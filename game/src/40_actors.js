// ============================================================
// 40 · Charaktere: Modelle (Kosmetik), Animation, Akteure, Inventar, Loot
// ============================================================
const actors = [];
let player = null;

function stdMat(color, opts) {
  opts = opts || {};
  const m = new T.MeshStandardMaterial({ color, roughness: opts.metal ? .35 : .75, metalness: opts.metal ? .7 : 0 });
  if (opts.glow) { m.emissive = new T.Color(color); m.emissiveIntensity = opts.glowI || .8; }
  if (opts.map) m.map = opts.map;
  return m;
}
const B = (w, h, d) => new T.BoxGeometry(w, h, d);

// ---------- Waffen-Modelle ----------
function wrapMaterial(wrapId) {
  const w = cosmetic('wrap', wrapId);
  if (w.tex) return stdMat(0xffffff, { map: TEX[w.tex] });
  return stdMat(w.color, { metal: w.metal, glow: w.glow, glowI: .6 });
}
const darkGunMat = stdMat(0x1a1d22);
function buildWeaponModel(id, wrapId) {
  const g = new T.Group(), wm = wrapMaterial(wrapId), dm = darkGunMat;
  const add = (geo, m, x, y, z) => { const me = new T.Mesh(geo, m); me.position.set(x, y, z); g.add(me); return me; };
  switch (id) {
    case 'ar': add(B(.08, .12, .62), wm, 0, 0, -.2); add(B(.04, .04, .3), dm, 0, .02, -.62); add(B(.06, .18, .08), dm, 0, -.13, -.18);
      add(B(.07, .1, .22), wm, 0, -.02, .18); add(B(.05, .05, .12), dm, 0, .09, -.25); break;
    case 'smg': add(B(.08, .12, .4), wm, 0, 0, -.12); add(B(.04, .04, .15), dm, 0, .02, -.38); add(B(.05, .22, .07), dm, 0, -.15, -.1); break;
    case 'pistol': add(B(.06, .1, .26), wm, 0, 0, -.1); add(B(.05, .14, .07), dm, 0, -.1, 0); break;
    case 'shotgun': add(B(.09, .11, .5), wm, 0, 0, -.1); add(B(.05, .05, .5), dm, 0, .03, -.55); add(B(.08, .07, .2), dm, 0, -.05, -.45);
      add(B(.07, .12, .25), wm, 0, -.03, .25); break;
    case 'sniper': add(B(.08, .11, .8), wm, 0, 0, -.25); add(B(.035, .035, .45), dm, 0, .02, -.85); add(B(.07, .1, .25), wm, 0, -.02, .25);
      const sc = add(new T.CylinderGeometry(.04, .04, .3, 8), dm, 0, .1, -.25); sc.rotation.x = Math.PI / 2; break;
  }
  return g;
}
function buildPickaxeModel(pickId) {
  const p = cosmetic('pickaxe', pickId), g = new T.Group();
  const hm = stdMat(p.handle), km = stdMat(p.color, { metal: p.metal || p.kind !== 'blade', glow: p.glow });
  const h = new T.Mesh(new T.CylinderGeometry(.03, .03, .85, 6), hm); h.position.y = .3; g.add(h);
  if (p.kind === 'pick') { const k = new T.Mesh(B(.06, .08, .7), km); k.position.set(0, .68, 0); g.add(k); const t1 = new T.Mesh(new T.ConeGeometry(.04, .2, 4), km); t1.rotation.x = -Math.PI / 2; t1.position.set(0, .68, -.43); g.add(t1); }
  else if (p.kind === 'axe') { const k = new T.Mesh(B(.04, .3, .3), km); k.position.set(0, .62, -.15); g.add(k); }
  else if (p.kind === 'hammer') { const k = new T.Mesh(B(.22, .22, .4), km); k.position.set(0, .7, 0); g.add(k); }
  else { const k = new T.Mesh(B(.03, .5, .12), km); k.position.set(0, .85, -.05); g.add(k); }
  return g;
}

