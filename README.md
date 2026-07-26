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

## Building it yourself (what you already have working)

You need Rust, Node.js, and the MSVC Build Tools installed once — if
`npm run dev` has worked for you before, you already have all of this.

In the project folder:

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

Either one is a complete, standalone Windows installer for `notify`. This is
the file you actually release/share — not the whole project folder.

## Sending it to someone else

Send them **just the `.exe` (or `.msi`) file** — nothing else. They do not
need Rust, Node.js, Visual Studio, or any of the tools you installed. Those
were only needed to *build* the app; running it is just like any other
Windows program.



## How it's put together

- **`src-tauri/`** — Rust backend. The only real logic here is
  `import_tracks`, which reads ID3/Vorbis/MP4 tags (title, artist, album,
  duration, embedded cover art) from whatever files you import, using the
  `lofty` crate. Everything else (library data, playlists, likes, theme)
  is just JSON files Tauri lets the frontend read/write directly in your
  app-data folder — no server, no accounts, no network calls at all.
- **`src/`** — the UI. Plain HTML/CSS/JS (no framework). `style.css` is
  built on CSS custom properties (`--bg-primary`, `--accent`, etc.), and
  `main.js` has a `THEME_FIELDS` list that generates the whole "Customize
  Theme" page's dropdowns/color pickers from those variables.
- **Theme files** are portable JSON — export one from the app, send it to a
  friend, they hit Import Theme, done. (Note: a custom background image
  path is stored as an absolute path on your machine, so it won't travel
  with an exported theme file — the colors/fonts/etc. will, though.)

## Ideas for extending it

- Drag-and-drop import (drop files/folders straight onto the window)
- Folder-watch auto-import instead of one-by-one file picking
- Drag-to-reorder playlists and playlist tracks
- Lyrics panel (local `.lrc` file support)
- Global media-key support (play/pause/next from the keyboard)
- A code-signing certificate, if you end up distributing this widely, to
  remove the SmartScreen warning entirely
