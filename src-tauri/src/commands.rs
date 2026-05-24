use crate::engine::{
    libngspice::LibNgSpiceEngine, Analysis, EngineError, EngineInfo, SimResult, SpiceEngine,
};

#[tauri::command]
pub fn engine_probe() -> Result<EngineInfo, EngineError> {
    let engine = LibNgSpiceEngine::load()?;
    engine.info()
}

#[tauri::command]
pub fn simulate(netlist: String, analysis: Analysis) -> Result<SimResult, EngineError> {
    let engine = LibNgSpiceEngine::load()?;
    engine.simulate(&netlist, &analysis)
}
