//! libngspice (shared library) engine.
//!
//! Dynamically loads libngspice via `libloading` and calls its C ABI. ngspice
//! is process-singleton, so we wrap access in a global OnceCell and serialize
//! `simulate()` calls behind a per-engine mutex.

use super::*;
use libloading::{Library, Symbol};
use once_cell::sync::OnceCell;
use parking_lot::Mutex;
use std::ffi::{c_char, c_int, c_short, c_void, CStr, CString};
use std::path::PathBuf;
use std::sync::Arc;

// ---- FFI types matching sharedspice.h --------------------------------------

#[repr(C)]
#[allow(dead_code)]
struct NgComplex {
    real: f64,
    imag: f64,
}

#[repr(C)]
#[allow(dead_code)]
struct VectorInfo {
    v_name: *mut c_char,
    v_type: c_int,
    v_flags: c_short,
    v_realdata: *mut f64,
    v_compdata: *mut NgComplex,
    v_length: c_int,
}

type SendChar = unsafe extern "C" fn(*mut c_char, c_int, *mut c_void) -> c_int;
type SendStat = unsafe extern "C" fn(*mut c_char, c_int, *mut c_void) -> c_int;
type ControlledExit =
    unsafe extern "C" fn(c_int, bool, bool, c_int, *mut c_void) -> c_int;
type BGThreadRunning = unsafe extern "C" fn(bool, c_int, *mut c_void) -> c_int;

type NgSpiceInit = unsafe extern "C" fn(
    Option<SendChar>,
    Option<SendStat>,
    Option<ControlledExit>,
    Option<unsafe extern "C" fn(*mut c_void, c_int, c_int, *mut c_void) -> c_int>,
    Option<unsafe extern "C" fn(*mut c_void, c_int, *mut c_void) -> c_int>,
    Option<BGThreadRunning>,
    *mut c_void,
) -> c_int;

type NgSpiceCommand = unsafe extern "C" fn(*mut c_char) -> c_int;
type NgGetVecInfo = unsafe extern "C" fn(*mut c_char) -> *mut VectorInfo;
type NgSpiceAllVecs = unsafe extern "C" fn(*mut c_char) -> *mut *mut c_char;
type NgSpiceAllPlots = unsafe extern "C" fn() -> *mut *mut c_char;
type NgSpiceCurPlot = unsafe extern "C" fn() -> *mut c_char;
type NgSpiceRunning = unsafe extern "C" fn() -> bool;

// ---- Shared context for C callbacks ----------------------------------------

struct Ctx {
    log: Mutex<String>,
}

static CTX: OnceCell<Box<Ctx>> = OnceCell::new();

unsafe extern "C" fn cb_send_char(s: *mut c_char, _id: c_int, user: *mut c_void) -> c_int {
    if !s.is_null() && !user.is_null() {
        let cs = CStr::from_ptr(s);
        if let Ok(text) = cs.to_str() {
            let ctx = &*(user as *const Ctx);
            let mut log = ctx.log.lock();
            log.push_str(text);
            log.push('\n');
        }
    }
    0
}

unsafe extern "C" fn cb_send_stat(_s: *mut c_char, _id: c_int, _user: *mut c_void) -> c_int {
    0
}

unsafe extern "C" fn cb_controlled_exit(
    _status: c_int,
    _immediate: bool,
    _quit: bool,
    _id: c_int,
    _user: *mut c_void,
) -> c_int {
    // Don't let ngspice tear down our process.
    0
}

unsafe extern "C" fn cb_bg_running(
    _running: bool,
    _id: c_int,
    _user: *mut c_void,
) -> c_int {
    0
}

// ---- Engine struct ----------------------------------------------------------

pub struct LibNgSpiceEngine {
    _library: Library,
    init_fn: NgSpiceInit,
    cmd_fn: NgSpiceCommand,
    get_vec_fn: NgGetVecInfo,
    all_vecs_fn: NgSpiceAllVecs,
    all_plots_fn: NgSpiceAllPlots,
    cur_plot_fn: NgSpiceCurPlot,
    running_fn: NgSpiceRunning,
    library_path: String,
    init_done: Mutex<bool>,
    sim_lock: Mutex<()>,
}

