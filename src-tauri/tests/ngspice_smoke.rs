use app_lib::engine::{libngspice::LibNgSpiceEngine, AcSweep, Analysis, SpiceEngine};

fn find_vec<'a>(result: &'a app_lib::engine::SimResult, name: &str) -> Option<&'a app_lib::engine::SimVector> {
    result.vectors.iter().find(|v| v.name.eq_ignore_ascii_case(name))
}

#[test]
fn op_voltage_divider() {
    let engine = LibNgSpiceEngine::load().expect("load libngspice");
    let netlist = r#"
V1 vin 0 DC 10
R1 vin mid 1k
R2 mid 0 1k
"#;
    let result = engine
        .simulate(netlist, &Analysis::Op)
        .expect("op should succeed");

    eprintln!("plot: {}", result.plot);
    eprintln!("vectors: {:?}", result.vectors.iter().map(|v| &v.name).collect::<Vec<_>>());
    eprintln!("log:\n{}", result.log);

    let mid = find_vec(&result, "v(mid)").or_else(|| find_vec(&result, "mid"));
    let mid = mid.expect("expected node 'mid' in vectors");
    let v_mid = mid.data.first().copied().expect("at least one data point");
    assert!((v_mid - 5.0).abs() < 1e-6, "v(mid) = {}, expected 5.0", v_mid);

    let vin = find_vec(&result, "v(vin)").or_else(|| find_vec(&result, "vin"));
    let v_vin = vin.expect("vin").data.first().copied().unwrap();
    assert!((v_vin - 10.0).abs() < 1e-6, "v(vin) = {}, expected 10.0", v_vin);
}

#[test]
fn tran_rc_lowpass() {
    let engine = LibNgSpiceEngine::load().expect("load libngspice");
    let netlist = r#"
V1 vin 0 SIN(0 1 1k)
R1 vin out 1k
C1 out 0 1u
"#;
    let result = engine
        .simulate(
            netlist,
            &Analysis::Tran {
                tstep: 1e-5,
                tstop: 5e-3,
                tstart: None,
            },
        )
        .expect("tran sim");
    let time = find_vec(&result, "time").expect("time vector");
    assert!(time.data.len() > 100, "expected many samples, got {}", time.data.len());
    let vout = find_vec(&result, "v(out)").or_else(|| find_vec(&result, "out")).expect("out");
    // RC = 1ms, drive at 1kHz → |H| ≈ 1 / sqrt(1 + (2π·f·RC)^2) ≈ 0.157
    // peak of v(out) should be well under input peak of 1V
    let peak: f64 = vout.data.iter().copied().fold(0.0_f64, f64::max);
    assert!(peak > 0.1 && peak < 0.5, "v(out) peak = {} not in (0.1, 0.5)", peak);
}

#[test]
fn ac_rc_lowpass_corner() {
    let engine = LibNgSpiceEngine::load().expect("load libngspice");
    // RC = 1k * 159nF ≈ 159µs → fc ≈ 1kHz
    let netlist = r#"
V1 vin 0 AC 1
R1 vin out 1k
C1 out 0 159n
"#;
    let result = engine
        .simulate(
            netlist,
            &Analysis::Ac {
                sweep: AcSweep::Dec,
                npts: 10,
                fstart: 10.0,
                fstop: 1.0e5,
            },
        )
        .expect("ac sim");
    let freq = find_vec(&result, "frequency").expect("frequency vec");
    let vout = find_vec(&result, "v(out)").or_else(|| find_vec(&result, "out")).expect("out");
    // Find sample closest to 1 kHz and check magnitude is ~0.7 (−3 dB)
    let mut closest = 0usize;
    let mut best = f64::INFINITY;
    for (i, f) in freq.data.iter().enumerate() {
        let d = (f - 1.0e3).abs();
        if d < best {
            best = d;
            closest = i;
        }
    }
    let mag = vout.data[closest];
    assert!(
        mag > 0.6 && mag < 0.8,
        "expected |H(1kHz)| ≈ 0.71, got {} at f={}",
        mag,
        freq.data[closest]
    );
}

