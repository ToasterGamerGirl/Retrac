// ============================================================
// 50 · Waffen: Hitscan, Shotgun, Projektile, Bloom, Schaden, Spitzhacke, Verbrauchsgüter
// ============================================================
let now = 0;
const projectiles = [];

function getSpread(a, w) {
  let s = w.spread;
  const spd = Math.hypot(a.vel.x, a.vel.z);
  if (!a.onGround) s *= 2.6;
  else if (a.sprinting) s *= 2.2;
  else if (spd > 0.6) s *= 1.5;
  else if (a.crouch) s *= 0.75;
  if (a.ads) s *= w.adsMul;
  s += a.bloom;
  // First-Shot-Accuracy: Stillstand + Pause seit letztem Schuss -> perfekte Präzision
  if (w.fsa && a.onGround && spd < 0.3 && now - a.lastShot >= w.fsaReset) s = 0;
  return Math.min(s, 14);
}
const _up = new T.Vector3(0, 1, 0), _r = new T.Vector3(), _u = new T.Vector3();
function coneDir(dir, angleRad, ox, oy) {
  // ox, oy: Offset im Bereich [-1,1] relativ zum Kegelradius
  _r.crossVectors(dir, _up); if (_r.lengthSq() < 1e-6) _r.set(1, 0, 0); _r.normalize();
  _u.crossVectors(_r, dir).normalize();
  const t = Math.tan(angleRad);
  return dir.clone().addScaledVector(_r, ox * t).addScaledVector(_u, oy * t).normalize();
}
function randomInDisk() { const r = Math.sqrt(Math.random()), th = Math.random() * Math.PI * 2; return [r * Math.cos(th), r * Math.sin(th)]; }
const SHOTGUN_PATTERN = [[0, 0], [.5, 0], [-.5, 0], [0, .5], [0, -.5], [.75, .75], [-.75, .75], [.75, -.75], [-.75, -.75], [0, 1]];

function falloffMult(w, d) {
  if (!w.falloff) return 1;
  const [[d0], [d1, m1]] = w.falloff;
  if (d <= d0) return 1; if (d >= d1) return m1;
  return lerp(1, m1, (d - d0) / (d1 - d0));
}
function muzzlePos(a) {
  const c = Math.cos(a.yaw), s = Math.sin(a.yaw);
  const lx = 0.22, ly = a.eye - 0.3, lz = -0.75;
  return new T.Vector3(a.pos.x + lx * c + lz * s, a.pos.y + ly, a.pos.z - lx * s + lz * c);
}

// ---------- Schaden ----------
function applyDamage(target, amount, src, head, weaponName) {
  if (!target.alive || amount <= 0) return 0;
  let rem = amount, shieldHit = false;
  if (target.shield > 0) { const s = Math.min(target.shield, rem); target.shield -= s; rem -= s; shieldHit = true; }
  target.hp -= rem;
  target.lastHurt = now;
  if (target.consume) target.consume = null;
  if (target.isPlayer) { UI.hurt(src); Sound.hurt(); }
  if (src && src.isPlayer && src !== target) { UI.damageNumber(target, amount, head, shieldHit); UI.hitmarker(head); Sound.hit(head); src.damageDealt += amount; }
  if (target.ai) botOnDamaged(target, src);
  if (target.hp <= 0) killActor(target, src, weaponName);
  return amount;
}
function killActor(t, src, weaponName) {
  t.alive = false; t.hp = 0;
  if (t.emote) stopEmote(t);
  t.model.root.rotation.z = Math.PI / 2; t.model.root.position.y += 0.3;
  setTimeout(() => disposeCharacter(t.model), 1500);
  dropAllLoot(t);
  if (src && src !== t) src.kills++;
  let msg;
  if (!src || src === t) msg = `${t.name} wurde vom Sturm erwischt`;
  else msg = `${src.name} eliminierte ${t.name}${weaponName ? ' · ' + weaponName : ''}`;
  UI.feed(msg, (src && src.isPlayer) || t.isPlayer);
  if (src && src.isPlayer && src !== t) { UI.announce('ELIMINIERT', t.name); Sound.elim(); }
  checkMatchEnd();
}

