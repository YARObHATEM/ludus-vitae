//! # The Iron Laws — canonical game mathematics
//!
//! This module is the ONLY place where game math exists. The frontend never
//! reconstructs these formulas; it renders values computed here (Scaffolding
//! rule: "No inline math reconstruction"). Every function is pure and tested.
//!
//! ## The laws in prose
//!
//! **Momentum** `M ∈ [0.25, 3.50]`, starts at 1.00.
//!   - Verified execution: `M += gain(weight)` where gain is
//!     TRIVIAL +0.02, STANDARD +0.05, HEROIC +0.10, MYTHIC +0.20.
//!     Overdraft executions (stamina exhausted) earn half gain.
//!     Off-window executions earn 75% gain.
//!   - Night close, for every missed due habit: `M ×= 0.90 ^ weight_mult`.
//!     Losses are multiplicative, gains are additive — the system is loss-averse
//!     on your behalf.
//!   - Idle cooling: a day with zero verified executions drifts M 3% toward
//!     1.00 (never below 1.00 by cooling alone). Rest is allowed; drift is not.
//!
//! **Friction (the Rust State)** — for each habit, `cm` = consecutive missed
//!   windows. Activation stamina cost:
//!   `cost = base(weight) × F^min(cm,6) × curse / √M`
//!   where `F = 1.30 − 0.005×(INT−10)` (floor 1.15) — intelligence literally
//!   lowers the interest rate on your failures. Curse = ×1.20 while an
//!   Ascended boss occupies the habit's sector.
//!
//! **Stamina** `S ∈ [0, max]`, `max = 100 + 2×(STR−10)`.
//!   Night regen: `+30 × √M`, halved on a day with misses, ×0.7 while the
//!   weapon is fractured/broken. Overdraft: executing with S < cost still
//!   works (S→0) but momentum gain is halved — honesty about limits.
//!
//! **The Whetstone** — verified executions never damage bosses. They forge:
//!   `Δsharpness = 1.8 × weight_mult × sector_mult × M^0.25 × (1 − S/100)`
//!   (logistic saturation: a sharp blade whets slowly). Idle days decay
//!   sharpness with a 14-day half-life. Each missed HEROIC/MYTHIC habit
//!   grinds ×0.98 off sharpness at night.
//!
//! **Durability** — misses chip it (`−1.5 × weight_mult`), perfect days heal
//!   it (+1.0). Below 30: FRACTURED (strike ×0.5, regen ×0.7). At 0: BROKEN —
//!   the Reckoning auto-fails until reforged by 7 consecutive perfect days.
//!
//! **The Reckoning** (end-of-cycle combat, day 90–120):
//!   `strike = sharpness × (0.5 + 0.5×dur/100) × (1 + 0.3×fire + 0.3×light)
//!            × M^0.25 × √(sector_completion) × fracture_penalty − armor`
//!   You cannot strike a sector you ignored: sector_completion gates damage.
//!
//! **The Gate** — level transition requires ALL of:
//!   global weighted progress ≥ 80%, every sector ≥ 50%, campaign day ≥ 90.
//!   Forced reckoning at day 120. Failure restarts the cycle (bosses keep
//!   their wounds — no arbitrary resets), cycle debt +1.
//!
//! **Ascended Debt** — a boss alive at level-up follows you: HP ×1.35 and a
//!   +20% stamina curse on its sector until it dies.

use crate::model::{BiomeMode, Sector, WeaponState, WeightClass};

// ---------------------------------------------------------------------------
// Constants (The Iron Laws)
// ---------------------------------------------------------------------------

pub const MOMENTUM_MIN: f64 = 0.25;
pub const MOMENTUM_MAX: f64 = 3.50;
pub const MOMENTUM_START: f64 = 1.00;
pub const MOMENTUM_MISS_BASE: f64 = 0.90;
pub const MOMENTUM_COOLING_RATE: f64 = 0.03;

pub const FRICTION_BASE: f64 = 1.30;
pub const FRICTION_FLOOR: f64 = 1.15;
pub const FRICTION_INT_RELIEF: f64 = 0.005;
pub const FRICTION_CAP_EXP: i64 = 6;

pub const CURSE_STAMINA_MULT: f64 = 1.20;
pub const ASCENSION_HP_MULT: f64 = 1.35;

