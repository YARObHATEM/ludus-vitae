//! Database layer: hardened SQLite connection (WAL, foreign keys), versioned
//! migrations, and the locked-transaction retry loop mandated by the
//! scaffolding rules (3 attempts, 200 ms apart).

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Db {
    pub conn: Mutex<Connection>,
    pub db_path: PathBuf,
    pub vault_root: PathBuf,
}

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("database error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

/// Migration list. Never edit an applied migration — append a new one.
const MIGRATIONS: &[(&str, &str)] = &[(
    "0001_iron_core",
    r#"
CREATE TABLE IF NOT EXISTS user_profiles (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL DEFAULT 'The Operator',
    oath TEXT NOT NULL DEFAULT '',
    environment_text TEXT NOT NULL DEFAULT '',
    threats_text TEXT NOT NULL DEFAULT '',
    current_level INTEGER NOT NULL DEFAULT 1 CHECK (current_level BETWEEN 1 AND 10),
    xp_str REAL NOT NULL DEFAULT 0,
    xp_int REAL NOT NULL DEFAULT 0,
    xp_cha REAL NOT NULL DEFAULT 0,
    xp_wil REAL NOT NULL DEFAULT 0,
    current_stamina REAL NOT NULL DEFAULT 100,
    momentum_coefficient REAL NOT NULL DEFAULT 1.0,
    level_started_day TEXT NOT NULL,
    cycle_count INTEGER NOT NULL DEFAULT 0,
    last_processed_day TEXT NOT NULL,
    genesis_complete INTEGER NOT NULL DEFAULT 0 CHECK (genesis_complete IN (0,1)),
    created_at TEXT NOT NULL,
    last_login_timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habit_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    sector_type TEXT NOT NULL CHECK (sector_type IN ('FINANCIAL','INTELLECTUAL','PHYSICAL','RESPONSIBILITY')),
    weight_class TEXT NOT NULL CHECK (weight_class IN ('TRIVIAL','STANDARD','HEROIC','MYTHIC')),
    verification_type TEXT NOT NULL CHECK (verification_type IN ('IMAGE','FILE','MANUAL')),
    target_frequency_hours INTEGER NOT NULL DEFAULT 24,
    window_start_hour INTEGER,
    window_end_hour INTEGER,
    consecutive_misses INTEGER NOT NULL DEFAULT 0,
    last_executed_day TEXT,
    created_day TEXT NOT NULL,
    is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1))
);

CREATE TABLE IF NOT EXISTS habit_execution_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id INTEGER NOT NULL,
    execution_timestamp TEXT NOT NULL,
    day_key TEXT NOT NULL,
    file_proof_path TEXT,
    note TEXT,
    stamina_cost REAL NOT NULL DEFAULT 0,
    momentum_after REAL NOT NULL DEFAULT 1.0,
    overdraft INTEGER NOT NULL DEFAULT 0 CHECK (overdraft IN (0,1)),
    off_window INTEGER NOT NULL DEFAULT 0 CHECK (off_window IN (0,1)),
    FOREIGN KEY (habit_id) REFERENCES habit_configs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS local_weapon_metrics (
    profile_id INTEGER PRIMARY KEY CHECK (profile_id = 1),
    sharpness REAL NOT NULL DEFAULT 10.0,
    durability REAL NOT NULL DEFAULT 100.0,
    fire_affinity REAL NOT NULL DEFAULT 0.0,
    lightning_affinity REAL NOT NULL DEFAULT 0.0,
    blunted INTEGER NOT NULL DEFAULT 0 CHECK (blunted IN (0,1)),
    reforge_progress INTEGER NOT NULL DEFAULT 0,
    forge_count_total INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS boss_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_level_gate INTEGER NOT NULL,
    sector_origin TEXT NOT NULL CHECK (sector_origin IN ('FINANCIAL','INTELLECTUAL','PHYSICAL')),
    boss_name TEXT NOT NULL,
    lore TEXT NOT NULL DEFAULT '',
    total_hp REAL NOT NULL,
    current_hp REAL NOT NULL,
    armor REAL NOT NULL DEFAULT 0,
    is_defeated INTEGER NOT NULL DEFAULT 0 CHECK (is_defeated IN (0,1)),
    is_ascended INTEGER NOT NULL DEFAULT 0 CHECK (is_ascended IN (0,1)),
    ascended_from_level INTEGER,
    defeated_at TEXT
);

CREATE TABLE IF NOT EXISTS boss_milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    boss_id INTEGER NOT NULL,
    milestone_order INTEGER NOT NULL,
    description TEXT NOT NULL,
    damage_value INTEGER NOT NULL,
    required_proof_type TEXT NOT NULL CHECK (required_proof_type IN ('IMAGE','FILE','MANUAL')),
    req_stat TEXT CHECK (req_stat IN ('STR','INT','CHA','WIL')),
    req_value INTEGER,
    is_completed INTEGER NOT NULL DEFAULT 0 CHECK (is_completed IN (0,1)),
    completed_at TEXT,
    proof_path TEXT,
    FOREIGN KEY (boss_id) REFERENCES boss_campaigns(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS system_days (
    day_key TEXT PRIMARY KEY,
    executions INTEGER NOT NULL DEFAULT 0,
    misses INTEGER NOT NULL DEFAULT 0,
    momentum_open REAL NOT NULL,
    momentum_close REAL NOT NULL,
    stamina_open REAL NOT NULL,
    stamina_close REAL NOT NULL,
    sharpness_close REAL NOT NULL,
    durability_close REAL NOT NULL,
    perfect INTEGER NOT NULL DEFAULT 0 CHECK (perfect IN (0,1))
);

CREATE TABLE IF NOT EXISTS system_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day_key TEXT NOT NULL,
    ts TEXT NOT NULL,
    kind TEXT NOT NULL,
    detail TEXT NOT NULL,
    seen INTEGER NOT NULL DEFAULT 0 CHECK (seen IN (0,1))
);

CREATE TABLE IF NOT EXISTS oracle_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    persona TEXT NOT NULL,
    mode TEXT NOT NULL,
    bias TEXT NOT NULL DEFAULT 'NONE',
    narrative TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_habit_logs ON habit_execution_logs(habit_id, execution_timestamp);
CREATE INDEX IF NOT EXISTS idx_habit_logs_day ON habit_execution_logs(day_key);
CREATE INDEX IF NOT EXISTS idx_verified_habit_logs ON habit_execution_logs(execution_timestamp) WHERE file_proof_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_boss_level ON boss_campaigns(target_level_gate);
CREATE INDEX IF NOT EXISTS idx_events_seen ON system_events(seen);
"#,
),
(
    "0002_siege_and_open_gates",
    r#"
ALTER TABLE habit_configs ADD COLUMN sworn_boss_id INTEGER REFERENCES boss_campaigns(id);
ALTER TABLE boss_campaigns ADD COLUMN siege_dealt REAL NOT NULL DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN last_reckoning_day TEXT;
"#,
),
(
    "0003_quests_rest_journal",
    r#"
CREATE TABLE IF NOT EXISTS quests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    sector_type TEXT NOT NULL CHECK (sector_type IN ('FINANCIAL','INTELLECTUAL','PHYSICAL','RESPONSIBILITY')),
    weight_class TEXT NOT NULL CHECK (weight_class IN ('TRIVIAL','STANDARD','HEROIC','MYTHIC')),
    verification_type TEXT NOT NULL CHECK (verification_type IN ('IMAGE','FILE','MANUAL')),
    deadline_day TEXT,
    created_day TEXT NOT NULL,
    completed_at TEXT,
    proof_path TEXT,
    is_abandoned INTEGER NOT NULL DEFAULT 0 CHECK (is_abandoned IN (0,1))
);

