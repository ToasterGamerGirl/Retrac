// ============================================================
// 60 · Bewegung (geteilt) & Bot-KI
// ============================================================
const BOT_GRACE = 18; // Sekunden ohne Kämpfe zu Beginn (Absprungphase)
const DIFF = [
  { aim: 5.0, react: 1.0, build: 0.25, fireMul: 1.8, burst: [2, 4], pause: [0.9, 1.6], name: 'Leicht' },
  { aim: 3.2, react: 0.65, build: 0.5, fireMul: 1.3, burst: [3, 6], pause: [0.6, 1.1], name: 'Normal' },
  { aim: 1.8, react: 0.4, build: 0.8, fireMul: 1.05, burst: [5, 9], pause: [0.3, 0.6], name: 'Schwer' },
];
function applyMovement(a, wx, wz, speed, dt) {
  if (!a.onGround && wx === 0 && wz === 0) return;
  const accel = a.onGround ? (a.sliding ? 4 : 55) : 14;
  const tx = wx * speed, tz = wz * speed;
  let dx = tx - a.vel.x, dz = tz - a.vel.z;
  const len = Math.hypot(dx, dz), max = accel * dt;
  if (len > max) { dx *= max / len; dz *= max / len; }
  a.vel.x += dx; a.vel.z += dz;
}

