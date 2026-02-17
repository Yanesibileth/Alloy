'use strict';

/**
 * Scout — Electron wrapper
 *
 * What this does:
 *   1. Loads the user's config from %AppData%\Scout\.env
 *   2. Runs backend/server.js directly inside Electron's Node.js process
 *      (no separate Node install needed — Electron IS Node.js)
 *   3. Shows a system tray icon with Open Dashboard / Edit Settings / Quit
 *   4. Opens the parent dashboard in the default browser after startup
 */

const { app, Tray, Menu, shell, dialog, nativeImage } = require('electron');
const path = require('path');
const fs   = require('fs');

// ── Single instance lock ──────────────────────────────────────────────────────

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// ── Paths ─────────────────────────────────────────────────────────────────────

// User config survives app updates (lives in %AppData%\Roaming\Scout)
const USER_DATA  = app.getPath('userData');
const ENV_FILE   = path.join(USER_DATA, '.env');

// Backend dir — works both in dev (next to main.js) and when packaged
const BACKEND_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'app', 'backend')
  : path.join(__dirname, 'backend');

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureUserConfig() {
  if (!fs.existsSync(USER_DATA)) fs.mkdirSync(USER_DATA, { recursive: true });

  if (!fs.existsSync(ENV_FILE)) {
    // First run — copy the example so the user has something to edit
    const example = path.join(BACKEND_DIR, '.env.example');
    if (fs.existsSync(example)) fs.copyFileSync(example, ENV_FILE);
  }
}

// Minimal 16x16 white square PNG (fallback if assets/icon.png is missing)
const FALLBACK_ICON_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAABdJREFUeNpj/P//PwMlgHHUgFEDAAIMAAABBgABsp9UOAAAAABJRU5ErkJggg==';

function getTrayIcon() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  if (fs.existsSync(iconPath)) return nativeImage.createFromPath(iconPath);
  return nativeImage.createFromBuffer(Buffer.from(FALLBACK_ICON_B64, 'base64'));
}

// ── Startup ───────────────────────────────────────────────────────────────────

// Swallow unhandled exceptions so the tray stays alive even if the bot crashes
process.on('uncaughtException', (err) => {
  console.error('[Scout] Uncaught exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Scout] Unhandled rejection:', reason);
});

let tray = null;
let backendStarted = false;

app.whenReady().then(() => {
  // Hide the app from the taskbar and dock — it lives in the tray only
  app.setAppUserModelId('com.scout.companion');
  if (app.dock) app.dock.hide();

  ensureUserConfig();

  // ── Load user config before starting the backend ─────────────────────────
  // dotenv won't overwrite vars that are already set, so loading here first
  // means backend/server.js's own dotenv.config() call becomes a no-op.
  require('dotenv').config({ path: ENV_FILE });

  // ── Run backend in-process ────────────────────────────────────────────────
  // Electron's main process IS a full Node.js runtime, so requiring server.js
  // starts Express, WebSocket, and the Mineflayer bot right here.
  try {
    // Tell the backend where to find dashboard.html (it uses __dirname internally,
    // which already resolves correctly since we're not changing CWD)
    process.env.BACKEND_ROOT = BACKEND_DIR;
    require(path.join(BACKEND_DIR, 'server.js'));
    backendStarted = true;
  } catch (err) {
    dialog.showErrorBox('Scout failed to start', err.message);
    app.quit();
    return;
  }

  // ── Open dashboard after the server has had time to bind its port ─────────
  setTimeout(() => {
    const port = process.env.PORT || 3000;
    shell.openExternal(`http://localhost:${port}`);
  }, 2500);

  // ── System tray ───────────────────────────────────────────────────────────
  tray = new Tray(getTrayIcon());
  tray.setToolTip('Scout — AI Minecraft Companion');

  const port = process.env.PORT || 3000;

  const menu = Menu.buildFromTemplate([
    { label: 'Scout — AI Minecraft Companion', enabled: false },
    { type: 'separator' },
    {
      label: 'Open Parent Dashboard',
      click: () => shell.openExternal(`http://localhost:${port}`),
    },
    {
      label: 'Edit Settings',
      click: () => {
        // Open .env in Notepad — easy for non-technical parents to edit
        shell.openPath(ENV_FILE);
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Scout',
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(menu);
  tray.on('double-click', () => shell.openExternal(`http://localhost:${port}`));
});

// Keep the app alive even when all browser windows are closed
app.on('window-all-closed', (e) => e.preventDefault());
