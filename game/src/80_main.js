// ============================================================
// 80 · Spieler-Steuerung, Kamera, Match-Ablauf, Hauptschleife
// ============================================================
const TEST_MODE = /[?&]test\b/.test(location.search);
let state = 'menu';
let locked = false;
const keys = {};
const mouse = { left: false, right: false };
const aim = { origin: new T.Vector3(), dir: new T.Vector3(0, 0, -1), pivot: new T.Vector3() };
let lastPlaceT = 0, interactHold = 0, interactTarget = null, stormTick = 0, matchTime = 0, placeAtDeath = 0, endTimer = null;
let bigMap = false;

// ---------- Modi ----------
function setPlayerMode(m, buildType) {
  const p = player;
  if (p.mode === 'edit' && m !== 'edit') cancelEdit();
  if (m !== 'combat') { p.ads = false; p.consume = null; p.reloadT = 0; }
  if (p.emote) stopEmote(p);
  p.mode = m; if (buildType) p.buildType = buildType;
  if (m !== 'build') updateGhost(null);
  refreshHeld(p);
}
function stopEmote(a) { a.emote = null; if (a.isPlayer) Sound.stopEmoteBeat(); }

// ---------- Eingabe ----------
function playing() { return state === 'playing' && (locked || TEST_MODE) && player && player.alive; }
document.addEventListener('keydown', e => {
  if (state === 'playing' && ['Space', 'Tab', 'KeyF', 'KeyQ', 'KeyE', 'KeyV', 'KeyG', 'KeyB', 'KeyC', 'KeyX', 'KeyR', 'KeyM'].includes(e.code)) e.preventDefault();
  if (keys[e.code]) return; keys[e.code] = true;
  if (!playing()) return;
  handleKey(e.code);
});
document.addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'KeyX') interactHold = 0; });
function handleKey(code) {
  const p = player;
  if (code === 'Digit1') { setPlayerMode('combat'); selectSlot(p, 0); refreshHeld(p); }
  const n = { Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5 }[code];
  if (n && p.inv.slots[n - 1]) { setPlayerMode('combat'); selectSlot(p, n); refreshHeld(p); }
  const bt = { KeyQ: 'wall', KeyF: 'floor', KeyE: 'ramp', KeyV: 'pyr' }[code];
  if (bt && p.phase === 'ground') setPlayerMode('build', bt);
  if (code === 'KeyG' && p.phase === 'ground') {
    if (editState) { confirmEdit(); setPlayerMode(p.prevMode || 'combat'); }
    else {
      const hit = raycast(aim.origin, aim.dir, 12, { noActors: true, onlyPieces: true });
      const pc = hit && hit.collider && hit.collider.owner;
      if (pc && pc.isPiece && pieceCenter(pc).distanceTo(p.pos) < 7.5 && canEditPiece(pc, p)) {
        const prev = p.mode === 'build' ? 'build' : 'combat'; setPlayerMode('edit'); p.prevMode = prev; startEdit(pc);
      } else if (pc && pc.isPiece && !canEditPiece(pc, p)) UI.toast('Gegnerische Bauteile kannst du nicht editieren');
    }
  }
  if (code === 'KeyR') startReload(p);
  if (code === 'KeyC') toggleCrouch(p);
  if (code === 'Space') tryJump(p);
  if (code === 'KeyB' && p.onGround && p.phase === 'ground' && p.mode === 'combat' && !p.emote) {
    p.emote = { id: profile.loadout.emote, start: p.animT || 0 };
    Sound.startEmoteBeat(cosmetic('emote', profile.loadout.emote).bpm);
  }
  if (code === 'KeyX') tryPickup(p);
  if (code === 'KeyM') { bigMap = !bigMap; $('bigmap').classList.toggle('hidden', !bigMap); }
}
canvas.addEventListener('mousedown', e => {
  if (state === 'playing' && !locked && !TEST_MODE) { requestLock(); return; }
  if (!playing()) return;
  if (e.button === 0) { mouse.left = true; onPrimaryDown(); }
  if (e.button === 2) { mouse.right = true; onSecondaryDown(); }
});
document.addEventListener('mouseup', e => {
  if (e.button === 0) { mouse.left = false; if (state === 'playing' && player && player.mode === 'edit') { editRelease(); if (!editState) setPlayerMode(player.prevMode || 'combat'); } }
  if (e.button === 2) { mouse.right = false; if (player) player.ads = false; }
});
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('wheel', e => {
  if (!playing()) return;
  const p = player; if (p.mode !== 'combat') { setPlayerMode('combat'); return; }
  const order = [0, 1, 2, 3, 4, 5].filter(i => i === 0 || p.inv.slots[i - 1]);
  let idx = order.indexOf(p.inv.sel); idx = (idx + (e.deltaY > 0 ? 1 : -1) + order.length) % order.length;
  selectSlot(p, order[idx]); refreshHeld(p);
}, { passive: true });
document.addEventListener('mousemove', e => {
  if (!playing() || !locked) return;
  lookDelta(e.movementX, e.movementY);
});
function lookDelta(dx, dy) {
  const p = player;
  let k = 0.0022 * settings.sens;
  const w = p.weaponDef;
  if (p.ads && w) { const hip = hipVFov() * DEG, ads = hip * w.adsFov; k *= settings.adsMul * Math.tan(ads / 2) / Math.tan(hip / 2) / (w.scope ? 1 : 0.85); }
  p.yaw -= dx * k; p.pitch = clamp(p.pitch - dy * k, -1.45, 1.45);
}
function requestLock() { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  $('lockHint').classList.toggle('hidden', locked || state !== 'playing');
  if (!locked && state === 'playing' && !TEST_MODE) pauseGame();
});

