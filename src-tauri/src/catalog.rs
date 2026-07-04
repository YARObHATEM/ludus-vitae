//! The canonical campaign catalog: 10 unskippable lifestyle chapters, three
//! sector bosses per chapter, and the equipment manifested by each kill.
//! Hardcoded per the Campaign Lore Engine rule — the AI may narrate over
//! these skeletons, it may never invent them.

use crate::model::Sector;

pub struct LevelDef {
    pub level: i64,
    pub title: &'static str,
    pub theme: &'static str,
}

pub struct BossDef {
    pub level: i64,
    pub sector: Sector,
    pub name: &'static str,
    pub lore: &'static str,
}

pub struct EquipmentDef {
    pub level: i64,
    pub sector: Sector,
    pub name: &'static str,
}

pub const LEVELS: [LevelDef; 10] = [
    LevelDef { level: 1, title: "Leaving the Cave", theme: "You are blind to your own execution capacity. Prove the machine works." },
    LevelDef { level: 2, title: "The Forge", theme: "Raw motion is not enough. Here you temper method into metal." },
    LevelDef { level: 3, title: "The Crossroads", theme: "Options multiply. Most are decoys. Choose weight over comfort." },
    LevelDef { level: 4, title: "The Rampart", theme: "Everything gained can rot. Hold the wall while building it higher." },
    LevelDef { level: 5, title: "The Citadel", theme: "Structure becomes power. Systems must now run without your mood." },
    LevelDef { level: 6, title: "The Long Roads", theme: "No novelty left. Only mileage. This chapter kills tourists." },
    LevelDef { level: 7, title: "The High Pass", theme: "Thin air. High stakes. Precision replaces enthusiasm." },
    LevelDef { level: 8, title: "The Night Watch", theme: "You guard what you built against your oldest self." },
    LevelDef { level: 9, title: "The Gates of Dawn", theme: "The exit exists. The final tolls are paid in consistency." },
    LevelDef { level: 10, title: "The Summit", theme: "No enemy remains but the mirror. Sovereignty or descent." },
];

