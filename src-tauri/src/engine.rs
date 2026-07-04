//! The deterministic engine: every mutation of game state passes through
//! here, inside transactions, using only the laws in `formulas.rs`.
//!
//! Time model: state changes are anchored to local calendar days. The engine
//! is lazy — on every snapshot it "closes" any elapsed days since the last
//! processed one, so decay applies even when the application never opened.

use chrono::{Local, NaiveDate, Timelike};
use rusqlite::{params, Connection, OptionalExtension};

use crate::catalog;
use crate::formulas as f;
use crate::model::*;

#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    #[error("{0}")]
    Rule(String),
    #[error("database error: {0}")]
    Db(#[from] rusqlite::Error),
}

pub type EResult<T> = Result<T, EngineError>;

pub fn day_key(d: NaiveDate) -> String {
    d.format("%Y-%m-%d").to_string()
}

pub fn parse_day(s: &str) -> NaiveDate {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap_or_else(|_| Local::now().date_naive())
}

pub fn now_ts() -> String {
    Local::now().to_rfc3339()
}

// ---------------------------------------------------------------------------
// Raw rows
// ---------------------------------------------------------------------------

pub struct RawProfile {
    pub name: String,
    pub oath: String,
    pub environment_text: String,
    pub threats_text: String,
    pub level: i64,
    pub xp_str: f64,
    pub xp_int: f64,
    pub xp_cha: f64,
    pub xp_wil: f64,
    pub stamina: f64,
    pub momentum: f64,
    pub level_started_day: NaiveDate,
    pub cycle_count: i64,
    pub last_processed_day: NaiveDate,
    pub last_reckoning_day: Option<NaiveDate>,
    pub genesis_complete: bool,
    pub created_at: String,
}

impl RawProfile {
    pub fn stat_str(&self) -> i64 { f::stat_value(self.xp_str) }
    pub fn stat_int(&self) -> i64 { f::stat_value(self.xp_int) }
    pub fn stat_cha(&self) -> i64 { f::stat_value(self.xp_cha) }
    pub fn stat_wil(&self) -> i64 { f::stat_value(self.xp_wil) }
    pub fn max_stamina(&self) -> f64 { f::max_stamina(self.stat_str()) }
    pub fn campaign_day(&self, today: NaiveDate) -> i64 {
        (today - self.level_started_day).num_days().max(0)
    }
}

pub struct RawWeapon {
    pub sharpness: f64,
    pub durability: f64,
    pub fire: f64,
    pub lightning: f64,
    pub blunted: bool,
    pub reforge_progress: i64,
    pub forge_count_total: i64,
}

impl RawWeapon {
    pub fn state(&self) -> WeaponState {
        f::weapon_state(self.durability, self.blunted)
    }
}

pub struct HabitRow {
    pub id: i64,
    pub name: String,
    pub description: String,
    pub sector: Sector,
    pub weight: WeightClass,
    pub verification: VerificationType,
    pub frequency_hours: i64,
    pub window_start_hour: Option<i64>,
    pub window_end_hour: Option<i64>,
    pub consecutive_misses: i64,
    pub last_executed_day: Option<NaiveDate>,
    pub created_day: NaiveDate,
    pub is_archived: bool,
    pub sworn_boss_id: Option<i64>,
}

impl HabitRow {
    pub fn period_days(&self) -> i64 {
        (self.frequency_hours / 24).max(1)
    }
    fn anchor(&self) -> NaiveDate {
        self.last_executed_day.unwrap_or(self.created_day)
    }
    /// Days elapsed since the last execution (or creation).
    fn elapsed(&self, day: NaiveDate) -> i64 {
        (day - self.anchor()).num_days()
    }
    /// A habit is due when a full period has elapsed since its anchor.
    pub fn due_on(&self, day: NaiveDate) -> bool {
        if self.is_archived || day < self.created_day {
            return false;
        }
        match self.last_executed_day {
            None => day >= self.created_day,
            Some(_) => self.elapsed(day) >= self.period_days(),
        }
    }
    /// One miss per elapsed period boundary — a 3-day habit does not bleed
    /// three misses in one bad window. A never-executed habit misses at the
    /// close of each full period since creation, starting with its first day.
    pub fn missed_on(&self, day: NaiveDate) -> bool {
        if !self.due_on(day) {
            return false;
        }
        let e = self.elapsed(day);
        match self.last_executed_day {
            None => (e + 1) % self.period_days() == 0,
            Some(_) => e > 0 && e % self.period_days() == 0,
        }
    }
    pub fn in_window(&self, hour: i64) -> bool {
        match (self.window_start_hour, self.window_end_hour) {
            (Some(s), Some(e)) if s < e => hour >= s && hour < e,
            (Some(s), None) => hour >= s,
            (None, Some(e)) => hour < e,
            _ => true,
        }
    }
}

// ---------------------------------------------------------------------------
// Loaders / savers
// ---------------------------------------------------------------------------

pub fn ensure_profile(conn: &Connection) -> EResult<()> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM user_profiles", [], |r| r.get(0))?;
    if count == 0 {
        let today = day_key(Local::now().date_naive());
        conn.execute(
            "INSERT INTO user_profiles (id, level_started_day, last_processed_day, created_at, last_login_timestamp)
             VALUES (1, ?1, ?1, ?2, ?2)",
            params![today, now_ts()],
        )?;
    }
    let wcount: i64 = conn.query_row("SELECT COUNT(*) FROM local_weapon_metrics", [], |r| r.get(0))?;
    if wcount == 0 {
        conn.execute("INSERT INTO local_weapon_metrics (profile_id) VALUES (1)", [])?;
    }
    conn.execute(
        "UPDATE user_profiles SET last_login_timestamp = ?1 WHERE id = 1",
        params![now_ts()],
    )?;
    Ok(())
}

pub fn load_profile(conn: &Connection) -> EResult<RawProfile> {
    let p = conn.query_row(
        "SELECT name, oath, environment_text, threats_text, current_level,
                xp_str, xp_int, xp_cha, xp_wil, current_stamina, momentum_coefficient,
                level_started_day, cycle_count, last_processed_day, genesis_complete, created_at,
                last_reckoning_day
         FROM user_profiles WHERE id = 1",
        [],
        |r| {
            Ok(RawProfile {
                name: r.get(0)?,
                oath: r.get(1)?,
                environment_text: r.get(2)?,
                threats_text: r.get(3)?,
                level: r.get(4)?,
                xp_str: r.get(5)?,
                xp_int: r.get(6)?,
                xp_cha: r.get(7)?,
                xp_wil: r.get(8)?,
                stamina: r.get(9)?,
                momentum: r.get(10)?,
                level_started_day: parse_day(&r.get::<_, String>(11)?),
                cycle_count: r.get(12)?,
                last_processed_day: parse_day(&r.get::<_, String>(13)?),
                genesis_complete: r.get::<_, i64>(14)? == 1,
                created_at: r.get(15)?,
                last_reckoning_day: r.get::<_, Option<String>>(16)?.map(|s| parse_day(&s)),
            })
        },
    )?;
    Ok(p)
}