static ENGINE: OnceCell<Arc<LibNgSpiceEngine>> = OnceCell::new();

impl LibNgSpiceEngine {
    fn candidate_paths() -> Vec<PathBuf> {
        vec![
            PathBuf::from("/opt/homebrew/lib/libngspice.dylib"),
            PathBuf::from("/usr/local/lib/libngspice.dylib"),
            PathBuf::from("/usr/lib/libngspice.so"),
            PathBuf::from("libngspice.dylib"),
            PathBuf::from("libngspice.so"),
            PathBuf::from("ngspice.dll"),
        ]
    }

    pub fn load() -> Result<Arc<Self>, EngineError> {
        let engine = ENGINE.get_or_try_init(Self::load_inner)?;
        Ok(engine.clone())
    }

    fn load_inner() -> Result<Arc<Self>, EngineError> {
        let (library, path) = Self::find_and_open()?;
        // SAFETY: the symbols below outlive `library` only because we keep
        // `library` alive in the returned struct.
        let init_fn: NgSpiceInit;
        let cmd_fn: NgSpiceCommand;
        let get_vec_fn: NgGetVecInfo;
        let all_vecs_fn: NgSpiceAllVecs;
        let all_plots_fn: NgSpiceAllPlots;
        let cur_plot_fn: NgSpiceCurPlot;
        let running_fn: NgSpiceRunning;
        unsafe {
            let s: Symbol<NgSpiceInit> =
                library.get(b"ngSpice_Init\0").map_err(ffi_err)?;
            init_fn = *s;
            let s: Symbol<NgSpiceCommand> =
                library.get(b"ngSpice_Command\0").map_err(ffi_err)?;
            cmd_fn = *s;
            let s: Symbol<NgGetVecInfo> =
                library.get(b"ngGet_Vec_Info\0").map_err(ffi_err)?;
            get_vec_fn = *s;
            let s: Symbol<NgSpiceAllVecs> =
                library.get(b"ngSpice_AllVecs\0").map_err(ffi_err)?;
            all_vecs_fn = *s;
            let s: Symbol<NgSpiceAllPlots> =
                library.get(b"ngSpice_AllPlots\0").map_err(ffi_err)?;
            all_plots_fn = *s;
            let s: Symbol<NgSpiceCurPlot> =
                library.get(b"ngSpice_CurPlot\0").map_err(ffi_err)?;
            cur_plot_fn = *s;
            let s: Symbol<NgSpiceRunning> =
                library.get(b"ngSpice_running\0").map_err(ffi_err)?;
            running_fn = *s;
        }

        Ok(Arc::new(Self {
            _library: library,
            init_fn,
            cmd_fn,
            get_vec_fn,
            all_vecs_fn,
            all_plots_fn,
            cur_plot_fn,
            running_fn,
            library_path: path,
            init_done: Mutex::new(false),
            sim_lock: Mutex::new(()),
        }))
    }

    fn find_and_open() -> Result<(Library, String), EngineError> {
        let mut tried = Vec::new();
        for p in Self::candidate_paths() {
            match unsafe { Library::new(&p) } {
                Ok(lib) => return Ok((lib, p.to_string_lossy().into_owned())),
                Err(e) => tried.push(format!("{}: {}", p.display(), e)),
            }
        }
        Err(EngineError::NotAvailable(format!(
            "could not locate libngspice. Tried:\n  {}\nInstall with `brew install ngspice`.",
            tried.join("\n  ")
        )))
    }

    fn ensure_initialized(&self) -> Result<(), EngineError> {
        let mut done = self.init_done.lock();
        if *done {
            return Ok(());
        }
        let ctx = CTX.get_or_init(|| {
            Box::new(Ctx {
                log: Mutex::new(String::new()),
            })
        });
        let user = (&**ctx) as *const Ctx as *mut c_void;
        let rc = unsafe {
            (self.init_fn)(
                Some(cb_send_char),
                Some(cb_send_stat),
                Some(cb_controlled_exit),
                None,
                None,
                Some(cb_bg_running),
                user,
            )
        };
        if rc != 0 {
            return Err(EngineError::Ffi(format!("ngSpice_Init rc={}", rc)));
        }
        *done = true;
        Ok(())
    }