CREATE TABLE IF NOT EXISTS journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    day_key TEXT NOT NULL,
    sector_type TEXT CHECK (sector_type IN ('FINANCIAL','INTELLECTUAL','PHYSICAL','RESPONSIBILITY')),
    content TEXT NOT NULL,
    oracle_reflection TEXT
);

CREATE TABLE IF NOT EXISTS rest_days (
    day_key TEXT PRIMARY KEY
);

ALTER TABLE user_profiles ADD COLUMN rest_tokens INTEGER NOT NULL DEFAULT 4;
"#,
)];

/// Burn the world: erase all game state, keep application settings and the
/// sealed API key. The Genesis Ritual returns on the next snapshot.
pub fn reset_world(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "DELETE FROM habit_execution_logs;
         DELETE FROM boss_milestones;
         DELETE FROM boss_campaigns;
         DELETE FROM habit_configs;
         DELETE FROM system_days;
         DELETE FROM system_events;
         DELETE FROM oracle_logs;
         DELETE FROM quests;
         DELETE FROM journal_entries;
         DELETE FROM rest_days;
         DELETE FROM local_weapon_metrics;
         DELETE FROM user_profiles;",
    )
}

/// Open (or create) the database with the hardened pragma set.
pub fn open_connection(path: &PathBuf) -> Result<Connection, DbError> {
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA temp_store = MEMORY;",
    )?;
    Ok(conn)
}

/// Apply pending migrations in order, tracked in schema_migrations.
pub fn migrate(conn: &Connection) -> Result<(), DbError> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL
         );",
    )?;
    for (version, sql) in MIGRATIONS {
        let applied: i64 = conn.query_row(
            "SELECT COUNT(*) FROM schema_migrations WHERE version = ?1",
            [version],
            |r| r.get(0),
        )?;
        if applied == 0 {
            conn.execute_batch(sql)?;
            conn.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, ?2)",
                rusqlite::params![version, chrono::Local::now().to_rfc3339()],
            )?;
        }
    }
    Ok(())
}

/// Run `f` inside an IMMEDIATE transaction with the mandated retry loop:
/// 3 attempts spaced 200 ms apart on lock contention, then bubble the error.
pub fn with_tx<T>(
    conn: &mut Connection,
    f: impl Fn(&rusqlite::Transaction) -> Result<T, rusqlite::Error>,
) -> Result<T, rusqlite::Error> {
    let mut attempt = 0;
    loop {
        attempt += 1;
        let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate);
        match tx {
            Ok(tx) => match f(&tx) {
                Ok(v) => {
                    tx.commit()?;
                    return Ok(v);
                }
                Err(e) if is_locked(&e) && attempt < 3 => {
                    drop(tx);
                    std::thread::sleep(std::time::Duration::from_millis(200));
                }
                Err(e) => return Err(e),
            },
            Err(e) if is_locked(&e) && attempt < 3 => {
                std::thread::sleep(std::time::Duration::from_millis(200));
            }
            Err(e) => return Err(e),
        }
    }
}

fn is_locked(e: &rusqlite::Error) -> bool {
    matches!(
        e,
        rusqlite::Error::SqliteFailure(err, _)
            if err.code == rusqlite::ErrorCode::DatabaseBusy
            || err.code == rusqlite::ErrorCode::DatabaseLocked
    )
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

pub fn get_setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        [key],
        |r| r.get::<_, String>(0),
    )
    .ok()
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![key, value],
    )?;
    Ok(())
}
