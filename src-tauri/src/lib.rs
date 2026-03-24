#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|_app| {
            // Global shortcut registration happens from the frontend via JS API
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