pub const STAMINA_REGEN_BASE: f64 = 30.0;
pub const STAMINA_BASE_MAX: f64 = 100.0;

pub const SHARPNESS_GAIN_BASE: f64 = 1.8;
pub const SHARPNESS_IDLE_HALF_LIFE_DAYS: f64 = 14.0;
pub const SHARPNESS_HEAVY_MISS_FACTOR: f64 = 0.98;
pub const SHARPNESS_BLUNT_FACTOR: f64 = 0.70;

pub const DURABILITY_MISS_HIT: f64 = 1.5;
pub const DURABILITY_PERFECT_REGEN: f64 = 1.0;
pub const DURABILITY_RECKONING_STRAIN: f64 = 10.0;
pub const WEAPON_FRACTURE_THRESHOLD: f64 = 30.0;
pub const REFORGE_PERFECT_DAYS: i64 = 7;

pub const FIRE_GAIN_PER_HEAVY_EXECUTION: f64 = 0.01;
pub const LIGHTNING_GAIN_PER_PERFECT_DAY: f64 = 0.05;
pub const FIRE_DAILY_DECAY: f64 = 0.995;
pub const LIGHTNING_DAILY_DECAY: f64 = 0.99;

pub const GATE_GLOBAL_REQ: f64 = 0.80;
pub const GATE_SECTOR_REQ: f64 = 0.50;
pub const LEVEL_CAP: i64 = 10;

// The Open Gates law: a chapter has no calendar. It ends when its bosses die
// (clean clear), or when the operator chooses to FORCE the gate early —
// paying the Ascended Debt for every survivor.
pub const RECKONING_MIN_SHARPNESS: f64 = 40.0;
pub const RECKONING_COOLDOWN_DAYS: i64 = 7;

// The Siege law: a directive sworn to a boss chips it with every verified
// execution — small, capped, relentless. The cap keeps sieges from replacing
// milestones: at most 20% of a boss's total HP can fall to daily pressure.
pub const SIEGE_DAMAGE_BASE: f64 = 0.5;
pub const SIEGE_CAP_FRACTION: f64 = 0.20;

pub const OFF_WINDOW_GAIN_FACTOR: f64 = 0.75;
pub const OVERDRAFT_GAIN_FACTOR: f64 = 0.50;

pub const XP_PER_STAT_POINT_BASE: f64 = 25.0;

// ---------------------------------------------------------------------------
// Weight & sector coefficients
// ---------------------------------------------------------------------------

/// Impact multiplier of a weight class (Genesis Ritual plain-word mapping).
pub fn weight_mult(w: WeightClass) -> f64 {
    match w {
        WeightClass::Trivial => 0.5,
        WeightClass::Standard => 1.0,
        WeightClass::Heroic => 1.5,
        WeightClass::Mythic => 2.0,
    }
}

/// Additive momentum gain of one verified execution.
pub fn momentum_gain(w: WeightClass) -> f64 {
    match w {
        WeightClass::Trivial => 0.02,
        WeightClass::Standard => 0.05,
        WeightClass::Heroic => 0.10,
        WeightClass::Mythic => 0.20,
    }
}

/// Base stamina cost of one execution before friction/curse/momentum.
pub fn base_activation_cost(w: WeightClass) -> f64 {
    match w {
        WeightClass::Trivial => 2.0,
        WeightClass::Standard => 5.0,
        WeightClass::Heroic => 9.0,
        WeightClass::Mythic => 14.0,
    }
}

/// Damage/progress scaling coefficient per campaign sector (Level 1 map:
/// the Financial frontline carries the heavy weight).
pub fn sector_mult(s: Sector) -> f64 {
    match s {
        Sector::Financial => 1.5,
        Sector::Intellectual => 1.0,
        Sector::Physical => 1.0,
        Sector::Responsibility => 0.75,
    }
}

// ---------------------------------------------------------------------------
// Momentum
// ---------------------------------------------------------------------------

pub fn clamp_momentum(m: f64) -> f64 {
    m.clamp(MOMENTUM_MIN, MOMENTUM_MAX)
}

/// Momentum after a verified execution.
pub fn momentum_after_execution(m: f64, w: WeightClass, overdraft: bool, off_window: bool) -> f64 {
    let mut gain = momentum_gain(w);
    if overdraft {
        gain *= OVERDRAFT_GAIN_FACTOR;
    }
    if off_window {
        gain *= OFF_WINDOW_GAIN_FACTOR;
    }
    clamp_momentum(m + gain)
}

