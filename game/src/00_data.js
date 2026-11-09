// ============================================================
// 00 · Konstanten, Daten, Einstellungen, Hilfsfunktionen
// ============================================================
const T = THREE;

const CELL = 4;              // Rastergröße in Metern
const MAP_HALF = 200;        // Karte: -200 … +200
const GRAV = 24;             // „snappy“ Gravitation
const JUMP_V = 8.0;          // ≈ 1,33 m Sprunghöhe
const STEP_H = 0.55;
const P_RADIUS = 0.4;
const P_HEIGHT = 1.8;
const P_CROUCH_H = 1.2;
const PYR_H = 2.0;
const FULL_MASK = { wall: 0x1FF, floor: 0xF, ramp: 0xF, pyr: 0xF };
const PIECE_COST = 10;

const SPEED = { run: 5.0, sprint: 6.8, crouch: 2.7, ads: 3.4, consume: 2.6, sky: 14, glide: 11 };

const DEFAULT_SETTINGS = {
  fov: 90, sens: 1.0, adsMul: 0.7, editOnRelease: true, turbo: true,
  shadows: true, bots: 15, difficulty: 1, volume: 0.5, showFps: true
};

function loadJSON(k, def) {
  try { const v = localStorage.getItem(k); return v ? Object.assign({}, def, JSON.parse(v)) : Object.assign({}, def); }
  catch (e) { return Object.assign({}, def); }
}
function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

const settings = loadJSON('gridfall_settings', DEFAULT_SETTINGS);

// ---------- Seltenheit ----------
const RARITY = [
  { name: 'Gewöhnlich',   css: '#b0b0b0', hex: 0xb0b0b0, dmg: 1.00, rel: 1.00 },
  { name: 'Ungewöhnlich', css: '#3fbf3f', hex: 0x3fbf3f, dmg: 1.05, rel: 0.95 },
  { name: 'Selten',       css: '#3f8fff', hex: 0x3f8fff, dmg: 1.10, rel: 0.91 },
  { name: 'Episch',       css: '#b44fff', hex: 0xb44fff, dmg: 1.16, rel: 0.87 },
  { name: 'Legendär',     css: '#ffb13f', hex: 0xffb13f, dmg: 1.22, rel: 0.82 },
];

// ---------- Waffen ----------
// spread in Grad (halber Kegelwinkel), falloff: [[ab Distanz, 1.0], [bis Distanz, Multiplikator]]
const WEAPONS = {
  pistol:  { name: 'Pistole', icon: '🔫', kind: 'hitscan', dmg: 24, rate: 6.75, mag: 16, reload: 1.5, ammo: 'light', head: 2.0,
             spread: 1.6, adsMul: 0.55, bloomShot: 0.7, bloomMax: 3.5, recover: 7, fsa: true, fsaReset: 0.35,
             falloff: [[25, 1], [60, 0.7]], structure: 24, adsFov: 0.82, auto: false, range: 160, rarities: [0, 1, 2], botRange: 18 },
  smg:     { name: 'MP', icon: '🔫', kind: 'hitscan', dmg: 17, rate: 12, mag: 30, reload: 2.2, ammo: 'light', head: 1.75,
             spread: 2.2, adsMul: 0.7, bloomShot: 0.35, bloomMax: 4.5, recover: 8, fsa: false, fsaReset: 1,
             falloff: [[15, 1], [40, 0.65]], structure: 17, adsFov: 0.85, auto: true, range: 120, rarities: [0, 1, 2, 3], botRange: 12 },
  ar:      { name: 'Sturmgewehr', icon: '🔫', kind: 'hitscan', dmg: 30, rate: 5.5, mag: 30, reload: 2.3, ammo: 'medium', head: 1.5,
             spread: 1.4, adsMul: 0.45, bloomShot: 0.55, bloomMax: 3.2, recover: 6, fsa: true, fsaReset: 0.6,
             falloff: [[50, 1], [100, 0.8]], structure: 30, adsFov: 0.72, auto: true, range: 260, rarities: [0, 1, 2, 3, 4], botRange: 26 },
  shotgun: { name: 'Pump-Shotgun', icon: '💥', kind: 'shotgun', dmg: 9.5, pellets: 10, rate: 0.75, mag: 5, reload: 4.2, ammo: 'shells', head: 2.0,
             spread: 4.2, adsMul: 0.85, bloomShot: 0, bloomMax: 0, recover: 10, fsa: false, fsaReset: 1,
             falloff: [[5, 1], [16, 0.3]], structure: 60, adsFov: 0.88, auto: false, range: 45, rarities: [0, 1, 2, 3, 4], botRange: 6 },
  sniper:  { name: 'Scharfschützengewehr', icon: '🎯', kind: 'projectile', dmg: 105, rate: 0.33, mag: 1, reload: 2.6, ammo: 'heavy', head: 2.5,
             spread: 3.0, adsMul: 0, bloomShot: 0, bloomMax: 0, recover: 10, fsa: false, fsaReset: 1,
             falloff: null, structure: 80, adsFov: 0.22, scope: true, speed: 280, gravity: 12, auto: false, range: 600, rarities: [2, 3, 4], botRange: 55 },
};
const AMMO_NAMES = { light: 'Leichte Mun.', medium: 'Mittlere Mun.', shells: 'Patronen', heavy: 'Schwere Mun.' };

