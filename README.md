# Hey dont forgot to join the discord to get update!
You will also get to see futer updates and share or download .jason themes.
https://discord.gg/WUEfEpCpPq


# notify

A local-library music player for Windows. Import your own MP3/FLAC/WAV/OGG/M4A
files, build playlists, like tracks, and fully re-skin the UI — every color,
font, radius, spacing value, and even the background image is customizable,
and you can export/import your look as a `.json` theme file.

Nothing is uploaded anywhere. Your music stays as files on your own disk;
the app just reads their metadata (title/artist/album/cover art/duration)
and plays them locally.

## Features

- Import local audio files, auto-reads title/artist/album/cover art/duration
- Playlists, Liked Songs, search
- Full playback: play/pause, next/prev, seek, volume + mute, shuffle, repeat
- A 6-band equalizer with Flat/Bass/Vocal/Treble presets
- A live, in-app theme editor (its own page, not a popup) — colors, fonts,
  corner roundness, spacing, a gradient tool with adjustable fade, and a
  custom background image
- 3 starter theme templates (Violet Night, Sunset Ember, Mono Frost)
- Theme export/import as portable `.json` files

## Building it yourself

You need Rust, Node.js, and the MSVC Build Tools installed once

In the project folder:

right click to open powershell

```powershell
npm install
npx tauri icon
npm run dev        # to test it
npm run build       # to produce the real installer
```

`npm run build` produces these files:

```
src-tauri\target\release\bundle\msi\notify_0.1.0_x64_en-US.msi
src-tauri\target\release\bundle\nsis\notify_0.1.0_x64-setup.exe
```