/// Momentum after night close applies every missed due habit.
/// `missed_weight_sum` = Σ weight_mult over missed habits.
pub fn momentum_after_misses(m: f64, missed_weight_sum: f64) -> f64 {
    if missed_weight_sum <= 0.0 {
        return clamp_momentum(m);
    }
    clamp_momentum(m * MOMENTUM_MISS_BASE.powf(missed_weight_sum))
}

/// Idle cooling: with zero verified executions, momentum above 1.0 drifts 3%
/// toward baseline. Cooling never drags below 1.0 — only misses do that.
pub fn momentum_cooling(m: f64, had_any_execution: bool) -> f64 {
    if had_any_execution || m <= MOMENTUM_START {
        return clamp_momentum(m);
    }
    clamp_momentum((m * (1.0 - MOMENTUM_COOLING_RATE)).max(MOMENTUM_START))
}

// ---------------------------------------------------------------------------
// Friction & stamina
// ---------------------------------------------------------------------------

/// Friction base shrinks with INT: intelligence lowers the interest rate on
/// failure. 1.30 at INT 10, floor 1.15.
pub fn friction_base(stat_int: i64) -> f64 {
    (FRICTION_BASE - FRICTION_INT_RELIEF * (stat_int - 10) as f64).max(FRICTION_FLOOR)
}

/// The activation (stamina) cost of executing a habit right now.
pub fn activation_cost(
    w: WeightClass,
    consecutive_misses: i64,
    momentum: f64,
    cursed: bool,
    stat_int: i64,
) -> f64 {
    let fb = friction_base(stat_int);
    let exp = consecutive_misses.clamp(0, FRICTION_CAP_EXP) as f64;
    let curse = if cursed { CURSE_STAMINA_MULT } else { 1.0 };
    let m = clamp_momentum(momentum);
    let cost = base_activation_cost(w) * fb.powf(exp) * curse / m.sqrt();
    round2(cost)
}

/// Consecutive misses required before a habit visibly rusts. Willpower widens
/// the tolerance: threshold = 2 + (WIL−10)/5.
pub fn rust_threshold(stat_wil: i64) -> i64 {
    2 + ((stat_wil - 10) / 5).max(0)
}

pub fn is_rusted(consecutive_misses: i64, stat_wil: i64) -> bool {
    consecutive_misses >= rust_threshold(stat_wil)
}

/// Maximum stamina ceiling regulated by STR.
pub fn max_stamina(stat_str: i64) -> f64 {
    (STAMINA_BASE_MAX + 2.0 * (stat_str - 10) as f64).clamp(60.0, 160.0)
}

/// Overnight stamina regeneration.
pub fn stamina_regen(momentum: f64, weapon_state: WeaponState, had_misses: bool) -> f64 {
    let m = clamp_momentum(momentum);
    let weapon_factor = match weapon_state {
        WeaponState::Fractured | WeaponState::Broken => 0.7,
        _ => 1.0,
    };
    let miss_factor = if had_misses { 0.5 } else { 1.0 };
    round2(STAMINA_REGEN_BASE * m.sqrt() * weapon_factor * miss_factor)
}

// ---------------------------------------------------------------------------
// Stats (STR / INT / CHA / WIL)
// ---------------------------------------------------------------------------

/// XP granted to the sector stat by one verified execution.
pub fn stat_xp_gain(w: WeightClass) -> f64 {
    10.0 * weight_mult(w)
}

/// Stat value derived from accumulated XP: 10 + ⌊√(xp/25)⌋.
/// Slow, unbounded-in-theory, sublinear — no grinding to godhood.
pub fn stat_value(xp: f64) -> i64 {
    10 + (xp.max(0.0) / XP_PER_STAT_POINT_BASE).sqrt().floor() as i64
}

/// Which stat a sector trains.
pub fn sector_stat(s: Sector) -> &'static str {
    match s {
        Sector::Physical => "STR",
        Sector::Intellectual => "INT",
        Sector::Financial => "CHA",
        Sector::Responsibility => "WIL",
    }
}

// ---------------------------------------------------------------------------
// The Whetstone (weapon forging)
// ---------------------------------------------------------------------------

