pub mod engine;
mod commands;
mod control;

use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
                // Start localhost HTTP control endpoint (debug builds only)
                control::start();
            }
            let handle = app.handle();

            // ---- Application menu (macOS-style) -----------------------------
            let app_submenu = SubmenuBuilder::new(handle, "Spice Sim")
                .item(&PredefinedMenuItem::about(handle, Some("About Spice Sim"), None)?)
                .separator()
                .item(&PredefinedMenuItem::hide(handle, None)?)
                .item(&PredefinedMenuItem::hide_others(handle, None)?)
                .item(&PredefinedMenuItem::show_all(handle, None)?)
                .separator()
                .item(&PredefinedMenuItem::quit(handle, None)?)
                .build()?;

            let new_item = MenuItemBuilder::new("New")
                .id("file:new")
                .accelerator("CmdOrCtrl+N")
                .build(handle)?;
            let open_item = MenuItemBuilder::new("Open…")
                .id("file:open")
                .accelerator("CmdOrCtrl+O")
                .build(handle)?;
            let save_item = MenuItemBuilder::new("Save")
                .id("file:save")
                .accelerator("CmdOrCtrl+S")
                .build(handle)?;
            let save_as_item = MenuItemBuilder::new("Save As…")
                .id("file:save_as")
                .accelerator("CmdOrCtrl+Shift+S")
                .build(handle)?;
            let export_item = MenuItemBuilder::new("Export Netlist…")
                .id("file:export_netlist")
                .accelerator("CmdOrCtrl+E")
                .build(handle)?;
            let export_svg_item = MenuItemBuilder::new("Export Schematic SVG…")
                .id("file:export_svg")
                .accelerator("CmdOrCtrl+Alt+E")
                .build(handle)?;
            let export_csv_item = MenuItemBuilder::new("Export Waveform CSV…")
                .id("file:export_csv")
                .accelerator("CmdOrCtrl+Shift+E")
                .build(handle)?;
            let file_submenu = SubmenuBuilder::new(handle, "File")
                .item(&new_item)
                .item(&open_item)
                .separator()
                .item(&save_item)
                .item(&save_as_item)
                .separator()
                .item(&export_item)
                .item(&export_svg_item)
                .item(&export_csv_item)
                .separator()
                .item(&PredefinedMenuItem::close_window(handle, None)?)
                .build()?;

            let undo_item = MenuItemBuilder::new("Undo")
                .id("edit:undo")
                .accelerator("CmdOrCtrl+Z")
                .build(handle)?;
            let redo_item = MenuItemBuilder::new("Redo")
                .id("edit:redo")
                .accelerator("CmdOrCtrl+Shift+Z")
                .build(handle)?;
            let edit_submenu = SubmenuBuilder::new(handle, "Edit")
                .item(&undo_item)
                .item(&redo_item)
                .separator()
                .item(&PredefinedMenuItem::cut(handle, None)?)
                .item(&PredefinedMenuItem::copy(handle, None)?)
                .item(&PredefinedMenuItem::paste(handle, None)?)
                .item(&PredefinedMenuItem::select_all(handle, None)?)
                .build()?;

            let run_item = MenuItemBuilder::new("Run")
                .id("sim:run")
                .accelerator("CmdOrCtrl+R")
                .build(handle)?;
            let configure_item = MenuItemBuilder::new("Configure Simulation…")
                .id("sim:configure")
                .accelerator("CmdOrCtrl+,")
                .build(handle)?;
            let sim_submenu = SubmenuBuilder::new(handle, "Simulate")
                .item(&run_item)
                .item(&configure_item)
                .build()?;

            let zoom_in = MenuItemBuilder::new("Zoom In")
                .id("view:zoom_in")
                .accelerator("CmdOrCtrl+=")
                .build(handle)?;
            let zoom_out = MenuItemBuilder::new("Zoom Out")
                .id("view:zoom_out")
                .accelerator("CmdOrCtrl+-")
                .build(handle)?;
            let zoom_reset = MenuItemBuilder::new("Reset Zoom")
                .id("view:zoom_reset")
                .accelerator("CmdOrCtrl+0")
                .build(handle)?;
            let fit_view = MenuItemBuilder::new("Fit to Content")
                .id("view:fit")
                .accelerator("Shift+F")
                .build(handle)?;
            let fit_selection = MenuItemBuilder::new("Fit Selection")
                .id("view:fit_selection")
                .accelerator("Shift+2")
                .build(handle)?;
            let toggle_grid = MenuItemBuilder::new("Toggle Grid")
                .id("view:toggle_grid")
                .accelerator("Shift+G")
                .build(handle)?;
            let toggle_snap = MenuItemBuilder::new("Toggle Snap to Grid")
                .id("view:toggle_snap")
                .accelerator("Shift+S")
                .build(handle)?;
            let view_submenu = SubmenuBuilder::new(handle, "View")
                .item(&zoom_in)
                .item(&zoom_out)
                .item(&zoom_reset)
                .separator()
                .item(&fit_view)
                .item(&fit_selection)
                .separator()
                .item(&toggle_grid)
                .item(&toggle_snap)
                .build()?;

            let menu = MenuBuilder::new(handle)
                .item(&app_submenu)
                .item(&file_submenu)
                .item(&edit_submenu)
                .item(&sim_submenu)
                .item(&view_submenu)
                .build()?;
            app.set_menu(menu)?;

            app.on_menu_event(|app, event| {
                let id = event.id().0.clone();
                let _ = app.emit("menu", id);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::engine_probe,
            commands::simulate,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
