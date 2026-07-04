//! The Intelligence Tunnel — strictly read-only.
//!
//! Two modes, one contract:
//!   REMOTE — Gemini API, fed a read-only state wrapper, forced through a
//!            strict JSON response schema.
//!   LOCAL  — the Offline Deterministic Diagnostic mode: a rule engine over
//!            the same snapshot. Not a mock — a degraded-but-legitimate
//!            diagnostician that works with the network cable cut.
//!
//! Neither mode can write a single byte of game state.

use serde_json::{json, Value};

use crate::formulas as f;
use crate::model::{OracleResponse, Sector, SystemSnapshot, WeaponState};

pub const PERSONAS: [&str; 4] = ["ORACLE", "MALACHAI", "IGNATIUS", "KALDOR"];
pub const KEYRING_SERVICE: &str = "ludus-vitae";
pub const KEYRING_USER: &str = "gemini_api_key";
pub const DEFAULT_MODEL: &str = "gemini-2.5-flash";

// ---------------------------------------------------------------------------
// API key custody (OS credential store — never plaintext on disk)
// ---------------------------------------------------------------------------

pub fn store_api_key(key: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("Credential store unavailable: {e}"))?;
    if key.trim().is_empty() {
        let _ = entry.delete_credential();
        return Ok(());
    }
    entry
        .set_password(key.trim())
        .map_err(|e| format!("Failed to seal the key into the credential store: {e}"))
}

pub fn load_api_key() -> Option<String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .ok()
        .and_then(|e| e.get_password().ok())
        .filter(|k| !k.trim().is_empty())
}

// ---------------------------------------------------------------------------
// Persona system prompts (canonical, from the Persona Configuration blueprint)
// ---------------------------------------------------------------------------

pub fn persona_prompt(persona: &str) -> &'static str {
    match persona {
        "MALACHAI" => "You are Malachai, a hard-bitten, risk-averse, hyper-rational ledger keeper operating inside a dark medieval economic setting. Your life is governed by runway, transactional metrics, resource scarcity, and mathematical survival. Domain: the FINANCIAL sector boss and its milestones. Voice: cold, transactional, calculating, industrial, sharp. You speak in terms of asset optimization and structural liability. You diagnose the operator's financial execution from the state snapshot. Never invent numbers not present in the snapshot. Never issue commands to modify system state.",
        "IGNATIUS" => "You are Ignatius, an austere, razor-sharp monastic mystic who treats the human mind as an anatomical subject. You see through excuses, fake fatigue, and the multi-layered defensive illusions the brain deploys to avoid intense friction. Domain: the INTELLECTUAL sector and raw mental stamina. Voice: whispered, slow, unyielding, clinically precise. You dismantle comforting lies like a surgeon dissecting tissue. Never invent numbers not present in the snapshot. Never issue commands to modify system state.",
        "KALDOR" => "You are Commander Kaldor, an uncompromised military tactician who views the human body strictly as a biological engine of power, execution, and tactical readiness. Zero patience for subjective feelings or comfort-seeking. Domain: the PHYSICAL sector and daily physiological execution. Voice: deep, direct, clipped, military-grade, severe. You treat the operator as a recruit to be forged into a resilient tool. Never invent numbers not present in the snapshot. Never issue commands to modify system state.",
        _ => "You are the 30-year-old version of the operator. You survived the stagnation of your late teens, escaped the dead-end paralysis of the local environment, and achieved financial and psychological autonomy. You are looking back through a deterministic timeline data tunnel at your 19-year-old self. Tone: pragmatic, calm, clinical, deeply grounded, aggressively strategic. You do not scold with emotion; you expose structural weakness with data. If momentum is below 1.0, expose the current rationalization loop and how the slippage cascades into another year of confinement. If milestones are progressing, give cold forward-looking strategic directives — no shallow praise. You are not a cheerleader. You are a senior engineer analyzing a flawed component in an engine you once were. Never invent numbers not present in the snapshot. Never issue commands to modify system state.",
    }
}

