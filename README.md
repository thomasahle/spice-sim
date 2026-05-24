# Spice Sim

Spice Sim is a desktop circuit editor and ngspice front end built with Tauri,
React, TypeScript, and Rust. It provides schematic editing, generated SPICE
netlists, transient/DC/AC/noise analyses, waveform viewing, measurements,
multi-page subcircuits, and project persistence.

## Requirements

- Node.js and npm
- Rust toolchain
- macOS with `libngspice` installed for local simulation and release packaging

On macOS with Homebrew:

```sh
brew install ngspice
```

## Development

Install dependencies:

```sh
npm install
```

Run the web UI:

```sh
npm run dev
```

Build the optional browser-only ngspice engine:

```sh
npm run build:ngspice-wasm
```

This compiles ngspice 46 with Emscripten and writes
`public/vendor/ngspice/ngspice.js` plus `ngspice.wasm`. When the app is not
running inside Tauri and the local HTTP bridge is unavailable, the web UI uses
those artifacts in a Web Worker and returns the same waveform vector shape used
by the desktop engine.

Run the Tauri app:

```sh
npm run tauri:dev
```

The debug Tauri app also starts a local control endpoint on
`http://127.0.0.1:7890` so browser-based development and MCP tools can drive
the same ngspice engine.

## Verification

Run the frontend checks:

```sh
npm run lint
npm run build
```

Run the Rust/ngspice smoke tests:

```sh
cd src-tauri
cargo test
```

Build a production app and installer:

```sh
npm run tauri:build
```

On macOS, the release build emits the `.app` bundle and `.dmg` under
`src-tauri/target/release/bundle/`.

## Project Format

Documents are saved as `.spicesim` JSON files. Generated netlists can be
exported as `.cir`, `.net`, or `.sp` files, and waveform data can be exported
as CSV after a simulation run.