pub const BOSSES: [BossDef; 30] = [
    // Level 1 — canonical trio from the Level 1 Campaign Map
    BossDef { level: 1, sector: Sector::Financial, name: "Malachai's Ledger", lore: "Every entry is a debt. The ledger of a dead city binds you to zero leverage until you write your own lines into it." },
    BossDef { level: 1, sector: Sector::Intellectual, name: "The Cognitive Fog", lore: "A haze of half-read pages and abandoned models. It feeds on unfinished understanding." },
    BossDef { level: 1, sector: Sector::Physical, name: "The Inertia Overlord", lore: "It does not attack. It simply makes sitting still feel like mercy. Hesitation feeds it." },
    // Level 2 — The Forge
    BossDef { level: 2, sector: Sector::Financial, name: "The Chained Smith", lore: "A craftsman who forges only for others, never for his own escape. Break his chains or wear them." },
    BossDef { level: 2, sector: Sector::Intellectual, name: "The Scattered Mind", lore: "A thousand sparks, no blade. It scatters your attention across anvils that never see a hammer." },
    BossDef { level: 2, sector: Sector::Physical, name: "The Soft Iron", lore: "Metal that never met the fire. It bends under the first real load and calls it fate." },
    // Level 3 — The Crossroads
    BossDef { level: 3, sector: Sector::Financial, name: "The False Merchant", lore: "He sells you plans in exchange for your runway. Every purchase feels like progress." },
    BossDef { level: 3, sector: Sector::Intellectual, name: "The Doubt Weaver", lore: "It spins ten futures at once so you will walk toward none of them." },
    BossDef { level: 3, sector: Sector::Physical, name: "The Comfort Siren", lore: "Her song is warm rooms and soft food. Sailors of discipline sink here." },
    // Level 4 — The Rampart
    BossDef { level: 4, sector: Sector::Financial, name: "The Leaking Vault", lore: "Gold enters, gold vanishes. It thrives where no ledger line is ever reconciled." },
    BossDef { level: 4, sector: Sector::Intellectual, name: "The Shallow Well", lore: "Knowledge one inch deep across a mile of surface. It dries the moment you draw from it." },
    BossDef { level: 4, sector: Sector::Physical, name: "The Broken Shield", lore: "Old injuries and older excuses, welded into armor that protects only your weakness." },
    // Level 5 — The Citadel
    BossDef { level: 5, sector: Sector::Financial, name: "The Gilded Cage", lore: "Comfortable income, closed horizon. The most beautiful prison ever balanced on a spreadsheet." },
    BossDef { level: 5, sector: Sector::Intellectual, name: "The Echo Chamber", lore: "It repeats your own conclusions back to you in a wiser voice until you stop testing them." },
    BossDef { level: 5, sector: Sector::Physical, name: "The Marble Sloth", lore: "A monument to past fitness. It stands perfectly still and calls itself maintenance." },
    // Level 6 — The Long Roads
    BossDef { level: 6, sector: Sector::Financial, name: "The Toll Collector", lore: "Small recurring fees on everything you failed to automate. He never sleeps; his meters never stop." },
    BossDef { level: 6, sector: Sector::Intellectual, name: "The Fog of Miles", lore: "The forgetting that eats month-old learning you never revisited or applied." },
    BossDef { level: 6, sector: Sector::Physical, name: "The Heavy Boots", lore: "Accumulated fatigue disguised as identity: 'I am just not an energetic person.'" },
    // Level 7 — The High Pass
    BossDef { level: 7, sector: Sector::Financial, name: "The Avalanche Broker", lore: "He offers leverage on a slope of snow. One careless month buries three disciplined years." },
    BossDef { level: 7, sector: Sector::Intellectual, name: "The Thin Air", lore: "At this altitude few can advise you. It suffocates those who still need applause to think." },
    BossDef { level: 7, sector: Sector::Physical, name: "The Frozen Sinew", lore: "Stiffness that arrives with success and desk hours. It sets like ice when you stop moving." },
    // Level 8 — The Night Watch
    BossDef { level: 8, sector: Sector::Financial, name: "The Silent Creditor", lore: "The lifestyle debt that compounds quietly while your income grows louder." },
    BossDef { level: 8, sector: Sector::Intellectual, name: "The Sleepless Whisper", lore: "The 2 a.m. voice that renegotiates tomorrow's standards downward." },
    BossDef { level: 8, sector: Sector::Physical, name: "The Midnight Hunger", lore: "It only visits after discipline sleeps. It signs treaties with your tired self." },
    // Level 9 — The Gates of Dawn
    BossDef { level: 9, sector: Sector::Financial, name: "The Last Gatekeeper", lore: "The final institution between you and autonomy. It respects only documented leverage." },
    BossDef { level: 9, sector: Sector::Intellectual, name: "The Final Doubt", lore: "Not fear of failure — fear of the size of what you have actually built." },
    BossDef { level: 9, sector: Sector::Physical, name: "The Old Skin", lore: "The body's memory of who you used to be, asking to be worn one more time." },
    // Level 10 — The Summit
    BossDef { level: 10, sector: Sector::Financial, name: "The Empty Throne", lore: "Sovereignty with no one left to blame. Sit down, or build a taller mountain." },
    BossDef { level: 10, sector: Sector::Intellectual, name: "The Mirror King", lore: "Every bias you ever defeated, wearing your face, ruling a kingdom of your assumptions." },
    BossDef { level: 10, sector: Sector::Physical, name: "The Mortal Frame", lore: "Time itself, undefeatable — but negotiable, decade by decade, through iron consistency." },
];

