const { dialog, fs, path, tauri } = window.__TAURI__;

// ---------- Icons ----------
const PLAY_ICON = "&#9654;";
const PAUSE_ICON = "&#10074;&#10074;";

// ---------- Paths / persistence ----------

let appDataDirPath = null;
let libraryPath = null;
let themePath = null;

async function initPaths() {
  appDataDirPath = await path.appDataDir();
  if (!(await fs.exists(appDataDirPath))) {
    await fs.createDir(appDataDirPath, { recursive: true });
  }
  libraryPath = await path.join(appDataDirPath, "library.json");
  themePath = await path.join(appDataDirPath, "theme.json");
}

const emptyLibrary = () => ({ tracks: [], playlists: [], liked: [] });

async function loadLibrary() {
  try {
    const text = await fs.readTextFile(libraryPath);
    return JSON.parse(text);
  } catch {
    return emptyLibrary();
  }
}

async function saveLibrary() {
  await fs.writeTextFile(libraryPath, JSON.stringify(library, null, 2));
}

async function loadTheme() {
  try {
    const text = await fs.readTextFile(themePath);
    return JSON.parse(text);
  } catch {
    const res = await fetch("default-theme.json");
    return await res.json();
  }
}

async function saveThemeToDisk(themeObj) {
  await fs.writeTextFile(themePath, JSON.stringify(themeObj, null, 2));
}

// ---------- State ----------

let library = emptyLibrary();
let theme = {};
let currentView = { type: "library" }; // { type: 'library' | 'liked' | 'playlist' | 'theme', id? }
let currentQueue = [];
let currentIndex = -1;
let shuffleOn = false;
let repeatOn = false;
let searchQuery = "";

// ---------- Theme engine ----------

function applyTheme(themeObj) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(themeObj)) {
    if (key.startsWith("--")) root.style.setProperty(key, value);
  }
  applyBackgroundImage();
}

// Custom background image lives behind #main (which has no opaque background
// of its own), layered with a darkening overlay so text stays readable.
function applyBackgroundImage() {
  if (theme.bgImagePath) {
    const url = tauri.convertFileSrc(theme.bgImagePath);
    const overlay = (theme.bgImageOverlay ?? 40) / 100;
    document.body.style.backgroundImage = `linear-gradient(rgba(0,0,0,${overlay}), rgba(0,0,0,${overlay})), url("${url}")`;
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundPosition = "center";
    document.body.style.backgroundRepeat = "no-repeat";
    document.body.style.backgroundAttachment = "fixed";
  } else {
    document.body.style.backgroundImage = "";
    document.body.style.backgroundSize = "";
    document.body.style.backgroundPosition = "";
    document.body.style.backgroundRepeat = "";
    document.body.style.backgroundAttachment = "";
  }
}

// Shared between Display Font and Body Font dropdowns, per user request,
// so both offer the exact same curated set of fonts.
const FONT_OPTIONS = [
  { label: "Space Grotesk", value: "'Space Grotesk', sans-serif" },
  { label: "Poppins", value: "'Poppins', sans-serif" },
  { label: "Playfair Display", value: "'Playfair Display', serif" },
  { label: "Sora", value: "'Sora', sans-serif" },
  { label: "Unbounded", value: "'Unbounded', sans-serif" },
];

const THEME_FIELDS = [
  { key: "--bg-primary", label: "Background", type: "color" },
  { key: "--bg-secondary", label: "Sidebar Background", type: "color" },
  { key: "--bg-elevated", label: "Elevated / Player Bar", type: "color" },
  { key: "--bg-hover", label: "Hover Highlight", type: "color" },
  { key: "--text-primary", label: "Primary Text", type: "color" },
  { key: "--text-secondary", label: "Secondary Text", type: "color" },
  { key: "--accent", label: "Accent", type: "color" },
  { key: "--border", label: "Border", type: "color" },
  {
    key: "--radius-sm", label: "Corner Radius", type: "select",
    options: [
      { label: "Sharp (0px)", value: "0px" },
      { label: "Subtle (4px)", value: "4px" },
      { label: "Default (6px)", value: "6px" },
      { label: "Round (10px)", value: "10px" },
      { label: "Very Round (14px)", value: "14px" },
    ],
  },
  {
    key: "--album-art-radius", label: "Album Art Shape", type: "select",
    options: [
      { label: "Square", value: "0px" },
      { label: "Slightly Rounded", value: "4px" },
      { label: "Default", value: "8px" },
      { label: "Very Rounded", value: "12px" },
      { label: "Circle", value: "999px" },
    ],
  },
  {
    key: "--sidebar-width", label: "Sidebar Width", type: "select",
    options: [
      { label: "Narrow", value: "200px" },
      { label: "Default", value: "240px" },
      { label: "Wide", value: "280px" },
      { label: "Extra Wide", value: "320px" },
    ],
  },
  {
    key: "--font-display", label: "Display Font", type: "select",
    options: FONT_OPTIONS,
  },
  {
    key: "--font-body", label: "Body Font", type: "select",
    options: FONT_OPTIONS,
  },
  {
    key: "--density", label: "Row Density", type: "select",
    options: [
      { label: "Compact", value: "0.7" },
      { label: "Cozy (Default)", value: "1" },
      { label: "Spacious", value: "1.3" },
      { label: "Very Spacious", value: "1.6" },
    ],
  },
];