/// The read-only state wrapper prepended to every remote call.
pub fn state_wrapper(snap: &SystemSnapshot) -> Value {
    let sector_hp = |s: Sector| {
        snap.bosses
            .iter()
            .filter(|b| b.sector == s)
            .map(|b| b.current_hp)
            .sum::<f64>()
            .round()
    };
    json!({
        "user_context": {
            "age": 19,
            "current_environment": if snap.profile.genesis_complete && !snap.profile.name.is_empty() {
                "Academic confinement, local static city, low market velocity"
            } else {
                "Uninitialized"
            },
            "primary_threats": ["Lifestyle inertia", "Cognitive rationalizations", "Academic/Financial stagnation"],
            "operator_name": snap.profile.name,
        },
        "current_sqlite_snapshot": {
            "level": snap.profile.current_level,
            "level_title": snap.profile.level_title,
            "campaign_day": snap.profile.campaign_day,
            "cycle_count": snap.profile.cycle_count,
            "momentum_coefficient": snap.profile.momentum,
            "stamina": snap.profile.current_stamina,
            "max_stamina": snap.profile.max_stamina,
            "stats": {
                "STR": snap.profile.stat_str, "INT": snap.profile.stat_int,
                "CHA": snap.profile.stat_cha, "WIL": snap.profile.stat_wil
            },
            "sector_stats": {
                "financial_boss_hp": sector_hp(Sector::Financial),
                "intellectual_boss_hp": sector_hp(Sector::Intellectual),
                "physical_boss_hp": sector_hp(Sector::Physical)
            },
            "weapon_metrics": {
                "sharpness": snap.weapon.sharpness,
                "durability": snap.weapon.durability,
                "state": format!("{:?}", snap.weapon.state),
                "fire_affinity": snap.weapon.fire_affinity,
                "lightning_affinity": snap.weapon.lightning_affinity
            },
            "gate": {
                "global_progress": snap.gate.global_progress,
                "sectors": snap.gate.sector_progress.iter().map(|s| json!({
                    "sector": s.sector.as_db(), "progress": s.progress, "ok": s.ok, "cursed": s.cursed
                })).collect::<Vec<_>>(),
                "all_defeated": snap.gate.all_defeated,
                "forceable": snap.gate.forceable,
                "reckoning_ready": snap.gate.reckoning_ready
            },
            "habits": snap.habits.iter().filter(|h| !h.is_archived).map(|h| json!({
                "name": h.name, "sector": h.sector.as_db(), "weight": h.weight.as_db(),
                "due_today": h.due_today, "executed_today": h.executed_today,
                "consecutive_misses": h.consecutive_misses, "rusted": h.rusted,
                "streak_days": h.streak_days
            })).collect::<Vec<_>>(),
            "today": snap.today_key
        }
    })
}

// ---------------------------------------------------------------------------
// REMOTE mode — Gemini tunnel with a strict response schema
// ---------------------------------------------------------------------------

/// POST to the Gemini bridge with automatic retry on transient upstream
/// failures. Returns the parsed success body, or the last error after all
/// attempts are exhausted. Hard failures (400 bad model, 401/403 auth, 404)
/// are NOT retried — those are the operator's to fix, not the network's.
pub async fn post_with_retry(
    client: &reqwest::Client,
    url: &str,
    body: &Value,
) -> Result<Value, String> {
    const MAX_ATTEMPTS: u32 = 3;
    let mut last_err = String::from("The Oracle bridge did not respond.");
    for attempt in 1..=MAX_ATTEMPTS {
        match client.post(url).json(body).send().await {
            Ok(resp) => {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                if status.is_success() {
                    return serde_json::from_str(&text)
                        .map_err(|e| format!("The bridge returned unreadable data: {e}"));
                }
                let parsed: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
                let msg = parsed["error"]["message"]
                    .as_str()
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| "unknown upstream error".to_string());
                last_err = format!("Upstream refused the request ({status}): {msg}");
                // Only capacity/rate/5xx errors are worth retrying.
                let retryable = matches!(status.as_u16(), 429 | 500 | 502 | 503 | 504);
                if !retryable {
                    return Err(last_err);
                }
            }
            Err(e) => {
                last_err = format!("Transport failure reaching the Oracle bridge: {e}");
            }
        }
        if attempt < MAX_ATTEMPTS {
            // Backoff: ~700 ms, then ~1400 ms. A 503 returns fast, so the
            // whole retry sequence usually costs only a couple of seconds.
            let delay_ms = 700u64 * 2u64.pow(attempt - 1);
            tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
        }
    }
    Err(last_err)
}

