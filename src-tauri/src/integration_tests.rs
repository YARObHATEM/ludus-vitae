//! Full-pipeline integration tests over a throwaway SQLite database:
//! genesis → execution → milestone → night closes → the Reckoning.

#![cfg(test)]

use crate::db;
use crate::engine;
use crate::model::*;
use chrono::Local;
use rusqlite::Connection;

fn fresh_db() -> Connection {
    let conn = Connection::open_in_memory().expect("in-memory db");
    conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
    db::migrate(&conn).expect("migrations apply");
    engine::ensure_profile(&conn).expect("profile seeded");
    conn
}

fn genesis(conn: &mut Connection) {
    engine::genesis_seed(
        conn,
        GenesisPayload {
            name: "Test Operator".into(),
            oath: "I will not stay small.".into(),
            environment_text: "dead city".into(),
            threats_text: "inertia".into(),
            habits: vec![
                NewHabitPayload {
                    name: "Ledger Build".into(),
                    description: "".into(),
                    sector: Sector::Financial,
                    weight: WeightClass::Heroic,
                    verification: VerificationType::Manual,
                    frequency_hours: 24,
                    window_start_hour: None,
                    window_end_hour: None,
                    sworn_boss_id: None,
                },
                NewHabitPayload {
                    name: "Conditioning".into(),
                    description: "".into(),
                    sector: Sector::Physical,
                    weight: WeightClass::Standard,
                    verification: VerificationType::Manual,
                    frequency_hours: 24,
                    window_start_hour: None,
                    window_end_hour: None,
                    sworn_boss_id: None,
                },
            ],
            milestones: vec![
                GenesisMilestonePayload {
                    sector: Sector::Financial,
                    description: "First strike".into(),
                    damage_value: 40,
                    proof_type: VerificationType::Manual,
                },
                GenesisMilestonePayload {
                    sector: Sector::Physical,
                    description: "Thirty units".into(),
                    damage_value: 50,
                    proof_type: VerificationType::Manual,
                },
                GenesisMilestonePayload {
                    sector: Sector::Intellectual,
                    description: "Book extraction".into(),
                    damage_value: 25,
                    proof_type: VerificationType::Manual,
                },
            ],
        },
    )
    .expect("genesis succeeds");
}

#[test]
fn genesis_spawns_the_first_chapter() {
    let mut conn = fresh_db();
    genesis(&mut conn);
    let p = engine::load_profile(&conn).unwrap();
    assert!(p.genesis_complete);
    assert_eq!(p.level, 1);
    let bosses = engine::load_bosses(&conn, 1).unwrap();
    assert_eq!(bosses.len(), 3);
    assert!(bosses.iter().any(|b| b.name == "Malachai's Ledger"));
    assert!(bosses.iter().all(|b| (b.total_hp - 100.0).abs() < 1e-9));
}

#[test]
fn execution_forges_and_double_execution_is_refused() {
    let mut conn = fresh_db();
    genesis(&mut conn);
    let habits = engine::load_habits(&conn, false).unwrap();
    let heroic = habits.iter().find(|h| h.name == "Ledger Build").unwrap().id;

    let before = engine::load_profile(&conn).unwrap();
    let report = engine::execute_habit(&mut conn, heroic, None, None).expect("first execution");
    let after = engine::load_profile(&conn).unwrap();
    let weapon = engine::load_weapon(&conn).unwrap();

    // HEROIC: +0.10 momentum, stamina paid, sharpness rose, WIL+CHA xp banked.
    assert!((after.momentum - (before.momentum + 0.10)).abs() < 1e-9);
    assert!(after.stamina < before.stamina);
    assert!(weapon.sharpness > 10.0);
    assert!(after.xp_cha > 0.0 && after.xp_wil > 0.0);
    assert!(report.verified);

    // The ledger does not double-count.
    let err = engine::execute_habit(&mut conn, heroic, None, None);
    assert!(err.is_err());
}