function onPrimaryDown() {
  const p = player;
  if (p.emote) stopEmote(p);
  if (p.mode === 'build') { tryPlace(true); return; }
  if (p.mode === 'edit') { editPress(pickEditTile(editState.piece, aim.origin, aim.dir)); return; }
  combatAction(true);
}
function onSecondaryDown() {
  const p = player;
  if (p.mode === 'build') { const i = MAT_ORDER.indexOf(p.matSel); p.matSel = MAT_ORDER[(i + 1) % 3]; ghost.key = ''; return; }
  if (p.mode === 'edit') { resetEdit(); setPlayerMode(p.prevMode || 'combat'); return; }
  if (p.weaponDef && p.reloadT <= 0) { p.ads = true; if (p.sprinting) p.sprinting = false; }
}
function combatAction(edge) {
  const p = player;
  if (p.phase !== 'ground') return;
  if (p.inv.sel === 0) { swingPickaxe(p, aim.pivot, aim.dir); return; }
  const it = p.heldItem; if (!it) return;
  if (it.type === 'consumable') { if (edge) startConsume(p); return; }
  const w = WEAPONS[it.id];
  if (!edge && !w.auto) return;
  if (it.mag <= 0) { if (p.inv.ammo[w.ammo] > 0) startReload(p); return; }
  if (p.sprinting) { p.sprinting = false; }
  fireWeapon(p, aim.origin, aim.dir);
}
function tryPlace(edge) {
  const p = player;
  if (!ghost.info) return;
  if (!edge && now - lastPlaceT < 0.05) return;
  if (p.inv.mats[p.matSel] < PIECE_COST) { if (edge) UI.toast(`Nicht genug ${MATS[p.matSel].name}`); return; }
  if (!canPlace(ghost.info)) return;
  p.inv.mats[p.matSel] -= PIECE_COST;
  placePiece(Object.assign({}, ghost.info), p.matSel, p);
  Sound.build(p.pos); lastPlaceT = now; ghost.key = '';
}
function toggleCrouch(p) {
  if (p.phase !== 'ground') return;
  if (p.emote) stopEmote(p);
  const spd = Math.hypot(p.vel.x, p.vel.z);
  if (!p.crouch && p.sprinting && spd > 5.5 && p.onGround) {
    p.sliding = true; p.crouch = true; p.vel.x *= 1.2; p.vel.z *= 1.2; return;
  }
  if (p.crouch) { if (ceilingHeight(p, p.pos.x, p.pos.z) > p.pos.y + P_HEIGHT) { p.crouch = false; p.sliding = false; } }
  else p.crouch = true;
}
function tryJump(p) {
  if (p.emote) stopEmote(p);
  if (p.phase === 'sky') { p.phase = 'glide'; return; }
  if (!p.onGround || p.phase !== 'ground') return;
  if (p.crouch || p.sliding) { if (ceilingHeight(p, p.pos.x, p.pos.z) <= p.pos.y + P_HEIGHT) return; p.crouch = false; p.sliding = false; }
  p.vel.y = JUMP_V; p.onGround = false;
}
function interactCandidates(p) {
  let bestL = null, bestLd = 2.4, bestC = null, bestCd = 2.8;
  for (const l of loot) {
    if (l.item.type === 'ammo' || l.item.type === 'mat') continue;
    const d = Math.hypot(l.pos.x - p.pos.x, l.pos.z - p.pos.z); if (d < bestLd && Math.abs(l.pos.y - p.pos.y) < 2) { bestLd = d; bestL = l; }
  }
  for (const c of chests) {
    if (c.opened) continue;
    const d = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z); if (d < bestCd && Math.abs(c.pos.y - p.pos.y) < 2) { bestCd = d; bestC = c; }
  }
  return { loot: bestL, chest: bestC };
}
function tryPickup(p) {
  const { loot: l } = interactCandidates(p);
  if (!l) return;
  const it = l.item;
  if (addToInventory(p, it)) { removeLoot(l); Sound.pickup(); return; }
  // Inventar voll: mit aktuellem Slot tauschen
  if (p.inv.sel > 0) { dropFromSlot(p, p.inv.sel - 1); p.inv.slots[p.inv.sel - 1] = it; removeLoot(l); refreshHeld(p); Sound.pickup(); }
  else UI.toast('Inventar voll – wähle einen Slot zum Tauschen');
}