function spawnBot(name, x, z) {
  const look = {
    skin: pick(COSMETICS.skin).id, backbling: pick(COSMETICS.backbling).id,
    pickaxe: pick(COSMETICS.pickaxe).id, wrap: pick(COSMETICS.wrap).id,
  };
  const a = new Actor(name, false, look);
  a.pos.set(x, 0, z); a.yaw = rand(0, Math.PI * 2);
  const wid = weighted([{ w: 35, v: 'ar' }, { w: 22, v: 'smg' }, { w: 25, v: 'shotgun' }, { w: 12, v: 'pistol' }, { w: 6, v: 'sniper' }]);
  const def = WEAPONS[wid];
  a.inv.slots[0] = { type: 'weapon', id: wid, rarity: pick(def.rarities), mag: def.mag };
  if (rng() < .5) a.inv.slots[1] = rollLootItem('consumable');
  a.inv.mats.wood = 120; a.shield = pick([0, 0, 25, 50]);
  a.inv.sel = 1;
  a.ai = { target: null, waypoint: null, thinkT: rand(0, .3), reactT: 0, strafe: 1, strafeT: 0, stuckT: 0, buildCd: 0, fireHold: 0, breakT: 0 };
  a.mode = 'combat';
  actors.push(a);
  refreshHeld(a);
  return a;
}
function hasLOS(from, to, ignore) {
  const d = new T.Vector3().subVectors(to, from); const len = d.length(); d.divideScalar(len);
  const hit = raycast(from, d, len, { ignoreActor: ignore, noActors: true });
  return !hit || hit.t >= len - 0.3;
}
function pickWaypoint(a) {
  const c = storm.next && storm.state === 'wait' ? storm.next : storm.cur;
  const r = Math.max(4, c.r * 0.8);
  for (let i = 0; i < 6; i++) {
    const ang = rand(0, Math.PI * 2), d = Math.sqrt(Math.random()) * r;
    const p = new T.Vector3(c.x + Math.cos(ang) * d, 0, c.z + Math.sin(ang) * d);
    if (p.distanceTo(a.pos) < 120 || i === 5) { p.x = clamp(p.x, -MAP_HALF + 3, MAP_HALF - 3); p.z = clamp(p.z, -MAP_HALF + 3, MAP_HALF - 3); return p; }
  }
}
function botThink(a) {
  const ai = a.ai, w = a.weaponDef, range = w ? Math.min(w.range, w.kind === 'projectile' ? 160 : 85) : 30;
  const eye = new T.Vector3(a.pos.x, a.pos.y + a.eye, a.pos.z);
  let best = null, bestD = Infinity;
  if (now < BOT_GRACE) { if (!ai.waypoint || ai.waypoint.distanceTo(a.pos) < 4) ai.waypoint = pickWaypoint(a); return; }
  for (const o of actors) {
    if (o === a || !o.alive || o.phase !== 'ground') continue;
    const d = o.pos.distanceTo(a.pos); if (d > range || d > bestD) continue;
    const tp = new T.Vector3(o.pos.x, o.pos.y + o.crouchH * .7, o.pos.z);
    if (!hasLOS(eye, tp, a)) continue;
    // Spieler wird leicht bevorzugt, damit es spannend bleibt
    const score = o.isPlayer ? d * 0.8 : d;
    if (score < bestD) { bestD = score; best = o; }
  }
  if (best !== ai.target) {
    ai.target = best;
    if (best) ai.reactT = DIFF[settings.difficulty].react + rand(0, .3);
  }
  if (best) ai.lastSeen = best.pos.clone();
  if (inStorm(a.pos)) ai.waypoint = new T.Vector3(storm.cur.x + rand(-5, 5), 0, storm.cur.z + rand(-5, 5));
  if (!ai.waypoint || ai.waypoint.distanceTo(a.pos) < 4) ai.waypoint = pickWaypoint(a);
}
function botOnDamaged(a, src) {
  const ai = a.ai; if (!ai || !src || src === a) return;
  if (!ai.target && src.alive) { ai.target = src; ai.reactT = 0.35; }
  const D = DIFF[settings.difficulty];
  if (now > ai.buildCd && a.inv.mats.wood >= PIECE_COST && rng() < D.build) {
    ai.buildCd = now + rand(2.5, 4.5);
    const yaw = Math.atan2(-(src.pos.x - a.pos.x), -(src.pos.z - a.pos.z));
    const fake = { pos: a.pos, yaw, pitch: 0, groundCol: a.groundCol, eye: a.eye };
    const types = rng() < .5 ? ['wall'] : ['wall', 'ramp'];
    for (const t of types) {
      const info = computeBuildTarget(fake, t);
      if (canPlace(info) && a.inv.mats.wood >= PIECE_COST) { a.inv.mats.wood -= PIECE_COST; placePiece(info, 'wood', a); Sound.build(a.pos); }
    }
  }
}
function botHeardShot(shooter) {
  for (const o of actors) {
    if (!o.ai || o === shooter || !o.alive || o.ai.target) continue;
    if (o.pos.distanceTo(shooter.pos) < 50 && rng() < .5) o.ai.waypoint = shooter.pos.clone();
  }
}
function updateBot(a, dt) {
  const ai = a.ai, D = DIFF[settings.difficulty];
  ai.thinkT -= dt;
  if (ai.thinkT <= 0) { ai.thinkT = 0.25; botThink(a); }
  if (ai.target && !ai.target.alive) ai.target = null;
  let wx = 0, wz = 0, wantYaw = a.yaw, wantPitch = 0;
  const t = ai.target, w = a.weaponDef;
  // Heilen, wenn sicher
  if (!t && a.hp < 75) {
    const ci = a.inv.slots.findIndex(s => s && s.type === 'consumable' && canConsume(a, s.id));
    if (ci >= 0 && !a.consume) { selectSlot(a, ci + 1); refreshHeld(a); startConsume(a); }
  } else if (a.inv.sel !== 1 && !a.consume && a.inv.slots[0]) { selectSlot(a, 1); refreshHeld(a); }
  if (t) {
    const dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z, d = Math.hypot(dx, dz);
    wantYaw = Math.atan2(-dx, -dz);
    const ty = t.pos.y + t.crouchH * .65 - (a.pos.y + a.eye);
    wantPitch = Math.atan2(ty, d);
    const desired = w ? w.botRange : 3;
    ai.strafeT -= dt; if (ai.strafeT <= 0) { ai.strafeT = rand(.6, 1.8); ai.strafe = rng() < .5 ? -1 : 1; }
    const fx = dx / (d || 1), fz = dz / (d || 1);
    let fwd = 0;
    if (d > desired * 1.3) fwd = 1; else if (d < desired * .6) fwd = -1;
    const strafeAmt = fwd === 0 ? 1 : .4;
    wx = fx * fwd + (-fz) * ai.strafe * strafeAmt; wz = fz * fwd + fx * ai.strafe * strafeAmt;
    // Feuern
    ai.reactT -= dt;
    if (ai.reactT <= 0 && w && !a.consume && d < w.range) {
      const yawErr = Math.abs(angleDiff(a.yaw, wantYaw));
      if (yawErr < 0.25) {
        const eye = new T.Vector3(a.pos.x, a.pos.y + a.eye, a.pos.z);
        const aimY = t.pos.y + (rng() < .2 ? t.crouchH - .2 : t.crouchH * .6);
        const to = new T.Vector3(t.pos.x, aimY, t.pos.z).sub(eye).normalize();
        const err = D.aim * DEG * (1 + d / 45);
        const g1 = (Math.random() + Math.random() + Math.random() - 1.5), g2 = (Math.random() + Math.random() + Math.random() - 1.5);
        const dir = coneDir(to, err, g1, g2);
        ai.fireHold -= dt;
        if (ai.fireHold <= 0) {
          if (fireWeapon(a, eye, dir)) {
            ai.fireHold = w.auto ? 0 : (1 / w.rate) * (D.fireMul - 1) + rand(0, .15);
            ai.burstLeft = (ai.burstLeft || randi(D.burst[0], D.burst[1])) - 1;
            if (ai.burstLeft <= 0) { ai.burstLeft = 0; ai.fireHold = rand(D.pause[0], D.pause[1]); }
          }
        }
      }
    }
  } else if (ai.waypoint) {
    const dx = ai.waypoint.x - a.pos.x, dz = ai.waypoint.z - a.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.5) { wx = dx / d; wz = dz / d; wantYaw = Math.atan2(-dx, -dz); }
  }
  const len = Math.hypot(wx, wz); if (len > 1) { wx /= len; wz /= len; }
  // Drehen
  const turn = 7 * dt;
  a.yaw += clamp(angleDiff(a.yaw, wantYaw), -turn, turn);
  a.pitch += clamp(wantPitch - a.pitch, -turn, turn);
  const speed = a.consume ? SPEED.consume : (t ? SPEED.run * .85 : SPEED.run);
  applyMovement(a, wx, wz, speed, dt);
  // Feststecken
  const moving = len > 0.1, spd = Math.hypot(a.vel.x, a.vel.z);
  if (moving && spd < 1.0) ai.stuckT += dt; else ai.stuckT = Math.max(0, ai.stuckT - dt);
  if (ai.stuckT > 0.35 && a.onGround) a.vel.y = JUMP_V;
  if (ai.stuckT > 1.2) {
    const bl = a.blocker;
    if (bl && bl.owner && bl.owner.isPiece && bl.owner.owner !== a) {
      ai.breakT -= dt;
      if (ai.breakT <= 0) { ai.breakT = 0.5; a.swingT = 0; damagePiece(bl.owner, 50, a); Sound.pickaxe(a.pos); }
    } else if (ai.stuckT > 2.5) { ai.waypoint = pickWaypoint(a); ai.stuckT = 0; ai.strafe *= -1; }
  }
}