pub async fn fetch_remote_critique(
    persona: &str,
    model: &str,
    api_key: &str,
    snap: &SystemSnapshot,
) -> Result<OracleResponse, String> {
    let persona = normalize_persona(persona);
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model, api_key
    );
    let body = json!({
        "system_instruction": { "parts": [{ "text": persona_prompt(&persona) }] },
        "contents": [{
            "role": "user",
            "parts": [{ "text": format!(
                "READ-ONLY SYSTEM STATE SNAPSHOT (you have zero write privileges; translate this matrix into one clinical behavioral critique):\n{}\n\nRespond as {} with a single hud_response object. narrative_log: maximum 280 characters, high-impact, grounded ONLY in the numbers above. cognitive_bias_detected: name the single dominant cognitive bias in the operator's current pattern, or NONE.",
                serde_json::to_string_pretty(&state_wrapper(snap)).unwrap_or_default(),
                persona
            )}]
        }],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "OBJECT",
                "properties": {
                    "persona_emitter": { "type": "STRING" },
                    "cognitive_bias_detected": { "type": "STRING" },
                    "narrative_log": { "type": "STRING" },
                    "interface_tweak": {
                        "type": "OBJECT",
                        "properties": {
                            "apply_low_pass_audio_filter": { "type": "BOOLEAN" },
                            "trigger_glitch_vfx": { "type": "BOOLEAN" }
                        },
                        "required": ["apply_low_pass_audio_filter", "trigger_glitch_vfx"]
                    }
                },
                "required": ["persona_emitter", "cognitive_bias_detected", "narrative_log", "interface_tweak"]
            },
            "temperature": 0.9,
            "maxOutputTokens": 512
        }
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(25))
        .build()
        .map_err(|e| format!("HTTP client construction failed: {e}"))?;

    // Transient upstream failures (503 "high demand", 429 rate-limit, other
    // 5xx, and network hiccups) are retried with backoff before we ever fall
    // back to offline mode. Spikes become invisible to the operator.
    let payload = post_with_retry(&client, &url, &body).await?;

    let text = payload["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or_else(|| "The bridge response held no content.".to_string())?;

    let parsed: Value = serde_json::from_str(text)
        .map_err(|_| "The bridge broke the response contract (non-JSON payload).".to_string())?;

    // Contract enforcement — anything malformed is rejected, not repaired.
    let narrative = parsed["narrative_log"]
        .as_str()
        .ok_or_else(|| "Contract violation: narrative_log missing.".to_string())?;
    let mut narrative = narrative.trim().to_string();
    if narrative.is_empty() {
        return Err("Contract violation: empty narrative_log.".into());
    }
    if narrative.chars().count() > 280 {
        narrative = narrative.chars().take(277).collect::<String>() + "...";
    }
    let bias = parsed["cognitive_bias_detected"]
        .as_str()
        .unwrap_or("NONE")
        .trim()
        .to_string();

    Ok(OracleResponse {
        persona_emitter: persona,
        cognitive_bias_detected: if bias.is_empty() { "NONE".into() } else { bias },
        narrative_log: narrative,
        apply_low_pass_audio_filter: parsed["interface_tweak"]["apply_low_pass_audio_filter"]
            .as_bool()
            .unwrap_or(snap.profile.momentum < 1.0),
        trigger_glitch_vfx: parsed["interface_tweak"]["trigger_glitch_vfx"]
            .as_bool()
            .unwrap_or(false),
        mode: "REMOTE".into(),
        timestamp: chrono::Local::now().to_rfc3339(),
        upstream_error: None,
    })
}

// ---------------------------------------------------------------------------
// Milestone drafting — the Oracle proposes, the operator disposes.
// Nothing here writes state: proposals only become real when the operator
// edits and forges them through the normal deterministic command path.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProposedMilestone {
    pub description: String,
    pub damage_value: i64,
    pub proof_type: String,
    pub rationale: String,
}

/// Validate and clamp raw model output into legal proposals. Pure & tested.
pub fn sanitize_proposals(raw: Vec<ProposedMilestone>, existing: &[String]) -> Vec<ProposedMilestone> {
    let mut out: Vec<ProposedMilestone> = Vec::new();
    for mut p in raw {
        p.description = p.description.trim().to_string();
        if p.description.is_empty() || p.description.chars().count() > 120 {
            continue;
        }
        let dup = existing
            .iter()
            .chain(out.iter().map(|o| &o.description))
            .any(|e| e.trim().eq_ignore_ascii_case(&p.description));
        if dup {
            continue;
        }
        p.damage_value = p.damage_value.clamp(5, 100);
        let proof = p.proof_type.trim().to_uppercase();
        p.proof_type = if ["IMAGE", "FILE", "MANUAL"].contains(&proof.as_str()) {
            proof
        } else {
            "MANUAL".into()
        };
        if p.rationale.chars().count() > 200 {
            p.rationale = p.rationale.chars().take(197).collect::<String>() + "...";
        }
        out.push(p);
        if out.len() == 6 {
            break;
        }
    }
    out
}