fn save_profile(conn: &Connection, p: &RawProfile) -> EResult<()> {
    conn.execute(
        "UPDATE user_profiles SET
            name=?1, oath=?2, environment_text=?3, threats_text=?4, current_level=?5,
            xp_str=?6, xp_int=?7, xp_cha=?8, xp_wil=?9, current_stamina=?10,
            momentum_coefficient=?11, level_started_day=?12, cycle_count=?13,
            last_processed_day=?14, genesis_complete=?15, last_reckoning_day=?16
         WHERE id = 1",
        params![
            p.name, p.oath, p.environment_text, p.threats_text, p.level,
            p.xp_str, p.xp_int, p.xp_cha, p.xp_wil, f::round2(p.stamina),
            f::round2(p.momentum), day_key(p.level_started_day), p.cycle_count,
            day_key(p.last_processed_day), p.genesis_complete as i64,
            p.last_reckoning_day.map(day_key)
        ],
    )?;
    Ok(())
}

pub fn load_weapon(conn: &Connection) -> EResult<RawWeapon> {
    let w = conn.query_row(
        "SELECT sharpness, durability, fire_affinity, lightning_affinity, blunted, reforge_progress, forge_count_total
         FROM local_weapon_metrics WHERE profile_id = 1",
        [],
        |r| {
            Ok(RawWeapon {
                sharpness: r.get(0)?,
                durability: r.get(1)?,
                fire: r.get(2)?,
                lightning: r.get(3)?,
                blunted: r.get::<_, i64>(4)? == 1,
                reforge_progress: r.get(5)?,
                forge_count_total: r.get(6)?,
            })
        },
    )?;
    Ok(w)
}

fn save_weapon(conn: &Connection, w: &RawWeapon) -> EResult<()> {
    conn.execute(
        "UPDATE local_weapon_metrics SET
            sharpness=?1, durability=?2, fire_affinity=?3, lightning_affinity=?4,
            blunted=?5, reforge_progress=?6, forge_count_total=?7
         WHERE profile_id = 1",
        params![
            f::round2(w.sharpness.clamp(0.0, 100.0)),
            f::round2(w.durability.clamp(0.0, 100.0)),
            f::round2(w.fire.clamp(0.0, 1.0)),
            f::round2(w.lightning.clamp(0.0, 1.0)),
            w.blunted as i64,
            w.reforge_progress,
            w.forge_count_total
        ],
    )?;
    Ok(())
}