// ---------- Spieler-Update ----------
function hipVFov() { return 2 * Math.atan(Math.tan(settings.fov * DEG / 2) / (16 / 9)) / DEG; }
function updatePlayer(dt) {
  const p = player;
  if (!p.alive) return;
  const inputOk = playing();
  let f = 0, s = 0;
  if (inputOk) { f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0); s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0); }
  if (p.emote && (f || s || !p.onGround)) stopEmote(p);
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
  let wx = fx * f + rx * s, wz = fz * f + rz * s; const wl = Math.hypot(wx, wz); if (wl > 0) { wx /= wl; wz /= wl; }

  if (p.phase === 'sky' || p.phase === 'glide') {
    const below = supportHeight({ pos: p.pos, r: .4 }, p.pos.x, p.pos.z, p.pos.y);
    const hAbove = p.pos.y - below;
    if (p.phase === 'sky' && hAbove < 28) p.phase = 'glide';
    p.gravScale = 0;
    const dive = p.phase === 'sky' && p.pitch < -0.6 && f > 0;
    p.vel.y = p.phase === 'sky' ? (dive ? -32 : -20) : -5.5;
    applyMovement(p, wx, wz, p.phase === 'sky' ? SPEED.sky : SPEED.glide, dt * 3);
    p.onGround = false;
    moveBody(p, dt);
    if (p.onGround) { p.phase = 'ground'; p.gravScale = 1; refreshHeld(p); }
    return;
  }
  // Sprint
  p.sprinting = inputOk && keys.ShiftLeft && f > 0 && !p.ads && !p.consume && !p.crouch && p.mode !== 'edit' && p.reloadT <= 0;
  if (keys.ShiftLeft && p.crouch && !p.sliding && f > 0 && ceilingHeight(p, p.pos.x, p.pos.z) > p.pos.y + P_HEIGHT) p.crouch = false;
  let speed = SPEED.run;
  if (p.sprinting) speed = SPEED.sprint;
  if (p.crouch) speed = SPEED.crouch;
  if (p.ads) speed = SPEED.ads;
  if (p.consume) speed = SPEED.consume;
  if (p.sliding) {
    const gc = p.groundCol;
    if (gc && gc.kind === 'ramp') { const [dx, dz] = DIR_VEC[gc.dir]; p.vel.x -= dx * 10 * dt; p.vel.z -= dz * 10 * dt; }
    else { p.vel.x *= (1 - 1.1 * dt); p.vel.z *= (1 - 1.1 * dt); }
    if (Math.hypot(p.vel.x, p.vel.z) < 3) p.sliding = false;
    applyMovement(p, wx, wz, Math.max(speed, Math.hypot(p.vel.x, p.vel.z)), dt);
  } else applyMovement(p, wx, wz, speed, dt);
  p.h = p.crouchH;
  moveBody(p, dt);
  // Aktionen bei gehaltener Taste
  if (inputOk && mouse.left) {
    if (p.mode === 'build' && settings.turbo) tryPlace(false);
    else if (p.mode === 'combat') combatAction(false);
  }
  // Baumodus-Vorschau
  if (p.mode === 'build') {
    const info = computeBuildTarget(p, p.buildType);
    updateGhost(info, canPlace(info) && p.inv.mats[p.matSel] >= PIECE_COST);
  }
  if (p.mode === 'edit') {
    if (!editState || !pieces.has(editState.piece.key) || pieceCenter(editState.piece).distanceTo(p.pos) > 9) { cancelEdit(); setPlayerMode(p.prevMode || 'combat'); }
    else editMove(pickEditTile(editState.piece, aim.origin, aim.dir));
  }
  // Interaktion
  const ic = interactCandidates(p);
  for (let i = loot.length - 1; i >= 0; i--) {
    const l = loot[i]; if (l.item.type !== 'ammo' && l.item.type !== 'mat') continue;
    if (l.pos.distanceTo(p.pos) < 1.8) { addToInventory(p, l.item); removeLoot(l); Sound.pickup(); }
  }
  if (ic.chest && (!ic.loot || ic.chest.pos.distanceTo(p.pos) < ic.loot.pos.distanceTo(p.pos))) {
    UI.setPrompt(`<kbd>X</kbd> halten – Truhe öffnen`);
    if (inputOk && keys.KeyX) { if (interactTarget !== ic.chest) { interactTarget = ic.chest; interactHold = 0; } interactHold += dt; UI.setProgress(interactHold / 0.35); if (interactHold >= 0.35) { openChest(ic.chest); interactHold = 0; } }
    else UI.setProgress(p.consume ? p.consume.t / p.consume.dur : null);
  } else if (ic.loot) {
    const it = ic.loot.item;
    UI.setPrompt(`<kbd>X</kbd> ${itemName(it)} <span style="color:${RARITY[itemRarity(it)].css}">(${RARITY[itemRarity(it)].name})</span>`);
    UI.setProgress(p.consume ? p.consume.t / p.consume.dur : null);
  } else {
    UI.setPrompt(p.consume ? `${CONSUMABLES[p.consume.id].name} wird benutzt…` : p.reloadT > 0 ? 'Nachladen…' : null);
    UI.setProgress(p.consume ? p.consume.t / p.consume.dur : p.reloadT > 0 && p.weaponDef ? 1 - p.reloadT / (p.weaponDef.reload * RARITY[p.heldItem.rarity].rel) : null);
  }
  // Bauteil-HP unter dem Fadenkreuz
  const hh = raycast(aim.origin, aim.dir, 30, { noActors: true, onlyPieces: true });
  UI.setPieceHp(hh && hh.collider && hh.collider.owner && hh.collider.owner.isPiece && p.mode !== 'edit' ? hh.collider.owner : null);
  // Modus-Anzeige
  if (p.mode === 'build') UI.setMode(`BAUEN · ${MATS[p.matSel].name} · RMB Material wechseln · G Editieren`);
  else if (p.mode === 'edit') UI.setMode(`EDITIEREN · LMB wählen/ziehen · ${settings.editOnRelease ? 'Loslassen bestätigt' : 'G bestätigt'} · RMB zurücksetzen`);
  else if (p.phase !== 'ground') UI.setMode(null);
  else UI.setMode(null);
}

