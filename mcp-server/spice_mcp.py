#!/usr/bin/env python3
"""Minimal MCP server for Spice Sim.

Speaks JSON-RPC 2.0 over stdio and forwards simulate / engine_probe to the
running Tauri app's HTTP control endpoint at http://127.0.0.1:7890.

To register with Claude Code, add to ~/.claude/settings.json (or your
project's .claude/settings.json):

    {
      "mcpServers": {
        "spice-sim": {
          "command": "python3",
          "args": ["/Users/ahle/repos/spice-sim/mcp-server/spice_mcp.py"]
        }
      }
    }

Then restart Claude Code. The tools `mcp__spice-sim__simulate` and
`mcp__spice-sim__engine_probe` will appear, callable directly by the model.

No external Python deps required (stdlib only).
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

CONTROL_BASE = "http://127.0.0.1:7890"

PROTOCOL_VERSION = "2024-11-05"
SERVER_NAME = "spice-sim"
SERVER_VERSION = "0.1.0"

TOOLS = [
    {
        "name": "ping",
        "description": "Verify the Spice Sim control endpoint is reachable.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "engine_probe",
        "description": "Return engine info (name, version, library path).",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "simulate",
        "description": (
            "Run a SPICE simulation. `netlist` is the full SPICE deck (one "
            "title line plus device cards). `analysis` is one of: "
            "{kind:'op'}, "
            "{kind:'tran', tstep, tstop, [tstart]}, "
            "{kind:'dcsweep', src, start, stop, step}, "
            "{kind:'ac', sweep:'dec'|'oct'|'lin', npts, fstart, fstop}, "
            "{kind:'noise', out_node, src, sweep, npts, fstart, fstop}. "
            "Frequencies / times are numbers in SI base units (seconds, Hz)."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "netlist": {"type": "string"},
                "analysis": {"type": "object"},
            },
            "required": ["netlist", "analysis"],
            "additionalProperties": False,
        },
    },
    {
        "name": "list_plots",
        "description": (
            "Return the list of ngspice plot names currently in memory. "
            "Useful for inspecting state after .step / .mc / .temp runs that "
            "leave behind multiple plots (tran1, tran2, …) without re-simulating."
        ),
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "read_log",
        "description": (
            "Peek at the last N lines of ngspice's recent stdout/stderr without "
            "clearing it or re-running. Defaults to the last 40 lines."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {"n": {"type": "integer", "minimum": 1, "maximum": 1000}},
            "additionalProperties": False,
        },
    },
    {
        "name": "raw_command",
        "description": (
            "Send an arbitrary ngspice command to the running engine and return "
            "its log delta. Useful for exploration: e.g. 'show all', 'display', "
            "'print v(out)', 'echo $temp', 'devhelp resistor'. Power-user only — "
            "destructive commands (reset, destroy) will affect subsequent sims."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {"command": {"type": "string"}},
            "required": ["command"],
            "additionalProperties": False,
        },
    },
]


def http_get(path: str) -> dict:
    with urllib.request.urlopen(f"{CONTROL_BASE}{path}", timeout=30) as r:
        return json.loads(r.read())


def http_post(path: str, body: dict) -> dict:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{CONTROL_BASE}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def call_tool(name: str, args: dict) -> dict:
    try:
        if name == "ping":
            return {"content": [{"type": "text", "text": http_get("/ping")}]}
        if name == "engine_probe":
            info = http_get("/engine_probe")
            return {"content": [{"type": "text", "text": json.dumps(info, indent=2)}]}
        if name == "simulate":
            result = http_post("/simulate", args)
            # Truncate giant vectors to keep MCP responses small.
            summary = summarise_result(result)
            return {"content": [{"type": "text", "text": json.dumps(summary, indent=2)}]}
        if name == "list_plots":
            plots = http_get("/list_plots")
            return {"content": [{"type": "text", "text": json.dumps(plots, indent=2)}]}
        if name == "read_log":
            n = int(args.get("n") or 40)
            log = http_get(f"/read_log?n={n}")
            return {"content": [{"type": "text", "text": log if isinstance(log, str) else json.dumps(log)}]}
        if name == "raw_command":
            cmd = args.get("command", "")
            if not cmd:
                return {"content": [{"type": "text", "text": "missing 'command'"}], "isError": True}
            result = http_post("/raw_command", {"command": cmd})
            return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}
        return {
            "content": [{"type": "text", "text": f"unknown tool: {name}"}],
            "isError": True,
        }
    except urllib.error.URLError as e:
        return {
            "content": [
                {
                    "type": "text",
                    "text": (
                        f"Spice Sim control endpoint not reachable at {CONTROL_BASE} "
                        f"({e}). Is the Tauri app running in dev mode (npx tauri dev)?"
                    ),
                }
            ],
            "isError": True,
        }


def summarise_result(result: dict) -> dict:
    """Trim trace data so the model gets a useful summary, not megabytes."""
    out = {"plot": result.get("plot"), "vectors": []}
    for v in result.get("vectors", []):
        data = v.get("data", [])
        # Send: length, first 3 samples, last 3 samples, min, max.
        s = {
            "name": v.get("name"),
            "is_scale": v.get("is_scale"),
            "len": len(data),
        }
        if data:
            s["first"] = data[:3]
            s["last"] = data[-3:]
            s["min"] = min(data)
            s["max"] = max(data)
        out["vectors"].append(s)
    if result.get("log"):
        out["log_tail"] = "\n".join(result["log"].splitlines()[-12:])
    return out


def handle(msg: dict) -> dict | None:
    mid = msg.get("id")
    method = msg.get("method")
    params = msg.get("params") or {}
    if method == "initialize":
        return ok(
            mid,
            {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {"tools": {}},
                "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
            },
        )
    if method == "notifications/initialized":
        return None
    if method == "tools/list":
        return ok(mid, {"tools": TOOLS})
    if method == "tools/call":
        name = params.get("name", "")
        args = params.get("arguments", {}) or {}
        return ok(mid, call_tool(name, args))
    if method == "ping":
        return ok(mid, {})
    return err(mid, -32601, f"method not found: {method}")


def ok(mid, result):
    return {"jsonrpc": "2.0", "id": mid, "result": result}


def err(mid, code, msg):
    return {"jsonrpc": "2.0", "id": mid, "error": {"code": code, "message": msg}}


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        response = handle(msg)
        if response is not None:
            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
