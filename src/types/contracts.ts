/**
 * TypeScript mirror of the Rust model layer (src-tauri/src/model.rs).
 * These types are contracts — never hand-edit one side without the other.
 */

export type Sector = "FINANCIAL" | "INTELLECTUAL" | "PHYSICAL" | "RESPONSIBILITY";
export type WeightClass = "TRIVIAL" | "STANDARD" | "HEROIC" | "MYTHIC";
export type VerificationType = "IMAGE" | "FILE" | "MANUAL";
export type WeaponState = "TEMPERED" | "BLUNTED" | "FRACTURED" | "BROKEN";
export type BiomeMode = "MUD" | "EARTH" | "COBBLE" | "PAVED";

export interface ProfileView {
  name: string;
  oath: string;
  current_level: number;
  level_title: string;
  level_theme: string;
  stat_str: number;
  stat_int: number;
  stat_cha: number;
  stat_wil: number;
  xp_str: number;
  xp_int: number;
  xp_cha: number;
  xp_wil: number;
  current_stamina: number;
  max_stamina: number;
  momentum: number;
  campaign_day: number;
  cycle_count: number;
  genesis_complete: boolean;
  created_at: string;
}

export interface WeaponView {
  sharpness: number;
  durability: number;
  fire_affinity: number;
  lightning_affinity: number;
  state: WeaponState;
  reforge_progress: number;
  forge_count_total: number;
}

export interface HabitView {
  id: number;
  name: string;
  description: string;
  sector: Sector;
  weight: WeightClass;
  verification: VerificationType;
  frequency_hours: number;
  window_start_hour: number | null;
  window_end_hour: number | null;
  consecutive_misses: number;
  rusted: boolean;
  due_today: boolean;
  executed_today: boolean;
  in_window_now: boolean;
  activation_cost: number;
  momentum_gain: number;
  cursed: boolean;
  last_executed_day: string | null;
  total_executions: number;
  streak_days: number;
  is_archived: boolean;
  sworn_boss_id: number | null;
  sworn_boss_name: string | null;
}

export interface MilestoneView {
  id: number;
  boss_id: number;
  order_index: number;
  description: string;
  damage_value: number;
  proof_type: VerificationType;
  completed: boolean;
  completed_at: string | null;
  proof_path: string | null;
  req_stat: string | null;
  req_value: number | null;
  stat_gate_open: boolean;
}

export interface BossView {
  id: number;
  level: number;
  sector: Sector;
  name: string;
  lore: string;
  total_hp: number;
  current_hp: number;
  armor: number;
  defeated: boolean;
  ascended: boolean;
  completion: number;
  milestones: MilestoneView[];
  projected_strike: number;
  siege_dealt: number;
  siege_cap: number;
}

export interface SectorProgress {
  sector: Sector;
  progress: number;
  required: number;
  ok: boolean;
  cursed: boolean;
}

export interface GateReport {
  global_progress: number;
  global_required: number;
  global_ok: boolean;
  sector_progress: SectorProgress[];
  sectors_ok: boolean;
  campaign_day: number;
  all_defeated: boolean;
  forceable: boolean;
  reckoning_ready: boolean;
  reckoning_min_sharpness: number;
  reckoning_cooldown_left: number;
  passed: boolean;
}

export interface DayRecord {
  day_key: string;
  executions: number;
  misses: number;
  momentum_close: number;
  stamina_close: number;
  sharpness_close: number;
  durability_close: number;
  perfect: boolean;
}

export interface SystemEvent {
  id: number;
  day_key: string;
  timestamp: string;
  kind: string;
  detail: string;
  seen: boolean;
}

export interface ExecutionLogView {
  id: number;
  habit_id: number;
  habit_name: string;
  sector: Sector;
  weight: WeightClass;
  timestamp: string;
  day_key: string;
  proof_path: string | null;
  note: string | null;
  stamina_cost: number;
  momentum_after: number;
  overdraft: boolean;
  off_window: boolean;
}

export interface EquipmentPiece {
  level: number;
  sector: Sector;
  name: string;
  unlocked: boolean;
}

export interface LevelInfo {
  level: number;
  title: string;
  theme: string;
  status: "CLEARED" | "CURRENT" | "SEALED";
}

export interface AudioLaw {
  pitch_multiplier: number;
  lowpass_cutoff: number;
  degradation: boolean;
}