    fn drain_log(&self) -> String {
        if let Some(ctx) = CTX.get() {
            let mut log = ctx.log.lock();
            std::mem::take(&mut *log)
        } else {
            String::new()
        }
    }


    fn run_command(&self, cmd: &str) -> Result<(), EngineError> {
        let c = CString::new(cmd).map_err(|e| EngineError::Ffi(e.to_string()))?;
        let rc = unsafe { (self.cmd_fn)(c.as_ptr() as *mut c_char) };
        if rc != 0 {
            let tail = self.peek_log(8);
            return Err(EngineError::Sim(format!(
                "command failed (rc={rc}): {cmd}\n{tail}"
            )));
        }
        Ok(())
    }

    fn wait_until_idle(&self) {
        for _ in 0..2000 {
            if !unsafe { (self.running_fn)() } {
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
    }

    fn cur_plot(&self) -> Result<String, EngineError> {
        let p = unsafe { (self.cur_plot_fn)() };
        if p.is_null() {
            return Err(EngineError::Sim("no current plot".into()));
        }
        Ok(unsafe { CStr::from_ptr(p) }
            .to_string_lossy()
            .into_owned())
    }

    /// All in-memory plot names that match the current analysis (e.g. for a
    /// transient sim with .step, returns ["tran1", "tran2", ...]). Filters out
    /// the always-present "const" plot.
    /// Public peek of the in-memory log without draining it. Useful for tools
    /// that want to inspect ngspice's recent stdout/stderr without re-running.
    pub fn peek_log(&self, n: usize) -> String {
        if let Some(ctx) = CTX.get() {
            let log = ctx.log.lock();
            let lines: Vec<&str> = log.lines().collect();
            let start = lines.len().saturating_sub(n);
            lines[start..].join("\n")
        } else {
            String::new()
        }
    }

    /// Public list of all plots currently in ngspice's memory.
    pub fn all_plots(&self) -> Vec<String> {
        let arr = unsafe { (self.all_plots_fn)() };
        if arr.is_null() {
            return Vec::new();
        }
        let mut out = Vec::new();
        unsafe {
            let mut i = 0isize;
            loop {
                let p = *arr.offset(i);
                if p.is_null() {
                    break;
                }
                out.push(CStr::from_ptr(p).to_string_lossy().into_owned());
                i += 1;
            }
        }
        out
    }

    /// Run an arbitrary ngspice command and return the resulting log delta.
    /// Intended for MCP-driven exploration / debugging — use with care.
    pub fn raw_command(&self, cmd: &str) -> Result<String, EngineError> {
        let _guard = self.sim_lock.lock();
        self.ensure_initialized()?;
        let _ = self.drain_log();
        self.run_command(cmd)?;
        Ok(self.drain_log())
    }

    fn step_sibling_plots(&self, cur: &str) -> Vec<String> {
        let arr = unsafe { (self.all_plots_fn)() };
        if arr.is_null() {
            return vec![cur.to_string()];
        }
        let mut all: Vec<String> = Vec::new();
        unsafe {
            let mut i = 0isize;
            loop {
                let p = *arr.offset(i);
                if p.is_null() {
                    break;
                }
                all.push(CStr::from_ptr(p).to_string_lossy().into_owned());
                i += 1;
            }
        }
        let prefix: String = cur.chars().take_while(|c| !c.is_ascii_digit()).collect();
        if prefix.is_empty() {
            return vec![cur.to_string()];
        }
        let mut matched: Vec<String> = all
            .into_iter()
            .filter(|p| {
                p.starts_with(&prefix)
                    && p[prefix.len()..].chars().all(|c| c.is_ascii_digit())
            })
            .collect();
        matched.sort_by_key(|p| p[prefix.len()..].parse::<u32>().unwrap_or(0));
        if matched.is_empty() {
            matched.push(cur.to_string());
        }
        matched
    }

    fn collect_vectors(&self, plot: &str) -> Result<Vec<SimVector>, EngineError> {
        let plot_c = CString::new(plot).map_err(|e| EngineError::Ffi(e.to_string()))?;
        let mut out = Vec::new();
        unsafe {
            let arr = (self.all_vecs_fn)(plot_c.as_ptr() as *mut c_char);
            if arr.is_null() {
                return Ok(out);
            }
            let mut i = 0isize;
            loop {
                let name_ptr = *arr.offset(i);
                if name_ptr.is_null() {
                    break;
                }
                let name = CStr::from_ptr(name_ptr).to_string_lossy().into_owned();
                let qualified = format!("{}.{}", plot, name);
                let qc = CString::new(qualified.as_str())
                    .map_err(|e| EngineError::Ffi(e.to_string()))?;
                let vi = (self.get_vec_fn)(qc.as_ptr() as *mut c_char);
                if !vi.is_null() {
                    let v = &*vi;
                    let len = v.v_length.max(0) as usize;
                    let (data, phase): (Vec<f64>, Option<Vec<f64>>) = if !v.v_realdata.is_null() {
                        (std::slice::from_raw_parts(v.v_realdata, len).to_vec(), None)
                    } else if !v.v_compdata.is_null() {
                        let complex = std::slice::from_raw_parts(v.v_compdata, len);
                        let data = complex
                            .iter()
                            .map(|c| (c.real * c.real + c.imag * c.imag).sqrt())
                            .collect();
                        let phase = complex
                            .iter()
                            .map(|c| c.imag.atan2(c.real).to_degrees())
                            .collect();
                        (data, Some(phase))
                    } else {
                        (Vec::new(), None)
                    };
                    // Scale vectors are named "time" / "frequency" / "v-sweep" /
                    // "i-sweep" by ngspice convention. Don't fall back on the
                    // first alphabetical vector — with savecurrents that is
                    // usually "@c1[i]", not the time axis.
                    let lower = name.to_ascii_lowercase();
                    let is_scale = lower == "time"
                        || lower == "frequency"
                        || lower == "v-sweep"
                        || lower == "i-sweep";
                    out.push(SimVector {
                        name,
                        is_scale,
                        data,
                        phase,
                    });
                }
                i += 1;
            }
        }
        Ok(out)
    }
}

fn ffi_err(e: libloading::Error) -> EngineError {
    EngineError::Ffi(e.to_string())
}

fn sweep_name(s: &super::AcSweep) -> &'static str {
    match s {
        super::AcSweep::Dec => "dec",
        super::AcSweep::Oct => "oct",
        super::AcSweep::Lin => "lin",
    }
}

/// Scan ngspice log lines for `.meas` result output. Recognises the typical
/// "<name>  =  <value>" and "<name>  =  <value> at=<t>" shapes plus the
/// "trig/targ" rise/fall variants. Lines unrelated to measurements are
/// ignored.
fn parse_measurements(log: &str) -> Vec<super::Measurement> {
    use super::Measurement;
    let mut out = Vec::new();
    for raw in log.lines() {
        // ngspice's SendChar prefixes "stdout " / "stderr "; strip if present.
        let line = raw
            .trim_start_matches("stdout ")
            .trim_start_matches("stderr ")
            .trim();
        if line.is_empty() {
            continue;
        }
        // Must contain '=' and a leading identifier.
        let Some(eq) = line.find('=') else {
            continue;
        };
        let name = line[..eq].trim();
        if name.is_empty() || !name.chars().next().is_some_and(|c| c.is_ascii_alphabetic()) {
            continue;
        }
        // Reject lines where the LHS contains spaces (multi-word) — not a
        // measurement result.
        if name.split_whitespace().count() != 1 {
            continue;
        }
        let rhs = line[eq + 1..].trim();
        // Pull the first number off rhs.
        let mut chars = rhs.char_indices();
        let mut end = 0;
        let mut seen_digit = false;
        while let Some((i, c)) = chars.next() {
            if c.is_ascii_digit() || c == '.' || c == '-' || c == '+' || c == 'e' || c == 'E' {
                end = i + c.len_utf8();
                if c.is_ascii_digit() {
                    seen_digit = true;
                }
            } else {
                break;
            }
        }
        if !seen_digit {
            continue;
        }
        let Ok(value) = rhs[..end].parse::<f64>() else {
            continue;
        };
        let mut at = None;
        if let Some(pos) = rhs.find("at=") {
            let tail = rhs[pos + 3..].trim_start();
            let end_at = tail
                .find(|c: char| !(c.is_ascii_digit() || c == '.' || c == '-' || c == '+' || c == 'e' || c == 'E'))
                .unwrap_or(tail.len());
            if let Ok(t) = tail[..end_at].parse::<f64>() {
                at = Some(t);
            }
        }
        out.push(Measurement {
            name: name.to_string(),
            value,
            at,
            raw: line.to_string(),
        });
    }
    out
}

/// Parametric-sweep directive parsed from `.step param NAME …` lines.
/// libngspice doesn't natively support `.step`, so we drive it ourselves.
#[derive(Debug)]
struct StepSweep {
    param_name: String,
    values: Vec<f64>,
}

/// One iteration in a swept simulation: param/temp/MC index, optional setter
/// commands to run before the analysis.
#[derive(Debug, Clone)]
struct SweepPoint {
    /// Pre-analysis ngspice commands (e.g. ["alterparam r=1k", "set temp=50"]).
    setup: Vec<String>,
}

/// Pulls `.step`, `.temp`, and `.mc` orchestration directives out of the
/// netlist (ngspice's shared library doesn't honour them natively) and
/// returns the cleaned netlist plus a flat list of sweep points to drive.
/// Each point's `setup` commands are run before the analysis command.
fn extract_sweeps(netlist: &str) -> (String, Vec<SweepPoint>) {
    let mut step: Option<StepSweep> = None;
    let mut temps: Vec<f64> = Vec::new();
    let mut mc_count: Option<u32> = None;
    let mut kept = String::with_capacity(netlist.len());

    for line in netlist.lines() {
        let trimmed = line.trim();
        let lower = trimmed.to_ascii_lowercase();
        if step.is_none() && lower.starts_with(".step ") {
            if let Some(s) = parse_step_line(trimmed) {
                step = Some(s);
                continue;
            }
        }
        if temps.is_empty() && lower.starts_with(".temp ") {
            let parsed: Vec<f64> = trimmed
                .split_whitespace()
                .skip(1)
                .filter_map(parse_spice_num)
                .collect();
            if !parsed.is_empty() {
                temps = parsed;
                continue;
            }
        }
        if mc_count.is_none() && lower.starts_with(".mc ") {
            if let Some(n) = trimmed
                .split_whitespace()
                .nth(1)
                .and_then(|s| s.parse::<u32>().ok())
            {
                if n > 0 && n <= 1024 {
                    mc_count = Some(n);
                    continue;
                }
            }
        }
        kept.push_str(line);
        kept.push('\n');
    }

    // Build a Cartesian product of (step × temp × mc).
    let step_values: Vec<(String, f64)> = match step {
        Some(s) => s
            .values
            .iter()
            .map(|v| (s.param_name.clone(), *v))
            .collect(),
        None => vec![],
    };
    let temp_values: Vec<f64> = temps;
    let mc_n = mc_count.unwrap_or(0);

    // If no sweep specified, return a single empty point.
    if step_values.is_empty() && temp_values.is_empty() && mc_n == 0 {
        return (kept, vec![SweepPoint { setup: vec![] }]);
    }

    let mut points: Vec<SweepPoint> = vec![SweepPoint { setup: vec![] }];
    if !step_values.is_empty() {
        let mut next = Vec::new();
        for p in &points {
            for (name, val) in &step_values {
                let mut sp = p.clone();
                sp.setup.push(format!("alterparam {} = {}", name, val));
                sp.setup.push("reset".to_string());
                next.push(sp);
            }
        }
        points = next;
    }
    if !temp_values.is_empty() {
        let mut next = Vec::new();
        for p in &points {
            for t in &temp_values {
                let mut sp = p.clone();
                sp.setup.push(format!("set temp = {}", t));
                next.push(sp);
            }
        }
        points = next;
    }
    if mc_n > 0 {
        let mut next = Vec::new();
        for p in &points {
            for i in 0..mc_n {
                let mut sp = p.clone();
                // ngspice picks a fresh RNG seed when `set rndseed` is set.
                // Use the iteration index so runs are reproducible.
                sp.setup.push(format!("set rndseed = {}", i + 1));
                next.push(sp);
            }
        }
        points = next;
    }

    (kept, points)
}

fn parse_step_line(line: &str) -> Option<StepSweep> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    // ".step param NAME start stop step" or ".step param NAME list V1 V2 ..."
    if parts.len() < 4 {
        return None;
    }
    if !parts[1].eq_ignore_ascii_case("param") {
        return None;
    }
    let name = parts[2].to_string();
    let rest = &parts[3..];
    if rest.is_empty() {
        return None;
    }
    if rest[0].eq_ignore_ascii_case("list") {
        let values: Vec<f64> = rest[1..]
            .iter()
            .filter_map(|s| parse_spice_num(s))
            .collect();
        if values.is_empty() {
            return None;
        }
        return Some(StepSweep {
            param_name: name,
            values,
        });
    }
    if rest.len() >= 3 {
        let start = parse_spice_num(rest[0])?;
        let stop = parse_spice_num(rest[1])?;
        let step = parse_spice_num(rest[2])?;
        if step == 0.0 {
            return None;
        }
        let mut values = Vec::new();
        let mut v = start;
        let dir = step.signum();
        // Inclusive of stop with a small tolerance.
        while (stop - v) * dir >= -step.abs() * 1e-9 {
            values.push(v);
            v += step;
            if values.len() > 1024 {
                break; // safety cap
            }
        }
        if values.is_empty() {
            return None;
        }
        return Some(StepSweep {
            param_name: name,
            values,
        });
    }
    None
}