#[test]
fn tran_savecurrents_emits_branch_currents() {
    let engine = LibNgSpiceEngine::load().expect("load libngspice");
    let netlist = r#"
V1 vin 0 PULSE(0 5 0 1u 1u 5m 10m)
R1 vin out 1k
C1 out 0 1u
"#;
    let result = engine
        .simulate(
            netlist,
            &Analysis::Tran {
                tstep: 1e-5,
                tstop: 1e-3,
                tstart: None,
            },
        )
        .expect("tran sim");
    let names: Vec<&str> = result.vectors.iter().map(|v| v.name.as_str()).collect();
    // savecurrents enabled in simulate() should produce per-device current vectors
    assert!(
        names.iter().any(|n| n.eq_ignore_ascii_case("@r1[i]") || n.eq_ignore_ascii_case("v1#branch")),
        "expected at least one device current vector, got: {:?}",
        names
    );
}

#[test]
fn parametric_step_creates_multiple_plots() {
    let engine = LibNgSpiceEngine::load().expect("load libngspice");
    let netlist = r#"
.param rval=1k
V1 vin 0 SIN(0 1 1k)
R1 vin out {rval}
C1 out 0 1u
.step param rval 500 2k 500
"#;
    let result = engine
        .simulate(
            netlist,
            &Analysis::Tran {
                tstep: 1e-5,
                tstop: 1e-3,
                tstart: None,
            },
        )
        .expect("step tran sim");
    eprintln!("plot: {}", result.plot);
    eprintln!("vectors ({}):", result.vectors.len());
    for v in &result.vectors {
        eprintln!("  {} (scale={}, n={})", v.name, v.is_scale, v.data.len());
    }
    eprintln!("log:\n{}", result.log);
    // With multiple plots, each non-scale vector is namespaced "tranN.<name>".
    let step_tagged: Vec<&str> = result
        .vectors
        .iter()
        .filter(|v| !v.is_scale && v.name.starts_with("tran"))
        .map(|v| v.name.as_str())
        .collect();
    assert!(
        step_tagged.len() >= 6,
        "expected ≥ 6 step-tagged vectors (3 steps × ≥2 nodes), got {:?}",
        step_tagged
    );
}

#[test]
fn temp_sweep_creates_one_plot_per_temperature() {
    let engine = LibNgSpiceEngine::load().expect("load libngspice");
    let netlist = r#"
V1 vin 0 DC 10
R1 vin out 1k
R2 out 0 1k
.temp 0 27 100
"#;
    let result = engine
        .simulate(netlist, &Analysis::Op)
        .expect("temp sweep op");
    let plots: std::collections::BTreeSet<&str> = result
        .vectors
        .iter()
        .filter(|v| !v.is_scale && v.name.contains('.'))
        .map(|v| v.name.split('.').next().unwrap_or(""))
        .collect();
    assert!(
        plots.len() >= 3,
        "expected ≥ 3 step plots from .temp sweep, got: {:?}",
        plots
    );
}

#[test]
fn monte_carlo_creates_one_plot_per_iteration() {
    let engine = LibNgSpiceEngine::load().expect("load libngspice");
    // .mc 5 produces 5 runs. The simple netlist doesn't actually vary, but
    // we exercise the orchestration path.
    let netlist = r#"
V1 vin 0 DC 5
R1 vin out 1k
R2 out 0 1k
.mc 5
"#;
    let result = engine
        .simulate(netlist, &Analysis::Op)
        .expect("monte carlo op");
    let plots: std::collections::BTreeSet<&str> = result
        .vectors
        .iter()
        .filter(|v| !v.is_scale && v.name.contains('.'))
        .map(|v| v.name.split('.').next().unwrap_or(""))
        .collect();
    assert!(
        plots.len() >= 5,
        "expected ≥ 5 plots for .mc 5, got: {:?}",
        plots
    );
}