// Targets a gradient can be applied to - anything styled with the CSS
// `background` shorthand (not `background-color`) accepts a gradient fine.
// This covers every button in the app too, since buttons pull their
// background from --accent or --bg-hover.
const GRADIENT_TARGETS = [
  { key: "--bg-primary", label: "Main Background" },
  { key: "--bg-secondary", label: "Sidebar Background" },
  { key: "--bg-elevated", label: "Elevated / Player Bar" },
  { key: "--bg-hover", label: "Hover Highlight (outline buttons)" },
  { key: "--accent", label: "Accent (Play + primary buttons)" },
];

const THEME_PRESETS = [
  {
    name: "Violet Night",
    swatch: "#7c5cff",
    values: {
      themeName: "Violet Night",
      "--bg-primary": "#121218", "--bg-secondary": "#191a21", "--bg-elevated": "#22232c",
      "--bg-hover": "#2b2c37", "--text-primary": "#f2f1ee", "--text-secondary": "#9a98a8",
      "--accent": "#7c5cff", "--accent-solid": "#7c5cff", "--accent-text": "#ffffff",
      "--border": "#2c2d38", "--radius-sm": "6px", "--radius-md": "10px", "--radius-lg": "16px",
      "--sidebar-width": "240px", "--player-height": "88px",
      "--font-display": "'Space Grotesk', sans-serif", "--font-body": "'Inter', sans-serif",
      "--font-mono": "'JetBrains Mono', monospace", "--album-art-radius": "8px", "--density": "1",
    },
  },
  {
    name: "Sunset Ember",
    swatch: "#ff7a45",
    values: {
      themeName: "Sunset Ember",
      "--bg-primary": "#1a1210", "--bg-secondary": "#20160f", "--bg-elevated": "#2b1b13",
      "--bg-hover": "#3a2419", "--text-primary": "#f7ece2", "--text-secondary": "#b99a86",
      "--accent": "#ff7a45", "--accent-solid": "#ff7a45", "--accent-text": "#1a1210",
      "--border": "#3a2419", "--radius-sm": "6px", "--radius-md": "10px", "--radius-lg": "16px",
      "--sidebar-width": "240px", "--player-height": "88px",
      "--font-display": "'Space Grotesk', sans-serif", "--font-body": "'Inter', sans-serif",
      "--font-mono": "'JetBrains Mono', monospace", "--album-art-radius": "8px", "--density": "1",
    },
  },
  {
    name: "Mono Frost",
    swatch: "#2f6fed",
    values: {
      themeName: "Mono Frost",
      "--bg-primary": "#f5f6f8", "--bg-secondary": "#ffffff", "--bg-elevated": "#eef0f4",
      "--bg-hover": "#e3e6ec", "--text-primary": "#161821", "--text-secondary": "#6b7280",
      "--accent": "#2f6fed", "--accent-solid": "#2f6fed", "--accent-text": "#ffffff",
      "--border": "#dde1e8", "--radius-sm": "6px", "--radius-md": "10px", "--radius-lg": "16px",
      "--sidebar-width": "240px", "--player-height": "88px",
      "--font-display": "'Space Grotesk', sans-serif", "--font-body": "'Inter', sans-serif",
      "--font-mono": "'JetBrains Mono', monospace", "--album-art-radius": "8px", "--density": "1",
    },
  },
];

async function applyPreset(preset) {
  const { bgImagePath, bgImageOverlay } = theme;
  theme = { ...preset.values, bgImagePath, bgImageOverlay };
  applyTheme(theme);
  renderThemeControls();
  await saveThemeToDisk(theme);
}