pub const EQUIPMENT: [EquipmentDef; 30] = [
    EquipmentDef { level: 1, sector: Sector::Financial, name: "Reinforced Steel Greaves" },
    EquipmentDef { level: 1, sector: Sector::Intellectual, name: "Strategic Iron Hood" },
    EquipmentDef { level: 1, sector: Sector::Physical, name: "Tempered Pauldrons" },
    EquipmentDef { level: 2, sector: Sector::Financial, name: "Smith's Ledger Gauntlets" },
    EquipmentDef { level: 2, sector: Sector::Intellectual, name: "Focused Visor" },
    EquipmentDef { level: 2, sector: Sector::Physical, name: "Quenched Chestplate" },
    EquipmentDef { level: 3, sector: Sector::Financial, name: "Merchant's True Scale" },
    EquipmentDef { level: 3, sector: Sector::Intellectual, name: "Cartographer's Circlet" },
    EquipmentDef { level: 3, sector: Sector::Physical, name: "Wayfarer Greaves" },
    EquipmentDef { level: 4, sector: Sector::Financial, name: "Sealed Vault Buckler" },
    EquipmentDef { level: 4, sector: Sector::Intellectual, name: "Deepwell Pendant" },
    EquipmentDef { level: 4, sector: Sector::Physical, name: "Rampart Tower Shield" },
    EquipmentDef { level: 5, sector: Sector::Financial, name: "Keys of the Open Gate" },
    EquipmentDef { level: 5, sector: Sector::Intellectual, name: "Chamberbreaker Signet" },
    EquipmentDef { level: 5, sector: Sector::Physical, name: "Living Marble Bracers" },
    EquipmentDef { level: 6, sector: Sector::Financial, name: "Tollbreaker Writ" },
    EquipmentDef { level: 6, sector: Sector::Intellectual, name: "Lantern of Recall" },
    EquipmentDef { level: 6, sector: Sector::Physical, name: "Milestrider Boots" },
    EquipmentDef { level: 7, sector: Sector::Financial, name: "Ice-Anchor Chain" },
    EquipmentDef { level: 7, sector: Sector::Intellectual, name: "Highland Clarity Torc" },
    EquipmentDef { level: 7, sector: Sector::Physical, name: "Thawed Sinew Wraps" },
    EquipmentDef { level: 8, sector: Sector::Financial, name: "Creditor's Broken Seal" },
    EquipmentDef { level: 8, sector: Sector::Intellectual, name: "Dawnkeeper's Vigil Lamp" },
    EquipmentDef { level: 8, sector: Sector::Physical, name: "Nightfast Belt" },
    EquipmentDef { level: 9, sector: Sector::Financial, name: "Gatekeeper's Countersign" },
    EquipmentDef { level: 9, sector: Sector::Intellectual, name: "Crown of Quiet Certainty" },
    EquipmentDef { level: 9, sector: Sector::Physical, name: "New Skin Mantle" },
    EquipmentDef { level: 10, sector: Sector::Financial, name: "The Sovereign's Own Coin" },
    EquipmentDef { level: 10, sector: Sector::Intellectual, name: "The Unclouded Mirror" },
    EquipmentDef { level: 10, sector: Sector::Physical, name: "Decade Harness" },
];

pub fn level_def(level: i64) -> &'static LevelDef {
    let idx = (level.clamp(1, 10) - 1) as usize;
    &LEVELS[idx]
}

pub fn bosses_for_level(level: i64) -> Vec<&'static BossDef> {
    BOSSES.iter().filter(|b| b.level == level).collect()
}

pub fn equipment_for(level: i64, sector: Sector) -> Option<&'static EquipmentDef> {
    EQUIPMENT.iter().find(|e| e.level == level && e.sector == sector)
}

/// Canonical Level 1 milestone seeds from the Campaign Map (M_01_*), offered
/// during the Genesis Ritual as editable defaults.
pub struct MilestoneSeed {
    pub sector: Sector,
    pub description: &'static str,
    pub damage: i64,
    pub proof: &'static str,
}

pub const LEVEL1_MILESTONE_SEEDS: [MilestoneSeed; 5] = [
    MilestoneSeed { sector: Sector::Financial, description: "Optimize technical resume for modern automation paradigms", damage: 20, proof: "FILE" },
    MilestoneSeed { sector: Sector::Financial, description: "Execute 20 verified external transactional applications", damage: 30, proof: "IMAGE" },
    MilestoneSeed { sector: Sector::Financial, description: "Confirm first verified external retainer or ledger entry", damage: 50, proof: "FILE" },
    MilestoneSeed { sector: Sector::Intellectual, description: "Complete deep analytical core book extraction mapping", damage: 25, proof: "FILE" },
    MilestoneSeed { sector: Sector::Physical, description: "Complete 30 validated high-intensity workout units", damage: 50, proof: "IMAGE" },
];
