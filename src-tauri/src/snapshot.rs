//! System snapshot assembly — the single read-model the UI renders from and
//! the only telemetry the AI layer is ever allowed to see.

use chrono::{Local, Timelike};
use rusqlite::{params, Connection};

use crate::catalog;
use crate::engine::{self, EResult};
use crate::formulas as f;
use crate::model::*;

pub fn build_snapshot(
    conn: &Connection,
    db_path: &str,
    oracle_configured: bool,
    oracle_model: String,
) -> EResult<SystemSnapshot> {
    let now = Local::now();
    let today = now.date_naive();
    let dk = engine::day_key(today);
    let hour = now.hour() as i64;

    let p = engine::load_profile(conn)?;
    let w = engine::load_weapon(conn)?;
    let level_def = catalog::level_def(p.level);
    let diff = engine::difficulty(conn);
    let difficulty_name =
        crate::db::get_setting(conn, "difficulty").unwrap_or_else(|| "standard".into());

    // ---- Habits with live derived state --------------------------------
    let habit_rows = engine::load_habits(conn, true)?;
    let mut habits = Vec::with_capacity(habit_rows.len());
    for h in &habit_rows {
        let executed_today: i64 = conn.query_row(
            "SELECT COUNT(*) FROM habit_execution_logs WHERE habit_id = ?1 AND day_key = ?2",
            params![h.id, dk],
            |r| r.get(0),
        )?;
        let total_execs: i64 = conn.query_row(
            "SELECT COUNT(*) FROM habit_execution_logs WHERE habit_id = ?1",
            params![h.id],
            |r| r.get(0),
        )?;
        let cursed = engine::sector_cursed(conn, p.level, h.sector);
        let streak = habit_streak_days(conn, h.id, &dk, h.period_days())?;
        let sworn_boss_name: Option<String> = match h.sworn_boss_id {
            Some(bid) => conn
                .query_row(
                    "SELECT boss_name FROM boss_campaigns WHERE id = ?1",
                    params![bid],
                    |r| r.get::<_, String>(0),
                )
                .ok(),
            None => None,
        };
        habits.push(HabitView {
            id: h.id,
            name: h.name.clone(),
            description: h.description.clone(),
            sector: h.sector,
            weight: h.weight,
            verification: h.verification,
            frequency_hours: h.frequency_hours,
            window_start_hour: h.window_start_hour,
            window_end_hour: h.window_end_hour,
            consecutive_misses: h.consecutive_misses,
            rusted: f::is_rusted(h.consecutive_misses, p.stat_wil()),
            due_today: h.due_on(today) && executed_today == 0,
            executed_today: executed_today > 0,
            in_window_now: h.in_window(hour),
            activation_cost: f::activation_cost_at(
                h.weight, h.consecutive_misses, p.momentum, cursed, p.stat_int(), diff.friction_base,
            ),
            momentum_gain: f::momentum_gain(h.weight),
            cursed,
            last_executed_day: h.last_executed_day.map(engine::day_key),
            total_executions: total_execs,
            streak_days: streak,
            is_archived: h.is_archived,
            sworn_boss_id: h.sworn_boss_id,
            sworn_boss_name,
        });
    }

    // ---- Bosses & milestones -------------------------------------------
    let boss_rows = engine::load_bosses(conn, p.level)?;
    let mut bosses = Vec::with_capacity(boss_rows.len());
    for b in &boss_rows {
        let mut stmt = conn.prepare(
            "SELECT id, milestone_order, description, damage_value, required_proof_type,
                    is_completed, completed_at, proof_path, req_stat, req_value
             FROM boss_milestones WHERE boss_id = ?1 ORDER BY milestone_order",
        )?;
        let milestones = stmt
            .query_map(params![b.id], |r| {
                let req_stat: Option<String> = r.get(8)?;
                let req_value: Option<i64> = r.get(9)?;
                Ok(MilestoneView {
                    id: r.get(0)?,
                    boss_id: b.id,
                    order_index: r.get(1)?,
                    description: r.get(2)?,
                    damage_value: r.get(3)?,
                    proof_type: VerificationType::from_db(&r.get::<_, String>(4)?),
                    completed: r.get::<_, i64>(5)? == 1,
                    completed_at: r.get(6)?,
                    proof_path: r.get(7)?,
                    stat_gate_open: match (req_stat.as_deref(), req_value) {
                        (Some(stat), Some(v)) => {
                            let have = match stat {
                                "STR" => p.stat_str(),
                                "INT" => p.stat_int(),
                                "CHA" => p.stat_cha(),
                                _ => p.stat_wil(),
                            };
                            have >= v
                        }
                        _ => true,
                    },
                    req_stat,
                    req_value,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        let completion = ((b.total_hp - b.current_hp) / b.total_hp).clamp(0.0, 1.0);
        bosses.push(BossView {
            id: b.id,
            level: b.level,
            sector: b.sector,
            name: b.name.clone(),
            lore: b.lore.clone(),
            total_hp: f::round2(b.total_hp),
            current_hp: f::round2(b.current_hp),
            armor: b.armor,
            defeated: b.defeated,
            ascended: b.ascended,
            completion: f::round2(completion),
            projected_strike: f::reckoning_strike(
                w.sharpness, w.durability, w.fire, w.lightning,
                p.momentum, completion, b.armor, w.state(),
            ),
            siege_dealt: f::round2(b.siege_dealt),
            siege_cap: f::round2(b.total_hp * f::SIEGE_CAP_FRACTION),
            milestones,
        });
    }

    let gate = engine::gate_report(conn, &p, today)?;

    // ---- Level ladder ----------------------------------------------------
    let levels = catalog::LEVELS
        .iter()
        .map(|l| LevelInfo {
            level: l.level,
            title: l.title.to_string(),
            theme: l.theme.to_string(),
            status: if l.level < p.level {
                "CLEARED".into()
            } else if l.level == p.level {
                "CURRENT".into()
            } else {
                "SEALED".into()
            },
        })
        .collect();

    // ---- Equipment manifest ----------------------------------------------
    let mut equipment = Vec::new();
    for eq in catalog::EQUIPMENT.iter() {
        let unlocked: i64 = conn.query_row(
            "SELECT COUNT(*) FROM boss_campaigns
             WHERE is_defeated = 1 AND sector_origin = ?1
               AND COALESCE(ascended_from_level, target_level_gate) = ?2",
            params![eq.sector.as_db(), eq.level],
            |r| r.get(0),
        )?;
        equipment.push(EquipmentPiece {
            level: eq.level,
            sector: eq.sector,
            name: eq.name.to_string(),
            unlocked: unlocked > 0,
        });
    }

    // ---- Evidence & terrain ----------------------------------------------
    let evidence_count: i64 = conn.query_row(
        "SELECT (SELECT COUNT(*) FROM habit_execution_logs WHERE file_proof_path IS NOT NULL)
              + (SELECT COUNT(*) FROM boss_milestones WHERE is_completed = 1)",
        [],
        |r| r.get(0),
    )?;

    // ---- Projections (Codex transparency) ---------------------------------
    let mut m_if_all = p.momentum;
    let mut cost_remaining = 0.0;
    let mut sharp_if_all = w.sharpness;
    for hv in habits.iter().filter(|h| h.due_today && !h.is_archived) {
        m_if_all = f::momentum_after_execution(m_if_all, hv.weight, false, false);
        cost_remaining += hv.activation_cost;
        sharp_if_all = (sharp_if_all + f::sharpness_gain(sharp_if_all, hv.weight, hv.sector, m_if_all)).min(100.0);
    }
    let missed_weight: f64 = habits
        .iter()
        .filter(|h| h.due_today && !h.is_archived)
        .map(|h| f::weight_mult(h.weight))
        .sum();
    let m_if_missed = f::momentum_after_misses_at(p.momentum, missed_weight, diff.miss_decay_base);

    // ---- The Recommended Action law ----------------------------------------
    let mut recommended: Option<RecommendedAction> = None;
    for hv in habits.iter().filter(|h| h.due_today && !h.is_archived) {
        let lagging = gate
            .sector_progress
            .iter()
            .any(|s| s.sector == hv.sector && !s.ok && p.campaign_day(today) > 30);
        let score = f::directive_priority(
            hv.weight, hv.sector, hv.rusted, hv.cursed, lagging,
            hv.sworn_boss_id.is_some(),
        );
        let better = recommended.as_ref().map(|r| score > r.score).unwrap_or(true);
        if better {
            let mut reasons: Vec<&str> = Vec::new();
            if hv.rusted {
                reasons.push("rust debt is compounding at 30%");
            }
            if hv.cursed {
                reasons.push("its sector carries an Ascended curse");
            }
            if lagging {
                reasons.push("its gate sector is below the 50% cap");
            }
            if reasons.is_empty() {
                reasons.push(match hv.sector {
                    Sector::Financial => "heaviest strike available on the financial frontline",
                    Sector::Intellectual => "highest-value window open on the intellectual front",
                    Sector::Physical => "highest-value window open on the physical front",
                    Sector::Responsibility => "highest-value window currently open",
                });
            }
            recommended = Some(RecommendedAction {
                habit_id: hv.id,
                habit_name: hv.name.clone(),
                score,
                reason: reasons.join("; "),
            });
        }
    }

    // ---- History ----------------------------------------------------------
    let mut stmt = conn.prepare(
        "SELECT day_key, executions, misses, momentum_close, stamina_close,
                sharpness_close, durability_close, perfect
         FROM system_days ORDER BY day_key DESC LIMIT 120",
    )?;
    let mut recent_days = stmt
        .query_map([], |r| {
            Ok(DayRecord {
                day_key: r.get(0)?,
                executions: r.get(1)?,
                misses: r.get(2)?,
                momentum_close: r.get(3)?,
                stamina_close: r.get(4)?,
                sharpness_close: r.get(5)?,
                durability_close: r.get(6)?,
                perfect: r.get::<_, i64>(7)? == 1,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    recent_days.reverse();

    let mut stmt = conn.prepare(
        "SELECT l.id, l.habit_id, h.habit_name, h.sector_type, h.weight_class,
                l.execution_timestamp, l.day_key, l.file_proof_path, l.note,
                l.stamina_cost, l.momentum_after, l.overdraft, l.off_window
         FROM habit_execution_logs l JOIN habit_configs h ON h.id = l.habit_id
         ORDER BY l.id DESC LIMIT 60",
    )?;
    let recent_logs = stmt
        .query_map([], |r| {
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
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut stmt = conn.prepare(
        "SELECT id, day_key, ts, kind, detail, seen FROM system_events
         WHERE seen = 0 ORDER BY id DESC LIMIT 40",
    )?;
    let unseen_events = stmt
        .query_map([], |r| {
            Ok(SystemEvent {
                id: r.get(0)?,
                day_key: r.get(1)?,
                timestamp: r.get(2)?,
                kind: r.get(3)?,
                detail: r.get(4)?,
                seen: r.get::<_, i64>(5)? == 1,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let rusted_any = habits.iter().any(|h| h.rusted && !h.is_archived);

    Ok(SystemSnapshot {
        profile: ProfileView {
            name: p.name.clone(),
            oath: p.oath.clone(),
            current_level: p.level,
            level_title: level_def.title.to_string(),
            level_theme: level_def.theme.to_string(),
            stat_str: p.stat_str(),
            stat_int: p.stat_int(),
            stat_cha: p.stat_cha(),
            stat_wil: p.stat_wil(),
            xp_str: f::round2(p.xp_str),
            xp_int: f::round2(p.xp_int),
            xp_cha: f::round2(p.xp_cha),
            xp_wil: f::round2(p.xp_wil),
            current_stamina: f::round2(p.stamina),
            max_stamina: p.max_stamina(),
            momentum: f::round2(p.momentum),
            campaign_day: p.campaign_day(today),
            cycle_count: p.cycle_count,
            genesis_complete: p.genesis_complete,
            created_at: p.created_at.clone(),
        },
        weapon: WeaponView {
            sharpness: f::round2(w.sharpness),
            durability: f::round2(w.durability),
            fire_affinity: f::round2(w.fire),
            lightning_affinity: f::round2(w.lightning),
            state: w.state(),
            reforge_progress: w.reforge_progress,
            forge_count_total: w.forge_count_total,
        },
        habits,
        bosses,
        gate,
        levels,
        equipment,
        biome: f::biome_mode(p.momentum),
        paving_ratio: f::round2(f::paving_ratio(evidence_count)),
        locomotion_speed: f::locomotion_speed(p.momentum),
        evidence_count,
        audio: AudioLaw {
            pitch_multiplier: f::audio_pitch_multiplier(p.momentum),
            lowpass_cutoff: f::audio_lowpass_cutoff(p.momentum),
            degradation: rusted_any,
        },
        projection: Projection {
            momentum_if_all_executed: f::round2(m_if_all),
            momentum_if_all_missed: f::round2(m_if_missed),
            stamina_cost_remaining: f::round2(cost_remaining),
            sharpness_if_all_executed: f::round2(sharp_if_all),
        },
        recommended,
        quests: engine::load_active_quests(conn, today)?,
        rest_tokens: p.rest_tokens,
        today_is_rest: engine::is_rest_day(conn, today),
        tomorrow_is_rest: engine::is_rest_day(conn, today + chrono::Duration::days(1)),
        difficulty: difficulty_name,
        recent_days,
        recent_logs,
        unseen_events,
        today_key: dk,
        now_hour: hour,
        db_path: db_path.to_string(),
        oracle_configured,
        oracle_model,
    })
}

/// Consecutive execution streak measured in the habit's own period — a
/// 3-day habit executed every third day is an unbroken streak, not a broken
/// daily one. Returned in days of coverage (executions × period).
fn habit_streak_days(
    conn: &Connection,
    habit_id: i64,
    today_key: &str,
    period_days: i64,
) -> EResult<i64> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT day_key FROM habit_execution_logs WHERE habit_id = ?1 ORDER BY day_key DESC LIMIT 366",
    )?;
    let days: Vec<String> = stmt
        .query_map(params![habit_id], |r| r.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    if days.is_empty() {
        return Ok(0);
    }
    let period = period_days.max(1);
    let today = engine::parse_day(today_key);
    let first = engine::parse_day(&days[0]);
    // Streak is alive if the most recent execution is within one period.
    if (today - first).num_days() > period {
        return Ok(0);
    }
    let mut executions = 1i64;
    let mut prev = first;
    for d in days.iter().skip(1) {
        let cur = engine::parse_day(d);
        if (prev - cur).num_days() <= period {
            executions += 1;
            prev = cur;
        } else {
            break;
        }
    }
    Ok(executions * period)
}
