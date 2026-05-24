//! Pluggable SPICE engine layer.
//!
//! The frontend talks to engines only in terms of SPICE netlist text +
//! analysis requests, so swapping engines (libngspice, ngspice subprocess,
//! LTSpice, Xyce, …) does not require touching UI code.

pub mod libngspice;

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AcSweep {
    Dec,
    Oct,
    Lin,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Analysis {
    /// DC operating point. Returns one value per node.
    Op,
    /// Transient analysis: tstep, tstop, optional tstart.
    Tran { tstep: f64, tstop: f64, tstart: Option<f64> },
    /// DC sweep of one source.
    DcSweep { src: String, start: f64, stop: f64, step: f64 },
    /// AC small-signal sweep.
    Ac { sweep: AcSweep, npts: u32, fstart: f64, fstop: f64 },
    /// Noise analysis at an output node referred to an input source.
    Noise {
        out_node: String,
        src: String,
        sweep: AcSweep,
        npts: u32,
        fstart: f64,
        fstop: f64,
    },
}

#[derive(Debug, Clone, Serialize)]
pub struct SimVector {
    pub name: String,
    /// Independent-axis vector (e.g. "time" for tran). None for OP.
    pub is_scale: bool,
    pub data: Vec<f64>,
    /// Phase in degrees for complex AC vectors. Omitted for real-valued vectors.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phase: Option<Vec<f64>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Measurement {
    pub name: String,
    pub value: f64,
    /// Optional "at" time / frequency, e.g. for vmax measurements.
    pub at: Option<f64>,
    /// Raw line as ngspice reported it.
    pub raw: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SimResult {
    pub plot: String,
    pub vectors: Vec<SimVector>,
    pub log: String,
    pub measurements: Vec<Measurement>,
}

#[derive(Debug, Clone, Serialize)]
pub struct EngineInfo {
    pub name: String,
    pub version: String,
    pub library_path: String,
}

#[derive(Debug, Error)]
pub enum EngineError {
    #[error("engine not available: {0}")]
    NotAvailable(String),
    #[error("simulation failed: {0}")]
    Sim(String),
    #[error("ffi error: {0}")]
    Ffi(String),
}

impl serde::Serialize for EngineError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub trait SpiceEngine: Send + Sync {
    fn info(&self) -> Result<EngineInfo, EngineError>;
    fn simulate(&self, netlist: &str, analysis: &Analysis) -> Result<SimResult, EngineError>;
}