// ---------- Charakter ----------
function buildCharacter(look) {
  const skin = cosmetic('skin', look.skin), c = skin.c;
  const mk = (col, o) => stdMat(col, Object.assign({ metal: skin.metal }, o || {}));
  const mSkin = mk(c.skin), mTop = mk(c.top), mPants = mk(c.pants), mShoes = mk(c.shoes), mAcc = mk(c.acc, { glow: skin.glow, glowI: .9 });
  const root = new T.Group(), body = new T.Group(); root.add(body);
  const shadow = renderer.shadowMap.enabled;
  const mesh = (geo, m, x, y, z, parent) => { const me = new T.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = shadow; (parent || body).add(me); return me; };
  // Beine
  const legL = new T.Group(), legR = new T.Group(); legL.position.set(-.13, .9, 0); legR.position.set(.13, .9, 0); body.add(legL, legR);
  for (const L of [legL, legR]) { mesh(B(.22, .78, .24), mPants, 0, -.39, 0, L); mesh(B(.24, .14, .32), mShoes, 0, -.83, -.04, L); }
  // Torso
  const torso = new T.Group(); torso.position.y = .9; body.add(torso);
  mesh(B(.56, .54, .3), mTop, 0, .27, 0, torso);
  mesh(B(.58, .07, .32), mAcc, 0, .08, 0, torso);
  // Kopf
  const head = new T.Group(); head.position.y = .72; torso.add(head);
  const hb = mesh(B(.34, .36, .34), mSkin, 0, 0, 0, head);
  switch (skin.head) {
    case 'hair': mesh(B(.37, .12, .37), mk(0x3a2a1a), 0, .17, .02, head); mesh(B(.37, .2, .08), mk(0x3a2a1a), 0, .05, .16, head); break;
    case 'visor': mesh(B(.36, .1, .1), mAcc, 0, .03, -.16, head); mesh(B(.38, .1, .38), mk(c.top), 0, .17, 0, head); break;
    case 'mask': hb.material = mk(0x1a1530); mesh(B(.3, .05, .05), mAcc, 0, .04, -.17, head); mesh(B(.36, .08, .36), mAcc, 0, .2, 0, head); break;
    case 'ears': for (const s of [-1, 1]) { const e = mesh(new T.ConeGeometry(.08, .22, 4), mSkin, s * .12, .27, 0, head); e.rotation.y = Math.PI / 4; }
      mesh(B(.14, .1, .14), mAcc, 0, -.07, -.2, head); break;
    case 'helmet': mesh(new T.SphereGeometry(.24, 10, 8, 0, Math.PI * 2, 0, Math.PI / 1.6), mk(c.top, { metal: true }), 0, .02, 0, head);
      mesh(B(.04, .14, .34), mAcc, 0, .24, 0, head); mesh(B(.28, .05, .05), mk(0x111111), 0, .02, -.18, head); break;
    case 'antenna': mesh(B(.3, .06, .05), mAcc, 0, .03, -.17, head); mesh(new T.CylinderGeometry(.015, .015, .25, 4), mk(0x888888), .1, .3, 0, head); mesh(new T.SphereGeometry(.04, 6, 4), mAcc, .1, .43, 0, head); break;
    case 'hat': mesh(new T.CylinderGeometry(.32, .32, .03, 12), mk(c.acc), 0, .17, 0, head); mesh(new T.CylinderGeometry(.18, .2, .18, 10), mk(c.acc), 0, .26, 0, head); break;
  }
  // Arme
  const armL = new T.Group(), armR = new T.Group(); armL.position.set(-.36, .5, 0); armR.position.set(.36, .5, 0); torso.add(armL, armR);
  for (const A of [armL, armR]) { mesh(B(.15, .56, .17), mTop, 0, -.28, 0, A); mesh(B(.13, .12, .14), mSkin, 0, -.6, 0, A); }
  // Rucksack
  const back = new T.Group(); back.position.set(0, .3, .17); torso.add(back);
  const bb = cosmetic('backbling', look.backbling);
  const bm = stdMat(bb.color || 0x555555, { glow: bb.kind === 'wings', glowI: .5 });
  let cape = null;
  if (bb.kind === 'pack') { mesh(B(.42, .48, .2), bm, 0, 0, .1, back); mesh(B(.36, .14, .06), mAcc, 0, -.1, .22, back); }
  else if (bb.kind === 'cape') { cape = new T.Group(); cape.position.set(0, .22, .02); back.add(cape); const cm = new T.MeshStandardMaterial({ color: bb.color, side: T.DoubleSide }); mesh(new T.PlaneGeometry(.55, 1.1), cm, 0, -.55, 0, cape); }
  else if (bb.kind === 'wings') { for (const s of [-1, 1]) { const w = mesh(new T.PlaneGeometry(.6, .9), new T.MeshStandardMaterial({ color: bb.color, emissive: bb.color, emissiveIntensity: .5, side: T.DoubleSide, transparent: true, opacity: .8 }), s * .32, .1, .08, back); w.rotation.y = s * .6; w.rotation.z = -s * .3; } }
  else if (bb.kind === 'jet') { for (const s of [-1, 1]) { const j = mesh(new T.CylinderGeometry(.09, .07, .45, 8), bm, s * .12, 0, .12, back); mesh(new T.ConeGeometry(.07, .15, 8), stdMat(0xff8030, { glow: true }), s * .12, -.3, .12, back).rotation.x = Math.PI; } }
  else if (bb.kind === 'sword') { const s = mesh(B(.06, 1.0, .02), stdMat(bb.color, { metal: true }), 0, .1, .06, back); s.rotation.z = .5; mesh(B(.22, .05, .05), stdMat(0x6b4a2a), -.15, -.2, .06, back).rotation.z = .5; }
  // Waffenhalter (folgt Pitch)
  const mount = new T.Group(); mount.position.set(.2, .38, -.32); torso.add(mount);
  // Gleiter
  const glider = new T.Group(); glider.position.y = 2.6; glider.visible = false; root.add(glider);
  const gm = new T.MeshStandardMaterial({ color: c.acc, side: T.DoubleSide, emissive: c.acc, emissiveIntensity: .2 });
  const wing = new T.Mesh(new T.ConeGeometry(1.6, 1.2, 3, 1, true), gm); wing.rotation.x = Math.PI / 2; wing.scale.set(1, 1, .15); glider.add(wing);
  return { root, body, legL, legR, torso, head, armL, armR, back, cape, mount, glider, held: null, heldKey: '', look };
}
function disposeCharacter(m) { scene.remove(m.root); }

