#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use lofty::file::{AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::{Accessor, ItemKey};
use serde::{Deserialize, Serialize};
use std::path::Path;
use uuid::Uuid;

/// Metadata pulled from a single imported audio file.
/// The frontend takes this, merges it into library.json, and stores it.
#[derive(Serialize, Deserialize, Clone)]
struct TrackMeta {
    id: String,
    path: String,
    title: String,
    artist: String,
    album: String,
    duration_secs: u64,
    // Cover art as a data: URL (base64), or None if the file has no embedded art.
    cover_data_url: Option<String>,
}

/// Reads ID3/Vorbis/MP4 tags + duration from a list of local file paths.
/// Supports mp3, flac, wav, ogg, m4a, and anything else `lofty` understands.
#[tauri::command]
fn import_tracks(paths: Vec<String>) -> Vec<TrackMeta> {
    paths
        .iter()
        .filter_map(|p| read_track_meta(p).ok())
        .collect()
}

fn read_track_meta(path_str: &str) -> Result<TrackMeta, String> {
    let path = Path::new(path_str);
    let tagged_file = Probe::open(path)
        .map_err(|e| e.to_string())?
        .read()
        .map_err(|e| e.to_string())?;

    let properties = tagged_file.properties();
    let duration_secs = properties.duration().as_secs();

    let tag = tagged_file.primary_tag().or_else(|| tagged_file.first_tag());

    let file_stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown Title".to_string());

    let (title, artist, album, cover_data_url) = if let Some(tag) = tag {
        let title = tag
            .title()
            .map(|s| s.to_string())
            .unwrap_or_else(|| file_stem.clone());
        let artist = tag
            .artist()
            .map(|s| s.to_string())
            .unwrap_or_else(|| "Unknown Artist".to_string());
        let album = tag
            .get_string(&ItemKey::AlbumTitle)
            .map(|s| s.to_string())
            .unwrap_or_else(|| "Unknown Album".to_string());

        let cover = tag.pictures().first().map(|pic| {
            let mime = pic
                .mime_type()
                .map(|m| m.to_string())
                .unwrap_or_else(|| "image/jpeg".to_string());
            let b64 = base64_encode(pic.data());
            format!("data:{};base64,{}", mime, b64)
        });

        (title, artist, album, cover)
    } else {
        (
            file_stem,
            "Unknown Artist".to_string(),
            "Unknown Album".to_string(),
            None,
        )
    };

    Ok(TrackMeta {
        id: Uuid::new_v4().to_string(),
        path: path_str.to_string(),
        title,
        artist,
        album,
        duration_secs,
        cover_data_url,
    })
}

// Minimal base64 encoder so we don't need an extra crate just for cover art.
fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0];
        let b1 = *chunk.get(1).unwrap_or(&0);
        let b2 = *chunk.get(2).unwrap_or(&0);

        out.push(CHARS[(b0 >> 2) as usize] as char);
        out.push(CHARS[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);
        out.push(if chunk.len() > 1 {
            CHARS[(((b1 & 0x0f) << 2) | (b2 >> 6)) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            CHARS[(b2 & 0x3f) as usize] as char
        } else {
            '='
        });
    }
    out
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![import_tracks])
        .run(tauri::generate_context!())
        .expect("error while running notify");
}
