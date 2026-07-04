/**
 * The only doorway between the shell and the Rust engine. Every call is a
 * typed Tauri command; the frontend holds no business logic and no state
 * authority.
 */
import { invoke } from "@tauri-apps/api/core";
import type {
  EditHabitPayload,
  ExecutionLogView,
  ExecutionReport,
  ForceGateReport,
  GenesisPayload,
  JournalEntryView,
  NewQuestPayload,
  QuestReport,
  Sector,
  MilestoneReport,
  NewHabitPayload,
  OracleLogView,
  OracleResponse,
  Persona,
  ProposedMilestone,
  ReckoningReport,
  SystemEvent,
  SystemSnapshot,
  VerificationType,
} from "../types/contracts";

export const bridge = {
  getSystemSnapshot: () => invoke<SystemSnapshot>("get_system_snapshot"),

  executeHabit: (habitId: number, proofPath?: string | null, note?: string | null) =>
    invoke<ExecutionReport>("execute_habit", { habitId, proofPath: proofPath ?? null, note: note ?? null }),

  completeMilestone: (milestoneId: number, proofPath?: string | null) =>
    invoke<MilestoneReport>("complete_milestone", { milestoneId, proofPath: proofPath ?? null }),

  callReckoning: () => invoke<ReckoningReport>("call_reckoning"),

  forceGate: () => invoke<ForceGateReport>("force_gate"),

  editBossMilestone: (
    id: number, description: string, damage: number, proof: VerificationType,
    reqStat?: string | null, reqValue?: number | null,
  ) =>
    invoke<void>("edit_boss_milestone", {
      id, description, damage, proof,
      reqStat: reqStat ?? null, reqValue: reqValue ?? null,
    }),

  deleteBossMilestone: (id: number) => invoke<void>("delete_boss_milestone", { id }),

  resetWorld: (confirmation: string) => invoke<void>("reset_world", { confirmation }),

  completeGenesis: (payload: GenesisPayload) => invoke<void>("complete_genesis", { payload }),

  createDirective: (payload: NewHabitPayload) => invoke<number>("create_directive", { payload }),

  editDirective: (payload: EditHabitPayload) => invoke<void>("edit_directive", { payload }),

  archiveDirective: (id: number, archived: boolean) =>
    invoke<void>("archive_directive", { id, archived }),

  addBossMilestone: (
    bossId: number, description: string, damage: number, proof: VerificationType,
    reqStat?: string | null, reqValue?: number | null,
  ) =>
    invoke<number>("add_boss_milestone", {
      bossId, description, damage, proof,
      reqStat: reqStat ?? null, reqValue: reqValue ?? null,
    }),

  getAmbientDiagnostic: (persona: Persona) =>
    invoke<OracleResponse>("get_ambient_diagnostic", { persona }),

  proposeMilestones: (bossId: number, goalText: string) =>
    invoke<ProposedMilestone[]>("propose_milestones", { bossId, goalText }),

  markEventsSeen: () => invoke<void>("mark_events_seen"),

  createQuest: (payload: NewQuestPayload) => invoke<number>("create_quest", { payload }),

  completeQuest: (questId: number, proofPath?: string | null) =>
    invoke<QuestReport>("complete_quest", { questId, proofPath: proofPath ?? null }),

  abandonQuest: (questId: number) => invoke<void>("abandon_quest", { questId }),

  declareRest: (dayOffset: 0 | 1) => invoke<void>("declare_rest", { dayOffset }),

  addJournalEntry: (content: string, sector?: Sector | null) =>
    invoke<number>("add_journal_entry", { content, sector: sector ?? null }),

  getJournal: (limit: number, offset: number) =>
    invoke<JournalEntryView[]>("get_journal", { limit, offset }),

  reflectOnJournal: (entryId: number) => invoke<string>("reflect_on_journal", { entryId }),

  getChronicle: (limit: number, offset: number) =>
    invoke<ExecutionLogView[]>("get_chronicle", { limit, offset }),

  getAllEvents: (limit: number) => invoke<SystemEvent[]>("get_all_events", { limit }),

  fetchPersonaCritique: (persona: Persona, preferRemote: boolean) =>
    invoke<OracleResponse>("fetch_persona_critique", { persona, preferRemote }),

  getOracleLogs: (limit: number) => invoke<OracleLogView[]>("get_oracle_logs", { limit }),

  setOracleKey: (key: string) => invoke<void>("set_oracle_key", { key }),

  getOracleStatus: () => invoke<Record<string, string>>("get_oracle_status"),

  testOracleConnection: () => invoke<string>("test_oracle_connection"),

  getSettings: () => invoke<Record<string, string>>("get_settings"),

  setAppSetting: (key: string, value: string) =>
    invoke<void>("set_app_setting", { key, value }),

  readProofThumbnail: (path: string) => invoke<string>("read_proof_thumbnail", { path }),

  exportBackup: () => invoke<string>("export_backup"),
};