function setHeld(model, key, wrapId, pickId) {
  if (model.heldKey === key) return;
  if (model.held) model.mount.remove(model.held);
  model.held = null; model.heldKey = key;
  if (!key) return;
  if (key === 'pickaxe') { model.held = buildPickaxeModel(pickId); model.held.rotation.x = -Math.PI / 2; model.held.position.set(0, 0, .1); }
  else if (WEAPONS[key]) model.held = buildWeaponModel(key, wrapId);
  else if (key.startsWith('c_')) { const c = CONSUMABLES[key.slice(2)]; model.held = new T.Mesh(new T.CylinderGeometry(.07, .07, .18, 8), stdMat(c.color, { glow: true, glowI: .4 })); }
  if (model.held) model.mount.add(model.held);
}

// ---------- Prozedurale Animation ----------
function animateCharacter(a, dt) {
  const m = a.model; if (!m) return;
  m.root.position.copy(a.pos); m.root.rotation.y = a.yaw;
  a.animT = (a.animT || 0) + dt;
  const spd = Math.hypot(a.vel.x, a.vel.z);
  a.walkPhase = (a.walkPhase || 0) + dt * spd * 2.2;
  const sw = Math.sin(a.walkPhase) * Math.min(1, spd / 4) * 0.8;
  let legL = sw, legR = -sw, armLx = -sw * 0.6, armRx = sw * 0.6, armLz = 0, armRz = 0, bodyX = 0, bodyY = 0, torsoY = 0, headX = 0;
  const holding = !!m.held && !a.emote;
  m.glider.visible = a.phase === 'glide';
  if (a.phase === 'sky') { bodyX = -1.2; legL = .3; legR = .3; armLz = 1.2; armRz = -1.2; armLx = 0; armRx = 0; }
  else if (a.phase === 'glide') { legL = .2; legR = .2; armLx = Math.PI; armRx = Math.PI; }
  else if (a.sliding) { bodyX = .35; bodyY = -.45; legL = -1.2; legR = -1.0; }
  else if (a.crouch) { bodyY = -.38; legL = -1.1 + sw * .3; legR = .3 - sw * .3; bodyX = .1; }
  else if (!a.onGround) { legL = -.6; legR = .3; }
  if (a.emote) {
    const t = a.animT - a.emote.start, e = a.emote.id, bpm = cosmetic('emote', e).bpm || 100, bt = t * bpm / 60 * Math.PI;
    legL = legR = 0; armLx = armRx = armLz = armRz = 0;
    if (e === 'emote_bounce') { bodyY = -Math.abs(Math.sin(bt)) * .15; armLz = .4 + Math.sin(bt) * .3; armRz = -.4 - Math.sin(bt) * .3; headX = Math.sin(bt) * .2; }
    else if (e === 'emote_wave') { armRz = -2.6 + Math.sin(t * 8) * .4; }
    else if (e === 'emote_robot') { const s = Math.floor(bt / 1.5) % 4; armLx = [0, -1.57, -1.57, 0][s]; armRx = [-1.57, 0, -1.57, 0][s]; torsoY = [0, .4, -.4, 0][s]; legL = s === 1 ? -.4 : 0; legR = s === 3 ? -.4 : 0; }
    else if (e === 'emote_disco') { armRz = Math.sin(bt) > 0 ? -2.6 : -.3; armRx = 0; armLz = .3; bodyY = -Math.abs(Math.sin(bt)) * .1; torsoY = Math.sin(bt / 2) * .5; legL = Math.sin(bt) * .4; }
    else if (e === 'emote_flex') { armLz = 1.4; armRz = -1.4; armLx = 0; armRx = 0; const f = Math.sin(bt) * .5 + .5; armLz += f * .3; armRz -= f * .3; bodyY = -f * .05; }
  } else if (holding && a.phase === 'ground') {
    armRx = Math.PI / 2 + a.pitch * .8; armLx = Math.PI / 2 + a.pitch * .8; armLz = -.35; armRz = .1;
  }
  m.legL.rotation.x = legL; m.legR.rotation.x = legR;
  m.armL.rotation.set(armLx, 0, armLz); m.armR.rotation.set(armRx, 0, armRz);
  m.body.rotation.x = bodyX; m.body.position.y = bodyY; m.torso.rotation.y = torsoY; m.head.rotation.x = headX;
  // Waffe
  const recoil = a.recoil || 0; a.recoil = Math.max(0, recoil - dt * 6);
  m.mount.visible = !a.emote && a.phase === 'ground' && !(a.isPlayer && a.scoped);
  let mountRx = a.pitch + recoil * .3;
  if (m.heldKey === 'pickaxe') { const s = a.swingT > 0 ? Math.sin((1 - a.swingT / 0.45) * Math.PI) : 0; mountRx = a.pitch + s * 1.4 - .2; }
  m.mount.rotation.x = mountRx;
  if (m.cape) m.cape.rotation.x = Math.min(1.2, spd * .12 + Math.sin(a.animT * 3) * .05 + (a.onGround ? 0 : .4));
}