#[test]
fn milestone_damages_with_sector_weighting() {
    let mut conn = fresh_db();
    genesis(&mut conn);
    let bosses = engine::load_bosses(&conn, 1).unwrap();
    let fin = bosses.iter().find(|b| b.sector == Sector::Financial).unwrap();
    let ms_id: i64 = conn
        .query_row(
            "SELECT id FROM boss_milestones WHERE boss_id = ?1 ORDER BY milestone_order LIMIT 1",
            [fin.id],
            |r| r.get(0),
        )
        .unwrap();
    let report = engine::complete_milestone(&mut conn, ms_id, None).expect("milestone seals");
    // 40 damage × 1.5 financial multiplier = 60.
    assert!((report.damage_dealt - 60.0).abs() < 1e-9);
    assert!((report.boss_hp_after - 40.0).abs() < 1e-9);
    // Sealed twice? Refused.
    assert!(engine::complete_milestone(&mut conn, ms_id, None).is_err());
}

#[test]
fn night_closes_apply_miss_decay_and_friction() {
    let mut conn = fresh_db();
    genesis(&mut conn);
    let today = Local::now().date_naive();

    // Rewind the clock: genesis five days ago, nothing ever executed.
    let five_ago = today - chrono::Duration::days(5);
    conn.execute(
        "UPDATE user_profiles SET level_started_day = ?1, last_processed_day = ?1",
        [engine::day_key(five_ago)],
    )
    .unwrap();
    conn.execute("UPDATE habit_configs SET created_day = ?1", [engine::day_key(five_ago)]).unwrap();

    let closed = engine::process_pending_days(&mut conn, today).expect("catch-up runs");
    assert_eq!(closed, 5);

    let p = engine::load_profile(&conn).unwrap();
    let habits = engine::load_habits(&conn, false).unwrap();
    // Five missed days on both habits: momentum collapsed below 1.0, misses recorded.
    assert!(p.momentum < 1.0);
    assert!(habits.iter().all(|h| h.consecutive_misses == 5));
    // Friction now prices the heroic habit above its base 9.
    let cost = crate::formulas::activation_cost(WeightClass::Heroic, 5, p.momentum, false, p.stat_int());
    assert!(cost > 9.0 * 1.3f64.powi(4));
    // The chronicle recorded the days.
    let day_rows: i64 = conn.query_row("SELECT COUNT(*) FROM system_days", [], |r| r.get(0)).unwrap();
    assert_eq!(day_rows, 5);
}

#[test]
fn reckoning_demands_forged_blade_and_rested_arm() {
    let mut conn = fresh_db();
    genesis(&mut conn);
    // A dull blade (sharpness 10 at genesis) cannot call the Reckoning.
    assert!(engine::run_reckoning(&mut conn).is_err());

    // Forge the blade; the call now lands.
    conn.execute("UPDATE local_weapon_metrics SET sharpness = 55, durability = 90", []).unwrap();
    let report = engine::run_reckoning(&mut conn).expect("forged blade strikes");
    assert_eq!(report.strikes.len(), 3);
    // Survivors blunt the edge (untouched bosses take √0 completion → 0 damage).
    assert!(report.blunted);
    let w = engine::load_weapon(&conn).unwrap();
    assert!(w.blunted);
    assert!((w.durability - 80.0).abs() < 1e-9);

    // The arm is not rested: an immediate second call is refused.
    conn.execute("UPDATE local_weapon_metrics SET sharpness = 60", []).unwrap();
    let err = engine::run_reckoning(&mut conn);
    assert!(err.is_err(), "cooldown must refuse the second call");
}