// ---------- Kamera ----------
let camDist = 3.2, camFov = 70;
function updateCamera(dt) {
  const p = player;
  const w = p.weaponDef;
  p.scoped = p.ads && w && w.scope && p.mode === 'combat';
  let fov = hipVFov();
  let dist = 3.4, side = 0.85, up = 0.3;
  if (p.phase !== 'ground') { dist = 7; side = 0; up = 1; }
  if (p.ads && w && p.mode === 'combat') { fov *= w.adsFov; dist = w.scope ? 0.3 : 1.6; side = w.scope ? 0.2 : 0.6; }
  if (p.sprinting) fov += 4;
  if (!p.alive) { dist = 6; side = 0; up = 1.5; }
  camFov = lerp(camFov, fov, 1 - Math.exp(-dt * (p.scoped ? 30 : 14)));
  camDist = lerp(camDist, dist, 1 - Math.exp(-dt * 14));
  camera.fov = camFov; camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  const pivot = aim.pivot.set(p.pos.x, p.pos.y + p.eye, p.pos.z);
  const fwd = viewDir(p.yaw, p.pitch, new T.Vector3());
  const right = new T.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
  const offset = new T.Vector3().addScaledVector(right, side).add(new T.Vector3(0, up, 0));
  const shoulder = pivot.clone().add(offset);
  // Kamerakollision
  let d = camDist;
  const back = fwd.clone().negate();
  const sideHit = raycast(pivot, offset.clone().normalize(), offset.length() + 0.2, { noActors: true });
  if (sideHit && sideHit.t < offset.length() + 0.2) shoulder.copy(pivot).addScaledVector(offset.clone().normalize(), Math.max(0, sideHit.t - 0.2));
  const hit = raycast(shoulder, back, camDist + 0.3, { noActors: true });
  if (hit) d = Math.min(d, Math.max(0.2, hit.t - 0.25));
  camera.position.copy(shoulder).addScaledVector(back, d);
  camera.rotation.set(p.pitch, p.yaw, 0);
  // Zielstrahl: startet auf Höhe des Spielers, damit nichts hinter ihm getroffen wird
  const t0 = Math.max(0, new T.Vector3().subVectors(pivot, camera.position).dot(fwd));
  aim.origin.copy(camera.position).addScaledVector(fwd, t0);
  aim.dir.copy(fwd);
  p.model.root.visible = !p.scoped;
  // Schatten folgen dem Spieler
  sun.position.set(p.pos.x + 60, 120, p.pos.z + 40); sun.target.position.set(p.pos.x, 0, p.pos.z);
}