#[test]
fn hierarchical_subckt_simulates_end_to_end() {
    // Mirrors what the multi-page frontend emits: a root schematic that
    // instantiates a user-defined subcircuit. Verifies the .subckt body
    // is correctly scoped and the X-device pins map through.
    //
    // Topology:
    //   V1 in 0 DC 5
    //   X1 in out HALVER       <-- subckt instance
    //   Rout out 0 1MEG        <-- prevents float
    //   .subckt HALVER a b
    //     Ra a m 1k
    //     Rb m b 1k
    //     .ends                <-- (with terminating Rterm: m → ground? not needed; pure resistor divider)
    //
    // Wait — HALVER as a 2-port doesn't give us a "halving" without a ground
    // reference. Use a 3-port: HALVER(in, out, gnd) and tie the centre to gnd
    // inside the subckt. Then expected v(out) = 0V (full short via the divider's
    // middle to GND would short out etc). Simpler: 4-pin pad-thru with internal
    // R-divider where out = in/2 by external Rload to ground.
    //
    // Easiest topology:
    //   .subckt HALVER inp outp gndp
    //     R1 inp outp 1k
    //     R2 outp gndp 1k
    //   .ends
    // Externally: V1 in 0 DC 10; X1 in mid 0 HALVER; expect v(mid) = 5.
    let engine = LibNgSpiceEngine::load().expect("load libngspice");
    let netlist = r#"
V1 in 0 DC 10
X1 in mid 0 HALVER
.subckt HALVER inp outp gndp
Ra inp outp 1k
Rb outp gndp 1k
.ends HALVER
"#;
    let result = engine
        .simulate(netlist, &Analysis::Op)
        .expect("hierarchical op");
    let mid = find_vec(&result, "mid").expect("mid node missing");
    let v = mid.data[0];
    assert!(
        (v - 5.0).abs() < 1e-6,
        "expected v(mid) = 5V through HALVER subckt, got {v}"
    );
}

#[test]
fn meas_directive_extracts_measurements() {
    let engine = LibNgSpiceEngine::load().expect("load libngspice");
    let netlist = r#"
V1 vin 0 SIN(0 1 1k)
R1 vin out 1k
C1 out 0 1u
.meas tran vmax_out MAX V(out)
.meas tran vmin_out MIN V(out)
"#;
    let result = engine
        .simulate(
            netlist,
            &Analysis::Tran {
                tstep: 1e-5,
                tstop: 5e-3,
                tstart: None,
            },
        )
        .expect("tran with meas");
    eprintln!("measurements: {:?}", result.measurements);
    let by_name: std::collections::HashMap<_, _> = result
        .measurements
        .iter()
        .map(|m| (m.name.to_ascii_lowercase(), m.value))
        .collect();
    assert!(
        by_name.contains_key("vmax_out"),
        "expected vmax_out measurement, got names: {:?}",
        by_name.keys().collect::<Vec<_>>()
    );
    let vmax = by_name["vmax_out"];
    assert!(
        vmax > 0.05 && vmax < 0.5,
        "expected vmax_out in RC-filtered range, got {vmax}"
    );
}

#[test]
fn opamp_inverting_gain() {
    let engine = LibNgSpiceEngine::load().expect("load libngspice");
    let netlist = r#"
V1 in 0 SIN(0 0.1 1k)
R1 in inn 1k
R2 inn out 10k
X1 0 inn out OPAMP
.subckt OPAMP plus minus out
Egain int 0 plus minus 1e5
Rout int out 100
.ends OPAMP
"#;
    let result = engine
        .simulate(
            netlist,
            &Analysis::Tran {
                tstep: 1e-5,
                tstop: 3e-3,
                tstart: None,
            },
        )
        .expect("opamp tran");
    let vout = find_vec(&result, "v(out)")
        .or_else(|| find_vec(&result, "out"))
        .expect("out");
    // Skip first 200 samples to let transient settle, then take peak.
    let tail: f64 = vout.data.iter().skip(200).copied().fold(0.0_f64, |a, b| a.max(b.abs()));
    // Closed-loop gain = -Rf/R1 = -10, so peak ≈ 1 V for 0.1 V input.
    assert!(
        tail > 0.85 && tail < 1.05,
        "expected output peak ≈ 1.0, got {}",
        tail
    );
}