export interface Projection {
  momentum_if_all_executed: number;
  momentum_if_all_missed: number;
  stamina_cost_remaining: number;
  sharpness_if_all_executed: number;
}

export interface RecommendedAction {
  habit_id: number;
  habit_name: string;
  score: number;
  reason: string;
}

export interface SystemSnapshot {
  profile: ProfileView;
  weapon: WeaponView;
  habits: HabitView[];
  bosses: BossView[];
  gate: GateReport;
  levels: LevelInfo[];
  equipment: EquipmentPiece[];
  biome: BiomeMode;
  paving_ratio: number;
  locomotion_speed: number;
  evidence_count: number;
  audio: AudioLaw;
  projection: Projection;
  recommended: RecommendedAction | null;
  recent_days: DayRecord[];
  recent_logs: ExecutionLogView[];
  unseen_events: SystemEvent[];
  today_key: string;
  now_hour: number;
  db_path: string;
  oracle_configured: boolean;
  oracle_model: string;
}

export interface ExecutionReport {
  habit_id: number;
  habit_name: string;
  verified: boolean;
  stamina_cost: number;
  stamina_after: number;
  overdraft: boolean;
  off_window: boolean;
  momentum_before: number;
  momentum_after: number;
  sharpness_before: number;
  sharpness_after: number;
  weight: WeightClass;
  sector: Sector;
  siege_damage: number;
  siege_boss_name: string | null;
  siege_boss_defeated: boolean;
}

export interface MilestoneReport {
  milestone_id: number;
  boss_id: number;
  boss_name: string;
  damage_dealt: number;
  boss_hp_after: number;
  boss_defeated: boolean;
  equipment_unlocked: string | null;
}

export interface ReckoningStrike {
  boss_id: number;
  boss_name: string;
  sector: Sector;
  strike_damage: number;
  hp_before: number;
  hp_after: number;
  defeated: boolean;
}

export interface ReckoningReport {
  strikes: ReckoningStrike[];
  weapon_state_after: WeaponState;
  blunted: boolean;
  gate: GateReport;
  level_advanced: boolean;
  new_level: number;
  new_level_title: string;
}

export interface ForceGateReport {
  ascended_bosses: string[];
  new_level: number;
  new_level_title: string;
}

export interface NewHabitPayload {
  name: string;
  description: string;
  sector: Sector;
  weight: WeightClass;
  verification: VerificationType;
  frequency_hours: number;
  window_start_hour: number | null;
  window_end_hour: number | null;
  sworn_boss_id: number | null;
}

export interface EditHabitPayload extends Omit<NewHabitPayload, "sector"> {
  id: number;
}

export interface GenesisMilestonePayload {
  sector: Sector;
  description: string;
  damage_value: number;
  proof_type: VerificationType;
}

export interface GenesisPayload {
  name: string;
  oath: string;
  environment_text: string;
  threats_text: string;
  habits: NewHabitPayload[];
  milestones: GenesisMilestonePayload[];
}

export interface OracleResponse {
  persona_emitter: string;
  cognitive_bias_detected: string;
  narrative_log: string;
  apply_low_pass_audio_filter: boolean;
  trigger_glitch_vfx: boolean;
  mode: "REMOTE" | "LOCAL" | "LOCAL_FALLBACK";
  timestamp: string;
  upstream_error: string | null;
}

export interface OracleLogView {
  id: number;
  timestamp: string;
  persona: string;
  mode: string;
  bias: string;
  narrative: string;
}

export type Persona = "ORACLE" | "MALACHAI" | "IGNATIUS" | "KALDOR";

export interface ProposedMilestone {
  description: string;
  damage_value: number;
  proof_type: string;
  rationale: string;
}

export const SECTOR_LABEL: Record<Sector, string> = {
  FINANCIAL: "Financial",
  INTELLECTUAL: "Intellectual",
  PHYSICAL: "Physical",
  RESPONSIBILITY: "Responsibility",
};

export const WEIGHT_LABEL: Record<WeightClass, string> = {
  TRIVIAL: "Trivial",
  STANDARD: "Standard",
  HEROIC: "Heroic",
  MYTHIC: "Mythic",
};

export const WEIGHT_MOMENTUM: Record<WeightClass, string> = {
  TRIVIAL: "+0.02",
  STANDARD: "+0.05",
  HEROIC: "+0.10",
  MYTHIC: "+0.20",
};
