//! Ludus Vitae core: Rust owns state, schema, and every sensitive operation.

mod catalog;
mod commands;
mod db;
mod engine;
mod formulas;
#[cfg(test)]
mod integration_tests;
mod model;
mod oracle;
mod snapshot;
mod vault;

use std::sync::Mutex;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data = app
                .path()
                .app_data_dir()
                .expect("app data directory must resolve");
            std::fs::create_dir_all(&app_data)?;
            let vault_root = vault::ensure_vault(&app_data)?;
            let db_path = app_data.join("ludus_vitae.db");
            let conn = db::open_connection(&db_path)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
            db::migrate(&conn)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
            engine::ensure_profile(&conn)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
            app.manage(db::Db {
                conn: Mutex::new(conn),
                db_path,
                vault_root,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_system_snapshot,
            commands::execute_habit,
            commands::complete_milestone,
            commands::call_reckoning,
            commands::force_gate,
            commands::edit_boss_milestone,
            commands::delete_boss_milestone,
            commands::reset_world,
            commands::complete_genesis,
            commands::create_directive,
            commands::edit_directive,
            commands::archive_directive,
            commands::add_boss_milestone,
            commands::mark_events_seen,
            commands::create_quest,
            commands::complete_quest,
            commands::abandon_quest,
            commands::declare_rest,
            commands::add_journal_entry,
            commands::get_journal,
            commands::reflect_on_journal,
            commands::get_chronicle,
            commands::get_all_events,
            commands::fetch_persona_critique,
            commands::get_ambient_diagnostic,
            commands::propose_milestones,
            commands::get_oracle_logs,
            commands::set_oracle_key,
            commands::get_oracle_status,
            commands::test_oracle_connection,
            commands::get_settings,
            commands::set_app_setting,
            commands::read_proof_thumbnail,
            commands::export_backup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ludus Vitae");
}