// ---------- Match ----------
function startMatch() {
  Sound.init();
  clearTimeout(endTimer);
  for (const a of actors) disposeCharacter(a.model);
  actors.length = 0;
  if (editState) closeEditOverlay();
  updateGhost(null);
  renderer.shadowMap.enabled = !!settings.shadows;
  clearWorld();
  generateWorld((Math.random() * 1e9) | 0);
  resetStorm();
  now = 0; matchTime = 0; stormTick = 0;
  player = new Actor('Du', true, Object.assign({}, profile.loadout));
  player.mode = 'combat'; player.buildType = 'wall';
  player.inv.mats.wood = 60;
  const ang = Math.random() * Math.PI * 2;
  player.pos.set(Math.cos(ang) * 110, 110, Math.sin(ang) * 110);
  player.yaw = Math.atan2(player.pos.x, player.pos.z); player.pitch = -0.5;
  player.phase = 'sky';
  actors.push(player);
  refreshHeld(player);
  const names = [...BOT_NAMES].sort(() => Math.random() - .5);
  for (let i = 0; i < settings.bots; i++) {
    const poi = pick(pois);
    let x = 0, z = 0;
    for (let t = 0; t < 20; t++) {
      x = poi.x + rand(-45, 45); z = poi.z + rand(-45, 45);
      if (queryColliders(x - 1, z - 1, x + 1, z + 1, []).length === 0) break;
    }
    spawnBot(names[i % names.length] + (i >= names.length ? i : ''), x, z);
  }
  state = 'playing';
  UI.hide('menu'); UI.hide('endScreen'); UI.hide('pause'); UI.show('hud');
  UI.lastHudKey = '';
  $('feed').innerHTML = '';
  UI.announce('Absprung!', 'Leertaste = Gleiter · W + nach unten schauen = Sturzflug');
  if (!TEST_MODE) requestLock();
}
function checkMatchEnd() {
  if (state !== 'playing' || !player) return;
  const alive = actors.filter(a => a.alive).length;
  if (!player.alive) { if (!placeAtDeath) placeAtDeath = alive + 1; endMatch(false); }
  else if (alive === 1) endMatch(true);
}
function endMatch(win) {
  if (state !== 'playing') return;
  state = 'ending';
  const place = win ? 1 : placeAtDeath;
  endTimer = setTimeout(() => {
    state = 'ended';
    if (document.pointerLockElement) document.exitPointerLock();
    Sound.stopEmoteBeat();
    $('endTitle').textContent = win ? '#1 · SIEG!' : '#' + place;
    $('endTitle').classList.toggle('lose', !win);
    $('endSub').textContent = win ? 'Du hast als Letzte/r überlebt!' : 'Du wurdest eliminiert';
    $('endStats').innerHTML = `Eliminierungen: <b>${player.kills}</b> · Schaden: <b>${Math.round(player.damageDealt)}</b> · Zeit: <b>${fmtTime(matchTime)}</b>`;
    UI.show('endScreen');
    placeAtDeath = 0;
  }, win ? 2500 : 1800);
  if (win) UI.announce('#1 · SIEG!', 'Letzte/r Überlebende/r');
}
function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused'; UI.show('pause');
}
function resumeGame() { UI.hide('pause'); UI.hide('settings'); UI.hide('help'); state = 'playing'; if (!TEST_MODE) requestLock(); }
function toLobby() {
  clearTimeout(endTimer);
  state = 'menu'; Sound.stopEmoteBeat();
  ['hud', 'pause', 'endScreen', 'settings', 'help'].forEach(id => UI.hide(id));
  UI.show('menu'); UI.renderLoadoutInfo(); Lobby.rebuild();
  if (document.pointerLockElement) document.exitPointerLock();
}