function renderThemeControls() {
  const container = document.getElementById("sidebar-theme-block");
  container.innerHTML = "";

  // --- Templates ---
  const templLabel = document.createElement("div");
  templLabel.className = "theme-section-label";
  templLabel.textContent = "Templates";
  container.appendChild(templLabel);

  const presetRow = document.createElement("div");
  presetRow.className = "theme-preset-row";
  for (const preset of THEME_PRESETS) {
    const btn = document.createElement("button");
    btn.className = "theme-preset-btn";
    btn.innerHTML = `<span class="theme-preset-swatch" style="background:${preset.swatch}"></span><span>${preset.name}</span>`;
    btn.addEventListener("click", () => applyPreset(preset));
    presetRow.appendChild(btn);
  }
  container.appendChild(presetRow);

  // --- Colors & style ---
  const colorsLabel = document.createElement("div");
  colorsLabel.className = "theme-section-label";
  colorsLabel.textContent = "Colors & Style";
  container.appendChild(colorsLabel);

  for (const field of THEME_FIELDS) {
    const wrap = document.createElement("div");
    wrap.className = "theme-control";
    const label = document.createElement("label");
    label.textContent = field.label;
    wrap.appendChild(label);

    let input;
    if (field.type === "color") {
      input = document.createElement("input");
      input.type = "color";
      input.value = /^#[0-9a-fA-F]{6}$/.test(theme[field.key]) ? theme[field.key] : "#000000";
      input.addEventListener("input", () => {
        theme[field.key] = input.value;
        // --accent is also used as text/border color in a few places, where
        // a gradient isn't valid CSS. Keep a solid fallback in sync whenever
        // the color picker (not the gradient tool) sets it.
        if (field.key === "--accent") theme["--accent-solid"] = input.value;
        applyTheme(theme);
      });
      input.addEventListener("change", () => saveThemeToDisk(theme));
    } else if (field.type === "select") {
      input = document.createElement("select");
      for (const opt of field.options) {
        const optionEl = document.createElement("option");
        optionEl.value = opt.value;
        optionEl.textContent = opt.label;
        if (theme[field.key] === opt.value) optionEl.selected = true;
        input.appendChild(optionEl);
      }
      input.addEventListener("change", async () => {
        theme[field.key] = input.value;
        applyTheme(theme);
        await saveThemeToDisk(theme);
      });
    }

    wrap.appendChild(input);
    container.appendChild(wrap);
  }

  // --- Gradient tool ---
  const gradLabel = document.createElement("div");
  gradLabel.className = "theme-section-label";
  gradLabel.textContent = "Gradient Tool";
  container.appendChild(gradLabel);

  const gradBox = document.createElement("div");
  gradBox.className = "gradient-tool";
  gradBox.innerHTML = `
    <div class="gradient-tool-row">
      <input type="color" id="grad-color1" value="#7c5cff" title="Start color" />
      <input type="color" id="grad-color2" value="#ff7a45" title="End color" />
    </div>
    <select id="grad-target">
      ${GRADIENT_TARGETS.map((t) => `<option value="${t.key}">${t.label}</option>`).join("")}
    </select>
    <label class="gradient-tool-label">Angle</label>
    <input type="range" id="grad-angle" min="0" max="360" value="135" />
    <label class="gradient-tool-label">Fade Position</label>
    <input type="range" id="grad-position" min="0" max="100" value="50" />
    <label class="gradient-tool-label">Fade Amount (0 = hard edge)</label>
    <input type="range" id="grad-softness" min="0" max="100" value="30" />
    <div class="gradient-preview" id="gradient-preview-box"></div>
    <button id="grad-apply" class="solid-btn">Apply Gradient</button>
  `;
  container.appendChild(gradBox);

  const c1 = gradBox.querySelector("#grad-color1");
  const c2 = gradBox.querySelector("#grad-color2");
  const angle = gradBox.querySelector("#grad-angle");
  const position = gradBox.querySelector("#grad-position");
  const softness = gradBox.querySelector("#grad-softness");
  const previewBox = gradBox.querySelector("#gradient-preview-box");
  const targetSelect = gradBox.querySelector("#grad-target");

  function buildGradientString() {
    const pos = Number(position.value);
    const half = Number(softness.value) / 2;
    const stop1 = Math.max(0, pos - half);
    const stop2 = Math.min(100, pos + half);
    return `linear-gradient(${angle.value}deg, ${c1.value} 0%, ${c1.value} ${stop1}%, ${c2.value} ${stop2}%, ${c2.value} 100%)`;
  }

  function refreshGradientPreview() {
    previewBox.style.background = buildGradientString();
  }
  [c1, c2, angle, position, softness].forEach((el) => el.addEventListener("input", refreshGradientPreview));
  refreshGradientPreview();

  gradBox.querySelector("#grad-apply").addEventListener("click", async () => {
    const targetKey = targetSelect.value;
    theme[targetKey] = buildGradientString();
    applyTheme(theme);
    await saveThemeToDisk(theme);
  });

  // --- Background image ---
  const bgImageLabel = document.createElement("div");
  bgImageLabel.className = "theme-section-label";
  bgImageLabel.textContent = "Background Image";
  container.appendChild(bgImageLabel);

  const bgImageBox = document.createElement("div");
  bgImageBox.className = "gradient-tool";
  const currentFileName = theme.bgImagePath ? theme.bgImagePath.split(/[\\/]/).pop() : null;
  bgImageBox.innerHTML = `
    ${currentFileName ? `<div class="bgimage-current">Current: ${escapeHtml(currentFileName)}</div>` : `<div class="bgimage-current">No image set</div>`}
    <button id="bgimage-choose" class="outline">Choose Image</button>
    ${currentFileName ? `<button id="bgimage-remove" class="outline">Remove Image</button>` : ""}
    <label class="gradient-tool-label">Darken Overlay</label>
    <input type="range" id="bgimage-overlay" min="0" max="90" value="${theme.bgImageOverlay ?? 40}" />
  `;
  container.appendChild(bgImageBox);

  bgImageBox.querySelector("#bgimage-choose").addEventListener("click", async () => {
    const filePath = await dialog.open({
      multiple: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }],
    });
    if (!filePath) return;
    theme.bgImagePath = filePath;
    applyBackgroundImage();
    await saveThemeToDisk(theme);
    renderThemeControls();
  });

  const removeBtn = bgImageBox.querySelector("#bgimage-remove");
  if (removeBtn) {
    removeBtn.addEventListener("click", async () => {
      delete theme.bgImagePath;
      applyBackgroundImage();
      await saveThemeToDisk(theme);
      renderThemeControls();
    });
  }

  const overlaySlider = bgImageBox.querySelector("#bgimage-overlay");
  overlaySlider.addEventListener("input", () => {
    theme.bgImageOverlay = Number(overlaySlider.value);
    applyBackgroundImage();
  });
  overlaySlider.addEventListener("change", () => saveThemeToDisk(theme));

  // --- Footer actions ---
  const footer = document.createElement("div");
  footer.className = "theme-footer-actions";

  const resetBtn = document.createElement("button");
  resetBtn.className = "outline";
  resetBtn.textContent = "Reset to Default";
  resetBtn.addEventListener("click", () => applyPreset(THEME_PRESETS[0]));

  const importBtn = document.createElement("button");
  importBtn.className = "outline";
  importBtn.textContent = "Import Theme";
  importBtn.addEventListener("click", async () => {
    const filePath = await dialog.open({
      multiple: false,
      filters: [{ name: "notify Theme", extensions: ["json"] }],
    });
    if (!filePath) return;
    const text = await fs.readTextFile(filePath);
    try {
      const imported = JSON.parse(text);
      theme = { ...theme, ...imported };
      applyTheme(theme);
      renderThemeControls();
      await saveThemeToDisk(theme);
    } catch {
      alert("Could not read that theme file.");
    }
  });

  const exportBtn = document.createElement("button");
  exportBtn.className = "solid-btn";
  exportBtn.textContent = "Export Theme";
  exportBtn.addEventListener("click", async () => {
    const filePath = await dialog.save({
      defaultPath: `${theme.themeName || "my-theme"}.json`,
      filters: [{ name: "notify Theme", extensions: ["json"] }],
    });
    if (!filePath) return;
    await fs.writeTextFile(filePath, JSON.stringify(theme, null, 2));
  });

  footer.appendChild(resetBtn);
  footer.appendChild(importBtn);
  footer.appendChild(exportBtn);
  container.appendChild(footer);
}