#[test]
fn clean_clear_advances_without_debt() {
    let mut conn = fresh_db();
    genesis(&mut conn);
    // Wound every boss to the brink, forge the blade, then let one Reckoning
    // finish all three: a clean clear.
    conn.execute("UPDATE boss_campaigns SET current_hp = 3", []).unwrap();
    conn.execute("UPDATE local_weapon_metrics SET sharpness = 80, durability = 100", []).unwrap();
    let report = engine::run_reckoning(&mut conn).expect("reckoning runs");
    assert!(report.strikes.iter().all(|s| s.defeated), "all bosses must fall: {:?}", report.strikes);
    assert!(report.level_advanced);
    assert_eq!(report.new_level, 2);
    assert!(!report.blunted);
    // Level 2 holds exactly three fresh bosses — no ascended debt.
    let bosses = engine::load_bosses(&conn, 2).unwrap();
    assert_eq!(bosses.len(), 3);
    assert!(bosses.iter().all(|b| !b.ascended));
}

#[test]
fn forcing_the_gate_ascends_survivors_with_debt() {
    let mut conn = fresh_db();
    genesis(&mut conn);
    // Below thresholds the gate refuses force.
    assert!(engine::force_gate(&mut conn).is_err());

    // Kill FIN and INT outright, wound PHY to 55%: global 87%, sectors 100/100/55.
    conn.execute(
        "UPDATE boss_campaigns SET current_hp = 0, is_defeated = 1 WHERE sector_origin IN ('FINANCIAL','INTELLECTUAL')",
        [],
    ).unwrap();
    conn.execute("UPDATE boss_campaigns SET current_hp = 45 WHERE sector_origin = 'PHYSICAL'", []).unwrap();

    let report = engine::force_gate(&mut conn).expect("gate can be forced");
    assert_eq!(report.new_level, 2);
    assert_eq!(report.ascended_bosses.len(), 1);

    let p = engine::load_profile(&conn).unwrap();
    assert_eq!(p.level, 2);
    // Level 2: three fresh bosses plus the ascended survivor at +35%.
    let bosses = engine::load_bosses(&conn, 2).unwrap();
    assert_eq!(bosses.len(), 4);
    let ascended = bosses.iter().find(|b| b.ascended).expect("survivor ascended");
    assert_eq!(ascended.sector, Sector::Physical);
    assert!((ascended.total_hp - 135.0).abs() < 0.01);
    assert!(engine::sector_cursed(&conn, 2, Sector::Physical));
    assert!(!engine::sector_cursed(&conn, 2, Sector::Financial));
}

#[test]
fn sworn_directives_siege_their_boss_up_to_the_cap() {
    let mut conn = fresh_db();
    genesis(&mut conn);
    let fin_boss: i64 = conn
        .query_row("SELECT id FROM boss_campaigns WHERE sector_origin = 'FINANCIAL'", [], |r| r.get(0))
        .unwrap();
    // Swear the heroic ledger habit to Malachai's Ledger.
    conn.execute("UPDATE habit_configs SET sworn_boss_id = ?1 WHERE habit_name = 'Ledger Build'", [fin_boss]).unwrap();

    let habits = engine::load_habits(&conn, false).unwrap();
    let heroic = habits.iter().find(|h| h.name == "Ledger Build").unwrap().id;
    let report = engine::execute_habit(&mut conn, heroic, None, None).expect("sworn execution");
    // HEROIC siege: 0.5 × 1.5 weight = 0.75 raw × 1.5 financial = 1.125.
    assert!((report.siege_damage - 1.13).abs() < 0.01, "siege was {}", report.siege_damage);
    assert_eq!(report.siege_boss_name.as_deref(), Some("Malachai's Ledger"));

    // The cap: siege can never take more than 20% of a boss.
    conn.execute("UPDATE boss_campaigns SET siege_dealt = 19.5 WHERE id = ?1", [fin_boss]).unwrap();
    // Clear today's ledger so the same window can be exercised again in-test.
    conn.execute("DELETE FROM habit_execution_logs", []).unwrap();
    conn.execute("UPDATE habit_configs SET last_executed_day = NULL", []).unwrap();
    let report2 = engine::execute_habit(&mut conn, heroic, None, None).expect("capped execution");
    assert!((report2.siege_damage - 0.5).abs() < 0.01, "cap must clip: {}", report2.siege_damage);
}