// ---------- Akteur ----------
let actorId = 0;
class Actor {
  constructor(name, isPlayer, look) {
    this.id = ++actorId; this.name = name; this.isPlayer = isPlayer;
    this.pos = new T.Vector3(); this.vel = new T.Vector3();
    this.yaw = 0; this.pitch = 0; this.r = P_RADIUS; this.h = P_HEIGHT;
    this.onGround = false; this.crouch = false; this.sliding = false; this.sprinting = false;
    this.hp = 100; this.shield = 0; this.alive = true; this.kills = 0; this.damageDealt = 0;
    this.inv = { slots: [null, null, null, null, null], sel: 0, ammo: { light: 0, medium: 0, shells: 0, heavy: 0 }, mats: { wood: 0, stone: 0, metal: 0 } };
    this.fireCd = 0; this.reloadT = 0; this.equipT = 0; this.bloom = 0; this.lastShot = -10; this.ads = false; this.consume = null; this.swingT = 0;
    this.phase = 'ground'; this.look = look; this.model = buildCharacter(look); scene.add(this.model.root);
    this.emote = null; this.matSel = 'wood';
  }
  get crouchH() { return (this.crouch || this.sliding) ? P_CROUCH_H : P_HEIGHT; }
  get eye() { return this.crouchH - 0.2; }
  get heldItem() { return this.inv.sel === 0 ? null : this.inv.slots[this.inv.sel - 1]; }
  get weaponDef() { const it = this.heldItem; return it && it.type === 'weapon' ? WEAPONS[it.id] : null; }
}