// ---------- Hauptschleife ----------
function update(dt) {
  now += dt; matchTime += dt;
  updatePlayer(dt);
  for (const a of actors) {
    if (!a.alive) continue;
    updateWeaponTimers(a, dt);
    if (a.ai) { updateBot(a, dt); a.h = a.crouchH; moveBody(a, dt); }
    animateCharacter(a, dt);
  }
  // Sturmschaden (direkt auf Gesundheit)
  stormTick += dt;
  if (stormTick >= 1) {
    stormTick -= 1;
    for (const a of actors) if (a.alive && inStorm(a.pos)) {
      a.hp -= storm.dmg; if (a.isPlayer) { UI.hurt(); }
      if (a.hp <= 0) killActor(a, null, null);
    }
  }
  updateStorm(dt);
  updateProjectiles(dt);
  updateLoot(dt);
  updateEffects(dt);
  if (player) {
    updateCamera(dt);
    UI.updateHud(dt);
    const w = player.weaponDef;
    UI.updateCrosshair(w && player.mode === 'combat' ? getSpread(player, w) : 0, player.mode === 'combat' && player.inv.sel !== 0 && w ? 'combat' : 'build');
    $('scope').style.opacity = player.scoped ? 1 : 0;
    $('crosshair').style.visibility = player.scoped ? 'hidden' : 'visible';
  }
}
let mapT = 0, fpsAcc = 0, fpsN = 0;
let lastFrame = performance.now();
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - lastFrame) / 1000); lastFrame = t;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { $('fps').textContent = settings.showFps ? Math.round(fpsN / fpsAcc) + ' FPS' : ''; fpsAcc = 0; fpsN = 0; }
  if (state === 'menu') { Lobby.render(dt); return; }
  if (state === 'playing' || state === 'ending') update(dt);
  else if (player) { updateEffects(0); }
  if (player) {
    mapT -= dt;
    if (mapT <= 0) { mapT = 0.2; UI.drawMap($('minimap'), false); if (bigMap) UI.drawMap($('bigmap'), true); }
  }
  renderer.render(scene, camera);
}

// ---------- Buttons ----------
$('btnPlay').onclick = () => startMatch();
$('btnLocker').onclick = () => { UI.renderLocker(); UI.show('locker'); };
$('lockerBack').onclick = () => UI.hide('locker');
$('btnSettings').onclick = () => { UI.renderSettings(); UI.show('settings'); };
$('settingsBack').onclick = () => UI.hide('settings');
$('btnHelp').onclick = () => UI.show('help');
$('helpBack').onclick = () => UI.hide('help');
$('btnResume').onclick = () => resumeGame();
$('btnPauseSettings').onclick = () => { UI.renderSettings(); UI.show('settings'); };
$('btnPauseHelp').onclick = () => UI.show('help');
$('btnQuit').onclick = () => toLobby();
$('btnAgain').onclick = () => startMatch();
$('btnLobby').onclick = () => toLobby();
document.addEventListener('keydown', e => { if (e.code === 'KeyB' && state === 'menu') Lobby.playEmote(); });

if ('ontouchstart' in window && !matchMedia('(pointer:fine)').matches) {
  const w = document.createElement('div'); w.id = 'touchWarn';
  w.textContent = 'GRIDFALL braucht Maus & Tastatur (PC/Mac). Auf dem Handy kannst du dir nur den Spind ansehen.';
  document.body.appendChild(w);
}

UI.init();
Lobby.init();
UI.renderLoadoutInfo();
requestAnimationFrame(frame);

// Test-/Debug-Schnittstelle
window.GRIDFALL = {
  startMatch, get player() { return player; }, actors, pieces, settings, get state() { return state; },
  handleKey, onPrimaryDown, onSecondaryDown, lookDelta, setPlayerMode, computeBuildTarget, canPlace, placePiece,
  editState: () => editState, editRelease, confirmEdit, raycast, aim, keys, mouse, storm, loot, chests, openChest, update,
  get now() { return now; },
};