pub fn load_habits(conn: &Connection, include_archived: bool) -> EResult<Vec<HabitRow>> {
    let sql = if include_archived {
        "SELECT id, habit_name, description, sector_type, weight_class, verification_type,
                target_frequency_hours, window_start_hour, window_end_hour,
                consecutive_misses, last_executed_day, created_day, is_archived, sworn_boss_id
         FROM habit_configs ORDER BY id"
    } else {
        "SELECT id, habit_name, description, sector_type, weight_class, verification_type,
                target_frequency_hours, window_start_hour, window_end_hour,
                consecutive_misses, last_executed_day, created_day, is_archived, sworn_boss_id
         FROM habit_configs WHERE is_archived = 0 ORDER BY id"
    };
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt
        .query_map([], |r| {
            Ok(HabitRow {
                id: r.get(0)?,
                name: r.get(1)?,
                description: r.get(2)?,
                sector: Sector::from_db(&r.get::<_, String>(3)?),
                weight: WeightClass::from_db(&r.get::<_, String>(4)?),
                verification: VerificationType::from_db(&r.get::<_, String>(5)?),
                frequency_hours: r.get(6)?,
                window_start_hour: r.get(7)?,
                window_end_hour: r.get(8)?,
                consecutive_misses: r.get(9)?,
                last_executed_day: r
                    .get::<_, Option<String>>(10)?
                    .map(|s| parse_day(&s)),
                created_day: parse_day(&r.get::<_, String>(11)?),
                is_archived: r.get::<_, i64>(12)? == 1,
                sworn_boss_id: r.get(13)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn push_event(conn: &Connection, day: &str, kind: &str, detail: &str) -> EResult<()> {
    conn.execute(
        "INSERT INTO system_events (day_key, ts, kind, detail, seen) VALUES (?1, ?2, ?3, ?4, 0)",
        params![day, now_ts(), kind, detail],
    )?;
    Ok(())
}

/// True while an Ascended boss is alive in the given sector at current level.
pub fn sector_cursed(conn: &Connection, level: i64, sector: Sector) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM boss_campaigns
         WHERE target_level_gate = ?1 AND sector_origin = ?2 AND is_ascended = 1 AND is_defeated = 0",
        params![level, sector.as_db()],
        |r| r.get::<_, i64>(0),
    )
    .map(|n| n > 0)
    .unwrap_or(false)
}

fn executed_on(conn: &Connection, habit_id: i64, day: &str) -> EResult<bool> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM habit_execution_logs WHERE habit_id = ?1 AND day_key = ?2",
        params![habit_id, day],
        |r| r.get(0),
    )?;
    Ok(n > 0)
}

// ---------------------------------------------------------------------------
// Day-close processing (the night algorithm)
// ---------------------------------------------------------------------------

/// Close every elapsed, unprocessed day strictly before `today`.
/// Returns the number of days closed.
pub fn process_pending_days(conn: &mut Connection, today: NaiveDate) -> EResult<i64> {
    let profile = load_profile(conn)?;
    if !profile.genesis_complete {
        // The world does not decay before it exists.
        conn.execute(
            "UPDATE user_profiles SET last_processed_day = ?1 WHERE id = 1",
            params![day_key(today)],
        )?;
        return Ok(0);
    }
    let mut closed = 0;
    let mut cursor = profile.last_processed_day;
    // `last_processed_day` is the next day awaiting closure. Close every day
    // strictly before today; today stays open until it has fully elapsed.
    while cursor < today {
        let day_to_close = cursor;
        let tx = conn.transaction()?;
        close_day(&tx, day_to_close)?;
        tx.execute(
            "UPDATE user_profiles SET last_processed_day = ?1 WHERE id = 1",
            params![day_key(day_to_close.succ_opt().unwrap_or(day_to_close))],
        )?;
        tx.commit()?;
        closed += 1;
        cursor = cursor.succ_opt().unwrap_or(cursor);
        if closed > 400 {
            break; // hard safety valve against pathological clocks
        }
    }
    Ok(closed)
}

/// Apply the night algorithm to one specific day (assumed unprocessed).
fn close_day(conn: &Connection, day: NaiveDate) -> EResult<()> {
    let dk = day_key(day);
    let mut p = load_profile(conn)?;
    let mut w = load_weapon(conn)?;

    let momentum_open = p.momentum;
    let stamina_open = p.stamina;

    let habits = load_habits(conn, false)?;
    let mut missed_weight_sum = 0.0;
    let mut heavy_misses: i64 = 0;
    let mut miss_count: i64 = 0;
    let mut due_count: i64 = 0;

    for h in &habits {
        if h.due_on(day) {
            due_count += 1;
        }
        if h.missed_on(day) && !executed_on(conn, h.id, &dk)? {
            miss_count += 1;
            missed_weight_sum += f::weight_mult(h.weight);
            if matches!(h.weight, WeightClass::Heroic | WeightClass::Mythic) {
                heavy_misses += 1;
            }
            w.durability -= f::durability_miss_hit(h.weight);
            conn.execute(
                "UPDATE habit_configs SET consecutive_misses = consecutive_misses + 1 WHERE id = ?1",
                params![h.id],
            )?;
            push_event(
                conn,
                &dk,
                "MISS",
                &format!(
                    "Window closed unexecuted: {} ({}). Friction debt compounds.",
                    h.name,
                    h.weight.as_db()
                ),
            )?;
        }
    }

    let executions: i64 = conn.query_row(
        "SELECT COUNT(*) FROM habit_execution_logs WHERE day_key = ?1",
        params![&dk],
        |r| r.get(0),
    )?;
    let had_any_execution = executions > 0;

    // Momentum: multiplicative miss decay, then idle cooling.
    let m_before = p.momentum;
    p.momentum = f::momentum_after_misses(p.momentum, missed_weight_sum);
    p.momentum = f::momentum_cooling(p.momentum, had_any_execution);

    // Sharpness: idle decay and heavy-miss grinding.
    if !had_any_execution {
        w.sharpness = f::sharpness_idle_decay(w.sharpness);
    }
    w.sharpness = f::sharpness_after_heavy_misses(w.sharpness, heavy_misses);

    // Perfect day: everything due was executed.
    let perfect = due_count > 0 && miss_count == 0 && had_any_execution;
    if perfect {
        w.durability = (w.durability + f::DURABILITY_PERFECT_REGEN).min(100.0);
        w.lightning = (w.lightning + f::LIGHTNING_GAIN_PER_PERFECT_DAY).min(1.0);
    }

    // Affinity entropy.
    w.fire *= f::FIRE_DAILY_DECAY;
    w.lightning *= f::LIGHTNING_DAILY_DECAY;

    // Reforging a broken blade takes seven consecutive perfect days.
    if w.durability <= 0.0 {
        if perfect {
            w.reforge_progress += 1;
        } else {
            w.reforge_progress = 0;
        }
        if w.reforge_progress >= f::REFORGE_PERFECT_DAYS {
            w.durability = 40.0;
            w.sharpness = w.sharpness.max(20.0);
            w.blunted = false;
            w.reforge_progress = 0;
            push_event(conn, &dk, "WEAPON", "The blade is reforged. Seven perfect days paid in full.")?;
        }
    } else {
        w.reforge_progress = 0;
    }

    w.durability = w.durability.clamp(0.0, 100.0);
    w.sharpness = w.sharpness.clamp(0.0, 100.0);

    // Overnight stamina regeneration.
    let regen = f::stamina_regen(p.momentum, w.state(), miss_count > 0);
    p.stamina = (p.stamina + regen).clamp(0.0, p.max_stamina());

    // Threshold events.
    if m_before >= 1.0 && p.momentum < 1.0 {
        push_event(conn, &dk, "TERRAIN", "Momentum collapsed below 1.0 — the road turns to mud.")?;
    }
    if w.state() == WeaponState::Fractured && w.durability + 1.5 >= f::WEAPON_FRACTURE_THRESHOLD {
        push_event(conn, &dk, "WEAPON", "The blade is fracturing. Durability below 30.")?;
    }
    if w.durability <= 0.0 && w.reforge_progress == 0 && !perfect {
        push_event(conn, &dk, "WEAPON", "The blade is BROKEN. Seven consecutive perfect days will reforge it.")?;
    }

    conn.execute(
        "INSERT OR REPLACE INTO system_days
            (day_key, executions, misses, momentum_open, momentum_close,
             stamina_open, stamina_close, sharpness_close, durability_close, perfect)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            dk,
            executions,
            miss_count,
            f::round2(momentum_open),
            f::round2(p.momentum),
            f::round2(stamina_open),
            f::round2(p.stamina),
            f::round2(w.sharpness),
            f::round2(w.durability),
            perfect as i64
        ],
    )?;

    save_profile(conn, &p)?;
    save_weapon(conn, &w)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Habit execution (the Whetstone)
// ---------------------------------------------------------------------------

pub fn execute_habit(
    conn: &mut Connection,
    habit_id: i64,
    proof_path: Option<String>,
    note: Option<String>,
) -> EResult<ExecutionReport> {
    let now = Local::now();
    let today = now.date_naive();
    let dk = day_key(today);
    let hour = now.hour() as i64;

    let tx = conn.transaction()?;
    let mut p = load_profile(&tx)?;
    if !p.genesis_complete {
        return Err(EngineError::Rule("The Genesis Ritual is not complete.".into()));
    }
    let mut w = load_weapon(&tx)?;
    let habits = load_habits(&tx, false)?;
    let h = habits
        .iter()
        .find(|h| h.id == habit_id)
        .ok_or_else(|| EngineError::Rule("Unknown directive.".into()))?;

    if executed_on(&tx, h.id, &dk)? {
        return Err(EngineError::Rule(format!(
            "'{}' is already verified within this window. The ledger does not double-count.",
            h.name
        )));
    }
    if !h.due_on(today) {
        let next = h.anchor() + chrono::Duration::days(h.period_days());
        return Err(EngineError::Rule(format!(
            "'{}' is not due. The window opens on {}.",
            h.name,
            day_key(next)
        )));
    }

    // Proof validation — evidence is local reality, not a decorative string.
    let validated_proof = crate::vault::validate_proof(h.verification, proof_path.as_deref())
        .map_err(EngineError::Rule)?;

    let cursed = sector_cursed(&tx, p.level, h.sector);
    let cost = f::activation_cost(h.weight, h.consecutive_misses, p.momentum, cursed, p.stat_int());
    let overdraft = p.stamina < cost;
    p.stamina = (p.stamina - cost).max(0.0);

    let off_window = !h.in_window(hour);
    let momentum_before = p.momentum;
    p.momentum = f::momentum_after_execution(p.momentum, h.weight, overdraft, off_window);

    let sharpness_before = w.sharpness;
    w.sharpness = (w.sharpness + f::sharpness_gain(w.sharpness, h.weight, h.sector, p.momentum)).min(100.0);
    if matches!(h.weight, WeightClass::Heroic | WeightClass::Mythic) {
        w.fire = (w.fire + f::FIRE_GAIN_PER_HEAVY_EXECUTION).min(1.0);
    }
    w.forge_count_total += 1;

    // Stat growth.
    let xp = f::stat_xp_gain(h.weight);
    match h.sector {
        Sector::Physical => p.xp_str += xp,
        Sector::Intellectual => p.xp_int += xp,
        Sector::Financial => p.xp_cha += xp,
        Sector::Responsibility => p.xp_wil += xp,
    }
    if h.sector != Sector::Responsibility {
        p.xp_wil += xp * 0.5;
    }

    tx.execute(
        "UPDATE habit_configs SET consecutive_misses = 0, last_executed_day = ?1 WHERE id = ?2",
        params![dk, h.id],
    )?;
    tx.execute(
        "INSERT INTO habit_execution_logs
            (habit_id, execution_timestamp, day_key, file_proof_path, note,
             stamina_cost, momentum_after, overdraft, off_window)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            h.id,
            now_ts(),
            dk,
            validated_proof,
            note,
            f::round2(cost),
            f::round2(p.momentum),
            overdraft as i64,
            off_window as i64
        ],
    )?;

    // The Siege law: a sworn execution chips its boss — small, capped,
    // relentless. Never more than 20% of a boss falls to daily pressure.
    let mut siege_damage = 0.0;
    let mut siege_boss_name: Option<String> = None;
    let mut siege_boss_defeated = false;
    if let Some(boss_id) = h.sworn_boss_id {
        let boss = tx
            .query_row(
                "SELECT boss_name, sector_origin, total_hp, current_hp, siege_dealt, is_defeated, target_level_gate
                 FROM boss_campaigns WHERE id = ?1",
                params![boss_id],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, f64>(2)?,
                        r.get::<_, f64>(3)?,
                        r.get::<_, f64>(4)?,
                        r.get::<_, i64>(5)?,
                        r.get::<_, i64>(6)?,
                    ))
                },
            )
            .optional()?;
        if let Some((bname, bsector, total, current, dealt, defeated, blevel)) = boss {
            if defeated == 0 && blevel == p.level {
                let cap = total * f::SIEGE_CAP_FRACTION;
                let cap_left = (cap - dealt).max(0.0);
                let eff = (f::siege_damage_raw(h.weight)
                    * f::sector_mult(Sector::from_db(&bsector)))
                .min(cap_left)
                .min(current);
                if eff > 0.0 {
                    let hp_after = (current - eff).max(0.0);
                    let now_defeated = hp_after <= 0.0;
                    tx.execute(
                        "UPDATE boss_campaigns SET current_hp = ?1, siege_dealt = siege_dealt + ?2,
                            is_defeated = ?3, defeated_at = CASE WHEN ?3 = 1 THEN ?4 ELSE defeated_at END
                         WHERE id = ?5",
                        params![hp_after, eff, now_defeated as i64, now_ts(), boss_id],
                    )?;
                    siege_damage = f::round2(eff);
                    siege_boss_name = Some(bname.clone());
                    siege_boss_defeated = now_defeated;
                    if now_defeated {
                        if let Some(eq) = catalog::equipment_for(blevel, Sector::from_db(&bsector)) {
                            push_event(&tx, &dk, "BOSS_DEFEATED",
                                &format!("The siege breaks {}. Equipment manifested: {}.", bname, eq.name))?;
                        } else {
                            push_event(&tx, &dk, "BOSS_DEFEATED", &format!("The siege breaks {}.", bname))?;
                        }
                    }
                }
            }
        }
    }

    let mut detail = format!(
        "Verified: {} ({}). Momentum {:.2} → {:.2}. Sharpness {:.1} → {:.1}.",
        h.name,
        h.weight.as_db(),
        momentum_before,
        p.momentum,
        sharpness_before,
        w.sharpness
    );
    if overdraft {
        detail.push_str(" Executed on an empty tank — overdraft honored at half momentum.");
    }
    if off_window {
        detail.push_str(" Off-window execution: gain reduced to 75%.");
    }
    if siege_damage > 0.0 {
        detail.push_str(&format!(
            " Siege: −{:.2} HP against {}.",
            siege_damage,
            siege_boss_name.as_deref().unwrap_or("the sworn boss")
        ));
    }
    push_event(&tx, &dk, "EXECUTION", &detail)?;

    save_profile(&tx, &p)?;
    save_weapon(&tx, &w)?;

    let report = ExecutionReport {
        habit_id: h.id,
        habit_name: h.name.clone(),
        verified: true,
        stamina_cost: f::round2(cost),
        stamina_after: f::round2(p.stamina),
        overdraft,
        off_window,
        momentum_before: f::round2(momentum_before),
        momentum_after: f::round2(p.momentum),
        sharpness_before: f::round2(sharpness_before),
        sharpness_after: f::round2(w.sharpness),
        weight: h.weight,
        sector: h.sector,
        siege_damage,
        siege_boss_name,
        siege_boss_defeated,
    };
    tx.commit()?;
    Ok(report)
}

