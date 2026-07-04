//! Type-safe IPC command layer. Every command validates through the engine;
//! nothing here contains game math or hidden state mutation.

use rusqlite::params;
use std::collections::HashMap;
use tauri::State;

use crate::db::{self, Db};
use crate::engine::{self, EngineError};
use crate::model::*;
use crate::oracle;
use crate::snapshot;

type CmdResult<T> = Result<T, String>;

fn rule(e: EngineError) -> String {
    e.to_string()
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_system_snapshot(db: State<Db>) -> CmdResult<SystemSnapshot> {
    let mut conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    engine::ensure_profile(&conn).map_err(rule)?;
    let today = chrono::Local::now().date_naive();
    engine::process_pending_days(&mut conn, today).map_err(rule)?;
    let model = db::get_setting(&conn, "oracle_model").unwrap_or_else(|| oracle::DEFAULT_MODEL.into());
    let configured = oracle::load_api_key().is_some();
    snapshot::build_snapshot(
        &conn,
        &db.db_path.to_string_lossy(),
        configured,
        model,
    )
    .map_err(rule)
}

// ---------------------------------------------------------------------------
// Execution pipeline
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn execute_habit(
    db: State<Db>,
    habit_id: i64,
    proof_path: Option<String>,
    note: Option<String>,
) -> CmdResult<ExecutionReport> {
    let mut conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    engine::execute_habit(&mut conn, habit_id, proof_path, note).map_err(rule)
}

#[tauri::command]
pub fn complete_milestone(
    db: State<Db>,
    milestone_id: i64,
    proof_path: Option<String>,
) -> CmdResult<MilestoneReport> {
    let mut conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    engine::complete_milestone(&mut conn, milestone_id, proof_path).map_err(rule)
}

#[tauri::command]
pub fn call_reckoning(db: State<Db>) -> CmdResult<ReckoningReport> {
    let mut conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    engine::run_reckoning(&mut conn).map_err(rule)
}

#[tauri::command]
pub fn force_gate(db: State<Db>) -> CmdResult<ForceGateReport> {
    let mut conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    engine::force_gate(&mut conn).map_err(rule)
}

#[tauri::command]
pub fn edit_boss_milestone(
    db: State<Db>,
    id: i64,
    description: String,
    damage: i64,
    proof: VerificationType,
    req_stat: Option<String>,
    req_value: Option<i64>,
) -> CmdResult<()> {
    let conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    engine::edit_milestone(&conn, id, &description, damage, proof, req_stat, req_value).map_err(rule)
}

#[tauri::command]
pub fn delete_boss_milestone(db: State<Db>, id: i64) -> CmdResult<()> {
    let conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    engine::delete_milestone(&conn, id).map_err(rule)
}

/// Burn the world. Demands the literal confirmation phrase — this is the one
/// button that erases a life's ledger.
#[tauri::command]
pub fn reset_world(db: State<Db>, confirmation: String) -> CmdResult<()> {
    if confirmation.trim() != "RESET" {
        return Err("Type RESET exactly to burn the world. The engine does not accept hesitation.".into());
    }
    let mut conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    engine::reset_world(&mut conn).map_err(rule)
}

// ---------------------------------------------------------------------------
// Genesis & directives
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn complete_genesis(db: State<Db>, payload: GenesisPayload) -> CmdResult<()> {
    let mut conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    engine::genesis_seed(&mut conn, payload).map_err(rule)
}

#[tauri::command]
pub fn create_directive(db: State<Db>, payload: NewHabitPayload) -> CmdResult<i64> {
    let conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    engine::create_habit(&conn, payload).map_err(rule)
}

#[tauri::command]
pub fn edit_directive(db: State<Db>, payload: EditHabitPayload) -> CmdResult<()> {
    let conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    engine::edit_habit(&conn, payload).map_err(rule)
}

#[tauri::command]
pub fn archive_directive(db: State<Db>, id: i64, archived: bool) -> CmdResult<()> {
    let conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    engine::archive_habit(&conn, id, archived).map_err(rule)
}

#[tauri::command]
pub fn add_boss_milestone(
    db: State<Db>,
    boss_id: i64,
    description: String,
    damage: i64,
    proof: VerificationType,
    req_stat: Option<String>,
    req_value: Option<i64>,
) -> CmdResult<i64> {
    let conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    engine::add_milestone(&conn, boss_id, &description, damage, proof, req_stat, req_value).map_err(rule)
}

#[tauri::command]
pub fn mark_events_seen(db: State<Db>) -> CmdResult<()> {
    let conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    engine::mark_events_seen(&conn).map_err(rule)
}

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn create_quest(db: State<Db>, payload: NewQuestPayload) -> CmdResult<i64> {
    let conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    engine::create_quest(&conn, payload).map_err(rule)
}

#[tauri::command]
pub fn complete_quest(
    db: State<Db>,
    quest_id: i64,
    proof_path: Option<String>,
) -> CmdResult<QuestReport> {
    let mut conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    engine::complete_quest(&mut conn, quest_id, proof_path).map_err(rule)
}

#[tauri::command]
pub fn abandon_quest(db: State<Db>, quest_id: i64) -> CmdResult<()> {
    let conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    engine::abandon_quest(&conn, quest_id).map_err(rule)
}

// ---------------------------------------------------------------------------
// Rest days
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn declare_rest(db: State<Db>, day_offset: i64) -> CmdResult<()> {
    let conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    engine::declare_rest(&conn, day_offset).map_err(rule)
}

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn add_journal_entry(
    db: State<Db>,
    content: String,
    sector: Option<Sector>,
) -> CmdResult<i64> {
    let conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    engine::add_journal_entry(&conn, &content, sector).map_err(rule)
}

#[tauri::command]
pub fn get_journal(db: State<Db>, limit: i64, offset: i64) -> CmdResult<Vec<JournalEntryView>> {
    let conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    engine::load_journal(&conn, limit, offset).map_err(rule)
}

/// The Oracle reads a journal entry against the live snapshot. Remote when a
/// key is sealed; otherwise the offline deterministic voice. The reflection
/// is stored on the entry either way.
#[tauri::command]
pub async fn reflect_on_journal(db: State<'_, Db>, entry_id: i64) -> CmdResult<String> {
    let (snap, model, content) = {
        let mut conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
        engine::ensure_profile(&conn).map_err(rule)?;
        let today = chrono::Local::now().date_naive();
        engine::process_pending_days(&mut conn, today).map_err(rule)?;
        let content: String = conn
            .query_row(
                "SELECT content FROM journal_entries WHERE id = ?1",
                params![entry_id],
                |r| r.get(0),
            )
            .map_err(|_| "Unknown journal entry.".to_string())?;
        let model =
            db::get_setting(&conn, "oracle_model").unwrap_or_else(|| oracle::DEFAULT_MODEL.into());
        let configured = oracle::load_api_key().is_some();
        let snap = snapshot::build_snapshot(&conn, &db.db_path.to_string_lossy(), configured, model.clone())
            .map_err(rule)?;
        (snap, model, content)
    };

    let reflection = match oracle::load_api_key() {
        Some(key) => match oracle::reflect_on_journal_remote(&model, &key, &content, &snap).await {
            Ok(r) => r,
            Err(_) => oracle::reflect_on_journal_local(&content, &snap),
        },
        None => oracle::reflect_on_journal_local(&content, &snap),
    };

    let conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    engine::store_journal_reflection(&conn, entry_id, &reflection).map_err(rule)?;
    Ok(reflection)
}

// ---------------------------------------------------------------------------
// Chronicle history
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_chronicle(db: State<Db>, limit: i64, offset: i64) -> CmdResult<Vec<ExecutionLogView>> {
    let conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    let mut stmt = conn
        .prepare(
            "SELECT l.id, l.habit_id, h.habit_name, h.sector_type, h.weight_class,
                    l.execution_timestamp, l.day_key, l.file_proof_path, l.note,
                    l.stamina_cost, l.momentum_after, l.overdraft, l.off_window
             FROM habit_execution_logs l JOIN habit_configs h ON h.id = l.habit_id
             ORDER BY l.id DESC LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![limit.clamp(1, 500), offset.max(0)], |r| {
            Ok(ExecutionLogView {
                id: r.get(0)?,
                habit_id: r.get(1)?,
                habit_name: r.get(2)?,
                sector: Sector::from_db(&r.get::<_, String>(3)?),
                weight: WeightClass::from_db(&r.get::<_, String>(4)?),
                timestamp: r.get(5)?,
                day_key: r.get(6)?,
                proof_path: r.get(7)?,
                note: r.get(8)?,
                stamina_cost: r.get(9)?,
                momentum_after: r.get(10)?,
                overdraft: r.get::<_, i64>(11)? == 1,
                off_window: r.get::<_, i64>(12)? == 1,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn get_all_events(db: State<Db>, limit: i64) -> CmdResult<Vec<SystemEvent>> {
    let conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    let mut stmt = conn
        .prepare("SELECT id, day_key, ts, kind, detail, seen FROM system_events ORDER BY id DESC LIMIT ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![limit.clamp(1, 1000)], |r| {
            Ok(SystemEvent {
                id: r.get(0)?,
                day_key: r.get(1)?,
                timestamp: r.get(2)?,
                kind: r.get(3)?,
                detail: r.get(4)?,
                seen: r.get::<_, i64>(5)? == 1,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

// ---------------------------------------------------------------------------
// Oracle bridge
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn fetch_persona_critique(
    db: State<'_, Db>,
    persona: String,
    prefer_remote: bool,
) -> CmdResult<OracleResponse> {
    // Assemble the read-only snapshot inside the lock, then release before I/O.
    let (snap, model) = {
        let mut conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
        engine::ensure_profile(&conn).map_err(rule)?;
        let today = chrono::Local::now().date_naive();
        engine::process_pending_days(&mut conn, today).map_err(rule)?;
        let model =
            db::get_setting(&conn, "oracle_model").unwrap_or_else(|| oracle::DEFAULT_MODEL.into());
        let configured = oracle::load_api_key().is_some();
        let snap = snapshot::build_snapshot(&conn, &db.db_path.to_string_lossy(), configured, model.clone())
            .map_err(rule)?;
        (snap, model)
    };

    let key = oracle::load_api_key();
    let mut response = match (prefer_remote, key) {
        (true, Some(key)) => match oracle::fetch_remote_critique(&persona, &model, &key, &snap).await {
            Ok(r) => r,
            Err(err) => {
                let mut fallback = oracle::local_critique(&persona, &snap, true);
                fallback.upstream_error = Some(err);
                fallback
            }
        },
        _ => oracle::local_critique(&persona, &snap, false),
    };

    if response.narrative_log.trim().is_empty() {
        response = oracle::local_critique(&persona, &snap, true);
    }

    let conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    conn.execute(
        "INSERT INTO oracle_logs (ts, persona, mode, bias, narrative) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            response.timestamp,
            response.persona_emitter,
            response.mode,
            response.cognitive_bias_detected,
            response.narrative_log
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(response)
}

/// Ambient diagnostic: the offline deterministic engine, without persisting a
/// consultation. Used by the Today page's always-on Oracle panel.
#[tauri::command]
pub fn get_ambient_diagnostic(db: State<'_, Db>, persona: String) -> CmdResult<OracleResponse> {
    let mut conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    engine::ensure_profile(&conn).map_err(rule)?;
    let today = chrono::Local::now().date_naive();
    engine::process_pending_days(&mut conn, today).map_err(rule)?;
    let model =
        db::get_setting(&conn, "oracle_model").unwrap_or_else(|| oracle::DEFAULT_MODEL.into());
    let configured = oracle::load_api_key().is_some();
    let snap = snapshot::build_snapshot(&conn, &db.db_path.to_string_lossy(), configured, model)
        .map_err(rule)?;
    Ok(oracle::local_critique(&persona, &snap, false))
}

#[tauri::command]
pub fn get_oracle_logs(db: State<Db>, limit: i64) -> CmdResult<Vec<OracleLogView>> {
    let conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    let mut stmt = conn
        .prepare("SELECT id, ts, persona, mode, bias, narrative FROM oracle_logs ORDER BY id DESC LIMIT ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![limit.clamp(1, 200)], |r| {
            Ok(OracleLogView {
                id: r.get(0)?,
                timestamp: r.get(1)?,
                persona: r.get(2)?,
                mode: r.get(3)?,
                bias: r.get(4)?,
                narrative: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

/// The Oracle drafts editable milestones for a boss from the operator's goal
/// text. Strictly read-only: nothing is written until the operator forges the
/// edited proposals through `add_boss_milestone`.
#[tauri::command]
pub async fn propose_milestones(
    db: State<'_, Db>,
    boss_id: i64,
    goal_text: String,
) -> CmdResult<Vec<oracle::ProposedMilestone>> {
    if goal_text.trim().len() < 8 {
        return Err("Describe the goal in at least a sentence — the Oracle does not read minds.".into());
    }
    let (model, ctx) = {
        let conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
        let model =
            db::get_setting(&conn, "oracle_model").unwrap_or_else(|| oracle::DEFAULT_MODEL.into());
        let p = engine::load_profile(&conn).map_err(rule)?;
        let boss = engine::load_bosses(&conn, p.level)
            .map_err(rule)?
            .into_iter()
            .find(|b| b.id == boss_id)
            .ok_or("Unknown boss — it does not stand in this chapter.")?;
        if boss.defeated {
            return Err("This boss is already destroyed; its campaign is closed.".into());
        }
        let existing: Vec<String> = conn
            .prepare("SELECT description FROM boss_milestones WHERE boss_id = ?1")
            .and_then(|mut s| {
                s.query_map(params![boss_id], |r| r.get::<_, String>(0))?
                    .collect::<Result<Vec<_>, _>>()
            })
            .map_err(|e| e.to_string())?;
        let level_title = crate::catalog::level_def(p.level).title.to_string();
        (
            model,
            oracle::MilestoneDraftContext {
                boss_name: boss.name,
                boss_lore: boss.lore,
                sector: boss.sector.as_db().to_string(),
                level_title,
                remaining_hp: boss.current_hp,
                sector_mult: crate::formulas::sector_mult(boss.sector),
                existing,
                operator_environment: p.environment_text.clone(),
                operator_threats: p.threats_text.clone(),
            },
        )
    };
    let key = oracle::load_api_key()
        .ok_or("No API key sealed in the credential store. Configure the Oracle in Settings first.")?;
    oracle::propose_milestones_remote(&model, &key, &ctx, goal_text.trim()).await
}

#[tauri::command]
pub fn set_oracle_key(key: String) -> CmdResult<()> {
    oracle::store_api_key(&key)
}

#[tauri::command]
pub fn get_oracle_status(db: State<Db>) -> CmdResult<HashMap<String, String>> {
    let conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    let mut map = HashMap::new();
    map.insert(
        "configured".into(),
        if oracle::load_api_key().is_some() { "true".into() } else { "false".into() },
    );
    map.insert(
        "model".into(),
        db::get_setting(&conn, "oracle_model").unwrap_or_else(|| oracle::DEFAULT_MODEL.into()),
    );
    Ok(map)
}

#[tauri::command]
pub async fn test_oracle_connection(db: State<'_, Db>) -> CmdResult<String> {
    let model = {
        let conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
        db::get_setting(&conn, "oracle_model").unwrap_or_else(|| oracle::DEFAULT_MODEL.into())
    };
    let key = oracle::load_api_key().ok_or("No API key sealed in the credential store.")?;
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model, key
    );
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    // Shares the retry logic, so a transient 503 during a test doesn't read as
    // a real failure.
    oracle::post_with_retry(
        &client,
        &url,
        &serde_json::json!({
            "contents": [{"role": "user", "parts": [{"text": "Reply with the single word: READY"}]}],
            "generationConfig": {"maxOutputTokens": 10}
        }),
    )
    .await?;
    Ok(format!("Bridge verified. Model '{model}' is reachable and answering."))
}

// ---------------------------------------------------------------------------
// Settings, vault, maintenance
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_settings(db: State<Db>) -> CmdResult<HashMap<String, String>> {
    let conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    let mut stmt = conn
        .prepare("SELECT key, value FROM app_settings")
        .map_err(|e| e.to_string())?;
    let mut map: HashMap<String, String> = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<HashMap<_, _>, _>>()
        .map_err(|e| e.to_string())?;
    map.entry("master_volume".into()).or_insert("0.85".into());
    map.entry("music_volume".into()).or_insert("0.6".into());
    map.entry("sfx_volume".into()).or_insert("0.9".into());
    map.entry("reduced_motion".into()).or_insert("false".into());
    map.entry("confirm_destructive".into()).or_insert("true".into());
    map.entry("startup_view".into()).or_insert("today".into());
    map.entry("oracle_model".into())
        .or_insert(oracle::DEFAULT_MODEL.into());
    map.entry("difficulty".into()).or_insert("standard".into());
    map.insert("vault_root".into(), db.vault_root.to_string_lossy().to_string());
    map.insert("db_path".into(), db.db_path.to_string_lossy().to_string());
    Ok(map)
}

#[tauri::command]
pub fn set_app_setting(db: State<Db>, key: String, value: String) -> CmdResult<()> {
    const ALLOWED: &[&str] = &[
        "master_volume",
        "music_volume",
        "sfx_volume",
        "reduced_motion",
        "confirm_destructive",
        "startup_view",
        "oracle_model",
        "difficulty",
    ];
    if !ALLOWED.contains(&key.as_str()) {
        return Err(format!("Unknown setting key: {key}"));
    }
    let conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    db::set_setting(&conn, &key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_proof_thumbnail(path: String) -> CmdResult<String> {
    crate::vault::read_proof_thumbnail(&path)
}

#[tauri::command]
pub fn export_backup(db: State<Db>) -> CmdResult<String> {
    let conn = db.conn.lock().map_err(|_| "state lock poisoned")?;
    // Flush the WAL into the main file so the copied db is complete.
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|e| e.to_string())?;
    crate::vault::export_backup(&db.db_path, &db.vault_root)
}