/// Sharpness gained by one verified execution (logistic saturation).
pub fn sharpness_gain(current: f64, w: WeightClass, s: Sector, momentum: f64) -> f64 {
    let m = clamp_momentum(momentum);
    let headroom = (1.0 - current / 100.0).max(0.0);
    round2(SHARPNESS_GAIN_BASE * weight_mult(w) * sector_mult(s) * m.powf(0.25) * headroom)
}

/// Idle-day exponential decay (half-life 14 days).
pub fn sharpness_idle_decay(current: f64) -> f64 {
    round2(current * (-(std::f64::consts::LN_2) / SHARPNESS_IDLE_HALF_LIFE_DAYS).exp())
}

/// Night grinding from heavy (HEROIC/MYTHIC) misses.
pub fn sharpness_after_heavy_misses(current: f64, heavy_miss_count: i64) -> f64 {
    round2(current * SHARPNESS_HEAVY_MISS_FACTOR.powi(heavy_miss_count.max(0) as i32))
}

pub fn durability_miss_hit(w: WeightClass) -> f64 {
    DURABILITY_MISS_HIT * weight_mult(w)
}

/// Weapon state derived from metrics. Priority: BROKEN > FRACTURED > BLUNTED.
pub fn weapon_state(durability: f64, blunted_flag: bool) -> WeaponState {
    if durability <= 0.0 {
        WeaponState::Broken
    } else if durability < WEAPON_FRACTURE_THRESHOLD {
        WeaponState::Fractured
    } else if blunted_flag {
        WeaponState::Blunted
    } else {
        WeaponState::Tempered
    }
}

// ---------------------------------------------------------------------------
// Campaign: bosses, strikes, gates
// ---------------------------------------------------------------------------

/// Total HP of a freshly spawned boss at a given level.
pub fn boss_total_hp(level: i64) -> f64 {
    100.0 + 50.0 * ((level - 1).max(0) as f64)
}

/// Flat armor of a boss at a given level (subtracted from each strike).
pub fn boss_armor(level: i64) -> f64 {
    4.0 * ((level - 1).max(0) as f64)
}

/// The Reckoning strike against one boss.
pub fn reckoning_strike(
    sharpness: f64,
    durability: f64,
    fire: f64,
    lightning: f64,
    momentum: f64,
    sector_completion: f64,
    armor: f64,
    state: WeaponState,
) -> f64 {
    if state == WeaponState::Broken {
        return 0.0;
    }
    let fracture_penalty = if state == WeaponState::Fractured { 0.5 } else { 1.0 };
    let m = clamp_momentum(momentum);
    let raw = sharpness
        * (0.5 + 0.5 * (durability / 100.0).clamp(0.0, 1.0))
        * (1.0 + 0.3 * fire.clamp(0.0, 1.0) + 0.3 * lightning.clamp(0.0, 1.0))
        * m.powf(0.25)
        * sector_completion.clamp(0.0, 1.0).sqrt()
        * fracture_penalty;
    round2((raw - armor).max(0.0))
}

/// Weighted global progress across bosses: Σ(dealt × sector_mult) / Σ(total × sector_mult).
pub fn global_progress(bosses: &[(f64, f64, Sector)]) -> f64 {
    let mut dealt = 0.0;
    let mut total = 0.0;
    for (hp_dealt, hp_total, sector) in bosses {
        dealt += hp_dealt * sector_mult(*sector);
        total += hp_total * sector_mult(*sector);
    }
    if total <= 0.0 {
        0.0
    } else {
        (dealt / total).clamp(0.0, 1.0)
    }
}

// ---------------------------------------------------------------------------
// The Recommended Action law
// ---------------------------------------------------------------------------

/// Deterministic priority score for a due directive. The engine always knows
/// which window matters most:
///   score = weight_mult × sector_mult
///           × 1.5 if rusted        (compounding debt is the emergency)
///           × 1.2 if cursed        (a cursed sector abandoned becomes a spiral)
///           × 1.3 if its gate sector lags below 50% past day 30 (anti-exploit pressure)
///           × 1.15 if sworn to a living boss (a siege never sleeps)
pub fn directive_priority(
    w: WeightClass,
    s: Sector,
    rusted: bool,
    cursed: bool,
    sector_lagging: bool,
    sworn: bool,
) -> f64 {
    let mut score = weight_mult(w) * sector_mult(s);
    if rusted {
        score *= 1.5;
    }
    if cursed {
        score *= 1.2;
    }
    if sector_lagging {
        score *= 1.3;
    }
    if sworn {
        score *= 1.15;
    }
    round2(score)
}