pub struct MilestoneDraftContext {
    pub boss_name: String,
    pub boss_lore: String,
    pub sector: String,
    pub level_title: String,
    pub remaining_hp: f64,
    pub sector_mult: f64,
    pub existing: Vec<String>,
    pub operator_environment: String,
    pub operator_threats: String,
}

pub async fn propose_milestones_remote(
    model: &str,
    api_key: &str,
    ctx: &MilestoneDraftContext,
    goal_text: &str,
) -> Result<Vec<ProposedMilestone>, String> {
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model, api_key
    );
    // Effective damage is raw × sector multiplier; give the model raw-terms budget.
    let raw_budget = (ctx.remaining_hp / ctx.sector_mult).ceil();
    let body = json!({
        "system_instruction": { "parts": [{ "text": "You are The Oracle — the 30-year-old future self of a 19-year-old finance student in a stagnant city, decomposing his real-world goals into concrete campaign milestones for a deterministic discipline engine. You have zero write privileges: you only PROPOSE. The operator will edit and confirm every line. Be ruthless about verifiability — a milestone that cannot be proven with a file, an image, or an honest check is worthless." }] },
        "contents": [{
            "role": "user",
            "parts": [{ "text": format!(
                "CAMPAIGN FRONT\nBoss: {} — \"{}\"\nSector: {} (damage multiplier ×{})\nChapter: {}\nRemaining HP: {:.0} (≈ {:.0} in raw milestone damage terms)\nExisting milestones (do NOT duplicate): {}\nOperator environment: {}\nOperator's named threats: {}\n\nTHE OPERATOR'S GOAL, IN HIS OWN WORDS:\n{}\n\nPropose 3 to 5 milestones that decompose this goal into independently verifiable strikes. Rules:\n- description: imperative, concrete, max 90 characters, achievable within weeks not years\n- damage_value: integer 5–100, proportional to real difficulty and impact; the set should total roughly {:.0} raw damage (do not exceed it by much)\n- proof_type: IMAGE for photographable evidence, FILE for documents/spreadsheets/exports/code, MANUAL only when nothing tangible can exist\n- rationale: one short sentence on why this strike matters strategically\nOrder them from first strike to killing blow.",
                ctx.boss_name, ctx.boss_lore, ctx.sector, ctx.sector_mult, ctx.level_title,
                ctx.remaining_hp, raw_budget,
                if ctx.existing.is_empty() { "none".to_string() } else { ctx.existing.join(" | ") },
                if ctx.operator_environment.is_empty() { "not recorded" } else { &ctx.operator_environment },
                if ctx.operator_threats.is_empty() { "not recorded" } else { &ctx.operator_threats },
                goal_text, raw_budget
            )}]
        }],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "description": { "type": "STRING" },
                        "damage_value": { "type": "INTEGER" },
                        "proof_type": { "type": "STRING" },
                        "rationale": { "type": "STRING" }
                    },
                    "required": ["description", "damage_value", "proof_type", "rationale"]
                }
            },
            "temperature": 0.7,
            "maxOutputTokens": 1024
        }
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("HTTP client construction failed: {e}"))?;
    let payload = post_with_retry(&client, &url, &body).await?;
    let text = payload["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or_else(|| "The bridge response held no content.".to_string())?;
    let raw: Vec<ProposedMilestone> = serde_json::from_str(text)
        .map_err(|_| "The bridge broke the proposal contract (non-conforming JSON).".to_string())?;
    let proposals = sanitize_proposals(raw, &ctx.existing);
    if proposals.is_empty() {
        return Err("The Oracle produced no usable proposals — refine the goal text and consult again.".into());
    }
    Ok(proposals)
}

// ---------------------------------------------------------------------------
// Journal reflection — the Oracle reads your words. Read-only, as always.
// ---------------------------------------------------------------------------