#[test]
fn milestones_are_editable_until_sealed() {
    let mut conn = fresh_db();
    genesis(&mut conn);
    let ms_id: i64 = conn
        .query_row("SELECT id FROM boss_milestones ORDER BY id LIMIT 1", [], |r| r.get(0))
        .unwrap();
    engine::edit_milestone(&conn, ms_id, "Rewritten vow", 33, VerificationType::Manual, None, None)
        .expect("unsealed milestone edits");
    let (desc, dmg): (String, i64) = conn
        .query_row("SELECT description, damage_value FROM boss_milestones WHERE id = ?1", [ms_id], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .unwrap();
    assert_eq!(desc, "Rewritten vow");
    assert_eq!(dmg, 33);

    // Seal it, then editing and deleting are refused — history is locked.
    engine::complete_milestone(&mut conn, ms_id, None).unwrap();
    assert!(engine::edit_milestone(&conn, ms_id, "x", 10, VerificationType::Manual, None, None).is_err());
    assert!(engine::delete_milestone(&conn, ms_id).is_err());

    // An unsealed one deletes cleanly.
    let other: i64 = conn
        .query_row("SELECT id FROM boss_milestones WHERE is_completed = 0 ORDER BY id LIMIT 1", [], |r| r.get(0))
        .unwrap();
    engine::delete_milestone(&conn, other).expect("unsealed milestone deletes");
}

#[test]
fn reset_returns_the_world_to_the_void() {
    let mut conn = fresh_db();
    genesis(&mut conn);
    let habits = engine::load_habits(&conn, false).unwrap();
    engine::execute_habit(&mut conn, habits[0].id, None, None).unwrap();

    engine::reset_world(&mut conn).expect("the world burns");
    let p = engine::load_profile(&conn).unwrap();
    assert!(!p.genesis_complete, "genesis must return");
    let counts: (i64, i64, i64) = conn
        .query_row(
            "SELECT (SELECT COUNT(*) FROM habit_configs),
                    (SELECT COUNT(*) FROM boss_campaigns),
                    (SELECT COUNT(*) FROM habit_execution_logs)",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap();
    assert_eq!(counts, (0, 0, 0));
}

#[test]
fn snapshot_assembles_the_complete_read_model() {
    let mut conn = fresh_db();
    genesis(&mut conn);
    let habits = engine::load_habits(&conn, false).unwrap();
    engine::execute_habit(&mut conn, habits[0].id, None, None).unwrap();

    let snap = crate::snapshot::build_snapshot(&conn, ":memory:", false, "gemini-2.0-flash".into())
        .expect("snapshot builds");
    assert_eq!(snap.profile.current_level, 1);
    assert_eq!(snap.bosses.len(), 3);
    assert_eq!(snap.levels.len(), 10);
    assert_eq!(snap.equipment.len(), 30);
    assert!(snap.habits.iter().any(|h| h.executed_today));
    assert!(snap.projection.momentum_if_all_missed <= snap.profile.momentum);
    // One habit is still due — the engine must recommend it.
    let rec = snap.recommended.as_ref().expect("a due directive must be recommended");
    assert_eq!(rec.habit_name, "Conditioning");
    assert!(!rec.reason.is_empty());

    // The offline oracle speaks deterministically from this snapshot.
    let critique = crate::oracle::local_critique("ORACLE", &snap, false);
    assert!(!critique.narrative_log.is_empty());
    assert!(critique.narrative_log.chars().count() <= 280);
    let again = crate::oracle::local_critique("ORACLE", &snap, false);
    assert_eq!(critique.narrative_log, again.narrative_log, "offline oracle must be deterministic");
}