fn parse_spice_num(raw: &str) -> Option<f64> {
    let s = raw.trim();
    if s.is_empty() {
        return None;
    }
    let lower = s.to_ascii_lowercase();
    // "meg" must be tested before "m" (longest suffix wins).
    let suffixes: &[(&str, f64)] = &[
        ("meg", 1e6),
        ("g", 1e9),
        ("k", 1e3),
        ("m", 1e-3),
        ("u", 1e-6),
        ("µ", 1e-6),
        ("n", 1e-9),
        ("p", 1e-12),
        ("f", 1e-15),
    ];
    for (suf, mul) in suffixes {
        if lower.ends_with(suf) {
            let num_part = &s[..s.len() - suf.len()];
            if let Ok(n) = num_part.parse::<f64>() {
                return Some(n * mul);
            }
        }
    }
    s.parse::<f64>().ok()
}

impl SpiceEngine for LibNgSpiceEngine {
    fn info(&self) -> Result<EngineInfo, EngineError> {
        self.ensure_initialized()?;
        let _ = self.drain_log();
        // Banner already printed on init; capture fresh from version command.
        self.run_command("version")?;
        let log = self.drain_log();
        // Pull the line that contains the version token, then strip the
        // "stdout"/"stderr" prefix the shared-lib callback prepends and the
        // leading "** " banner stars so consumers see "ngspice-46" (or similar)
        // directly.
        let raw = log
            .lines()
            .find(|l| {
                let l = l.to_ascii_lowercase();
                l.contains("ngspice") && (l.contains('-') || l.contains("version"))
            })
            .unwrap_or("ngspice");
        let cleaned = raw
            .trim_start_matches("stdout")
            .trim_start_matches("stderr")
            .trim_start()
            .trim_start_matches('*')
            .trim_start_matches('*')
            .trim();
        // Prefer a compact "ngspice-NN" token if present.
        let version = cleaned
            .split_whitespace()
            .find(|w| w.to_ascii_lowercase().starts_with("ngspice"))
            .unwrap_or(cleaned)
            .to_string();
        Ok(EngineInfo {
            name: "ngspice (libngspice)".into(),
            version,
            library_path: self.library_path.clone(),
        })
    }

