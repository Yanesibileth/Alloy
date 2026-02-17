'use strict';

/**
 * Scout — Active Minecraft Companion
 *
 * Alex joins the game as a real player and:
 *   1. Follows the child everywhere using pathfinder
 *   2. Mines nearby ores while tagging along
 *   3. Attacks hostile mobs that get close to the child
 *   4. Responds to chat using Claude AI (or built-in fallbacks)
 *   5. Makes occasional proactive comments based on what's happening
 *   6. Reports everything to the parent dashboard in real time
 */

const mineflayer                    = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalFollow, GoalBlock, GoalNear } = goals;
const Anthropic                     = require('@anthropic-ai/sdk');
const express                       = require('express');
const http                          = require('http');
const WebSocket                     = require('ws');
const cors                          = require('cors');
const path                          = require('path');
require('dotenv').config();

// ─── Config ──────────────────────────────────────────────────────────────────

const MC_HOST    = process.env.MC_HOST    || 'localhost';
const MC_PORT    = parseInt(process.env.MC_PORT || '25565');
const MC_VERSION = process.env.MC_VERSION || '1.20.1';
const BOT_NAME   = process.env.BOT_NAME   || 'Alex';
const PORT       = parseInt(process.env.PORT || '3000');

// Lock the companion to one player by username (optional).
// If not set, Alex follows whoever speaks or joins first.
let targetPlayerName = process.env.TARGET_PLAYER || null;

// ─── Claude ──────────────────────────────────────────────────────────────────

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// ─── Dashboard server (Express + WebSocket) ──────────────────────────────────

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