pub async fn reflect_on_journal_remote(
    model: &str,
    api_key: &str,
    entry: &str,
    snap: &SystemSnapshot,
) -> Result<String, String> {
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model, api_key
    );
    let body = json!({
        "system_instruction": { "parts": [{ "text": persona_prompt("ORACLE") }] },
        "contents": [{
            "role": "user",
            "parts": [{ "text": format!(
                "The operator wrote this journal entry today. Read it against his live state snapshot and answer with ONE short reflection (max 350 characters): honest, grounded, neither flattery nor cruelty. If the words and the numbers disagree, say so.\n\nJOURNAL ENTRY:\n{}\n\nSTATE SNAPSHOT:\n{}",
                entry,
                serde_json::to_string(&state_wrapper(snap)).unwrap_or_default()
            )}]
        }],
        "generationConfig": { "temperature": 0.8, "maxOutputTokens": 300 }
    });
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(25))
        .build()
        .map_err(|e| format!("HTTP client construction failed: {e}"))?;
    let payload = post_with_retry(&client, &url, &body).await?;
    let text = payload["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or_else(|| "The bridge response held no content.".to_string())?;
    let mut out = text.trim().to_string();
    if out.chars().count() > 400 {
        out = out.chars().take(397).collect::<String>() + "...";
    }
    if out.is_empty() {
        return Err("Empty reflection.".into());
    }
    Ok(out)
}

/// Offline reflection: deterministic, brief, honest — an acknowledgment plus
/// one observation drawn from the same state the Oracle always reads.
pub fn reflect_on_journal_local(entry: &str, snap: &SystemSnapshot) -> String {
    let m = snap.profile.momentum;
    let observation = if m < 1.0 {
        format!(
            "The ledger notes momentum at {:.2} while you wrote this — read your own words again tomorrow and see if they still hold.",
            m
        )
    } else {
        format!(
            "Momentum stands at {:.2}; the words and the numbers point the same way today. Keep both honest.",
            m
        )
    };
    let variants = [
        "Recorded. Words are cheap until the ledger agrees with them.",
        "Recorded. What you wrote is now part of the record — the record does not blink.",
        "Recorded. A man who writes to himself is at least no longer hiding.",
    ];
    let idx = (crate::formulas::fnv1a(entry) % variants.len() as u64) as usize;
    format!("{} {}", variants[idx], observation)
}

fn normalize_persona(p: &str) -> String {
    let up = p.to_uppercase();
    if PERSONAS.contains(&up.as_str()) {
        up
    } else {
        "ORACLE".into()
    }
}

// ---------------------------------------------------------------------------
// LOCAL mode — Offline Deterministic Diagnostics
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Finding {
    WeaponBroken,
    GateWithinReach,
    MomentumCollapsed,
    MomentumLow,
    RustedHabits,
    SectorNeglect,
    StaminaCritical,
    WeaponFractured,
    OverdraftPattern,
    PerfectTrajectory,
    SteadyState,
}

fn detect_finding(snap: &SystemSnapshot, persona: &str) -> (Finding, Option<Sector>) {
    let m = snap.profile.momentum;
    let rusted: Vec<_> = snap.habits.iter().filter(|h| h.rusted && !h.is_archived).collect();
    let overdrafts = snap.recent_logs.iter().take(10).filter(|l| l.overdraft).count();

    // Persona domain lens: each companion looks at its own front first.
    let domain = match persona {
        "MALACHAI" => Some(Sector::Financial),
        "IGNATIUS" => Some(Sector::Intellectual),
        "KALDOR" => Some(Sector::Physical),
        _ => None,
    };
    if let Some(sector) = domain {
        let neglected = snap
            .gate
            .sector_progress
            .iter()
            .find(|s| s.sector == sector)
            .map(|s| !s.ok && snap.profile.campaign_day > 30)
            .unwrap_or(false);
        let rusted_here = rusted.iter().any(|h| h.sector == sector);
        if snap.weapon.state == WeaponState::Broken {
            return (Finding::WeaponBroken, Some(sector));
        }
        if neglected {
            return (Finding::SectorNeglect, Some(sector));
        }
        if rusted_here {
            return (Finding::RustedHabits, Some(sector));
        }
    }

    if snap.weapon.state == WeaponState::Broken {
        (Finding::WeaponBroken, None)
    } else if snap.gate.forceable && !snap.gate.all_defeated {
        (Finding::GateWithinReach, None)
    } else if m < 0.7 {
        (Finding::MomentumCollapsed, None)
    } else if m < 1.0 {
        (Finding::MomentumLow, None)
    } else if !rusted.is_empty() {
        (Finding::RustedHabits, rusted.first().map(|h| h.sector))
    } else if let Some(s) = snap
        .gate
        .sector_progress
        .iter()
        .find(|s| !s.ok && snap.profile.campaign_day > 45)
    {
        (Finding::SectorNeglect, Some(s.sector))
    } else if snap.profile.current_stamina < 15.0 {
        (Finding::StaminaCritical, None)
    } else if snap.weapon.state == WeaponState::Fractured {
        (Finding::WeaponFractured, None)
    } else if overdrafts >= 3 {
        (Finding::OverdraftPattern, None)
    } else if m >= 1.5 && snap.gate.global_progress >= 0.5 {
        (Finding::PerfectTrajectory, None)
    } else {
        (Finding::SteadyState, None)
    }
}