// ---------------------------------------------------------------------------
// Milestones (direct campaign damage)
// ---------------------------------------------------------------------------

pub fn complete_milestone(
    conn: &mut Connection,
    milestone_id: i64,
    proof_path: Option<String>,
) -> EResult<MilestoneReport> {
    let today = Local::now().date_naive();
    let dk = day_key(today);

    let tx = conn.transaction()?;
    let mut p = load_profile(&tx)?;
    if !p.genesis_complete {
        return Err(EngineError::Rule("The Genesis Ritual is not complete.".into()));
    }

    let row = tx
        .query_row(
            "SELECT m.id, m.boss_id, m.description, m.damage_value, m.required_proof_type,
                    m.req_stat, m.req_value, m.is_completed,
                    b.boss_name, b.sector_origin, b.current_hp, b.total_hp, b.target_level_gate, b.is_defeated
             FROM boss_milestones m JOIN boss_campaigns b ON b.id = m.boss_id
             WHERE m.id = ?1",
            params![milestone_id],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, i64>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, Option<String>>(5)?,
                    r.get::<_, Option<i64>>(6)?,
                    r.get::<_, i64>(7)?,
                    r.get::<_, String>(8)?,
                    r.get::<_, String>(9)?,
                    r.get::<_, f64>(10)?,
                    r.get::<_, f64>(11)?,
                    r.get::<_, i64>(12)?,
                    r.get::<_, i64>(13)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| EngineError::Rule("Unknown milestone.".into()))?;

    let (mid, boss_id, description, damage_value, proof_type, req_stat, req_value, completed,
         boss_name, sector_s, current_hp, _total_hp, boss_level, boss_defeated) = row;

    if completed == 1 {
        return Err(EngineError::Rule("This milestone is already sealed.".into()));
    }
    if boss_defeated == 1 {
        return Err(EngineError::Rule("The boss is already defeated; its milestones are closed.".into()));
    }
    if boss_level != p.level {
        return Err(EngineError::Rule("This milestone belongs to another chapter.".into()));
    }

    // Stat gate (CHA unlocks high-tier transactional milestones, etc.)
    if let (Some(stat), Some(reqv)) = (req_stat.as_deref(), req_value) {
        let have = match stat {
            "STR" => p.stat_str(),
            "INT" => p.stat_int(),
            "CHA" => p.stat_cha(),
            _ => p.stat_wil(),
        };
        if have < reqv {
            return Err(EngineError::Rule(format!(
                "Path sealed: requires {} ≥ {} (you hold {}).",
                stat, reqv, have
            )));
        }
    }

    let vtype = VerificationType::from_db(&proof_type);
    let validated_proof = crate::vault::validate_proof(vtype, proof_path.as_deref())
        .map_err(EngineError::Rule)?;

    let sector = Sector::from_db(&sector_s);
    let damage = f::round2(damage_value as f64 * f::sector_mult(sector));
    let hp_after = (current_hp - damage).max(0.0);
    let defeated = hp_after <= 0.0;

    tx.execute(
        "UPDATE boss_milestones SET is_completed = 1, completed_at = ?1, proof_path = ?2 WHERE id = ?3",
        params![now_ts(), validated_proof, mid],
    )?;
    tx.execute(
        "UPDATE boss_campaigns SET current_hp = ?1, is_defeated = ?2, defeated_at = CASE WHEN ?2 = 1 THEN ?3 ELSE defeated_at END WHERE id = ?4",
        params![hp_after, defeated as i64, now_ts(), boss_id],
    )?;

    // Stat growth: milestone damage IS experience.
    match sector {
        Sector::Physical => p.xp_str += damage_value as f64,
        Sector::Intellectual => p.xp_int += damage_value as f64,
        Sector::Financial => p.xp_cha += damage_value as f64,
        Sector::Responsibility => p.xp_wil += damage_value as f64,
    }
    p.xp_wil += 10.0;

    push_event(
        &tx,
        &dk,
        "MILESTONE",
        &format!(
            "Milestone sealed: {} — {:.0} damage to {} ({:.0} HP remains).",
            description, damage, boss_name, hp_after
        ),
    )?;

    let mut equipment_unlocked = None;
    if defeated {
        if let Some(eq) = catalog::equipment_for(boss_level, sector) {
            equipment_unlocked = Some(eq.name.to_string());
            push_event(
                &tx,
                &dk,
                "BOSS_DEFEATED",
                &format!("{} has fallen. Equipment manifested: {}.", boss_name, eq.name),
            )?;
        } else {
            push_event(&tx, &dk, "BOSS_DEFEATED", &format!("{} has fallen.", boss_name))?;
        }
    }

    save_profile(&tx, &p)?;
    let report = MilestoneReport {
        milestone_id: mid,
        boss_id,
        boss_name,
        damage_dealt: damage,
        boss_hp_after: f::round2(hp_after),
        boss_defeated: defeated,
        equipment_unlocked,
    };
    tx.commit()?;
    Ok(report)
}