// ---------- Theme live preview (shown in main area, replacing the track list) ----------

const PREVIEW_TRACKS = [
  { id: "p1", title: "Neon Skyline", artist: "Wave Runner", album: "Night Drive", duration_secs: 214 },
  { id: "p2", title: "Glass Horizon", artist: "Aurora Fields", album: "Glass Horizon", duration_secs: 187 },
  { id: "p3", title: "Static Bloom", artist: "Kilo Youth", album: "Static Bloom EP", duration_secs: 245 },
];
let previewPlayingIndex = 0;
let previewLiked = {};

function renderThemePreviewTracks() {
  document.getElementById("empty-state").hidden = true;
  const listEl = document.getElementById("track-list");
  listEl.innerHTML = "";

  PREVIEW_TRACKS.forEach((track, idx) => {
    const row = document.createElement("div");
    row.className = "track-row";
    if (idx === previewPlayingIndex) row.classList.add("playing");
    const liked = !!previewLiked[track.id];

    row.innerHTML = `
      <span class="col-index">${idx + 1}</span>
      <span class="col-play">
        <button class="play-row-btn" title="Play">${idx === previewPlayingIndex ? PAUSE_ICON : PLAY_ICON}</button>
      </span>
      <span class="col-title">
        <img src="" style="visibility:hidden" />
        <span class="title-text">
          <span class="t">${track.title}</span>
          <span class="a">${track.artist}</span>
        </span>
      </span>
      <span class="col-album">${track.album}</span>
      <span class="col-duration">${formatDuration(track.duration_secs)}</span>
      <span class="col-like">
        <button class="like-btn ${liked ? "liked" : ""}" title="Like">${liked ? "&#9829;" : "&#9825;"}</button>
      </span>
      <span class="col-addlist">
        <button class="addlist-btn" title="Add to playlist (preview only)">+</button>
      </span>
    `;

    row.addEventListener("click", () => {
      previewPlayingIndex = idx;
      renderThemePreviewTracks();
    });
    row.querySelector(".play-row-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      previewPlayingIndex = idx;
      renderThemePreviewTracks();
    });
    row.querySelector(".like-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      previewLiked[track.id] = !previewLiked[track.id];
      renderThemePreviewTracks();
    });
    row.querySelector(".addlist-btn").addEventListener("click", (e) => {
      e.stopPropagation();
    });

    listEl.appendChild(row);
  });
}

// ---------- View switching ----------

function switchView(type, id) {
  currentView = id ? { type, id } : { type };
  closePlaylistMenu();

  const playlistsBlock = document.getElementById("sidebar-playlists-block");
  const themeBlock = document.getElementById("sidebar-theme-block");
  const searchBox = document.getElementById("search-box");
  const subtitle = document.getElementById("view-subtitle");

  if (type === "theme") {
    playlistsBlock.hidden = true;
    themeBlock.hidden = false;
    searchBox.hidden = true;
    document.getElementById("view-title").textContent = "Customize Theme";
    subtitle.textContent = "Live preview — changes on the left update this list instantly.";
    subtitle.hidden = false;
    renderThemeControls();
    renderThemePreviewTracks();
  } else {
    playlistsBlock.hidden = false;
    themeBlock.hidden = true;
    searchBox.hidden = false;
    subtitle.hidden = true;

    if (type === "liked") {
      document.getElementById("view-title").textContent = "Liked Songs";
    } else if (type === "playlist") {
      const pl = library.playlists.find((p) => p.id === id);
      document.getElementById("view-title").textContent = pl ? pl.name : "Playlist";
    } else {
      document.getElementById("view-title").textContent = "Your Library";
    }
    renderTrackList();
  }

  document.querySelectorAll(".nav-item[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === type);
  });
  renderPlaylists();
}