// ---------- Treffer anwenden ----------
function applyHit(a, w, it, hit, dist, perActor) {
  const rar = RARITY[it.rarity];
  if (hit.actor) {
    const head = hit.part === 'head';
    const dmg = w.dmg * rar.dmg * falloffMult(w, dist) * (head ? w.head : 1);
    if (perActor) { const e = perActor.get(hit.actor) || { dmg: 0, head: false }; e.dmg += dmg; e.head = e.head || head; perActor.set(hit.actor, e); }
    else applyDamage(hit.actor, dmg, a, head, w.name);
    spawnImpact(hit.point, 0xff4040, 3);
  } else if (hit.collider) {
    const o = hit.collider.owner;
    if (o && o.isPiece) { damagePiece(o, w.structure * rar.dmg, a); spawnImpact(hit.point, 0xffe0a0, 4); }
    else if (o && o.isWorldObject) { damageWorldObject(o, w.structure * 0.5); spawnImpact(hit.point, 0xdddddd, 3); }
    else spawnImpact(hit.point, 0xdddddd, 3);
  } else if (hit.ground) spawnImpact(hit.point, 0x9a8a60, 3);
}

// ---------- Feuern ----------
function canFire(a) { return a.fireCd <= 0 && a.reloadT <= 0 && a.equipT <= 0 && !a.consume; }
function fireWeapon(a, origin, dir) {
  const it = a.heldItem; if (!it || it.type !== 'weapon') return false;
  const w = WEAPONS[it.id];
  if (!canFire(a)) return false;
  if (it.mag <= 0) { startReload(a); return false; }
  const spread = getSpread(a, w) * DEG;
  it.mag--; a.fireCd = 1 / w.rate; a.recoil = 1;
  const muzzle = muzzlePos(a);
  if (w.kind === 'projectile') {
    const [ox, oy] = randomInDisk();
    const d = coneDir(dir, spread, ox, oy);
    // Startpunkt auf die Blicklinie, damit die Kugel dorthin fliegt, wohin gezielt wird
    const start = origin.clone();
    spawnProjectile(a, w, it, start, d.multiplyScalar(w.speed));
  } else if (w.kind === 'shotgun') {
    const per = new Map();
    for (let i = 0; i < w.pellets; i++) {
      const [px, py] = SHOTGUN_PATTERN[i % SHOTGUN_PATTERN.length];
      const d = coneDir(dir, spread * (a.ads ? .85 : 1) * (a.onGround ? 1 : 1.5), px + rand(-.12, .12), py + rand(-.12, .12));
      const hit = raycast(origin, d, w.range, { ignoreActor: a });
      const end = hit ? hit.point : origin.clone().addScaledVector(d, w.range);
      if (i % 3 === 0) spawnTracer(muzzle, end, 0xffe8a0);
      if (hit) applyHit(a, w, it, hit, hit.t, per);
    }
    for (const [target, e] of per) applyDamage(target, e.dmg, a, e.head, w.name);
  } else {
    const [ox, oy] = randomInDisk();
    const d = coneDir(dir, spread, ox, oy);
    const hit = raycast(origin, d, w.range, { ignoreActor: a });
    const end = hit ? hit.point : origin.clone().addScaledVector(d, w.range);
    spawnTracer(muzzle, end, 0xfff2a0);
    if (hit) applyHit(a, w, it, hit, hit.t, null);
  }
  a.bloom = Math.min(a.bloom + w.bloomShot, w.bloomMax);
  a.lastShot = now;
  Sound.shot(it.id, a.pos);
  if (a.ai) botHeardShot(a);
  return true;
}
function startReload(a) {
  const it = a.heldItem; if (!it || it.type !== 'weapon' || a.reloadT > 0) return;
  const w = WEAPONS[it.id];
  if (it.mag >= w.mag) return;
  if (!a.ai && a.inv.ammo[w.ammo] <= 0) return;
  a.reloadT = w.reload * RARITY[it.rarity].rel; a.ads = false;
  if (a.isPlayer) Sound.reload();
}
function updateWeaponTimers(a, dt) {
  a.fireCd -= dt; a.equipT -= dt; a.swingT -= dt;
  const w = a.weaponDef;
  if (w && now - a.lastShot > 0.12) a.bloom = Math.max(0, a.bloom - w.recover * dt);
  if (!w) a.bloom = 0;
  if (a.reloadT > 0) {
    a.reloadT -= dt;
    if (a.reloadT <= 0) {
      const it = a.heldItem;
      if (it && it.type === 'weapon') {
        const def = WEAPONS[it.id], need = def.mag - it.mag;
        const take = a.ai ? need : Math.min(need, a.inv.ammo[def.ammo]);
        it.mag += take; if (!a.ai) a.inv.ammo[def.ammo] -= take;
      }
      a.reloadT = 0;
    }
  }
  if (a.consume) {
    a.consume.t += dt;
    if (a.consume.t >= a.consume.dur) finishConsume(a);
  }
}