const CONSUMABLES = {
  minishield: { name: 'Mini-Schild', icon: '🛡', time: 2.0, stack: 6, shield: 25, shieldCap: 50, rarity: 1, color: 0x3fa9ff },
  shield:     { name: 'Schildtrank', icon: '🧪', time: 5.0, stack: 3, shield: 50, shieldCap: 100, rarity: 2, color: 0x2060ff },
  bandage:    { name: 'Verband', icon: '🩹', time: 3.5, stack: 15, hp: 15, hpCap: 75, rarity: 0, color: 0xeeeeee },
  medkit:     { name: 'Medikit', icon: '➕', time: 8.0, stack: 3, hp: 100, hpCap: 100, rarity: 1, color: 0xff4040 },
};

const MATS = {
  wood:  { name: 'Holz',   hp: 150, time: 2.5, css: '#b07a43' },
  stone: { name: 'Stein',  hp: 300, time: 5.0, css: '#9aa0a8' },
  metal: { name: 'Metall', hp: 500, time: 7.0, css: '#6f93b8' },
};
const MAT_ORDER = ['wood', 'stone', 'metal'];

// ---------- Kosmetik-Katalog (eigene Designs) ----------
// Alle Einträge sind originale, prozedural erzeugte Designs.
const COSMETICS = {
  skin: [
    { id: 'skin_recruit', name: 'Rekrut', rarity: 0, c: { skin: 0xe0b48a, top: 0x6b7b8c, pants: 0x3d4a5c, shoes: 0x222222, acc: 0x9aa8b8 }, head: 'hair' },
    { id: 'skin_neon', name: 'Neon-Läuferin', rarity: 1, c: { skin: 0xc68a62, top: 0x18d8ff, pants: 0xff3fb4, shoes: 0xffffff, acc: 0x18d8ff }, head: 'visor', glow: true },
    { id: 'skin_shadow', name: 'Schattenagent', rarity: 2, c: { skin: 0x2a2440, top: 0x3a2f8f, pants: 0x2d2470, shoes: 0x111122, acc: 0xc04bff }, head: 'mask', glow: true },
    { id: 'skin_fox', name: 'Wüstenfuchs', rarity: 3, c: { skin: 0xd9893f, top: 0xe8c48a, pants: 0x8a5a2b, shoes: 0x4a3018, acc: 0xffffff }, head: 'ears' },
    { id: 'skin_knight', name: 'Goldritter', rarity: 4, c: { skin: 0xd4af37, top: 0xd4af37, pants: 0x8a6d1d, shoes: 0x5a4612, acc: 0xff3030 }, head: 'helmet', metal: true },
    { id: 'skin_robot', name: 'Bolt-9', rarity: 3, c: { skin: 0xb8c4d0, top: 0x4a5866, pants: 0x2e3842, shoes: 0x1a2028, acc: 0x40ff80 }, head: 'antenna', metal: true, glow: true },
    { id: 'skin_ranger', name: 'Waldläufer', rarity: 1, c: { skin: 0x9a6a48, top: 0x3f6b2f, pants: 0x4a3a28, shoes: 0x2a2018, acc: 0x8bc34a }, head: 'hat' },
    { id: 'skin_frost', name: 'Frostbrecher', rarity: 2, c: { skin: 0xdfefff, top: 0x8fd3ff, pants: 0x2f5f9f, shoes: 0xffffff, acc: 0xffffff }, head: 'helmet', glow: true },
  ],
  backbling: [
    { id: 'bb_none', name: 'Keiner', rarity: 0, kind: 'none' },
    { id: 'bb_pack', name: 'Feldrucksack', rarity: 0, kind: 'pack', color: 0x5a4a32 },
    { id: 'bb_cape', name: 'Umhang', rarity: 2, kind: 'cape', color: 0xb02030 },
    { id: 'bb_wings', name: 'Lichtflügel', rarity: 4, kind: 'wings', color: 0x8fe8ff },
    { id: 'bb_jet', name: 'Mini-Jetpack', rarity: 3, kind: 'jet', color: 0x707a88 },
    { id: 'bb_sword', name: 'Rückenschwert', rarity: 2, kind: 'sword', color: 0xc0c8d0 },
  ],
  pickaxe: [
    { id: 'pick_default', name: 'Standardhacke', rarity: 0, kind: 'pick', color: 0x8a8f99, handle: 0x6b4a2a },
    { id: 'pick_axe', name: 'Holzfälleraxt', rarity: 1, kind: 'axe', color: 0xb0b8c0, handle: 0x7a3a1a },
    { id: 'pick_hammer', name: 'Vorschlag', rarity: 2, kind: 'hammer', color: 0x505860, handle: 0x303030 },
    { id: 'pick_neon', name: 'Neonklinge', rarity: 3, kind: 'blade', color: 0x2ee6ff, handle: 0x202030, glow: true },
    { id: 'pick_gold', name: 'Goldene Hacke', rarity: 4, kind: 'pick', color: 0xffcc33, handle: 0x3a2a10, metal: true },
  ],
  wrap: [
    { id: 'wrap_none', name: 'Keine', rarity: 0, color: 0x2a2e36 },
    { id: 'wrap_red', name: 'Feuerrot', rarity: 1, color: 0xc0202a },
    { id: 'wrap_neon', name: 'Neon', rarity: 2, color: 0x0fd0ff, glow: true },
    { id: 'wrap_camo', name: 'Tarnmuster', rarity: 2, tex: 'camo' },
    { id: 'wrap_galaxy', name: 'Galaxie', rarity: 4, tex: 'galaxy' },
    { id: 'wrap_gold', name: 'Gold', rarity: 4, color: 0xffc83a, metal: true },
  ],
  emote: [
    { id: 'emote_bounce', name: 'Wippen', rarity: 0, bpm: 110 },
    { id: 'emote_wave', name: 'Winken', rarity: 0, bpm: 0 },
    { id: 'emote_robot', name: 'Robotertanz', rarity: 2, bpm: 120 },
    { id: 'emote_disco', name: 'Disco-Fieber', rarity: 3, bpm: 124 },
    { id: 'emote_flex', name: 'Muskelspiel', rarity: 1, bpm: 96 },
  ],
};
const COSMETIC_CATS = [
  { key: 'skin', name: 'Outfit' }, { key: 'backbling', name: 'Rucksack' }, { key: 'pickaxe', name: 'Spitzhacke' },
  { key: 'wrap', name: 'Lackierung' }, { key: 'emote', name: 'Emote' },
];
function cosmetic(cat, id) { return COSMETICS[cat].find(c => c.id === id) || COSMETICS[cat][0]; }