document.querySelectorAll(".nav-item[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

// ---------- Rendering (real library) ----------

function formatDuration(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function getTracksForCurrentView() {
  let tracks;
  if (currentView.type === "liked") {
    tracks = library.tracks.filter((t) => library.liked.includes(t.id));
  } else if (currentView.type === "playlist") {
    const pl = library.playlists.find((p) => p.id === currentView.id);
    tracks = pl ? pl.trackIds.map((id) => library.tracks.find((t) => t.id === id)).filter(Boolean) : [];
  } else {
    tracks = library.tracks;
  }
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    tracks = tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q)
    );
  }
  return tracks;
}

function renderPlaylists() {
  const list = document.getElementById("playlist-list");
  list.innerHTML = "";
  for (const pl of library.playlists) {
    const btn = document.createElement("button");
    btn.className = "playlist-item";
    if (currentView.type === "playlist" && currentView.id === pl.id) btn.classList.add("active");
    btn.textContent = pl.name;
    btn.addEventListener("click", () => switchView("playlist", pl.id));
    list.appendChild(btn);
  }
}

function renderTrackList() {
  const tracks = getTracksForCurrentView();
  const listEl = document.getElementById("track-list");
  const emptyEl = document.getElementById("empty-state");
  listEl.innerHTML = "";

  if (tracks.length === 0) {
    emptyEl.hidden = false;
    const msgEl = emptyEl.querySelector("p");
    const importBtn = document.getElementById("empty-import-btn");
    if (currentView.type === "liked") {
      msgEl.textContent = "No liked songs yet — click the heart on a song to add it here.";
      importBtn.hidden = true;
    } else if (currentView.type === "playlist") {
      msgEl.textContent = "This playlist is empty — use the + button on a song to add it here.";
      importBtn.hidden = true;
    } else {
      msgEl.textContent = "No tracks here yet.";
      importBtn.hidden = false;
    }
    return;
  }
  emptyEl.hidden = true;

  tracks.forEach((track, idx) => {
    const row = document.createElement("div");
    row.className = "track-row";
    const isCurrent = currentIndex >= 0 && currentQueue[currentIndex]?.id === track.id;
    const isPlayingNow = isCurrent && !audioEl.paused;
    if (isCurrent) row.classList.add("playing");

    const isLiked = library.liked.includes(track.id);

    row.innerHTML = `
      <span class="col-index">${idx + 1}</span>
      <span class="col-play">
        <button class="play-row-btn" data-play="${track.id}" title="Play">${isPlayingNow ? PAUSE_ICON : PLAY_ICON}</button>
      </span>
      <span class="col-title">
        ${track.cover_data_url ? `<img src="${track.cover_data_url}" />` : `<img src="" style="visibility:hidden" />`}
        <span class="title-text">
          <span class="t">${escapeHtml(track.title)}</span>
          <span class="a">${escapeHtml(track.artist)}</span>
        </span>
      </span>
      <span class="col-album">${escapeHtml(track.album)}</span>
      <span class="col-duration">${formatDuration(track.duration_secs)}</span>
      <span class="col-like">
        <button class="like-btn ${isLiked ? "liked" : ""}" data-like="${track.id}">${isLiked ? "&#9829;" : "&#9825;"}</button>
      </span>
      <span class="col-addlist">
        <button class="addlist-btn" data-addlist="${track.id}" title="Add to playlist">+</button>
      </span>
    `;

    row.addEventListener("click", () => {
      currentQueue = tracks;
      currentIndex = idx;
      playCurrent();
    });

    row.querySelector("[data-play]").addEventListener("click", (e) => {
      e.stopPropagation();
      const current = currentQueue[currentIndex];
      if (current && current.id === track.id) {
        togglePlayPause();
      } else {
        currentQueue = tracks;
        currentIndex = idx;
        playCurrent();
      }
    });

    row.querySelector("[data-like]").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleLike(track.id);
    });

    row.querySelector("[data-addlist]").addEventListener("click", (e) => {
      e.stopPropagation();
      openPlaylistMenu(track, e.currentTarget);
    });

    listEl.appendChild(row);
  });
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function toggleLike(trackId) {
  const idx = library.liked.indexOf(trackId);
  if (idx >= 0) library.liked.splice(idx, 1);
  else library.liked.push(trackId);
  saveLibrary();
  renderTrackList();
  updateNowPlayingLike();
}

function updateNowPlayingLike() {
  const btn = document.getElementById("np-like");
  const track = currentQueue[currentIndex];
  if (!track) {
    btn.classList.remove("liked");
    btn.innerHTML = "&#9825;";
    return;
  }
  const liked = library.liked.includes(track.id);
  btn.classList.toggle("liked", liked);
  btn.innerHTML = liked ? "&#9829;" : "&#9825;";
}

