//! Forensic inspector: opens a copied database (with its WAL) read-only and
//! reports what actually lives inside. Never used by the app itself.

fn main() {
    let path = std::env::args().nth(1).expect("usage: inspect <db path>");
    let conn = rusqlite::Connection::open(&path).expect("open");

    let count = |sql: &str| -> i64 {
        conn.query_row(sql, [], |r| r.get(0)).unwrap_or(-1)
    };

    println!("== migrations ==");
    if let Ok(mut stmt) = conn.prepare("SELECT version FROM schema_migrations ORDER BY version") {
        let rows = stmt.query_map([], |r| r.get::<_, String>(0)).unwrap();
        for v in rows.flatten() {
            println!("  {v}");
        }
    }

    println!("== profile ==");
    if let Ok((name, genesis, level, momentum)) = conn.query_row(
        "SELECT name, genesis_complete, current_level, momentum_coefficient FROM user_profiles LIMIT 1",
        [],
        |r| Ok((
            r.get::<_, String>(0)?,
            r.get::<_, i64>(1)?,
            r.get::<_, i64>(2)?,
            r.get::<_, f64>(3)?,
        )),
    ) {
        println!("  name='{name}' genesis_complete={genesis} level={level} momentum={momentum}");
    } else {
        println!("  NO PROFILE ROW");
    }

    println!("== row counts ==");
    for table in [
        "user_profiles", "habit_configs", "habit_execution_logs", "boss_campaigns",
        "boss_milestones", "system_days", "system_events", "oracle_logs",
        "journal_entries", "quests", "rest_days", "app_settings",
    ] {
        println!("  {table}: {}", count(&format!("SELECT COUNT(*) FROM {table}")));
    }

    println!("== app_settings ==");
    if let Ok(mut stmt) = conn.prepare("SELECT key, value FROM app_settings") {
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .unwrap();
        for (k, v) in rows.flatten() {
            println!("  {k} = {v}");
        }
    }

    println!("== last 10 events (any) ==");
    if let Ok(mut stmt) =
        conn.prepare("SELECT day_key, kind, detail FROM system_events ORDER BY id DESC LIMIT 10")
    {
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            })
            .unwrap();
        for (d, k, det) in rows.flatten() {
            println!("  [{d}] {k}: {det}");
        }
    };
    println!("== end ==");
}