// ---------- Profil (lokal, „alles freigeschaltet“) ----------
const DEFAULT_PROFILE = {
  grantAll: true,
  owned: [],
  loadout: { skin: 'skin_shadow', backbling: 'bb_cape', pickaxe: 'pick_neon', wrap: 'wrap_neon', emote: 'emote_bounce' },
};
const profile = loadJSON('gridfall_profile', DEFAULT_PROFILE);
profile.loadout = Object.assign({}, DEFAULT_PROFILE.loadout, profile.loadout || {});
function ownsCosmetic(cat, id) {
  if (profile.grantAll) return COSMETICS[cat].some(c => c.id === id);
  return profile.owned.includes(id);
}

// ---------- Hilfsfunktionen ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
let rng = Math.random;
const rand = (a, b) => a + (b - a) * rng();
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(rng() * arr.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const DEG = Math.PI / 180;
function weighted(list) { // [{w, v}]
  let s = 0; for (const e of list) s += e.w;
  let r = rng() * s;
  for (const e of list) { if ((r -= e.w) <= 0) return e.v; }
  return list[list.length - 1].v;
}
function angleDiff(a, b) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

const BOT_NAMES = ['Pixel', 'Turbo', 'Nova', 'Blitz', 'Kobalt', 'Echo', 'Funke', 'Orbit', 'Vektor', 'Sturmi', 'Nebel', 'Quarz',
  'Raketa', 'Titan', 'Zephyr', 'Glitch', 'Krypto', 'Laser', 'Mako', 'Nugget', 'Polar', 'Radar', 'Sonic', 'Volt', 'Wirbel',
  'Yeti', 'Zorro', 'Brezel', 'Dynamo', 'Flux'];