// ---------- Add-to-playlist popover ----------

let activePlaylistMenu = null;

function closePlaylistMenu() {
  if (activePlaylistMenu) {
    activePlaylistMenu.remove();
    activePlaylistMenu = null;
    document.removeEventListener("click", handleOutsideMenuClick, true);
  }
}

function handleOutsideMenuClick(e) {
  if (activePlaylistMenu && !activePlaylistMenu.contains(e.target)) {
    closePlaylistMenu();
  }
}

function openPlaylistMenu(track, anchorEl) {
  closePlaylistMenu();

  const menu = document.createElement("div");
  menu.className = "playlist-menu";

  const rect = anchorEl.getBoundingClientRect();
  menu.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - 260)}px`;
  menu.style.left = `${Math.min(rect.left - 180, window.innerWidth - 236)}px`;

  renderPlaylistMenuContents(menu, track);

  document.body.appendChild(menu);
  activePlaylistMenu = menu;

  setTimeout(() => document.addEventListener("click", handleOutsideMenuClick, true), 0);
}

function renderPlaylistMenuContents(menu, track) {
  menu.innerHTML = "";

  const title = document.createElement("div");
  title.className = "playlist-menu-title";
  title.textContent = "Add to playlist";
  menu.appendChild(title);

  if (library.playlists.length === 0) {
    const empty = document.createElement("div");
    empty.className = "playlist-menu-empty";
    empty.textContent = "No playlists yet.";
    menu.appendChild(empty);
  } else {
    for (const pl of library.playlists) {
      const inPlaylist = pl.trackIds.includes(track.id);
      const item = document.createElement("button");
      item.className = "playlist-menu-item" + (inPlaylist ? " in-playlist" : "");
      item.innerHTML = `<span class="playlist-menu-check">${inPlaylist ? "&#10003;" : ""}</span><span>${escapeHtml(pl.name)}</span>`;
      item.addEventListener("click", async () => {
        const idx = pl.trackIds.indexOf(track.id);
        if (idx >= 0) pl.trackIds.splice(idx, 1);
        else pl.trackIds.push(track.id);
        await saveLibrary();
        renderPlaylistMenuContents(menu, track);
        if (currentView.type === "playlist" && currentView.id === pl.id) renderTrackList();
      });
      menu.appendChild(item);
    }
  }

  const divider = document.createElement("div");
  divider.className = "playlist-menu-divider";
  menu.appendChild(divider);

  const newRow = document.createElement("div");
  newRow.className = "playlist-menu-new";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "New playlist name";
  const createBtn = document.createElement("button");
  createBtn.textContent = "Add";

  const createAndAdd = async () => {
    const name = input.value.trim();
    if (!name) return;
    const newPl = { id: crypto.randomUUID(), name, trackIds: [track.id] };
    library.playlists.push(newPl);
    await saveLibrary();
    renderPlaylists();
    renderPlaylistMenuContents(menu, track);
  };

  createBtn.addEventListener("click", createAndAdd);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") createAndAdd();
  });

  newRow.appendChild(input);
  newRow.appendChild(createBtn);
  menu.appendChild(newRow);
}

// ---------- Playback ----------

const audioEl = document.getElementById("audio-el");
audioEl.crossOrigin = "anonymous";

// ---------- Equalizer ----------

const EQ_BANDS = [
  { freq: 60, label: "60" },
  { freq: 170, label: "170" },
  { freq: 350, label: "350" },
  { freq: 1000, label: "1k" },
  { freq: 3500, label: "3.5k" },
  { freq: 10000, label: "10k" },
];
const EQ_PRESETS = {
  Flat: [0, 0, 0, 0, 0, 0],
  Bass: [7, 5, 3, 0, -1, -2],
  Vocal: [-2, -1, 2, 5, 3, 0],
  Treble: [-2, -1, 0, 2, 5, 7],
};

let audioGraphReady = false;
let eqFilters = [];

function ensureAudioGraph() {
  if (audioGraphReady) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContextClass();
    const source = ctx.createMediaElementSource(audioEl);
    let node = source;
    eqFilters = EQ_BANDS.map((band) => {
      const filter = ctx.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.value = band.freq;
      filter.Q.value = 1;
      filter.gain.value = 0;
      node.connect(filter);
      node = filter;
      return filter;
    });
    node.connect(ctx.destination);
    window.__eqAudioContext = ctx;
    audioGraphReady = true;
  } catch (e) {
    // If this fails for any reason, playback continues normally without EQ.
    console.warn("Equalizer unavailable:", e);
  }
}

let activeEqMenu = null;

function closeEqMenu() {
  if (activeEqMenu) {
    activeEqMenu.remove();
    activeEqMenu = null;
    document.removeEventListener("click", handleOutsideEqClick, true);
  }
}
function handleOutsideEqClick(e) {
  if (activeEqMenu && !activeEqMenu.contains(e.target) && e.target.id !== "eq-btn") {
    closeEqMenu();
  }
}

function setEqGains(gains) {
  if (eqFilters.length === 0) return;
  eqFilters.forEach((filter, i) => {
    filter.gain.value = gains[i];
  });
  if (activeEqMenu) {
    activeEqMenu.querySelectorAll(".eq-band input[type=range]").forEach((slider, i) => {
      slider.value = gains[i];
      slider.nextElementSibling.textContent = `${gains[i] > 0 ? "+" : ""}${gains[i]}dB`;
    });
  }
}

function applyEqPreset(name) {
  const gains = EQ_PRESETS[name];
  if (!gains) return;
  setEqGains(gains);
}

function openEqMenu(anchorEl) {
  closeEqMenu();
  ensureAudioGraph();
  if (window.__eqAudioContext && window.__eqAudioContext.state === "suspended") {
    window.__eqAudioContext.resume();
  }

  const menu = document.createElement("div");
  menu.className = "eq-menu";
  const rect = anchorEl.getBoundingClientRect();
  menu.style.bottom = `${window.innerHeight - rect.top + 10}px`;
  menu.style.left = `${Math.max(10, rect.left - 150)}px`;

  const title = document.createElement("div");
  title.className = "eq-menu-title";
  title.textContent = "Equalizer";
  menu.appendChild(title);

  const presetRow = document.createElement("div");
  presetRow.className = "eq-preset-row";
  for (const name of Object.keys(EQ_PRESETS)) {
    const btn = document.createElement("button");
    btn.textContent = name;
    btn.addEventListener("click", () => applyEqPreset(name));
    presetRow.appendChild(btn);
  }
  menu.appendChild(presetRow);

  const bandsRow = document.createElement("div");
  bandsRow.className = "eq-bands";
  EQ_BANDS.forEach((band, i) => {
    const filter = eqFilters[i];
    const current = filter ? filter.gain.value : 0;

    const bandEl = document.createElement("div");
    bandEl.className = "eq-band";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = -12;
    slider.max = 12;
    slider.step = 1;
    slider.value = current;
    slider.addEventListener("input", () => {
      if (eqFilters[i]) eqFilters[i].gain.value = Number(slider.value);
      valueLabel.textContent = `${slider.value > 0 ? "+" : ""}${slider.value}dB`;
    });

    const valueLabel = document.createElement("span");
    valueLabel.className = "eq-band-value";
    valueLabel.textContent = `${current > 0 ? "+" : ""}${current}dB`;

    const label = document.createElement("span");
    label.className = "eq-band-label";
    label.textContent = band.label;

    bandEl.appendChild(slider);
    bandEl.appendChild(valueLabel);
    bandEl.appendChild(label);
    bandsRow.appendChild(bandEl);
  });
  menu.appendChild(bandsRow);

  document.body.appendChild(menu);
  activeEqMenu = menu;
  setTimeout(() => document.addEventListener("click", handleOutsideEqClick, true), 0);
}

document.getElementById("eq-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  if (activeEqMenu) {
    closeEqMenu();
  } else {
    openEqMenu(e.currentTarget);
  }
});

function playCurrent() {
  const track = currentQueue[currentIndex];
  if (!track) return;
  audioEl.src = tauri.convertFileSrc(track.path);
  ensureAudioGraph();
  if (window.__eqAudioContext && window.__eqAudioContext.state === "suspended") {
    window.__eqAudioContext.resume();
  }
  audioEl.play();
  document.getElementById("np-title").textContent = track.title;
  document.getElementById("np-artist").textContent = track.artist;
  const cover = document.getElementById("np-cover");
  const placeholder = document.getElementById("np-cover-placeholder");
  if (track.cover_data_url) {
    cover.src = track.cover_data_url;
    cover.hidden = false;
    placeholder.hidden = true;
  } else {
    cover.hidden = true;
    placeholder.hidden = false;
  }
  updateNowPlayingLike();
  renderTrackList();
}

function syncPlaybackUI() {
  document.getElementById("play-btn").innerHTML = audioEl.paused ? PLAY_ICON : PAUSE_ICON;
  const current = currentQueue[currentIndex];
  document.querySelectorAll("#track-list .play-row-btn[data-play]").forEach((btn) => {
    const isThisTrack = current && btn.dataset.play === current.id;
    btn.innerHTML = isThisTrack && !audioEl.paused ? PAUSE_ICON : PLAY_ICON;
    btn.closest(".track-row")?.classList.toggle("playing", !!isThisTrack);
  });
}

audioEl.addEventListener("play", syncPlaybackUI);
audioEl.addEventListener("pause", syncPlaybackUI);

function togglePlayPause() {
  if (!currentQueue[currentIndex]) return;
  if (audioEl.paused) {
    audioEl.play();
  } else {
    audioEl.pause();
  }
}

function playNext() {
  if (currentQueue.length === 0) return;
  if (shuffleOn) {
    currentIndex = Math.floor(Math.random() * currentQueue.length);
  } else {
    currentIndex = (currentIndex + 1) % currentQueue.length;
  }
  playCurrent();
}

function playPrev() {
  if (currentQueue.length === 0) return;
  currentIndex = (currentIndex - 1 + currentQueue.length) % currentQueue.length;
  playCurrent();
}

audioEl.addEventListener("ended", () => {
  if (repeatOn) {
    playCurrent();
  } else {
    playNext();
  }
});

function updateSliderFill(input) {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 100;
  const val = Number(input.value);
  const pct = ((val - min) / (max - min)) * 100;
  input.style.background = `linear-gradient(to right, var(--accent) ${pct}%, var(--bg-hover) ${pct}%)`;
}

audioEl.addEventListener("timeupdate", () => {
  const seek = document.getElementById("seek-bar");
  if (!isSeeking && audioEl.duration) {
    seek.value = (audioEl.currentTime / audioEl.duration) * 100;
    updateSliderFill(seek);
  }
  document.getElementById("time-current").textContent = formatDuration(audioEl.currentTime || 0);
  document.getElementById("time-total").textContent = formatDuration(audioEl.duration || 0);
});

let isSeeking = false;
const seekBar = document.getElementById("seek-bar");
seekBar.addEventListener("input", () => {
  isSeeking = true;
  updateSliderFill(seekBar);
});
seekBar.addEventListener("change", () => {
  if (audioEl.duration) {
    audioEl.currentTime = (seekBar.value / 100) * audioEl.duration;
  }
  isSeeking = false;
  updateSliderFill(seekBar);
});
updateSliderFill(seekBar);

const volumeBarEl = document.getElementById("volume-bar");
volumeBarEl.addEventListener("input", (e) => {
  audioEl.volume = e.target.value / 100;
  if (audioEl.muted && e.target.value > 0) audioEl.muted = false;
  updateVolumeIcon();
  updateSliderFill(volumeBarEl);
});
audioEl.volume = 0.8;
updateSliderFill(volumeBarEl);

const VOLUME_ICON_HTML = document.getElementById("volume-icon-btn").innerHTML;
const MUTE_ICON_HTML = `
  <svg viewBox="0 0 18 18" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2 7h2.5L8 4v10L4.5 11H2z" fill="currentColor" stroke="none"/>
    <path d="M11 6 15 12"/>
    <path d="M15 6 11 12"/>
  </svg>