// ---------- Projektile (Scharfschütze, mit Bullet Drop) ----------
const bulletGeo = new T.SphereGeometry(0.08, 6, 4);
const bulletMat = new T.MeshBasicMaterial({ color: 0xfff0a0 });
function spawnProjectile(a, w, it, pos, vel) {
  const mesh = new T.Mesh(bulletGeo, bulletMat); mesh.position.copy(pos); scene.add(mesh);
  projectiles.push({ owner: a, w, it: { rarity: it.rarity }, pos: pos.clone(), vel, mesh, life: 3, start: pos.clone(), lastTrail: pos.clone() });
}
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i]; p.life -= dt;
    let done = p.life <= 0;
    const sub = 3;
    for (let s = 0; s < sub && !done; s++) {
      const h = dt / sub;
      p.vel.y -= p.w.gravity * h;
      const step = p.vel.clone().multiplyScalar(h), len = step.length();
      const d = step.clone().divideScalar(len);
      const hit = raycast(p.pos, d, len, { ignoreActor: p.owner });
      if (hit) { applyHit(p.owner, p.w, p.it, hit, p.start.distanceTo(hit.point), null); done = true; p.pos.copy(hit.point); }
      else p.pos.add(step);
    }
    p.mesh.position.copy(p.pos);
    if (p.pos.distanceTo(p.lastTrail) > 6) { spawnTracer(p.lastTrail, p.pos, 0xffffff); p.lastTrail.copy(p.pos); }
    if (done || p.pos.y < -5) { scene.remove(p.mesh); projectiles.splice(i, 1); }
  }
}

// ---------- Spitzhacke ----------
function swingPickaxe(a, origin, dir) {
  if (a.swingT > 0 || a.equipT > 0) return false;
  a.swingT = 0.45;
  const hit = raycast(origin, dir, 3.4, { ignoreActor: a });
  if (!hit) return true;
  if (hit.actor) { applyDamage(hit.actor, 20, a, false, 'Spitzhacke'); }
  else if (hit.collider) {
    const o = hit.collider.owner;
    if (o && o.isPiece) { damagePiece(o, 50, a); Sound.pickaxe(hit.point); }
    else if (o && o.isWorldObject && o.hp > 0) {
      const before = o.hp; damageWorldObject(o, 50);
      a.inv.mats[o.mat] = Math.min(999, a.inv.mats[o.mat] + o.yield + (before - 50 <= 0 ? o.yield : 0));
      Sound.pickaxe(hit.point);
      if (a.isPlayer) UI.matGain(o.mat, o.yield);
    }
  }
  spawnImpact(hit.point, 0xffffff, 3);
  return true;
}

// ---------- Verbrauchsgegenstände ----------
function canConsume(a, id) {
  const c = CONSUMABLES[id];
  if (c.shield) return a.shield < c.shieldCap;
  return a.hp < c.hpCap;
}
function startConsume(a) {
  const it = a.heldItem; if (!it || it.type !== 'consumable' || a.consume || a.equipT > 0) return;
  if (!canConsume(a, it.id)) { if (a.isPlayer) UI.toast(CONSUMABLES[it.id].shield ? 'Schild ist schon voll' : 'Gesundheit ist schon voll'); return; }
  a.consume = { t: 0, dur: CONSUMABLES[it.id].time, id: it.id, slot: a.inv.sel };
}
function finishConsume(a) {
  const c = a.consume; a.consume = null;
  const it = a.inv.slots[c.slot - 1];
  if (!it || it.type !== 'consumable' || it.id !== c.id) return;
  const def = CONSUMABLES[c.id];
  if (def.shield) a.shield = Math.min(def.shieldCap, a.shield + def.shield);
  if (def.hp) a.hp = Math.min(def.hpCap, a.hp + def.hp);
  it.count--; if (it.count <= 0) a.inv.slots[c.slot - 1] = null;
  if (a.isPlayer) Sound.pickup();
}