/// Raw siege damage of one sworn execution (before the sector multiplier and
/// the 20% cap).
pub fn siege_damage_raw(w: WeightClass) -> f64 {
    round2(SIEGE_DAMAGE_BASE * weight_mult(w))
}

/// The Reckoning can be called only with a forged blade and a rested arm.
pub fn reckoning_ready(sharpness: f64, days_since_last: Option<i64>) -> bool {
    sharpness >= RECKONING_MIN_SHARPNESS
        && days_since_last.map(|d| d >= RECKONING_COOLDOWN_DAYS).unwrap_or(true)
}

// ---------------------------------------------------------------------------
// Presentation laws (still centralized here — the UI renders, never derives)
// ---------------------------------------------------------------------------

/// Terrain mode from momentum. Evidence paving is layered on top by ratio.
pub fn biome_mode(momentum: f64) -> BiomeMode {
    if momentum < 1.0 {
        BiomeMode::Mud
    } else if momentum < 1.2 {
        BiomeMode::Earth
    } else if momentum < 2.0 {
        BiomeMode::Cobble
    } else {
        BiomeMode::Paved
    }
}

/// Fraction of terrain tiles permanently paved by verified evidence.
pub fn paving_ratio(evidence_count: i64) -> f64 {
    ((evidence_count as f64) / 150.0).clamp(0.0, 1.0)
}

/// Audio Pitch Multiplier = Base Default Pitch × momentum_coefficient (clamped
/// to keep the soundscape usable).
pub fn audio_pitch_multiplier(momentum: f64) -> f64 {
    round2(clamp_momentum(momentum).clamp(0.6, 1.45))
}

/// Global low-pass cutoff. Muffled world below momentum 1.0, fully open ≥1.5.
pub fn audio_lowpass_cutoff(momentum: f64) -> f64 {
    let t = ((clamp_momentum(momentum) - 0.5) / 1.0).clamp(0.0, 1.0);
    round2(700.0 + (18_000.0 - 700.0) * t)
}