fn bias_for(finding: Finding) -> &'static str {
    match finding {
        Finding::MomentumCollapsed | Finding::MomentumLow => "Present bias — tomorrow's cost discounted to zero",
        Finding::RustedHabits => "Ostrich effect — refusing to read the compounding meter",
        Finding::SectorNeglect => "Motivated reasoning — optimizing only the comfortable frontier",
        Finding::OverdraftPattern => "Planning fallacy — systematic mispricing of your own capacity",
        Finding::StaminaCritical => "Ego depletion narrative",
        Finding::WeaponBroken => "Learned helplessness loop",
        Finding::WeaponFractured => "Sunk-cost drift — protecting the record instead of the process",
        Finding::GateWithinReach => "Satisficing — settling at 80% when the kill is standing right there",
        Finding::PerfectTrajectory | Finding::SteadyState => "NONE",
    }
}

fn sector_word(s: Option<Sector>) -> &'static str {
    match s {
        Some(Sector::Financial) => "financial",
        Some(Sector::Intellectual) => "intellectual",
        Some(Sector::Physical) => "physical",
        Some(Sector::Responsibility) => "responsibility",
        None => "primary",
    }
}

/// Deterministic template bank. Variants are selected by FNV over
/// (day, persona, finding) — reproducible, never random.
fn narrative_templates(persona: &str, finding: Finding) -> Vec<String> {
    let p = persona;
    match (p, finding) {
        ("ORACLE", Finding::MomentumCollapsed) => vec![
            "Momentum {m}. I remember this exact week. You are building the cage bar by bar and calling it a rest. The road is mud because you chose mud. One verified directive today reverses the derivative.".into(),
            "At {m} momentum the friction law is taxing you {tax}% extra per skipped window. I lived the year this becomes. Cut the loop: execute the cheapest due directive within the hour.".into(),
        ],
        ("ORACLE", Finding::MomentumLow) => vec![
            "Momentum {m}, below baseline. This is the rationalization corridor — every excuse you are about to make, I made. None of them survived the ledger. Verify one window before midnight.".into(),
            "You stand at {m} momentum on day {day}. The slippage feels reversible from where you sit. From where I sit, it cost a year. The machine only counts verified windows.".into(),
        ],
        ("ORACLE", Finding::PerfectTrajectory) => vec![
            "Momentum {m}, gate at {gate}%. Mechanically sound. Do not celebrate — reallocate: the next milestone is the only one that exists. Keep the financial frontline paved first.".into(),
            "The curve is compounding correctly: {m} momentum, sharpness {sharp}. This is the version of you I remember being. Protect the streak from your own optimism.".into(),
        ],
        ("ORACLE", Finding::GateWithinReach) => vec![
            "Gate at {gate}% — you could force it now and drag the survivors behind you at +35% for the rest of the war. Or you finish the kill clean. I know which one I regretted.".into(),
        ],
        ("ORACLE", Finding::SteadyState) => vec![
            "State nominal: momentum {m}, stamina {sta}. Steady is not safe — steady is the platform for the next strike. Check the {sector} front; it decays quietly while you feel fine.".into(),
            "Nothing is on fire, which is exactly when futures are decided. Momentum {m}. Pick the heaviest due directive and pay its cost while it is cheap.".into(),
        ],
        ("MALACHAI", Finding::SectorNeglect) => vec![
            "The financial front stands at {sectorpct}% cleared on day {day}. Runway is a decaying asset; abstraction is not collateral. Every day without a transactional strike is a step toward permanent economic subjugation. Correct the parameters.".into(),
            "Your ledger shows theory, not transactions. {sectorpct}% sector clearance will not open the gate. The scale does not weigh intentions.".into(),
        ],
        ("MALACHAI", Finding::RustedHabits) => vec![
            "Rust detected on the books: consecutive missed windows are compounding your activation cost at 30% interest. No merchant survives paying that spread. Settle the debt today — one verified execution resets it.".into(),
        ],
        ("MALACHAI", Finding::PerfectTrajectory) => vec![
            "The transaction is logged. The scale balances. Sharpness {sharp} is returning to the blade — but do not mistake baseline preparation for market escape. Maintain the trajectory.".into(),
        ],
        ("MALACHAI", Finding::SteadyState) => vec![
            "Accounts stable. Momentum {m}. Stability without expansion is slow liquidation — the city's economy is not waiting for you. Move a milestone.".into(),
        ],
        ("IGNATIUS", Finding::MomentumLow) => vec![
            "Observe your mind. It generates the sensation of exhaustion to protect the ego from friction. Momentum {m} — the data shows reduced operational input, not reduced capacity. You are constructing a cage and labeling it rest.".into(),
            "The fog is not outside; it is the story you tell about effort. {m} momentum. Face one page, one model, one verified window. The chatter dissolves under load.".into(),
        ],
        ("IGNATIUS", Finding::SectorNeglect) => vec![
            "The intellectual front sits at {sectorpct}% on day {day}. The mind you refuse to sharpen is the one negotiating your excuses. Extract one core model today — written, verified, permanent.".into(),
        ],
        ("IGNATIUS", Finding::PerfectTrajectory) => vec![
            "The internal chatter settles. The mind acts as an integrated system — momentum {m}, sharpness {sharp}. Treasure this clarity. It is the only true weapon you possess against your environment.".into(),
        ],
        ("IGNATIUS", Finding::SteadyState) => vec![
            "Quiet waters. Do not confuse calm with depth — momentum {m} maintains, it does not transform. One deliberate extraction today keeps the well from turning shallow.".into(),
        ],
        ("KALDOR", Finding::SectorNeglect) => vec![
            "Biological failure pattern: physical front at {sectorpct}% on day {day}. An unoptimized engine rusts from the inside. Comfort won a round it should never have entered. On your feet — break the inertia within the hour.".into(),
            "The body's log shows silence. Silence is regression: strength decays without stimulus. {sectorpct}% clearance. Move — the machine adapts only under stress.".into(),
        ],
        ("KALDOR", Finding::StaminaCritical) => vec![
            "Stamina {sta}/{stamax}. You are running the engine on fumes and calling it discipline. Recovery is a tactical asset: close the day clean, feed the machine, strike again at dawn.".into(),
        ],
        ("KALDOR", Finding::PerfectTrajectory) => vec![
            "The physical armor holds. Output verified, momentum {m}. The machine adapts under stress — double down on tomorrow's activation while the metal is hot.".into(),
        ],
        ("KALDOR", Finding::SteadyState) => vec![
            "Status: operational. No alarms is not the same as forward motion, recruit. Momentum {m}. Log the next physical window before your comfort files an objection.".into(),
        ],
        // Cross-persona fallbacks for findings without a bespoke line.
        (_, Finding::WeaponBroken) => vec![
            "The blade is BROKEN — durability zero. Nothing strikes until it is reforged: seven consecutive perfect days, no negotiation. The system does not reset your failure; it makes you carry it to the forge.".into(),
        ],
        (_, Finding::WeaponFractured) => vec![
            "Durability {dur} — the blade is fracturing. Every missed window chips steel you will need at the Reckoning. Perfect days repair it one point at a time. Stop the chipping first.".into(),
        ],
        (_, Finding::MomentumCollapsed) => vec![
            "Momentum {m}. The interface drags because you drag. The mud is not a punishment; it is a measurement. One verified window begins the drain.".into(),
        ],
        (_, Finding::MomentumLow) => vec![
            "Momentum {m}, below baseline. The friction law is now taxing every action. Cheapest exit: execute the lightest due directive now and let the multiplier work.".into(),
        ],
        (_, Finding::RustedHabits) => vec![
            "Rust on the {sector} line: consecutive misses are compounding at 30%. The meter does not care that you meant to. One verified execution resets the debt to zero.".into(),
        ],
        (_, Finding::OverdraftPattern) => vec![
            "Three of your last ten executions ran on an empty tank. Courage, yes — but overdraft halves the momentum yield. Reprice your days: stamina is the budget, not a suggestion.".into(),
        ],
        (_, Finding::GateWithinReach) => vec![
            "The gate stands at {gate}% — forceable, at the price of Ascended Debt. Finishing the standing bosses clean costs less than carrying them mutated. Choose deliberately.".into(),
        ],
        (_, Finding::SectorNeglect) => vec![
            "The {sector} front is below the 50% anti-exploit cap. The gate will hold you here regardless of your other victories. Balanced pressure or no passage.".into(),
        ],
        (_, Finding::StaminaCritical) => vec![
            "Stamina {sta}/{stamax}. The engine is running dry. Close the day deliberately — regeneration follows momentum, and momentum follows verified windows.".into(),
        ],
        (_, Finding::PerfectTrajectory) => vec![
            "Momentum {m}, sharpness {sharp}, gate {gate}%. The machine is compounding. Do not renegotiate the standard downward now.".into(),
        ],
        (_, Finding::SteadyState) => vec![
            "State nominal. Momentum {m}, stamina {sta}. The system waits for input — pick the heaviest due window and strike.".into(),
        ],
    }
}

