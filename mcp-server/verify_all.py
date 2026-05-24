#!/usr/bin/env python3
"""End-to-end verification that the running Tauri app's ngspice engine
returns correct results for every analysis type.

Hits the localhost control endpoint started by `cargo run`/`npx tauri dev`
in debug mode. Each test asserts a known-good numeric result.

Usage:
    python3 mcp-server/verify_all.py
"""

import json
import sys
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:7890"


def post(netlist, analysis):
    req = urllib.request.Request(
        f"{BASE}/simulate",
        data=json.dumps({"netlist": netlist, "analysis": analysis}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def get_vec(result, name):
    for v in result["vectors"]:
        if v["name"].lower() == name.lower():
            return v
    return None


FAIL = 0
PASS = 0


def check(desc, ok, detail=""):
    global FAIL, PASS
    mark = "✓" if ok else "✗"
    print(f"  {mark} {desc}" + (f"  ({detail})" if detail else ""))
    if ok:
        PASS += 1
    else:
        FAIL += 1


def section(name):
    print(f"\n— {name} —")


def main():
    try:
        with urllib.request.urlopen(f"{BASE}/ping", timeout=5) as r:
            pong = json.loads(r.read())
    except urllib.error.URLError as e:
        print(f"✗ Cannot reach {BASE}: {e}")
        print("  Make sure the Tauri app is running: cd .. && npx tauri dev")
        sys.exit(2)
    print(f"endpoint up: {pong}")

    section("OP — voltage divider")
    r = post("V1 vin 0 DC 10\nR1 vin mid 1k\nR2 mid 0 1k\n", {"kind": "op"})
    mid = get_vec(r, "mid")
    vin = get_vec(r, "vin")
    check("v(mid) ≈ 5V", mid and abs(mid["data"][0] - 5.0) < 1e-6,
          f"got {mid and mid['data'][0]}")
    check("v(vin) = 10V", vin and abs(vin["data"][0] - 10.0) < 1e-6,
          f"got {vin and vin['data'][0]}")

    section("Transient — RC low-pass with sine input")
    r = post(
        "V1 vin 0 SIN(0 1 1k)\nR1 vin out 1k\nC1 out 0 1u\n",
        {"kind": "tran", "tstep": 1e-5, "tstop": 5e-3},
    )
    time = get_vec(r, "time")
    out = get_vec(r, "v(out)") or get_vec(r, "out")
    check("time vector has > 100 samples", time and len(time["data"]) > 100,
          f"got {time and len(time['data'])}")
    peak = max(abs(v) for v in out["data"]) if out else 0
    # RC=1ms, drive 1kHz → |H| ≈ 0.157 → peak ~0.16V
    check("|v(out)| peak ∈ (0.10, 0.50)", 0.10 < peak < 0.50,
          f"got {peak:.4f}")

    section("AC — RC corner at 1 kHz (R=1k, C=159nF → fc≈1kHz)")
    r = post(
        "V1 vin 0 AC 1\nR1 vin out 1k\nC1 out 0 159n\n",
        {"kind": "ac", "sweep": "dec", "npts": 10, "fstart": 10, "fstop": 1e5},
    )
    freq = get_vec(r, "frequency")
    out = get_vec(r, "v(out)") or get_vec(r, "out")
    # Find sample nearest 1kHz
    idx = min(range(len(freq["data"])),
              key=lambda i: abs(freq["data"][i] - 1000.0)) if freq else -1
    # We only got first/last/min/max from the summary; need full data here.
    # Refetch via the same simulate, then expect mag ≈ 0.71 at fc
    # The summary trims arrays — but min/max for an AC magnitude trace
    # spans the bandwidth, so just check the range bracket.
    mag_max = max(out["data"]) if out else 0
    mag_min = min(out["data"]) if out else 1
    # Also pinpoint magnitude near 1 kHz to verify -3 dB corner.
    mag_at_1k = out["data"][idx] if out and idx >= 0 else float("nan")
    check("|H| max ≈ 1 (passband)", 0.9 < mag_max <= 1.001,
          f"got {mag_max:.4f}")
    check("|H| min < 0.2 (stopband)", mag_min < 0.2,
          f"got {mag_min:.4f}")
    check("|H(1kHz)| ≈ 0.71 (−3 dB)", 0.60 < mag_at_1k < 0.80,
          f"got {mag_at_1k:.4f} at f={freq['data'][idx]:.1f}Hz")

    section("DC sweep — V1 from 0 to 10V over 1k+1k divider")
    r = post(
        "V1 vin 0 DC 0\nR1 vin mid 1k\nR2 mid 0 1k\n",
        {"kind": "dcsweep", "src": "V1", "start": 0, "stop": 10, "step": 1},
    )
    mid = get_vec(r, "mid")
    mid_min = min(mid["data"]) if mid else None
    mid_max = max(mid["data"]) if mid else None
    check("mid sweep min ≈ 0, max ≈ 5",
          mid and abs(mid_min) < 1e-6 and abs(mid_max - 5.0) < 1e-6,
          f"got min={mid_min} max={mid_max}")

    section("Op-amp — inverting amplifier gain ≈ −10")
    r = post(
        """V1 in 0 SIN(0 0.1 1k)
R1 in inn 1k
R2 inn out 10k
X1 0 inn out OPAMP
.subckt OPAMP plus minus out
Egain int 0 plus minus 1e5
Rout int out 100
.ends OPAMP
""",
        {"kind": "tran", "tstep": 1e-5, "tstop": 3e-3},
    )
    out = get_vec(r, "v(out)") or get_vec(r, "out")
    # Steady-state peak should be ≈ 1V (gain × 0.1V input). Skip startup.
    tail = out["data"][200:] if out else []
    peak = max(abs(v) for v in tail) if tail else 0
    check("|v(out)|peak ∈ (0.85, 1.1)", 0.85 < peak < 1.1,
          f"got peak={peak:.4f}")

    section(".meas — extract MAX/MIN from transient")
    r = post(
        """V1 vin 0 SIN(0 1 1k)
R1 vin out 1k
C1 out 0 1u
.meas tran vmax_out MAX V(out)
.meas tran vmin_out MIN V(out)
""",
        {"kind": "tran", "tstep": 1e-5, "tstop": 5e-3},
    )
    meas = {m["name"].lower(): m["value"] for m in r.get("measurements", [])}
    check("vmax_out present", "vmax_out" in meas, f"got {list(meas)}")
    check("vmin_out present", "vmin_out" in meas, f"got {list(meas)}")
    if "vmax_out" in meas:
        check("vmax_out > 0.05V", meas["vmax_out"] > 0.05, f"got {meas['vmax_out']:.4f}")

    section("Parametric .step — three R values for RC filter")
    r = post(
        """.param rval=1k
V1 vin 0 SIN(0 1 1k)
R1 vin out {rval}
C1 out 0 1u
.step param rval 500 2k 500
""",
        {"kind": "tran", "tstep": 1e-5, "tstop": 1e-3},
    )
    step_names = [v["name"] for v in r["vectors"]
                  if not v["is_scale"] and v["name"].startswith("tran")]
    distinct = {n.split(".")[0] for n in step_names}
    check("≥ 4 distinct step plots", len(distinct) >= 4,
          f"got plots={sorted(distinct)}")

    print(f"\nresult: {PASS} passed, {FAIL} failed")
    sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    main()
