//! Shared domain types. These structs are the single contract between the
//! Rust engine and the React shell — `src/types/contracts.ts` mirrors them 1:1.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Sector {
    Financial,
    Intellectual,
    Physical,
    Responsibility,
}

impl Sector {
    pub fn from_db(s: &str) -> Sector {
        match s {
            "FINANCIAL" => Sector::Financial,
            "INTELLECTUAL" => Sector::Intellectual,
            "PHYSICAL" => Sector::Physical,
            _ => Sector::Responsibility,
        }
    }
    pub fn as_db(&self) -> &'static str {
        match self {
            Sector::Financial => "FINANCIAL",
            Sector::Intellectual => "INTELLECTUAL",
            Sector::Physical => "PHYSICAL",
            Sector::Responsibility => "RESPONSIBILITY",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WeightClass {
    Trivial,
    Standard,
    Heroic,
    Mythic,
}

impl WeightClass {
    pub fn from_db(s: &str) -> WeightClass {
        match s {
            "TRIVIAL" => WeightClass::Trivial,
            "HEROIC" => WeightClass::Heroic,
            "MYTHIC" => WeightClass::Mythic,
            _ => WeightClass::Standard,
        }
    }
    pub fn as_db(&self) -> &'static str {
        match self {
            WeightClass::Trivial => "TRIVIAL",
            WeightClass::Standard => "STANDARD",
            WeightClass::Heroic => "HEROIC",
            WeightClass::Mythic => "MYTHIC",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum VerificationType {
    Image,
    File,
    Manual,
}

impl VerificationType {
    pub fn from_db(s: &str) -> VerificationType {
        match s {
            "IMAGE" => VerificationType::Image,
            "FILE" => VerificationType::File,
            _ => VerificationType::Manual,
        }
    }
    pub fn as_db(&self) -> &'static str {
        match self {
            VerificationType::Image => "IMAGE",
            VerificationType::File => "FILE",
            VerificationType::Manual => "MANUAL",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WeaponState {
    Tempered,
    Blunted,
    Fractured,
    Broken,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BiomeMode {
    Mud,
    Earth,
    Cobble,
    Paved,
}

// ---------------------------------------------------------------------------
// Snapshot structs (read model)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileView {
    pub name: String,
    pub oath: String,
    pub current_level: i64,
    pub level_title: String,
    pub level_theme: String,
    pub stat_str: i64,
    pub stat_int: i64,
    pub stat_cha: i64,
    pub stat_wil: i64,
    pub xp_str: f64,
    pub xp_int: f64,
    pub xp_cha: f64,
    pub xp_wil: f64,
    pub current_stamina: f64,
    pub max_stamina: f64,
    pub momentum: f64,
    pub campaign_day: i64,
    pub cycle_count: i64,
    pub genesis_complete: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeaponView {
    pub sharpness: f64,
    pub durability: f64,
    pub fire_affinity: f64,
    pub lightning_affinity: f64,
    pub state: WeaponState,
    pub reforge_progress: i64,
    pub forge_count_total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HabitView {
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
    pub rusted: bool,
    pub due_today: bool,
    pub executed_today: bool,
    pub in_window_now: bool,
    /// Stamina cost to execute right now (friction law applied).
    pub activation_cost: f64,
    pub momentum_gain: f64,
    pub cursed: bool,
    pub last_executed_day: Option<String>,
    pub total_executions: i64,
    pub streak_days: i64,
    pub is_archived: bool,
    /// The goal this directive is sworn to — every execution sieges that boss.
    pub sworn_boss_id: Option<i64>,
    pub sworn_boss_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MilestoneView {
    pub id: i64,
    pub boss_id: i64,
    pub order_index: i64,
    pub description: String,
    pub damage_value: i64,
    pub proof_type: VerificationType,
    pub completed: bool,
    pub completed_at: Option<String>,
    pub proof_path: Option<String>,
    pub req_stat: Option<String>,
    pub req_value: Option<i64>,
    pub stat_gate_open: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BossView {
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
    pub completion: f64,
    pub milestones: Vec<MilestoneView>,
    /// Projected reckoning strike damage if the reckoning happened right now.
    pub projected_strike: f64,
    /// Damage already dealt by sworn daily sieges, and its hard cap (20% of total).
    pub siege_dealt: f64,
    pub siege_cap: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GateReport {
    pub global_progress: f64,
    pub global_required: f64,
    pub global_ok: bool,
    pub sector_progress: Vec<SectorProgress>,
    pub sectors_ok: bool,
    /// Informational only — chapters have no calendar.
    pub campaign_day: i64,
    /// The clean clear: every boss destroyed. The gate opens without debt.
    pub all_defeated: bool,
    /// Thresholds met (global ≥80%, every sector ≥50%): the gate MAY be
    /// forced — survivors ascend with +35% HP and a sector curse.
    pub forceable: bool,
    /// The Reckoning can be called now (sharpness ≥ min, cooldown elapsed).
    pub reckoning_ready: bool,
    pub reckoning_min_sharpness: f64,
    pub reckoning_cooldown_left: i64,
    pub passed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SectorProgress {
    pub sector: Sector,
    pub progress: f64,
    pub required: f64,
    pub ok: bool,
    pub cursed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DayRecord {
    pub day_key: String,
    pub executions: i64,
    pub misses: i64,
    pub momentum_close: f64,
    pub stamina_close: f64,
    pub sharpness_close: f64,
    pub durability_close: f64,
    pub perfect: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemEvent {
    pub id: i64,
    pub day_key: String,
    pub timestamp: String,
    pub kind: String,
    pub detail: String,
    pub seen: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionLogView {
    pub id: i64,
    pub habit_id: i64,
    pub habit_name: String,
    pub sector: Sector,
    pub weight: WeightClass,
    pub timestamp: String,
    pub day_key: String,
    pub proof_path: Option<String>,
    pub note: Option<String>,
    pub stamina_cost: f64,
    pub momentum_after: f64,
    pub overdraft: bool,
    pub off_window: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EquipmentPiece {
    pub level: i64,
    pub sector: Sector,
    pub name: String,
    pub unlocked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LevelInfo {
    pub level: i64,
    pub title: String,
    pub theme: String,
    pub status: String, // "CLEARED" | "CURRENT" | "SEALED"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioLaw {
    /// Master pitch multiplier: base pitch x momentum (clamped).
    pub pitch_multiplier: f64,
    /// Global low-pass cutoff Hz derived from momentum.
    pub lowpass_cutoff: f64,
    /// True when any rusted habit exists — engine applies degradation wobble.
    pub degradation: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Projection {
    /// Momentum if every remaining due habit today is verified.
    pub momentum_if_all_executed: f64,
    /// Momentum after tonight's close if everything still due is missed.
    pub momentum_if_all_missed: f64,
    /// Total stamina cost of everything still due right now.
    pub stamina_cost_remaining: f64,
    /// Sharpness if all remaining due habits are verified now.
    pub sharpness_if_all_executed: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestView {
    pub id: i64,
    pub title: String,
    pub description: String,
    pub sector: Sector,
    pub weight: WeightClass,
    pub verification: VerificationType,
    pub deadline_day: Option<String>,
    pub created_day: String,
    pub completed_at: Option<String>,
    pub is_abandoned: bool,
    /// True when a deadline exists and today is past it (still completable).
    pub overdue: bool,
    pub momentum_reward: f64,
    pub xp_reward: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JournalEntryView {
    pub id: i64,
    pub timestamp: String,
    pub day_key: String,
    pub sector: Option<Sector>,
    pub content: String,
    pub oracle_reflection: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewQuestPayload {
    pub title: String,
    pub description: String,
    pub sector: Sector,
    pub weight: WeightClass,
    pub verification: VerificationType,
    pub deadline_day: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestReport {
    pub quest_id: i64,
    pub title: String,
    pub late: bool,
    pub momentum_before: f64,
    pub momentum_after: f64,
    pub xp_banked: f64,
    pub sharpness_after: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecommendedAction {
    pub habit_id: i64,
    pub habit_name: String,
    pub score: f64,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemSnapshot {
    pub profile: ProfileView,
    pub weapon: WeaponView,
    pub habits: Vec<HabitView>,
    pub bosses: Vec<BossView>,
    pub gate: GateReport,
    pub levels: Vec<LevelInfo>,
    pub equipment: Vec<EquipmentPiece>,
    pub biome: BiomeMode,
    pub paving_ratio: f64,
    pub locomotion_speed: f64,
    pub evidence_count: i64,
    pub audio: AudioLaw,
    pub projection: Projection,
    pub recommended: Option<RecommendedAction>,
    /// Active (uncompleted, unabandoned) quests.
    pub quests: Vec<QuestView>,
    pub rest_tokens: i64,
    pub today_is_rest: bool,
    pub tomorrow_is_rest: bool,
    pub difficulty: String,
    pub recent_days: Vec<DayRecord>,
    pub recent_logs: Vec<ExecutionLogView>,
    pub unseen_events: Vec<SystemEvent>,
    pub today_key: String,
    pub now_hour: i64,
    pub db_path: String,
    pub oracle_configured: bool,
    pub oracle_model: String,
}

// ---------------------------------------------------------------------------
// Command payloads / results
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionReport {
    pub habit_id: i64,
    pub habit_name: String,
    pub verified: bool,
    pub stamina_cost: f64,
    pub stamina_after: f64,
    pub overdraft: bool,
    pub off_window: bool,
    pub momentum_before: f64,
    pub momentum_after: f64,
    pub sharpness_before: f64,
    pub sharpness_after: f64,
    pub weight: WeightClass,
    pub sector: Sector,
    /// Siege damage dealt to the sworn boss by this execution (0 if unsworn).
    pub siege_damage: f64,
    pub siege_boss_name: Option<String>,
    pub siege_boss_defeated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MilestoneReport {
    pub milestone_id: i64,
    pub boss_id: i64,
    pub boss_name: String,
    pub damage_dealt: f64,
    pub boss_hp_after: f64,
    pub boss_defeated: bool,
    pub equipment_unlocked: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReckoningStrike {
    pub boss_id: i64,
    pub boss_name: String,
    pub sector: Sector,
    pub strike_damage: f64,
    pub hp_before: f64,
    pub hp_after: f64,
    pub defeated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReckoningReport {
    pub strikes: Vec<ReckoningStrike>,
    pub weapon_state_after: WeaponState,
    pub blunted: bool,
    pub gate: GateReport,
    /// A clean clear: the last boss fell to this reckoning and the chapter
    /// advanced without debt.
    pub level_advanced: bool,
    pub new_level: i64,
    pub new_level_title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForceGateReport {
    pub ascended_bosses: Vec<String>,
    pub new_level: i64,
    pub new_level_title: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewHabitPayload {
    pub name: String,
    pub description: String,
    pub sector: Sector,
    pub weight: WeightClass,
    pub verification: VerificationType,
    pub frequency_hours: i64,
    pub window_start_hour: Option<i64>,
    pub window_end_hour: Option<i64>,
    #[serde(default)]
    pub sworn_boss_id: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EditHabitPayload {
    pub id: i64,
    pub name: String,
    pub description: String,
    pub weight: WeightClass,
    pub verification: VerificationType,
    pub frequency_hours: i64,
    pub window_start_hour: Option<i64>,
    pub window_end_hour: Option<i64>,
    #[serde(default)]
    pub sworn_boss_id: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GenesisMilestonePayload {
    pub sector: Sector,
    pub description: String,
    pub damage_value: i64,
    pub proof_type: VerificationType,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GenesisPayload {
    pub name: String,
    pub oath: String,
    pub environment_text: String,
    pub threats_text: String,
    pub habits: Vec<NewHabitPayload>,
    pub milestones: Vec<GenesisMilestonePayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OracleResponse {
    pub persona_emitter: String,
    pub cognitive_bias_detected: String,
    pub narrative_log: String,
    pub apply_low_pass_audio_filter: bool,
    pub trigger_glitch_vfx: bool,
    pub mode: String, // "REMOTE" | "LOCAL" | "LOCAL_FALLBACK"
    pub timestamp: String,
    /// Present only when a remote attempt failed and the system degraded to
    /// offline deterministic diagnostics.
    pub upstream_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OracleLogView {
    pub id: i64,
    pub timestamp: String,
    pub persona: String,
    pub mode: String,
    pub bias: String,
    pub narrative: String,
}