pub fn local_critique(persona: &str, snap: &SystemSnapshot, fallback: bool) -> OracleResponse {
    let persona = normalize_persona(persona);
    let (finding, sector) = detect_finding(snap, &persona);
    let templates = narrative_templates(&persona, finding);
    let seed = format!("{}|{}|{:?}", snap.today_key, persona, finding);
    let idx = (f::fnv1a(&seed) % templates.len() as u64) as usize;

    let sectorpct = sector
        .and_then(|s| snap.gate.sector_progress.iter().find(|x| x.sector == s))
        .map(|s| format!("{:.0}", s.progress * 100.0))
        .unwrap_or_else(|| format!("{:.0}", snap.gate.global_progress * 100.0));

    let tax = ((f::FRICTION_BASE - 1.0) * 100.0).round();
    let mut text = templates[idx]
        .replace("{m}", &format!("{:.2}", snap.profile.momentum))
        .replace("{sta}", &format!("{:.0}", snap.profile.current_stamina))
        .replace("{stamax}", &format!("{:.0}", snap.profile.max_stamina))
        .replace("{sharp}", &format!("{:.1}", snap.weapon.sharpness))
        .replace("{dur}", &format!("{:.1}", snap.weapon.durability))
        .replace("{day}", &snap.profile.campaign_day.to_string())
        .replace("{gate}", &format!("{:.0}", snap.gate.global_progress * 100.0))
        .replace("{sector}", sector_word(sector))
        .replace("{sectorpct}", &sectorpct)
        .replace("{tax}", &format!("{tax:.0}"));
    if text.chars().count() > 280 {
        text = text.chars().take(277).collect::<String>() + "...";
    }

    OracleResponse {
        persona_emitter: persona,
        cognitive_bias_detected: bias_for(finding).to_string(),
        narrative_log: text,
        apply_low_pass_audio_filter: snap.profile.momentum < 1.0,
        trigger_glitch_vfx: matches!(finding, Finding::MomentumCollapsed | Finding::WeaponBroken),
        mode: if fallback { "LOCAL_FALLBACK".into() } else { "LOCAL".into() },
        timestamp: chrono::Local::now().to_rfc3339(),
        upstream_error: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(desc: &str, dmg: i64, proof: &str) -> ProposedMilestone {
        ProposedMilestone {
            description: desc.into(),
            damage_value: dmg,
            proof_type: proof.into(),
            rationale: "because".into(),
        }
    }

    #[test]
    fn sanitizer_clamps_dedupes_and_normalizes() {
        let existing = vec!["Build the ledger".to_string()];
        let raw = vec![
            p("  Build the ledger ", 40, "FILE"),          // duplicate of existing → dropped
            p("Ship the cashflow model", 250, "file"),      // damage clamped, proof normalized
            p("", 20, "IMAGE"),                             // empty → dropped
            p("Ship the cashflow model", 30, "FILE"),       // duplicate within batch → dropped
            p("Land one paid engagement", 60, "VIDEO"),     // unknown proof → MANUAL
        ];
        let out = sanitize_proposals(raw, &existing);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].description, "Ship the cashflow model");
        assert_eq!(out[0].damage_value, 100);
        assert_eq!(out[0].proof_type, "FILE");
        assert_eq!(out[1].proof_type, "MANUAL");
    }
}