`;

function updateVolumeIcon() {
  const btn = document.getElementById("volume-icon-btn");
  btn.innerHTML = audioEl.muted ? MUTE_ICON_HTML : VOLUME_ICON_HTML;
  btn.classList.toggle("muted", audioEl.muted);
}

document.getElementById("volume-icon-btn").addEventListener("click", () => {
  audioEl.muted = !audioEl.muted;
  updateVolumeIcon();
});

document.getElementById("play-btn").addEventListener("click", togglePlayPause);
document.getElementById("next-btn").addEventListener("click", playNext);
document.getElementById("prev-btn").addEventListener("click", playPrev);
document.getElementById("shuffle-btn").addEventListener("click", (e) => {
  shuffleOn = !shuffleOn;
  e.currentTarget.style.color = shuffleOn ? "var(--accent)" : "";
});
document.getElementById("repeat-btn").addEventListener("click", (e) => {
  repeatOn = !repeatOn;
  e.currentTarget.style.color = repeatOn ? "var(--accent)" : "";
});
document.getElementById("np-like").addEventListener("click", () => {
  const track = currentQueue[currentIndex];
  if (track) toggleLike(track.id);
});

// ---------- Import ----------

async function importMusic() {
  const selected = await dialog.open({
    multiple: true,
    filters: [{ name: "Audio", extensions: ["mp3", "flac", "wav", "ogg", "m4a", "aac"] }],
  });
  if (!selected) return;
  const paths = Array.isArray(selected) ? selected : [selected];

  const existingPaths = new Set(library.tracks.map((t) => t.path));
  const newPaths = paths.filter((p) => !existingPaths.has(p));
  if (newPaths.length === 0) return;

  const newTracks = await tauri.invoke("import_tracks", { paths: newPaths });
  library.tracks.push(...newTracks);
  await saveLibrary();
  if (currentView.type !== "theme") renderTrackList();
}

document.getElementById("import-btn").addEventListener("click", importMusic);
document.getElementById("empty-import-btn").addEventListener("click", importMusic);

// ---------- Playlists ----------

document.getElementById("new-playlist-btn").addEventListener("click", () => openModal());

function openModal() {
  document.getElementById("modal-backdrop").hidden = false;
  document.getElementById("modal-input").value = "";
  document.getElementById("modal-input").focus();
}
function closeModal() {
  document.getElementById("modal-backdrop").hidden = true;
}
document.getElementById("modal-cancel").addEventListener("click", closeModal);
document.getElementById("modal-confirm").addEventListener("click", async () => {
  const name = document.getElementById("modal-input").value.trim();
  if (!name) return;
  library.playlists.push({ id: crypto.randomUUID(), name, trackIds: [] });
  await saveLibrary();
  renderPlaylists();
  closeModal();
});

// ---------- Search ----------

document.getElementById("search-box").addEventListener("input", (e) => {
  searchQuery = e.target.value;
  renderTrackList();
});

// ---------- Init ----------

async function init() {
  await initPaths();
  library = await loadLibrary();
  theme = await loadTheme();
  applyTheme(theme);
  renderPlaylists();
  renderTrackList();
}

init();