app.get('/',       (_req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/health', (_req, res) => res.json({ status: 'ok', connected: botStatus.connected, aiEnabled: !!anthropic }));
app.get('/api/logs',   (_req, res) => res.json({ logs: actionLog.slice(-100), safetyAlerts: safetyAlerts.slice(0, 20) }));
app.get('/api/status', (_req, res) => res.json(botStatus));

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}

server.listen(PORT, () => {
  console.log(`[Scout] Parent dashboard → http://localhost:${PORT}`);
  console.log(`[Scout] AI: ${anthropic ? 'Claude active' : 'Fallback mode — add ANTHROPIC_API_KEY to .env for full AI'}`);
});

// ─── Shared state ────────────────────────────────────────────────────────────

const actionLog    = [];   // last 500 events (all types)
const safetyAlerts = [];   // flagged messages
let   chatHistory  = [];   // Claude conversation history

let botStatus = {
  connected:    false,
  health:       20,
  food:         20,
  position:     null,
  task:         'connecting...',
  targetPlayer: null,
  aiEnabled:    !!anthropic,
};

let currentState  = 'idle';   // idle | following | mining | protecting
let followGoalSet = false;
let digging       = false;

function addLog(type, message, extra = {}) {
  const entry = { time: new Date().toISOString(), type, message, ...extra };
  actionLog.push(entry);
  if (actionLog.length > 500) actionLog.shift();
  broadcast({ type: 'log', entry });
  console.log(`[${type}] ${message}`);
}

function updateStatus(patch) {
  Object.assign(botStatus, patch);
  broadcast({ type: 'status', status: { ...botStatus } });
}

// ─── Minecraft constants ──────────────────────────────────────────────────────

const HOSTILE_MOBS = new Set([
  'zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch',
  'pillager', 'vindicator', 'phantom', 'drowned', 'husk', 'stray',
  'cave_spider', 'blaze', 'ghast', 'slime', 'magma_cube', 'silverfish',
]);

// In priority order — diamonds first, coal last
const ORE_NAMES = [
  'ancient_debris',
  'diamond_ore', 'deepslate_diamond_ore',
  'emerald_ore', 'deepslate_emerald_ore',
  'gold_ore',    'deepslate_gold_ore',
  'iron_ore',    'deepslate_iron_ore',
  'lapis_ore',   'deepslate_lapis_ore',
  'coal_ore',    'deepslate_coal_ore',
  'copper_ore',  'deepslate_copper_ore',
];

const ORE_REACTIONS = {
  ancient_debris:           "ancient debris!! we're getting netherite",
  diamond_ore:              "DIAMONDS!! let's go!!",
  deepslate_diamond_ore:    "DIAMONDS!! let's go!!",
  emerald_ore:              "emerald! nice find",
  gold_ore:                 "gold, grabbing it",
  deepslate_gold_ore:       "gold, grabbing it",
};

const WEAPON_PRIORITY = [
  'netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'golden_sword', 'wooden_sword',
  'netherite_axe',   'diamond_axe',   'iron_axe',
];

const PICKAXE_PRIORITY = [
  'netherite_pickaxe', 'diamond_pickaxe', 'iron_pickaxe', 'stone_pickaxe', 'golden_pickaxe', 'wooden_pickaxe',
];

const FOOD_NAMES = [
  'cooked_beef', 'cooked_porkchop', 'cooked_chicken', 'cooked_mutton',
  'cooked_salmon', 'cooked_cod', 'bread', 'apple', 'carrot', 'golden_carrot',
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Bot creation ─────────────────────────────────────────────────────────────

let bot;

function createBot() {
  bot = mineflayer.createBot({
    host:       MC_HOST,
    port:       MC_PORT,
    username:   BOT_NAME,
    version:    MC_VERSION,
    auth:       'offline',
    hideErrors: false,
  });

  bot.loadPlugin(pathfinder);

  bot.once('spawn', () => {
    const mcMove = new Movements(bot);
    mcMove.canDig = true;
    bot.pathfinder.setMovements(mcMove);

    digging       = false;
    followGoalSet = false;
    currentState  = 'idle';

    updateStatus({ connected: true, task: 'looking for player to follow' });
    addLog('system', `${BOT_NAME} spawned and ready`);

    startBehaviorLoop();
    startProactiveComments();
  });

  bot.on('login', () => addLog('system', `Connected to ${MC_HOST}:${MC_PORT}`));

  bot.on('health', () => {
    updateStatus({
      health:   bot.health,
      food:     bot.food,
      position: roundPos(bot.entity?.position),
    });

    // Auto-eat if hungry
    if (bot.food < 16) {
      const food = bot.inventory.items().find(i => FOOD_NAMES.some(f => i.name === f));
      if (food) bot.equip(food, 'hand').then(() => bot.consume()).catch(() => {});
    }
  });

  bot.on('chat', async (username, message) => {
    if (username === bot.username) return;
    addLog('chat', message, { username });
    checkSafety(username, message);

    // First speaker becomes the target player
    if (!targetPlayerName) {
      targetPlayerName = username;
      updateStatus({ targetPlayer: username });
      addLog('system', `Now following ${username}`);
    }

    const reply = await getAIResponse(username, message);
    if (reply) {
      await sleep(1200 + Math.random() * 800); // natural-feeling delay
      bot.chat(reply);
      addLog('companion', reply, { username: BOT_NAME });
    }
  });

  bot.on('playerJoined', (player) => {
    if (player.username === bot.username) return;
    addLog('system', `${player.username} joined`);
    if (!targetPlayerName) {
      targetPlayerName = player.username;
      updateStatus({ targetPlayer: player.username });
    }
  });

  bot.on('playerLeft', (player) => {
    addLog('system', `${player.username} left`);
    if (player.username === targetPlayerName) {
      targetPlayerName = null;
      followGoalSet    = false;
      bot.pathfinder.stop();
      currentState = 'idle';
      updateStatus({ task: 'waiting for player', targetPlayer: null });
    }
  });

  bot.on('death', () => {
    addLog('system', `${BOT_NAME} died — respawning`);
    digging       = false;
    followGoalSet = false;
    currentState  = 'idle';
  });

  bot.on('error', (err) => {
    addLog('error', err.message);
    updateStatus({ connected: false });
  });

  bot.on('end', (reason) => {
    addLog('system', `Disconnected (${reason}) — reconnecting in 5 s`);
    updateStatus({ connected: false, task: 'reconnecting...' });
    setTimeout(createBot, 5000);
  });
}

function roundPos(pos) {
  if (!pos) return null;
  return { x: Math.round(pos.x), y: Math.round(pos.y), z: Math.round(pos.z) };
}

// ─── Behavior loop (runs every 800 ms) ───────────────────────────────────────

function startBehaviorLoop() {
  setInterval(() => tick().catch(() => {}), 800);
}

async function tick() {
  if (!bot?.entity) return;

  const target = targetPlayerName ? bot.players[targetPlayerName] : null;

  if (!target?.entity) {
    if (currentState !== 'idle') {
      currentState  = 'idle';
      followGoalSet = false;
      bot.pathfinder.stop();
      updateStatus({ task: 'waiting for player' });
    }
    return;
  }

  const playerPos = target.entity.position;

  // ── Priority 1: Protect the child from nearby mobs ───────────────────────
  const mob = findThreat(playerPos, 7);
  if (mob) {
    if (currentState !== 'protecting') {
      currentState  = 'protecting';
      followGoalSet = false;
      updateStatus({ task: `protecting from ${mob.name}` });
      addLog('action', `Protecting ${targetPlayerName} from ${mob.name}`);
    }
    await handleThreat(mob);
    return;
  }

  // ── Priority 2: Mine nearby ores ─────────────────────────────────────────
  if (!digging) {
    const ore = findOre(playerPos, 6);
    if (ore) {
      await handleMining(ore);
      return;
    }
  }

  // ── Priority 3: Follow the player ────────────────────────────────────────
  if (!digging) {
    const dist = bot.entity.position.distanceTo(playerPos);
    if (dist > 4) {
      if (!followGoalSet || currentState !== 'following') {
        currentState  = 'following';
        followGoalSet = true;
        bot.pathfinder.setGoal(new GoalFollow(target.entity, 2), true);
        updateStatus({ task: `following ${targetPlayerName}` });
      }
    } else {
      if (followGoalSet) {
        bot.pathfinder.stop();
        followGoalSet = false;
      }
      currentState = 'following';
      updateStatus({ task: `with ${targetPlayerName}` });
    }
  }
}

// ─── Behavior implementations ─────────────────────────────────────────────────

function findThreat(playerPos, range) {
  return Object.values(bot.entities).find(e =>
    e?.name && HOSTILE_MOBS.has(e.name) && e.position.distanceTo(playerPos) <= range
  ) || null;
}

function findOre(playerPos, range) {
  for (const name of ORE_NAMES) {
    const id = bot.registry.blocksByName[name]?.id;
    if (id == null) continue;
    const block = bot.findBlock({ matching: id, maxDistance: range });
    if (block && block.position.distanceTo(playerPos) <= range) return block;
  }
  return null;
}

function getBestItem(priorityList) {
  for (const name of priorityList) {
    const item = bot.inventory.items().find(i => i.name === name);
    if (item) return item;
  }
  return null;
}

async function handleThreat(mob) {
  try {
    const weapon = getBestItem(WEAPON_PRIORITY);
    if (weapon) await bot.equip(weapon, 'hand').catch(() => {});

    if (bot.entity.position.distanceTo(mob.position) > 3) {
      bot.pathfinder.setGoal(new GoalNear(mob.position.x, mob.position.y, mob.position.z, 2));
    } else {
      bot.attack(mob);
    }
  } catch (_) {
    // mob may have died mid-attack
    currentState  = 'following';
    followGoalSet = false;
  }
}

async function handleMining(block) {
  if (digging) return;

  digging       = true;
  currentState  = 'mining';
  followGoalSet = false;
  updateStatus({ task: `mining ${block.name}` });
  addLog('action', `Mining ${block.name}`);

  try {
    const pick = getBestItem(PICKAXE_PRIORITY);
    if (pick) await bot.equip(pick, 'hand').catch(() => {});

    // Navigate to the block
    bot.pathfinder.setGoal(new GoalBlock(block.position.x, block.position.y, block.position.z));

    // Wait until adjacent (max 8 s)
    const deadline = Date.now() + 8000;
    while (bot.entity.position.distanceTo(block.position) > 4) {
      if (Date.now() > deadline) return;
      await sleep(200);
    }

    bot.pathfinder.stop();

    // Re-check the block still exists (player may have already mined it)
    const fresh = bot.blockAt(block.position);
    if (!fresh || fresh.name === 'air') return;

    if (bot.canDigBlock(fresh)) {
      await bot.dig(fresh);
      addLog('action', `Mined ${fresh.name}`);

      // Occasional reaction comment
      if (ORE_REACTIONS[fresh.name] && Math.random() < 0.45) {
        const comment = ORE_REACTIONS[fresh.name];
        bot.chat(comment);
        addLog('companion', comment, { username: BOT_NAME });
      }
    }
  } catch (_) {
    // block gone or path blocked — no crash
  } finally {
    digging       = false;
    currentState  = 'following';
    followGoalSet = false;
  }
}

// ─── Claude AI (chat responses) ──────────────────────────────────────────────

const SYSTEM_PROMPT = `\
You are ${BOT_NAME}, a Minecraft companion AI. You are literally in the game with the player — \
following them, mining ores, and protecting them from mobs.

Personality: chill older sibling who genuinely loves Minecraft. Never preachy.

Rules:
- Max 2 short sentences (this is game chat)
- Reference what's actually happening: mining, mobs, exploring, building
- Celebrate finds naturally ("DIAMONDS let's go")
- After fighting a mob: "that creeper nearly got us lol"
- If asked to do something: "on it" / "right behind you" / "already on it"
- Casual tips only, never lectures
- Age-appropriate and warm`;

async function getAIResponse(username, message) {
  chatHistory.push({ role: 'user', content: `${username}: ${message}` });
  if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);

  if (!anthropic) {
    const reply = fallbackChatResponse(message);
    chatHistory.push({ role: 'assistant', content: reply });
    return reply;
  }

  try {
    const res = await anthropic.messages.create({
      model:      'claude-opus-4-6',
      max_tokens: 80,
      system:     SYSTEM_PROMPT,
      messages:   chatHistory,
    });
    const text = res.content[0].text.trim();
    chatHistory.push({ role: 'assistant', content: text });
    return text;
  } catch (e) {
    console.error('[Claude]', e.message);
    return fallbackChatResponse(message);
  }
}

function fallbackChatResponse(msg) {
  if (/diamond/i.test(msg))         return "DIAMONDS!! on my way";
  if (/follow|come here/i.test(msg)) return "right behind you!";
  if (/mine|dig/i.test(msg))         return "already scanning for ore nearby";
  if (/help|how do/i.test(msg))      return "on it! what do you need?";
  if (/fight|kill|attack/i.test(msg)) return "on it, I got this mob";
  if (/build|make|craft/i.test(msg)) return "let's do it! what materials do we have?";
  if (/die|died|lost my stuff/i.test(msg)) return "oof, let's go get your stuff back";
  if (/food|hungry/i.test(msg))      return "yeah we should find food soon";
  if (/creeper|zombie|skeleton/i.test(msg)) return "saw it, I'll handle it";
  return "yeah! what do you want to do?";
}

// ─── Proactive comments (every ~50 s, 25% chance) ────────────────────────────

function startProactiveComments() {
  setInterval(async () => {
    if (!targetPlayerName || !bot?.entity || currentState === 'idle') return;
    if (Math.random() > 0.25) return;

    const comment = await getProactiveComment();
    if (comment) {
      bot.chat(comment);
      addLog('companion', comment, { username: BOT_NAME });
    }
  }, 50_000);
}

async function getProactiveComment() {
  const ctx = {
    task:   currentState,
    y:      Math.round(bot.entity?.position?.y ?? 64),
    health: Math.round(bot.health),
  };

  if (!anthropic) {
    const opts = [
      "what are we looking for next?",
      "we should find a cave and go deeper",
      "want to start building something?",
      "we need more torches soon",
      "I can hear mobs below us",
    ];
    return opts[Math.floor(Math.random() * opts.length)];
  }

  try {
    const res = await anthropic.messages.create({
      model:      'claude-opus-4-6',
      max_tokens: 50,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: `Say one casual in-game comment based on: ${JSON.stringify(ctx)}` }],
    });
    return res.content[0].text.trim();
  } catch (_) {
    return null;
  }
}

// ─── Safety monitoring ────────────────────────────────────────────────────────

const SAFETY_PATTERNS = {
  frustration: /\b(stupid|hate|worst|ugh|rage)\b/i,
  negative:    /\b(kill|loser|noob|trash|idiot)\b/i,
  concerning:  /\b(real life|my address|my school|my house)\b/i,
};

function checkSafety(username, message) {
  const concerns = Object.entries(SAFETY_PATTERNS)
    .filter(([, re]) => re.test(message))
    .map(([type]) => type);
  if (!concerns.length) return;

  const alert = { time: new Date().toISOString(), username, message, concerns };
  safetyAlerts.unshift(alert);
  if (safetyAlerts.length > 100) safetyAlerts.pop();
  broadcast({ type: 'safety_alert', alert });
}

// ─── Start ────────────────────────────────────────────────────────────────────

createBot();
