<div align="center">

```
    _    _ _
   / \  | | | __ _ _   _
  / _ \ | | |/ _` | | | |
 / ___ \| | | (_| | |_| |
/_/   \_\_|_|\__,_|\__, |
                   |___/
```

**An AI companion that plays Minecraft with your child.**

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Electron](https://img.shields.io/badge/Electron-v28-47848F?style=flat-square&logo=electron&logoColor=white)](https://electronjs.org)
[![Claude AI](https://img.shields.io/badge/Claude-AI%20powered-D97757?style=flat-square)](https://anthropic.com)
[![Minecraft](https://img.shields.io/badge/Minecraft-Java%201.20-62B47A?style=flat-square)](https://minecraft.net)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D4?style=flat-square&logo=windows&logoColor=white)](https://microsoft.com/windows)

</div>

---

## What is Allay?

Allay joins your child's Minecraft world as a real player and **actually plays the game** alongside them — not as a spectator, not as a plugin, but as a bot that walks, mines, fights, and chats just like a human would.

Parents get a live dashboard showing what Allay and their child are doing at all times, with safety monitoring built in.

> Named after the Allay — a Minecraft mob that follows you everywhere and helps you collect things. That's exactly what this does.

---

## What Allay does

```
┌─────────────────────────────────────────────────────┐
│  Priority 1 — PROTECT                               │
│  Scans 7 blocks around the child every 800ms.       │
│  Equips best weapon. Charges at hostile mobs.       │
│                                                     │
│  Priority 2 — MINE                                  │
│  Searches 6 blocks for ores (diamonds first).       │
│  Navigates, digs, reacts in chat ("DIAMONDS!!")     │
│                                                     │
│  Priority 3 — FOLLOW                                │
│  Stays within 2 blocks using live pathfinding.      │
│  Re-routes automatically as the child moves.        │
└─────────────────────────────────────────────────────┘
```

- Equips the best pickaxe or sword from inventory automatically
- Eats food when hungry (food < 16/20)
- Makes unprompted comments about what's happening in-game
- Responds to chat via Claude AI or built-in smart fallbacks
- Reconnects automatically if the server drops
- No Minecraft mod or plugin required — joins as an offline-mode player

---

## Architecture

```
Minecraft Java Edition Server
         │
         │  (Minecraft protocol — TCP)
         │
    ┌────▼────────────────────────────────────┐
    │            Allay  (Node.js)             │
    │                                         │
    │  ┌──────────────┐  ┌─────────────────┐  │
    │  │  Mineflayer  │  │   Claude API    │  │
    │  │  bot player  │  │  (chat only)    │  │
    │  └──────┬───────┘  └────────┬────────┘  │
    │         │                   │           │
    │  ┌──────▼───────────────────▼────────┐  │
    │  │         Behavior Loop (800ms)     │  │
    │  │   protect → mine → follow         │  │
    │  └───────────────────────────────────┘  │
    │                                         │
    │  ┌──────────────────────────────────┐   │
    │  │  Express + WebSocket (port 3000) │   │
    │  │  Parent Dashboard                │   │
    │  └──────────────────────────────────┘   │
    └─────────────────────────────────────────┘
```

**Mineflayer** handles all gameplay — movement, digging, attacking, pathfinding.
**Claude AI** only generates chat text. Gameplay is 100% deterministic rule-based logic.

---

## Quick start (developer)

**Prerequisites:** Node.js v18+, a Minecraft Java Edition server (or LAN world)

```bat
setup.bat
```

```bat
cd backend
node server.js
```

Open **http://localhost:3000** for the parent dashboard.

---

## One-click installer

For parents: a single `.exe` that installs everything with no technical setup required.

### Build it

```bat
build.bat
```

Three steps run automatically:

| Step | What happens |
|------|-------------|
| 1 | `backend/node_modules` installed (production only) |
| 2 | Electron + electron-builder downloaded |
| 3 | `dist/Allay-Setup.exe` produced |

> First build takes a few minutes — Electron is ~120 MB to download.

### What parents get

- Double-click `Allay-Setup.exe` → installs silently, launches immediately
- Allay lives in the **system tray** — no windows, no console
- Right-click tray → **Edit Settings** → opens `.env` in Notepad
- Right-click tray → **Open Dashboard** → opens `http://localhost:3000`
- Settings stored in `%AppData%\Roaming\Allay\.env` — survive app updates

---

## Configuration

Edit `backend/.env` (or via Edit Settings in the tray):

```env
# Minecraft server
MC_HOST=localhost
MC_PORT=25565
MC_VERSION=1.20.1

# Bot identity
BOT_NAME=Allay

# Lock Allay to one specific child (optional)
# TARGET_PLAYER=YourChildsUsername

# Claude AI for natural chat responses (optional)
# Without this, Allay uses smart built-in responses
# ANTHROPIC_API_KEY=sk-ant-...
```

Get an API key at [console.anthropic.com](https://console.anthropic.com)

---

## Parent dashboard

```
┌─────────────────────────────────────────────────────────┐
│  Allay — Parent Dashboard                               │
├─────────────────────────────────────────────────────────┤
│  ● Allay is online  · Claude AI                         │
│  following Steve                    Health ████████ 16  │
│  x 142 / y 64 / z -88               Food  ██████   12  │
├──────────┬──────────┬──────────┬────────────────────────┤
│  Mined   │  Chats   │Protected │  Alerts                │
│    14    │    32    │    5     │    0                   │
├──────────┴──────────┴──────────┴────────────────────────┤
│  [ Live Feed ]  [ Chat Log ]  [ Safety ]                │
├─────────────────────────────────────────────────────────┤
│  12:04:01  ACTION   Mined diamond_ore                   │
│  12:04:03  COMPANION  DIAMONDS!! let's go!!             │
│  12:04:12  CHAT    <Steve> can we build a house         │
│  12:04:14  COMPANION  yeah let's find a good spot!      │
└─────────────────────────────────────────────────────────┘
```

**Safety tab** flags messages containing frustration, negative language, or concerning real-world topics — no notification spam, just a log you can review.

---

## File structure

```
allay/
├── main.js               Electron entry point (tray + in-process backend)
├── package.json          Root: Electron + electron-builder config
├── build.bat             → dist/Allay-Setup.exe
├── setup.bat             Dev setup
│
├── backend/
│   ├── server.js         Bot + AI + dashboard server
│   ├── dashboard.html    Parent dashboard UI
│   ├── package.json      Backend dependencies
│   └── .env.example      Config template
│
├── assets/
│   ├── icon.png          System tray icon
│   └── icon.ico          Installer icon
│
└── dashboard/
    └── ParentDashboard.jsx   Reusable React component
```

---

## Notes

- Allay connects in **offline mode** by default. For servers requiring premium auth, set `auth: 'microsoft'` in `server.js`.
- Logs are **in-memory only** — cleared on restart.
- Behavior loop: **800ms tick**, ore search radius **6 blocks**, mob protection radius **7 blocks**.
- Minecraft server version must match `MC_VERSION` in `.env` exactly.