function selectSlot(a, s) {
  if (s === a.inv.sel) return;
  a.inv.sel = s; a.reloadT = 0; a.consume = null; a.equipT = 0.25; a.ads = false; a.swingT = 0;
}
function refreshHeld(a) {
  const it = a.heldItem;
  let key = 'pickaxe';
  if (a.mode === 'build' || a.mode === 'edit') key = '';
  else if (it) key = it.type === 'weapon' ? it.id : 'c_' + it.id;
  setHeld(a.model, key, a.look.wrap, a.look.pickaxe);
}

// ---------- Inventar ----------
function addToInventory(a, item) {
  if (item.type === 'ammo') { a.inv.ammo[item.ammo] = Math.min(999, a.inv.ammo[item.ammo] + item.count); return true; }
  if (item.type === 'mat') { a.inv.mats[item.mat] = Math.min(999, a.inv.mats[item.mat] + item.count); return true; }
  if (item.type === 'consumable') {
    const def = CONSUMABLES[item.id];
    for (const s of a.inv.slots) if (s && s.type === 'consumable' && s.id === item.id && s.count < def.stack) {
      const add = Math.min(def.stack - s.count, item.count); s.count += add; item.count -= add;
      if (item.count <= 0) return true;
    }
  }
  const free = a.inv.slots.indexOf(null);
  if (free >= 0) { a.inv.slots[free] = item; return true; }
  return false;
}
function dropFromSlot(a, idx) {
  const it = a.inv.slots[idx]; if (!it) return;
  a.inv.slots[idx] = null;
  const f = viewDir(a.yaw, 0, new T.Vector3());
  spawnLoot(it, a.pos.clone().addScaledVector(f, 1.2));
}