    fn simulate(&self, netlist: &str, analysis: &Analysis) -> Result<SimResult, EngineError> {
        let _guard = self.sim_lock.lock();
        self.ensure_initialized()?;
        let _ = self.drain_log();
        let _ = self.run_command("destroy all");
        let _ = self.run_command("reset");

        let path = std::env::temp_dir().join(format!(
            "spicesim-{}-{}.cir",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));

        // Extract `.step` / `.temp` / `.mc` (libngspice's shared mode doesn't
        // honour them natively; we drive the loop ourselves).
        let (cleaned, sweep_points) = extract_sweeps(netlist);
        let netlist_to_use = cleaned.as_str();

        let mut body = String::new();
        let first_nonblank = netlist_to_use
            .lines()
            .find(|l| !l.trim().is_empty())
            .unwrap_or("");
        let trimmed = first_nonblank.trim_start();
        if !trimmed.starts_with('*') {
            body.push_str("* Spice Sim circuit\n");
        }
        body.push_str(netlist_to_use);
        if !netlist_to_use
            .lines()
            .any(|l| l.trim().eq_ignore_ascii_case(".end"))
        {
            body.push_str("\n.end\n");
        }
        std::fs::write(&path, body)
            .map_err(|e| EngineError::Sim(format!("write temp netlist: {}", e)))?;

        self.run_command(&format!("source {}", path.display()))?;
        // Save all device terminal currents so the UI can animate wire flow.
        let _ = self.run_command("set savecurrents");

        let analysis_cmd = match analysis {
            Analysis::Op => "op".to_string(),
            Analysis::Tran {
                tstep,
                tstop,
                tstart,
            } => match tstart {
                Some(t0) => format!("tran {} {} {}", tstep, tstop, t0),
                None => format!("tran {} {}", tstep, tstop),
            },
            Analysis::DcSweep {
                src,
                start,
                stop,
                step,
            } => {
                // ngspice's `dc` analysis requires the source name in
                // lowercase (the rest of the parser is case-insensitive, but
                // this command is not). Normalise.
                format!("dc {} {} {} {}", src.to_ascii_lowercase(), start, stop, step)
            }
            Analysis::Ac {
                sweep,
                npts,
                fstart,
                fstop,
            } => {
                let s = sweep_name(sweep);
                format!("ac {} {} {} {}", s, npts, fstart, fstop)
            }
            Analysis::Noise {
                out_node,
                src,
                sweep,
                npts,
                fstart,
                fstop,
            } => {
                let s = sweep_name(sweep);
                format!(
                    "noise v({}) {} {} {} {} {}",
                    out_node.to_ascii_lowercase(),
                    src.to_ascii_lowercase(),
                    s,
                    npts,
                    fstart,
                    fstop,
                )
            }
        };
        // Loop the analysis once per sweep point. A single empty point means
        // no parametric/temp/MC sweep — just run the analysis once.
        for point in &sweep_points {
            for cmd in &point.setup {
                self.run_command(cmd)?;
            }
            self.run_command(&analysis_cmd)?;
            self.wait_until_idle();
        }

        let plot = self.cur_plot()?;
        let plots = self.step_sibling_plots(&plot);
        let multi = plots.len() > 1;
        let mut vectors: Vec<SimVector> = Vec::new();
        let mut scale_included = false;
        for plot_name in &plots {
            let vecs = self.collect_vectors(plot_name)?;
            for mut v in vecs {
                if v.is_scale {
                    if scale_included {
                        // Drop duplicate scale across steps (assume shared axis).
                        continue;
                    }
                    scale_included = true;
                } else if multi {
                    // Tag each step's traces so the frontend can render them
                    // as distinct curves.
                    v.name = format!("{}.{}", plot_name, v.name);
                }
                vectors.push(v);
            }
        }
        let log = self.drain_log();
        let measurements = parse_measurements(&log);

        let _ = std::fs::remove_file(&path);
        Ok(SimResult {
            plot,
            vectors,
            log,
            measurements,
        })
    }
}
