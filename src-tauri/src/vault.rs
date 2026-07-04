//! The Evidence Vault: proof paths are local evidence, not decorative
//! strings. Every proof is validated against the real filesystem before the
//! engine accepts it.

use crate::model::VerificationType;
use base64::Engine as _;
use std::path::{Path, PathBuf};

const IMAGE_EXTS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "bmp"];
const MAX_THUMBNAIL_BYTES: u64 = 3 * 1024 * 1024;

/// Validate a proof path for a verification mode. Returns the canonical path
/// string to store, or None for manual checks without attachments.
pub fn validate_proof(
    vtype: VerificationType,
    proof_path: Option<&str>,
) -> Result<Option<String>, String> {
    match vtype {
        VerificationType::Manual => {
            // The Honest Manual Check: zero-friction, integrity-backed.
            // An attachment is welcome but never required.
            match proof_path {
                Some(p) if !p.trim().is_empty() => validate_existing(p).map(Some),
                _ => Ok(None),
            }
        }
        VerificationType::Image => {
            let p = proof_path
                .filter(|p| !p.trim().is_empty())
                .ok_or_else(|| "This verification demands image evidence (a cobblestone).".to_string())?;
            let canonical = validate_existing(p)?;
            let ext = Path::new(&canonical)
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase())
                .unwrap_or_default();
            if !IMAGE_EXTS.contains(&ext.as_str()) {
                return Err(format!(
                    "'{}' is not an image. Accepted: {}.",
                    ext,
                    IMAGE_EXTS.join(", ")
                ));
            }
            Ok(Some(canonical))
        }
        VerificationType::File => {
            let p = proof_path
                .filter(|p| !p.trim().is_empty())
                .ok_or_else(|| "This verification demands a file payload (an archive scroll).".to_string())?;
            validate_existing(p).map(Some)
        }
    }
}

fn validate_existing(p: &str) -> Result<String, String> {
    let path = Path::new(p.trim());
    if !path.is_absolute() {
        return Err("Proof paths must be absolute. Relative shadows are rejected.".into());
    }
    let meta = std::fs::metadata(path)
        .map_err(|_| format!("Evidence not found on local disk: {}", path.display()))?;
    if !meta.is_file() {
        return Err("Evidence must be a file, not a directory.".into());
    }
    if meta.len() == 0 {
        return Err("Evidence file is empty (0 bytes). The ledger rejects hollow proof.".into());
    }
    Ok(path.to_string_lossy().to_string())
}

/// Read an image proof and return it as a data URL for the evidence gallery.
/// Size-capped; never used for anything but display.
pub fn read_proof_thumbnail(path: &str) -> Result<String, String> {
    let p = Path::new(path);
    let meta = std::fs::metadata(p).map_err(|_| "Evidence no longer exists on disk.".to_string())?;
    if meta.len() > MAX_THUMBNAIL_BYTES {
        return Err("Evidence exceeds the 3 MB display cap; open it from disk instead.".into());
    }
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    if !IMAGE_EXTS.contains(&ext.as_str()) {
        return Err("Only image evidence can be displayed inline.".into());
    }
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/bmp",
    };
    let bytes = std::fs::read(p).map_err(|e| format!("Failed reading evidence: {e}"))?;
    Ok(format!(
        "data:{};base64,{}",
        mime,
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

/// Ensure the local vault directory tree exists; returns the vault root.
pub fn ensure_vault(app_data: &Path) -> std::io::Result<PathBuf> {
    let root = app_data.join("vault");
    for sub in ["cobblestones", "inventory", "audio_tactical", "backups"] {
        std::fs::create_dir_all(root.join(sub))?;
    }
    Ok(root)
}

/// Export a timestamped backup of the database into the vault. Returns the
/// backup file path.
pub fn export_backup(db_path: &Path, vault_root: &Path) -> Result<String, String> {
    let stamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let dest = vault_root
        .join("backups")
        .join(format!("ludus_vitae_{stamp}.db"));
    // SQLite in WAL mode: a plain copy of the main db plus wal/shm flush via
    // the backup API would be ideal; copying after a checkpoint is adequate
    // for a single-process local app.
    std::fs::copy(db_path, &dest).map_err(|e| format!("Backup failed: {e}"))?;
    Ok(dest.to_string_lossy().to_string())
}