// ---------------------------------------------------------------------------
// The Reckoning (end-of-cycle combat resolution)
// ---------------------------------------------------------------------------

pub struct BossRow {
    pub id: i64,
    pub level: i64,
    pub sector: Sector,
    pub name: String,
    pub lore: String,
    pub total_hp: f64,
    pub current_hp: f64,
    pub armor: f64,
    pub defeated: bool,
    pub ascended: bool,
    pub siege_dealt: f64,
}

pub fn load_bosses(conn: &Connection, level: i64) -> EResult<Vec<BossRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, target_level_gate, sector_origin, boss_name, lore, total_hp, current_hp, armor, is_defeated, is_ascended, siege_dealt
         FROM boss_campaigns WHERE target_level_gate = ?1 ORDER BY
         CASE sector_origin WHEN 'FINANCIAL' THEN 0 WHEN 'INTELLECTUAL' THEN 1 ELSE 2 END, id",
    )?;
    let rows = stmt
        .query_map(params![level], |r| {
            Ok(BossRow {
                id: r.get(0)?,
                level: r.get(1)?,
                sector: Sector::from_db(&r.get::<_, String>(2)?),
                name: r.get(3)?,
                lore: r.get(4)?,
                total_hp: r.get(5)?,
                current_hp: r.get(6)?,
                armor: r.get(7)?,
                defeated: r.get::<_, i64>(8)? == 1,
                ascended: r.get::<_, i64>(9)? == 1,
                siege_dealt: r.get(10)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Build the gate report for the current level state. The Open Gates law:
/// no calendar. `passed` (clean clear) when every boss is destroyed;
/// `forceable` when thresholds hold and the operator may choose the debt.
pub fn gate_report(conn: &Connection, p: &RawProfile, today: NaiveDate) -> EResult<GateReport> {
    let bosses = load_bosses(conn, p.level)?;
    let triples: Vec<(f64, f64, Sector)> = bosses
        .iter()
        .map(|b| ((b.total_hp - b.current_hp).max(0.0), b.total_hp, b.sector))
        .collect();
    let global = f::global_progress(&triples);

    let mut sector_progress = Vec::new();
    let mut sectors_ok = true;
    for sector in [Sector::Financial, Sector::Intellectual, Sector::Physical] {
        let (dealt, total): (f64, f64) = bosses
            .iter()
            .filter(|b| b.sector == sector)
            .fold((0.0, 0.0), |(d, t), b| {
                (d + (b.total_hp - b.current_hp).max(0.0), t + b.total_hp)
            });
        let progress = if total > 0.0 { (dealt / total).clamp(0.0, 1.0) } else { 1.0 };
        let ok = progress >= f::GATE_SECTOR_REQ;
        if !ok {
            sectors_ok = false;
        }
        sector_progress.push(SectorProgress {
            sector,
            progress: f::round2(progress),
            required: f::GATE_SECTOR_REQ,
            ok,
            cursed: sector_cursed(conn, p.level, sector),
        });
    }

    let all_defeated = !bosses.is_empty() && bosses.iter().all(|b| b.defeated);
    let global_ok = global >= f::GATE_GLOBAL_REQ;
    let weapon = load_weapon(conn)?;
    let days_since = p.last_reckoning_day.map(|d| (today - d).num_days());
    let cooldown_left = days_since
        .map(|d| (f::RECKONING_COOLDOWN_DAYS - d).max(0))
        .unwrap_or(0);
    Ok(GateReport {
        global_progress: f::round2(global),
        global_required: f::GATE_GLOBAL_REQ,
        global_ok,
        sector_progress,
        sectors_ok,
        campaign_day: p.campaign_day(today),
        all_defeated,
        forceable: global_ok && sectors_ok && !all_defeated,
        reckoning_ready: f::reckoning_ready(weapon.sharpness, days_since) && !all_defeated,
        reckoning_min_sharpness: f::RECKONING_MIN_SHARPNESS,
        reckoning_cooldown_left: cooldown_left,
        passed: all_defeated,
    })
}

/// The Reckoning — a repeatable, expensive strike. Requires a forged blade
/// (sharpness ≥ 40) and a rested arm (7 days since the last call). The blade
/// pays 10 durability; any survivor blunts the edge. If the last boss falls,
/// the chapter advances cleanly — no debt, no ascension.
pub fn run_reckoning(conn: &mut Connection) -> EResult<ReckoningReport> {
    let today = Local::now().date_naive();
    let dk = day_key(today);
    let tx = conn.transaction()?;
    let mut p = load_profile(&tx)?;
    let mut w = load_weapon(&tx)?;

    let days_since = p.last_reckoning_day.map(|d| (today - d).num_days());
    if w.sharpness < f::RECKONING_MIN_SHARPNESS {
        return Err(EngineError::Rule(format!(
            "The blade is not forged for a Reckoning: sharpness {:.1}, the law demands {:.0}. Verify more windows.",
            w.sharpness,
            f::RECKONING_MIN_SHARPNESS
        )));
    }
    if let Some(d) = days_since {
        if d < f::RECKONING_COOLDOWN_DAYS {
            return Err(EngineError::Rule(format!(
                "The arm is not rested: {} day(s) remain before the next Reckoning can be called.",
                f::RECKONING_COOLDOWN_DAYS - d
            )));
        }
    }

    let bosses = load_bosses(&tx, p.level)?;
    if bosses.iter().all(|b| b.defeated) {
        return Err(EngineError::Rule("No boss stands. The gate is already open — walk through it.".into()));
    }

    let mut strikes = Vec::new();
    let mut any_survivor = false;
    for b in bosses.iter().filter(|b| !b.defeated) {
        let completion = ((b.total_hp - b.current_hp) / b.total_hp).clamp(0.0, 1.0);
        let dmg = f::reckoning_strike(
            w.sharpness, w.durability, w.fire, w.lightning,
            p.momentum, completion, b.armor, w.state(),
        );
        let hp_after = (b.current_hp - dmg).max(0.0);
        let defeated = hp_after <= 0.0;
        tx.execute(
            "UPDATE boss_campaigns SET current_hp = ?1, is_defeated = ?2,
                defeated_at = CASE WHEN ?2 = 1 THEN ?3 ELSE defeated_at END
             WHERE id = ?4",
            params![hp_after, defeated as i64, now_ts(), b.id],
        )?;
        if defeated {
            if let Some(eq) = catalog::equipment_for(b.level, b.sector) {
                push_event(&tx, &dk, "BOSS_DEFEATED",
                    &format!("The Reckoning: {} destroyed. Equipment manifested: {}.", b.name, eq.name))?;
            }
        } else {
            any_survivor = true;
        }
        strikes.push(ReckoningStrike {
            boss_id: b.id,
            boss_name: b.name.clone(),
            sector: b.sector,
            strike_damage: dmg,
            hp_before: f::round2(b.current_hp),
            hp_after: f::round2(hp_after),
            defeated,
        });
    }

    // The blade pays for every reckoning.
    w.durability = (w.durability - f::DURABILITY_RECKONING_STRAIN).max(0.0);
    if any_survivor {
        w.blunted = true;
        w.sharpness = f::round2(w.sharpness * f::SHARPNESS_BLUNT_FACTOR);
        push_event(&tx, &dk, "WEAPON", "A boss resisted the clear. The edge records a BLUNTED state.")?;
    } else {
        w.blunted = false;
    }
    save_weapon(&tx, &w)?;
    p.last_reckoning_day = Some(today);

    // Clean clear: the chapter ends when its bosses die.
    let mut level_advanced = false;
    let mut new_level = p.level;
    if !any_survivor {
        if p.level < f::LEVEL_CAP {
            new_level = p.level + 1;
            spawn_level_bosses(&tx, new_level)?;
            p.level = new_level;
            p.level_started_day = today;
            let ldef = catalog::level_def(new_level);
            push_event(&tx, &dk, "LEVEL",
                &format!("CLEAN CLEAR — the gate opens without debt. Chapter {} begins: {} — {}",
                    new_level, ldef.title, ldef.theme))?;
        } else {
            push_event(&tx, &dk, "LEVEL", "THE SUMMIT IS CLEARED. No enemy remains but the mirror.")?;
        }
        level_advanced = true;
    }

    save_profile(&tx, &p)?;
    push_event(&tx, &dk, "RECKONING",
        &format!("Reckoning resolved. {} strike(s) delivered.", strikes.len()))?;

    let gate = gate_report(&tx, &p, today)?;
    let ldef = catalog::level_def(new_level);
    let report = ReckoningReport {
        strikes,
        weapon_state_after: load_weapon(&tx)?.state(),
        blunted: any_survivor,
        gate,
        level_advanced,
        new_level,
        new_level_title: ldef.title.to_string(),
    };
    tx.commit()?;
    Ok(report)
}

/// Force the Gate — the operator's choice to advance before every boss is
/// dead. Requires the thresholds (global ≥80%, every sector ≥50%). Every
/// survivor ascends: +35% HP and a stamina curse on its sector.
pub fn force_gate(conn: &mut Connection) -> EResult<ForceGateReport> {
    let today = Local::now().date_naive();
    let dk = day_key(today);
    let tx = conn.transaction()?;
    let mut p = load_profile(&tx)?;
    let gate = gate_report(&tx, &p, today)?;

    if gate.all_defeated {
        return Err(EngineError::Rule("Every boss is destroyed — the gate opens cleanly through a Reckoning; no force is needed.".into()));
    }
    if !gate.forceable {
        return Err(EngineError::Rule(
            "The gate cannot be forced: it demands ≥80% global weighted progress and ≥50% in every sector.".into(),
        ));
    }
    if p.level >= f::LEVEL_CAP {
        return Err(EngineError::Rule("There is no gate beyond the Summit.".into()));
    }

    let new_level = p.level + 1;
    let mut ascended_names = Vec::new();
    for b in load_bosses(&tx, p.level)?.iter().filter(|b| !b.defeated) {
        let new_total = f::round2(b.total_hp * f::ASCENSION_HP_MULT);
        let new_current = f::round2(b.current_hp * f::ASCENSION_HP_MULT);
        tx.execute(
            "UPDATE boss_campaigns SET target_level_gate = ?1, total_hp = ?2, current_hp = ?3,
                is_ascended = 1, ascended_from_level = ?4
             WHERE id = ?5",
            params![new_level, new_total, new_current, p.level, b.id],
        )?;
        ascended_names.push(b.name.clone());
        push_event(&tx, &dk, "LEVEL",
            &format!("ASCENDED DEBT: {} follows you with {:.0} HP (+35%) and a stamina curse on its sector.",
                b.name, new_total))?;
    }
    spawn_level_bosses(&tx, new_level)?;
    p.level = new_level;
    p.level_started_day = today;
    let ldef = catalog::level_def(new_level);
    push_event(&tx, &dk, "LEVEL",
        &format!("THE GATE IS FORCED. Chapter {} begins: {} — {}", new_level, ldef.title, ldef.theme))?;
    save_profile(&tx, &p)?;
    tx.commit()?;
    Ok(ForceGateReport {
        ascended_bosses: ascended_names,
        new_level,
        new_level_title: ldef.title.to_string(),
    })
}

/// Spawn the canonical bosses for a level, with auto-seeded generic milestones
/// (the operator refines them in the Campaign chamber).
fn spawn_level_bosses(conn: &Connection, level: i64) -> EResult<()> {
    for def in catalog::bosses_for_level(level) {
        let total = f::boss_total_hp(level);
        let armor = f::boss_armor(level);
        conn.execute(
            "INSERT INTO boss_campaigns (target_level_gate, sector_origin, boss_name, lore, total_hp, current_hp, armor)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6)",
            params![level, def.sector.as_db(), def.name, def.lore, total, armor],
        )?;
        let boss_id = conn.last_insert_rowid();
        let seeds = [
            ("Open the front: first verified strike on this sector", 0.20),
            ("Hold the line: sustained verified campaign of work", 0.25),
            ("Break the guard: one decisive, documented outcome", 0.15),
        ];
        for (i, (desc, frac)) in seeds.iter().enumerate() {
            conn.execute(
                "INSERT INTO boss_milestones (boss_id, milestone_order, description, damage_value, required_proof_type)
                 VALUES (?1, ?2, ?3, ?4, 'MANUAL')",
                params![boss_id, (i + 1) as i64, desc, (total * frac).round() as i64],
            )?;
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Genesis Ritual seeding
// ---------------------------------------------------------------------------

pub fn genesis_seed(conn: &mut Connection, payload: GenesisPayload) -> EResult<()> {
    let today = Local::now().date_naive();
    let dk = day_key(today);

    if payload.name.trim().is_empty() {
        return Err(EngineError::Rule("A name is required. The world must know who walks it.".into()));
    }
    if payload.habits.is_empty() || payload.habits.len() > 12 {
        return Err(EngineError::Rule("Between 1 and 12 directives are required at Genesis.".into()));
    }

    let tx = conn.transaction()?;
    let p = load_profile(&tx)?;
    if p.genesis_complete {
        return Err(EngineError::Rule("The Genesis Ritual has already been performed.".into()));
    }

    tx.execute(
        "UPDATE user_profiles SET name=?1, oath=?2, environment_text=?3, threats_text=?4,
            genesis_complete=1, level_started_day=?5, last_processed_day=?5, created_at=?6
         WHERE id = 1",
        params![
            payload.name.trim(),
            payload.oath.trim(),
            payload.environment_text.trim(),
            payload.threats_text.trim(),
            dk,
            now_ts()
        ],
    )?;

    for h in &payload.habits {
        if h.name.trim().is_empty() {
            return Err(EngineError::Rule("Every directive needs a name.".into()));
        }
        let freq = h.frequency_hours.clamp(24, 24 * 14);
        tx.execute(
            "INSERT INTO habit_configs
                (habit_name, description, sector_type, weight_class, verification_type,
                 target_frequency_hours, window_start_hour, window_end_hour, created_day)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                h.name.trim(),
                h.description.trim(),
                h.sector.as_db(),
                h.weight.as_db(),
                h.verification.as_db(),
                freq,
                h.window_start_hour,
                h.window_end_hour,
                dk
            ],
        )
        .map_err(|e| match e {
            rusqlite::Error::SqliteFailure(err, _)
                if err.code == rusqlite::ErrorCode::ConstraintViolation =>
            {
                EngineError::Rule(format!("Directive name duplicated: '{}'.", h.name.trim()))
            }
            other => EngineError::Db(other),
        })?;
    }

    // Level 1 bosses from the canon.
    for def in catalog::bosses_for_level(1) {
        tx.execute(
            "INSERT INTO boss_campaigns (target_level_gate, sector_origin, boss_name, lore, total_hp, current_hp, armor)
             VALUES (1, ?1, ?2, ?3, ?4, ?4, ?5)",
            params![
                def.sector.as_db(),
                def.name,
                def.lore,
                f::boss_total_hp(1),
                f::boss_armor(1)
            ],
        )?;
    }

    // Milestones assigned to their sector's boss.
    let mut order_by_boss: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();
    for m in &payload.milestones {
        if m.description.trim().is_empty() {
            continue;
        }
        let sector = if m.sector == Sector::Responsibility { Sector::Financial } else { m.sector };
        let boss_id: i64 = tx.query_row(
            "SELECT id FROM boss_campaigns WHERE target_level_gate = 1 AND sector_origin = ?1",
            params![sector.as_db()],
            |r| r.get(0),
        )?;
        let order = order_by_boss.entry(boss_id).or_insert(0);
        *order += 1;
        tx.execute(
            "INSERT INTO boss_milestones (boss_id, milestone_order, description, damage_value, required_proof_type)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                boss_id,
                *order,
                m.description.trim(),
                m.damage_value.clamp(5, 100),
                m.proof_type.as_db()
            ],
        )?;
    }

    push_event(
        &tx,
        &dk,
        "GENESIS",
        &format!(
            "GENESIS COMPLETE. {} enters Chapter 1: Leaving the Cave. The clock is running.",
            payload.name.trim()
        ),
    )?;
    tx.commit()?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Directive management
// ---------------------------------------------------------------------------

/// A directive may swear itself to a living boss of the current chapter.
fn validate_sworn(conn: &Connection, level: i64, sworn: Option<i64>) -> EResult<Option<i64>> {
    match sworn {
        None => Ok(None),
        Some(id) => {
            let ok: i64 = conn.query_row(
                "SELECT COUNT(*) FROM boss_campaigns WHERE id = ?1 AND target_level_gate = ?2 AND is_defeated = 0",
                params![id, level],
                |r| r.get(0),
            )?;
            if ok == 1 {
                Ok(Some(id))
            } else {
                Err(EngineError::Rule(
                    "A directive can only be sworn to a living boss of the current chapter.".into(),
                ))
            }
        }
    }
}

pub fn create_habit(conn: &Connection, h: NewHabitPayload) -> EResult<i64> {
    let p = load_profile(conn)?;
    if !p.genesis_complete {
        return Err(EngineError::Rule("Complete the Genesis Ritual first.".into()));
    }
    if h.name.trim().is_empty() {
        return Err(EngineError::Rule("A directive needs a name.".into()));
    }
    let active: i64 = conn.query_row(
        "SELECT COUNT(*) FROM habit_configs WHERE is_archived = 0",
        [],
        |r| r.get(0),
    )?;
    if active >= 12 {
        return Err(EngineError::Rule(
            "Twelve active directives is the ceiling. Depth beats breadth — archive one first.".into(),
        ));
    }
    let sworn = validate_sworn(conn, p.level, h.sworn_boss_id)?;
    let dk = day_key(Local::now().date_naive());
    conn.execute(
        "INSERT INTO habit_configs
            (habit_name, description, sector_type, weight_class, verification_type,
             target_frequency_hours, window_start_hour, window_end_hour, created_day, sworn_boss_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            h.name.trim(),
            h.description.trim(),
            h.sector.as_db(),
            h.weight.as_db(),
            h.verification.as_db(),
            h.frequency_hours.clamp(24, 24 * 14),
            h.window_start_hour,
            h.window_end_hour,
            dk,
            sworn
        ],
    )
    .map_err(|e| match e {
        rusqlite::Error::SqliteFailure(err, _)
            if err.code == rusqlite::ErrorCode::ConstraintViolation =>
        {
            EngineError::Rule(format!("A directive named '{}' already exists.", h.name.trim()))
        }
        other => EngineError::Db(other),
    })?;
    let id = conn.last_insert_rowid();
    push_event(
        conn,
        &dk,
        "EXECUTION",
        &format!("New directive forged: {} ({} / {}).", h.name.trim(), h.sector.as_db(), h.weight.as_db()),
    )?;
    Ok(id)
}

pub fn edit_habit(conn: &Connection, h: EditHabitPayload) -> EResult<()> {
    let p = load_profile(conn)?;
    let sworn = validate_sworn(conn, p.level, h.sworn_boss_id)?;
    conn.execute(
        "UPDATE habit_configs SET habit_name=?1, description=?2, weight_class=?3,
            verification_type=?4, target_frequency_hours=?5, window_start_hour=?6, window_end_hour=?7,
            sworn_boss_id=?8
         WHERE id = ?9",
        params![
            h.name.trim(),
            h.description.trim(),
            h.weight.as_db(),
            h.verification.as_db(),
            h.frequency_hours.clamp(24, 24 * 14),
            h.window_start_hour,
            h.window_end_hour,
            sworn,
            h.id
        ],
    )?;
    Ok(())
}

/// Revise an unsealed milestone. Completed milestones are history — locked.
pub fn edit_milestone(
    conn: &Connection,
    id: i64,
    description: &str,
    damage: i64,
    proof: VerificationType,
    req_stat: Option<String>,
    req_value: Option<i64>,
) -> EResult<()> {
    if description.trim().is_empty() {
        return Err(EngineError::Rule("A milestone needs a description.".into()));
    }
    let completed: Option<i64> = conn
        .query_row("SELECT is_completed FROM boss_milestones WHERE id = ?1", params![id], |r| r.get(0))
        .optional()?;
    match completed {
        None => return Err(EngineError::Rule("Unknown milestone.".into())),
        Some(1) => return Err(EngineError::Rule("A sealed milestone is history — it cannot be rewritten.".into())),
        _ => {}
    }
    let (req_stat, req_value) = match (req_stat, req_value) {
        (Some(s), Some(v)) if ["STR", "INT", "CHA", "WIL"].contains(&s.as_str()) => {
            (Some(s), Some(v.clamp(11, 40)))
        }
        _ => (None, None),
    };
    conn.execute(
        "UPDATE boss_milestones SET description=?1, damage_value=?2, required_proof_type=?3,
            req_stat=?4, req_value=?5
         WHERE id = ?6",
        params![description.trim(), damage.clamp(5, 100), proof.as_db(), req_stat, req_value, id],
    )?;
    Ok(())
}

/// Withdraw an unsealed milestone entirely.
pub fn delete_milestone(conn: &Connection, id: i64) -> EResult<()> {
    let completed: Option<i64> = conn
        .query_row("SELECT is_completed FROM boss_milestones WHERE id = ?1", params![id], |r| r.get(0))
        .optional()?;
    match completed {
        None => return Err(EngineError::Rule("Unknown milestone.".into())),
        Some(1) => return Err(EngineError::Rule("A sealed milestone is history — it cannot be deleted.".into())),
        _ => {}
    }
    conn.execute("DELETE FROM boss_milestones WHERE id = ?1", params![id])?;
    Ok(())
}

/// Burn the world and return to the void before Genesis. Settings and the
/// sealed API key survive; nothing else does.
pub fn reset_world(conn: &mut Connection) -> EResult<()> {
    let tx = conn.transaction()?;
    crate::db::reset_world(&tx)?;
    tx.commit()?;
    ensure_profile(conn)?;
    Ok(())
}

pub fn archive_habit(conn: &Connection, id: i64, archived: bool) -> EResult<()> {
    conn.execute(
        "UPDATE habit_configs SET is_archived = ?1 WHERE id = ?2",
        params![archived as i64, id],
    )?;
    Ok(())
}

pub fn add_milestone(
    conn: &Connection,
    boss_id: i64,
    description: &str,
    damage: i64,
    proof: VerificationType,
    req_stat: Option<String>,
    req_value: Option<i64>,
) -> EResult<i64> {
    if description.trim().is_empty() {
        return Err(EngineError::Rule("A milestone needs a description.".into()));
    }
    // A stat gate requires both halves; a dangling one is a config error.
    let (req_stat, req_value) = match (req_stat, req_value) {
        (Some(s), Some(v)) if ["STR", "INT", "CHA", "WIL"].contains(&s.as_str()) => {
            (Some(s), Some(v.clamp(11, 40)))
        }
        _ => (None, None),
    };
    let next_order: i64 = conn.query_row(
        "SELECT COALESCE(MAX(milestone_order), 0) + 1 FROM boss_milestones WHERE boss_id = ?1",
        params![boss_id],
        |r| r.get(0),
    )?;
    conn.execute(
        "INSERT INTO boss_milestones (boss_id, milestone_order, description, damage_value, required_proof_type, req_stat, req_value)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![boss_id, next_order, description.trim(), damage.clamp(5, 100), proof.as_db(), req_stat, req_value],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn mark_events_seen(conn: &Connection) -> EResult<()> {
    conn.execute("UPDATE system_events SET seen = 1 WHERE seen = 0", [])?;
    Ok(())
}