// ---------- Loot ----------
const loot = [];
function rollLootItem(cat) {
  if (cat === 'weapon') {
    const id = weighted([{ w: 30, v: 'ar' }, { w: 20, v: 'smg' }, { w: 25, v: 'shotgun' }, { w: 15, v: 'pistol' }, { w: 8, v: 'sniper' }]);
    const def = WEAPONS[id];
    const rw = [30, 30, 22, 13, 5];
    const rarity = weighted(def.rarities.map(r => ({ w: rw[r], v: r })));
    return { type: 'weapon', id, rarity, mag: def.mag };
  }
  if (cat === 'consumable') {
    const id = weighted([{ w: 30, v: 'minishield' }, { w: 15, v: 'shield' }, { w: 30, v: 'bandage' }, { w: 10, v: 'medkit' }]);
    const def = CONSUMABLES[id];
    return { type: 'consumable', id, count: id === 'bandage' ? 5 : id === 'minishield' ? 3 : 1, rarity: def.rarity };
  }
  if (cat === 'ammo') { const am = pick(['light', 'medium', 'shells', 'heavy']); return { type: 'ammo', ammo: am, count: { light: 30, medium: 30, shells: 8, heavy: 6 }[am] }; }
  const mat = pick(MAT_ORDER); return { type: 'mat', mat, count: 30 };
}
function itemName(it) {
  if (it.type === 'weapon') return WEAPONS[it.id].name;
  if (it.type === 'consumable') return CONSUMABLES[it.id].name + (it.count > 1 ? ' ×' + it.count : '');
  if (it.type === 'ammo') return AMMO_NAMES[it.ammo] + ' ×' + it.count;
  return MATS[it.mat].name + ' ×' + it.count;
}
function itemRarity(it) { return it.type === 'weapon' || it.type === 'consumable' ? (it.rarity || 0) : 0; }
const beamGeo = new T.CylinderGeometry(0.05, 0.05, 4, 6);
const beamMats = RARITY.map(r => new T.MeshBasicMaterial({ color: r.hex, transparent: true, opacity: .55, blending: T.AdditiveBlending, depthWrite: false }));
function spawnLoot(item, pos, vel) {
  const grp = new T.Group();
  let model;
  if (item.type === 'weapon') model = buildWeaponModel(item.id, 'wrap_none');
  else if (item.type === 'consumable') model = new T.Mesh(new T.CylinderGeometry(.12, .12, .3, 10), stdMat(CONSUMABLES[item.id].color, { glow: true, glowI: .3 }));
  else if (item.type === 'ammo') model = new T.Mesh(B(.35, .25, .25), stdMat(0x4a7a3a));
  else model = new T.Mesh(B(.35, .35, .35), MAT_MATERIALS[item.mat]);
  model.position.y = .45; grp.add(model);
  if (item.type === 'weapon' || item.type === 'consumable') { const b = new T.Mesh(beamGeo, beamMats[itemRarity(item)]); b.position.y = 2; grp.add(b); }
  grp.position.copy(pos); scene.add(grp);
  const l = { item, mesh: grp, model, pos: grp.position, vel: vel || new T.Vector3(), t: rand(0, 6), settled: !vel };
  loot.push(l);
  return l;
}
function removeLoot(l) { const i = loot.indexOf(l); if (i >= 0) loot.splice(i, 1); scene.remove(l.mesh); }
function updateLoot(dt) {
  for (const l of loot) {
    l.t += dt; l.model.rotation.y += dt * 1.2; l.model.position.y = .45 + Math.sin(l.t * 2) * .08;
    if (!l.settled) {
      l.vel.y -= 20 * dt; l.pos.addScaledVector(l.vel, dt);
      const b = { pos: l.pos, r: .2, h: .3 };
      const sup = supportHeight(b, l.pos.x, l.pos.z, l.pos.y + 0.6);
      if (l.pos.y <= sup) { l.pos.y = sup; l.vel.set(0, 0, 0); l.settled = true; }
    }
  }
}
function dropAllLoot(a) {
  const base = a.pos.clone();
  const items = a.inv.slots.filter(Boolean);
  for (const k of Object.keys(a.inv.ammo)) if (a.inv.ammo[k] > 0) items.push({ type: 'ammo', ammo: k, count: Math.min(a.inv.ammo[k], 60) });
  for (const k of MAT_ORDER) if (a.inv.mats[k] > 0) items.push({ type: 'mat', mat: k, count: Math.min(a.inv.mats[k], 100) });
  items.forEach((it, i) => {
    const ang = i / items.length * Math.PI * 2;
    spawnLoot(it, base.clone().add(new T.Vector3(0, 0.5, 0)), new T.Vector3(Math.cos(ang) * 2.5, 5, Math.sin(ang) * 2.5));
  });
}
function openChest(ch) {
  if (ch.opened) return;
  ch.opened = true; ch.lid.rotation.x = -1.9; ch.glow.visible = false;
  Sound.chest();
  const items = [rollLootItem('weapon'), rollLootItem('consumable'), rollLootItem('mat')];
  const w = items[0]; items.push({ type: 'ammo', ammo: WEAPONS[w.id].ammo, count: { light: 36, medium: 30, shells: 10, heavy: 6 }[WEAPONS[w.id].ammo] });
  if (rng() < .4) items.push(rollLootItem('ammo'));
  items.forEach((it, i) => {
    const ang = ch.grp.rotation.y + (i - (items.length - 1) / 2) * .5;
    spawnLoot(it, ch.pos.clone().add(new T.Vector3(0, .8, 0)), new T.Vector3(-Math.sin(ang) * 3, 5, -Math.cos(ang) * 3));
  });
}
