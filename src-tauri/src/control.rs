//! Localhost HTTP control endpoint.
//!
//! Runs alongside the Tauri main loop on 127.0.0.1:7890, exposing the same
//! simulation/engine_probe surface that the frontend uses via Tauri IPC. Lets
//! tests, scripts, and MCP servers drive the *running* app's ngspice engine
//! without needing the webview.
//!
//! Endpoints:
//!   GET  /ping            → "pong"
//!   GET  /engine_probe    → JSON EngineInfo
//!   POST /simulate        → JSON { netlist: string, analysis: Analysis }
//!                            returns JSON SimResult
//!
//! No auth; bound to loopback only.

use crate::engine::{libngspice::LibNgSpiceEngine, Analysis, SpiceEngine};
use std::thread;
use tiny_http::{Header, Method, Response, Server};

const ADDR: &str = "127.0.0.1:7890";

pub fn start() {
    thread::spawn(|| {
        let server = match Server::http(ADDR) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[control] failed to bind {ADDR}: {e}");
                return;
            }
        };
        eprintln!("[control] listening on http://{ADDR}");
        for mut req in server.incoming_requests() {
            let method = req.method().clone();
            let url = req.url().to_string();
            let resp = match (method, url.as_str()) {
                (Method::Options, _) => json_text("{}"),
                (Method::Get, "/ping") => json_text("\"pong\""),
                (Method::Get, "/engine_probe") => handle_probe(),
                (Method::Post, "/simulate") => {
                    let mut body = String::new();
                    if let Err(e) = req.as_reader().read_to_string(&mut body) {
                        json_error(400, &format!("body read: {e}"))
                    } else {
                        handle_simulate(&body)
                    }
                }
                (Method::Get, "/list_plots") => handle_list_plots(),
                (Method::Get, url) if url.starts_with("/read_log") => handle_read_log(url),
                (Method::Post, "/raw_command") => {
                    let mut body = String::new();
                    if let Err(e) = req.as_reader().read_to_string(&mut body) {
                        json_error(400, &format!("body read: {e}"))
                    } else {
                        handle_raw_command(&body)
                    }
                }
                _ => json_error(404, "not found"),
            };
            let _ = req.respond(resp);
        }
    });
}

fn handle_probe() -> Response<std::io::Cursor<Vec<u8>>> {
    match LibNgSpiceEngine::load().and_then(|e| e.info()) {
        Ok(info) => json_text(&serde_json::to_string(&info).unwrap_or_default()),
        Err(e) => json_error(500, &format!("{e}")),
    }
}

fn handle_simulate(body: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    #[derive(serde::Deserialize)]
    struct SimReq {
        netlist: String,
        analysis: Analysis,
    }
    let req: SimReq = match serde_json::from_str(body) {
        Ok(r) => r,
        Err(e) => return json_error(400, &format!("bad request: {e}")),
    };
    let engine = match LibNgSpiceEngine::load() {
        Ok(e) => e,
        Err(e) => return json_error(500, &format!("engine load: {e}")),
    };
    match engine.simulate(&req.netlist, &req.analysis) {
        Ok(result) => json_text(&serde_json::to_string(&result).unwrap_or_default()),
        Err(e) => json_error(500, &format!("sim: {e}")),
    }
}

fn handle_list_plots() -> Response<std::io::Cursor<Vec<u8>>> {
    let engine = match LibNgSpiceEngine::load() {
        Ok(e) => e,
        Err(e) => return json_error(500, &format!("engine load: {e}")),
    };
    let plots = engine.all_plots();
    json_text(&serde_json::to_string(&plots).unwrap_or_default())
}

fn handle_read_log(url: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    // url is something like "/read_log" or "/read_log?n=50"
    let n: usize = url
        .split_once('?')
        .and_then(|(_, q)| {
            q.split('&').find_map(|kv| {
                let mut parts = kv.splitn(2, '=');
                let k = parts.next()?;
                let v = parts.next()?;
                if k == "n" { v.parse::<usize>().ok() } else { None }
            })
        })
        .unwrap_or(40);
    let engine = match LibNgSpiceEngine::load() {
        Ok(e) => e,
        Err(e) => return json_error(500, &format!("engine load: {e}")),
    };
    let log = engine.peek_log(n);
    json_text(&serde_json::to_string(&log).unwrap_or_default())
}

fn handle_raw_command(body: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    #[derive(serde::Deserialize)]
    struct RawReq {
        command: String,
    }
    let req: RawReq = match serde_json::from_str(body) {
        Ok(r) => r,
        Err(e) => return json_error(400, &format!("bad request: {e}")),
    };
    let engine = match LibNgSpiceEngine::load() {
        Ok(e) => e,
        Err(e) => return json_error(500, &format!("engine load: {e}")),
    };
    match engine.raw_command(&req.command) {
        Ok(log) => json_text(&serde_json::to_string(&serde_json::json!({
            "command": req.command,
            "log": log,
        })).unwrap_or_default()),
        Err(e) => json_error(500, &format!("cmd: {e}")),
    }
}

fn json_text(body: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_string(body.to_owned())
        .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap())
        .with_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap())
        .with_header(Header::from_bytes(&b"Access-Control-Allow-Methods"[..], &b"GET,POST,OPTIONS"[..]).unwrap())
        .with_header(Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"Content-Type"[..]).unwrap())
}

fn json_error(status: u16, msg: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    let payload = format!("{{\"error\":{}}}", serde_json::to_string(msg).unwrap_or_default());
    Response::from_string(payload)
        .with_status_code(status)
        .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap())
        .with_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap())
}