/// Locomotion speed factor for the world strip.
pub fn locomotion_speed(momentum: f64) -> f64 {
    round2(clamp_momentum(momentum).clamp(0.5, 2.2))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

pub fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

/// FNV-1a — deterministic variant selection for the offline oracle. Never
/// used for game state; only reproducible narrative choice.
pub fn fnv1a(input: &str) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in input.as_bytes() {
        hash ^= *b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

// ---------------------------------------------------------------------------
// Tests — the laws must hold
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const EPS: f64 = 1e-9;

    #[test]
    fn momentum_gains_match_weight_cards() {
        assert!((momentum_gain(WeightClass::Trivial) - 0.02).abs() < EPS);
        assert!((momentum_gain(WeightClass::Standard) - 0.05).abs() < EPS);
        assert!((momentum_gain(WeightClass::Heroic) - 0.10).abs() < EPS);
        assert!((momentum_gain(WeightClass::Mythic) - 0.20).abs() < EPS);
    }

    #[test]
    fn momentum_clamps_at_bounds() {
        assert!((momentum_after_execution(3.45, WeightClass::Mythic, false, false) - 3.5).abs() < EPS);
        assert!((momentum_after_misses(0.26, 10.0) - MOMENTUM_MIN).abs() < EPS);
    }

    #[test]
    fn momentum_miss_is_multiplicative() {
        // one missed STANDARD: ×0.90
        let m = momentum_after_misses(2.0, 1.0);
        assert!((m - 1.8).abs() < EPS);
        // one missed MYTHIC: ×0.90^2 = 0.81
        let m2 = momentum_after_misses(2.0, 2.0);
        assert!((m2 - 1.62).abs() < 1e-6);
    }

    #[test]
    fn cooling_never_drops_below_baseline_and_respects_activity() {
        assert!((momentum_cooling(1.01, false) - 1.0).abs() < EPS);
        assert!((momentum_cooling(2.0, false) - 1.94).abs() < EPS);
        assert!((momentum_cooling(2.0, true) - 2.0).abs() < EPS);
        assert!((momentum_cooling(0.8, false) - 0.8).abs() < EPS); // cooling can't hurt low M
    }

    #[test]
    fn overdraft_and_off_window_shave_gains() {
        let base = momentum_after_execution(1.0, WeightClass::Mythic, false, false);
        let od = momentum_after_execution(1.0, WeightClass::Mythic, true, false);
        let ow = momentum_after_execution(1.0, WeightClass::Mythic, false, true);
        assert!((base - 1.20).abs() < EPS);
        assert!((od - 1.10).abs() < EPS);
        assert!((ow - 1.15).abs() < EPS);
    }

    #[test]
    fn friction_compounds_at_130_percent_and_caps() {
        let c0 = activation_cost(WeightClass::Standard, 0, 1.0, false, 10);
        let c1 = activation_cost(WeightClass::Standard, 1, 1.0, false, 10);
        let c2 = activation_cost(WeightClass::Standard, 2, 1.0, false, 10);
        assert!((c0 - 5.0).abs() < EPS);
        assert!((c1 - 6.5).abs() < EPS);
        assert!((c2 - 8.45).abs() < EPS);
        // cap at exponent 6
        let c6 = activation_cost(WeightClass::Standard, 6, 1.0, false, 10);
        let c9 = activation_cost(WeightClass::Standard, 9, 1.0, false, 10);
        assert!((c6 - c9).abs() < EPS);
    }

    #[test]
    fn intelligence_lowers_friction_interest_rate() {
        assert!((friction_base(10) - 1.30).abs() < EPS);
        assert!((friction_base(20) - 1.25).abs() < EPS);
        assert!((friction_base(60) - FRICTION_FLOOR).abs() < EPS);
    }

    #[test]
    fn curse_and_momentum_shape_costs() {
        let cursed = activation_cost(WeightClass::Standard, 0, 1.0, true, 10);
        assert!((cursed - 6.0).abs() < EPS);
        // high momentum discounts effort
        let fast = activation_cost(WeightClass::Standard, 0, 3.5, false, 10);
        assert!(fast < 5.0 / 1.8 + 0.1);
        // collapsed momentum doubles effort
        let slow = activation_cost(WeightClass::Standard, 0, 0.25, false, 10);
        assert!((slow - 10.0).abs() < EPS);
    }

    #[test]
    fn willpower_widens_rust_tolerance() {
        assert_eq!(rust_threshold(10), 2);
        assert_eq!(rust_threshold(15), 3);
        assert!(is_rusted(2, 10));
        assert!(!is_rusted(2, 15));
    }

    #[test]
    fn stamina_ceiling_and_regen() {
        assert!((max_stamina(10) - 100.0).abs() < EPS);
        assert!((max_stamina(20) - 120.0).abs() < EPS);
        assert!((stamina_regen(1.0, WeaponState::Tempered, false) - 30.0).abs() < EPS);
        assert!((stamina_regen(1.0, WeaponState::Tempered, true) - 15.0).abs() < EPS);
        assert!((stamina_regen(1.0, WeaponState::Fractured, false) - 21.0).abs() < EPS);
    }

    #[test]
    fn stats_grow_sublinearly() {
        assert_eq!(stat_value(0.0), 10);
        assert_eq!(stat_value(25.0), 11);
        assert_eq!(stat_value(100.0), 12);
        assert_eq!(stat_value(2500.0), 20);
    }

    #[test]
    fn whetstone_saturates_logistically() {
        let dull = sharpness_gain(10.0, WeightClass::Standard, Sector::Intellectual, 1.0);
        let sharp = sharpness_gain(90.0, WeightClass::Standard, Sector::Intellectual, 1.0);
        assert!(dull > sharp * 5.0);
        let maxed = sharpness_gain(100.0, WeightClass::Mythic, Sector::Financial, 3.5);
        assert!(maxed.abs() < EPS);
    }

    #[test]
    fn financial_sector_carries_heavy_weight() {
        let fin = sharpness_gain(0.0, WeightClass::Standard, Sector::Financial, 1.0);
        let intl = sharpness_gain(0.0, WeightClass::Standard, Sector::Intellectual, 1.0);
        assert!((fin / intl - 1.5).abs() < 0.01);
    }

    #[test]
    fn sharpness_half_life_is_fourteen_days() {
        let mut s = 80.0;
        for _ in 0..14 {
            s = sharpness_idle_decay(s);
        }
        assert!((s - 40.0).abs() < 0.5);
    }

    #[test]
    fn weapon_states_derive_in_priority_order() {
        assert_eq!(weapon_state(0.0, false), WeaponState::Broken);
        assert_eq!(weapon_state(20.0, false), WeaponState::Fractured);
        assert_eq!(weapon_state(50.0, true), WeaponState::Blunted);
        assert_eq!(weapon_state(50.0, false), WeaponState::Tempered);
    }

    #[test]
    fn reckoning_respects_neglect_and_armor() {
        // full weapon vs untouched sector: zero completion → zero strike
        let s = reckoning_strike(100.0, 100.0, 0.0, 0.0, 1.0, 0.0, 0.0, WeaponState::Tempered);
        assert!(s.abs() < EPS);
        // healthy strike
        let s2 = reckoning_strike(60.0, 80.0, 0.0, 0.0, 1.3, 1.0, 0.0, WeaponState::Tempered);
        assert!(s2 > 55.0 && s2 < 65.0);
        // armor subtracts flat
        let s3 = reckoning_strike(60.0, 80.0, 0.0, 0.0, 1.3, 1.0, 10.0, WeaponState::Tempered);
        assert!((s2 - s3 - 10.0).abs() < EPS);
        // broken weapon cannot strike
        let s4 = reckoning_strike(100.0, 0.0, 1.0, 1.0, 3.5, 1.0, 0.0, WeaponState::Broken);
        assert!(s4.abs() < EPS);
    }

    #[test]
    fn global_progress_weights_sectors() {
        // financial counts 1.5×
        let bosses = vec![
            (100.0, 100.0, Sector::Financial),
            (0.0, 100.0, Sector::Intellectual),
            (0.0, 100.0, Sector::Physical),
        ];
        let g = global_progress(&bosses);
        assert!((g - 150.0 / 350.0).abs() < 1e-9);
    }

    #[test]
    fn boss_scaling_by_level() {
        assert!((boss_total_hp(1) - 100.0).abs() < EPS);
        assert!((boss_total_hp(10) - 550.0).abs() < EPS);
        assert!((boss_armor(1) - 0.0).abs() < EPS);
        assert!((boss_armor(10) - 36.0).abs() < EPS);
    }

    #[test]
    fn biome_thresholds_follow_spec() {
        assert_eq!(biome_mode(0.8), BiomeMode::Mud);
        assert_eq!(biome_mode(1.05), BiomeMode::Earth);
        assert_eq!(biome_mode(1.5), BiomeMode::Cobble);
        assert_eq!(biome_mode(2.4), BiomeMode::Paved);
    }

    #[test]
    fn audio_laws_track_momentum() {
        assert!((audio_pitch_multiplier(1.0) - 1.0).abs() < EPS);
        assert!(audio_pitch_multiplier(0.25) >= 0.6);
        assert!(audio_lowpass_cutoff(0.5) <= 701.0);
        assert!(audio_lowpass_cutoff(1.5) >= 17_999.0);
    }

    #[test]
    fn fnv_is_stable() {
        assert_eq!(fnv1a("oracle"), fnv1a("oracle"));
        assert_ne!(fnv1a("oracle"), fnv1a("malachai"));
    }

    #[test]
    fn recommendation_prioritizes_rust_over_raw_weight() {
        // A rusted STANDARD financial habit outranks a clean MYTHIC responsibility one.
        let rusted_fin = directive_priority(WeightClass::Standard, Sector::Financial, true, false, false, false);
        let clean_resp = directive_priority(WeightClass::Mythic, Sector::Responsibility, false, false, false, false);
        assert!(rusted_fin > clean_resp);
        // All multipliers compose.
        let full = directive_priority(WeightClass::Mythic, Sector::Financial, true, true, true, true);
        assert!((full - 2.0 * 1.5 * 1.5 * 1.2 * 1.3 * 1.15).abs() < 0.01);
    }

    #[test]
    fn siege_chips_by_weight() {
        assert!((siege_damage_raw(WeightClass::Trivial) - 0.25).abs() < EPS);
        assert!((siege_damage_raw(WeightClass::Mythic) - 1.0).abs() < EPS);
    }

    #[test]
    fn reckoning_needs_forged_blade_and_rested_arm() {
        assert!(!reckoning_ready(39.9, None));
        assert!(reckoning_ready(40.0, None));
        assert!(!reckoning_ready(80.0, Some(6)));
        assert!(reckoning_ready(80.0, Some(7)));
    }
}
