# Spice Sim MCP server

A tiny stdio MCP server that forwards `simulate` / `engine_probe` / `ping`
calls to the running Tauri app's localhost HTTP control endpoint
(`http://127.0.0.1:7890`).

Lets Claude (in Claude Code, Claude Desktop, etc.) drive the running app's
ngspice engine directly via tool calls — same surface the frontend uses.

## Prerequisites

- Python 3 (stdlib only; no `pip install` needed).
- The Tauri app must be running in dev mode: `cd .. && npx tauri dev`.
  The HTTP control endpoint is started automatically in debug builds.

## Wire into Claude Code

Add to `~/.claude/settings.json` (or your project's `.claude/settings.json`):

```json
{
  "mcpServers": {
    "spice-sim": {
      "command": "python3",
      "args": ["/Users/ahle/repos/spice-sim/mcp-server/spice_mcp.py"]
    }
  }
}
```

Restart Claude Code. Three new tools will appear:

- `mcp__spice-sim__ping` — sanity check the control endpoint
- `mcp__spice-sim__engine_probe` — ngspice version + library path
- `mcp__spice-sim__simulate` — run a SPICE sim against the live app

The model can then call `simulate` with any SPICE netlist and analysis spec
(`op` / `tran` / `dcsweep` / `ac` / `noise`) and get back trimmed vector
summaries (first/last samples, min/max, length) plus the recent ngspice log.

## Quick sanity check (no Claude)

```bash
# In one terminal: start the app
cd /Users/ahle/repos/spice-sim && npx tauri dev

# In another: confirm the control endpoint is up
curl http://127.0.0.1:7890/ping
curl http://127.0.0.1:7890/engine_probe
curl -X POST http://127.0.0.1:7890/simulate \
  -H 'Content-Type: application/json' \
  -d '{"netlist":"V1 vin 0 DC 10\nR1 vin mid 1k\nR2 mid 0 1k\n","analysis":{"kind":"op"}}'
```

## Security note

The HTTP endpoint binds to `127.0.0.1` only and runs only in debug builds
(controlled by `cfg!(debug_assertions)` in `src-tauri/src/lib.rs`). It is not
exposed over the network.
