// ============================================================
// 20 · Welt: Boden, Bäume, Felsen, Kisten, Häuser (aus Bauteilen), Truhen, Sturm
// ============================================================
const worldObjects = []; // abbaubare Objekte {kind, mat, hp, maxHp, mesh, colliders, pos}
const chests = [];
const pois = [];
let groundMesh = null;

const ground = (() => {
  const g = new T.PlaneGeometry(MAP_HALF * 2 + 400, MAP_HALF * 2 + 400);
  g.rotateX(-Math.PI / 2);
  const m = new T.Mesh(g, new T.MeshStandardMaterial({ map: TEX.grass, roughness: 1 }));
  m.receiveShadow = true;
  return m;
})();
scene.add(ground);
// Kartengrenze (sichtbarer Rand)
(() => {
  const m = new T.MeshBasicMaterial({ color: 0x3060ff, transparent: true, opacity: .15, side: T.DoubleSide, depthWrite: false });
  for (let i = 0; i < 4; i++) {
    const p = new T.Mesh(new T.PlaneGeometry(MAP_HALF * 2, 40), m);
    p.position.y = 20;
    if (i === 0) p.position.z = -MAP_HALF; if (i === 1) p.position.z = MAP_HALF;
    if (i === 2) { p.position.x = -MAP_HALF; p.rotation.y = Math.PI / 2; } if (i === 3) { p.position.x = MAP_HALF; p.rotation.y = Math.PI / 2; }
    scene.add(p);
  }
})();

const worldGroup = new T.Group(); scene.add(worldGroup);
const trunkGeo = new T.CylinderGeometry(0.35, 0.45, 4, 7);
const leafGeo = new T.IcosahedronGeometry(2.4, 0);
const rockGeo = new T.DodecahedronGeometry(1.6, 0);
const crateGeo = new T.BoxGeometry(2.2, 1.6, 1.4);
const trunkMat = new T.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 1 });
const leafMats = [0x3f9a3a, 0x2f8a40, 0x58b04a, 0xd8a030].map(c => new T.MeshStandardMaterial({ color: c, roughness: .9, flatShading: true }));
const rockMat = new T.MeshStandardMaterial({ color: 0x8a8f96, roughness: 1, flatShading: true });
const crateMat = new T.MeshStandardMaterial({ color: 0x5a8ab8, roughness: .5, metalness: .5 });

function addWorldObject(kind, x, z) {
  const o = { kind, pos: new T.Vector3(x, 0, z), colliders: [], isWorldObject: true };
  const shadow = renderer.shadowMap.enabled;
  const grp = new T.Group(); grp.position.set(x, 0, z);
  if (kind === 'tree') {
    const s = rand(0.85, 1.3);
    const tr = new T.Mesh(trunkGeo, trunkMat); tr.position.y = 2 * s; tr.scale.setScalar(s);
    const lf = new T.Mesh(leafGeo, pick(leafMats)); lf.position.y = 5 * s; lf.scale.set(s, s * 1.2, s); lf.rotation.y = rand(0, 6);
    tr.castShadow = lf.castShadow = shadow; grp.add(tr, lf);
    o.mat = 'wood'; o.maxHp = o.hp = 300; o.yield = 9;
    o.colliders.push(boxCollider(x - .45, 0, z - .45, x + .45, 4 * s, z + .45, o));
    o.colliders.push(boxCollider(x - 2.2 * s, 3 * s, z - 2.2 * s, x + 2.2 * s, 7.6 * s, z + 2.2 * s, o, { noMove: true }));
  } else if (kind === 'rock') {
    const s = rand(0.8, 1.4);
    const r = new T.Mesh(rockGeo, rockMat); r.scale.set(s * 1.2, s * 0.8, s); r.position.y = 0.7 * s; r.rotation.y = rand(0, 6);
    r.castShadow = r.receiveShadow = shadow; grp.add(r);
    o.mat = 'stone'; o.maxHp = o.hp = 400; o.yield = 8;
    o.colliders.push(boxCollider(x - 1.5 * s, 0, z - 1.3 * s, x + 1.5 * s, 1.6 * s, z + 1.3 * s, o));
  } else { // Metallkiste
    const r = new T.Mesh(crateGeo, crateMat); r.position.y = 0.8; const rot = rng() < .5;
    if (rot) r.rotation.y = Math.PI / 2;
    r.castShadow = r.receiveShadow = shadow; grp.add(r);
    o.mat = 'metal'; o.maxHp = o.hp = 350; o.yield = 7;
    const hx = rot ? .7 : 1.1, hz = rot ? 1.1 : .7;
    o.colliders.push(boxCollider(x - hx, 0, z - hz, x + hx, 1.6, z + hz, o));
  }
  o.mesh = grp; worldGroup.add(grp);
  for (const c of o.colliders) addCollider(c);
  worldObjects.push(o);
  return o;
}
function damageWorldObject(o, amount) {
  if (o.hp <= 0) return;
  o.hp -= amount;
  o.mesh.scale.setScalar(0.94); setTimeout(() => o.mesh && o.mesh.scale.setScalar(1), 70);
  if (o.hp <= 0) {
    for (const c of o.colliders) removeCollider(c);
    worldGroup.remove(o.mesh);
    spawnDebris(new T.Vector3(o.pos.x, 1.5, o.pos.z), o.mat);
  }
}

// ---------- Truhen ----------
const chestGeo = new T.BoxGeometry(1.1, 0.7, 0.7);
const lidGeo = new T.BoxGeometry(1.14, 0.25, 0.74);
const chestMat = new T.MeshStandardMaterial({ color: 0xe8b830, roughness: .4, metalness: .6, emissive: 0x553300, emissiveIntensity: .6 });
const chestTrim = new T.MeshStandardMaterial({ color: 0x6b3a12, roughness: .8 });
const chestGlowGeo = new T.SphereGeometry(1.1, 12, 8);
const chestGlowMat = new T.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: .18, blending: T.AdditiveBlending, depthWrite: false });
function addChest(x, y, z, rotY) {
  const grp = new T.Group(); grp.position.set(x, y, z); grp.rotation.y = rotY || 0;
  const b = new T.Mesh(chestGeo, chestMat); b.position.y = 0.35;
  const lid = new T.Group(); lid.position.set(0, 0.7, -0.35);
  const l = new T.Mesh(lidGeo, chestTrim); l.position.set(0, 0.12, 0.35); lid.add(l);
  const glow = new T.Mesh(chestGlowGeo, chestGlowMat); glow.position.y = 0.4;
  grp.add(b, lid, glow); worldGroup.add(grp);
  const ch = { pos: new T.Vector3(x, y, z), grp, lid, glow, opened: false };
  chests.push(ch);
  return ch;
}

// ---------- Häuser aus Bauteilen (editierbar & zerstörbar) ----------
const DOOR_MASK = FULL_MASK.wall & ~((1 << 4) | (1 << 7));
const WIN_MASK = FULL_MASK.wall & ~(1 << 4);
function buildHouse(cx, cz, w, d, floors, mat) {
  // cx, cz: Rasterzelle links unten; w,d in Zellen
  const placeW = (axis, ix, iz, level, mask) => {
    const info = { type: 'wall', axis, ix, iz, level };
    if (!pieces.has(pieceKey(info))) placePiece(info, mat, null, { instant: true, mask });
  };
  const doorSide = randi(0, 3), doorIdx = randi(0, (doorSide < 2 ? w : d) - 1);
  for (let lv = 0; lv < floors; lv++) {
    for (let i = 0; i < w; i++) {
      const m0 = (lv === 0 && doorSide === 0 && i === doorIdx) ? DOOR_MASK : (rng() < .3 ? WIN_MASK : FULL_MASK.wall);
      const m1 = (lv === 0 && doorSide === 1 && i === doorIdx) ? DOOR_MASK : (rng() < .3 ? WIN_MASK : FULL_MASK.wall);
      placeW('z', cx + i, cz, lv, m0); placeW('z', cx + i, cz + d, lv, m1);
    }
    for (let j = 0; j < d; j++) {
      const m0 = (lv === 0 && doorSide === 2 && j === doorIdx) ? DOOR_MASK : (rng() < .3 ? WIN_MASK : FULL_MASK.wall);
      const m1 = (lv === 0 && doorSide === 3 && j === doorIdx) ? DOOR_MASK : (rng() < .3 ? WIN_MASK : FULL_MASK.wall);
      placeW('x', cx, cz + j, lv, m0); placeW('x', cx + w, cz + j, lv, m1);
    }
    // Decke / oberer Boden
    for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) {
      if (floors > 1 && lv < floors - 1 && i === 0 && j === 0) continue; // Loch für Treppe
      placePiece({ type: 'floor', ix: cx + i, iz: cz + j, level: lv + 1 }, mat, null, { instant: true });
    }
  }
  // Treppe (Rampe) im Erdgeschoss, falls mehrstöckig
  if (floors > 1) {
    for (let lv = 0; lv < floors - 1; lv++) placePiece({ type: 'ramp', ix: cx, iz: cz, level: lv, dir: 0 }, mat, null, { instant: true });
  }
  // Dach
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) placePiece({ type: 'pyr', ix: cx + i, iz: cz + j, level: floors }, mat, null, { instant: true });
  // Truhe innen
  const ci = w > 1 ? 1 : 0, cj = d > 1 ? 1 : 0;
  if (rng() < 0.85) addChest((cx + ci) * CELL + 2, 0.1, (cz + cj) * CELL + 2, rand(0, 6));
  if (floors > 1 && rng() < .6) addChest((cx + w - 1) * CELL + 2, CELL + 0.1, (cz + d - 1) * CELL + 2, rand(0, 6));
}

const POI_NAMES = ['Neonhafen', 'Kiefernhain', 'Rostwerk', 'Sonnenplatz', 'Krähennest', 'Glimmerbucht', 'Ziegelhof'];
function generateWorld(seed) {
  rng = mulberry32(seed);
  pois.length = 0;
  const used = [];
  for (let i = 0; i < 7; i++) {
    let x, z, ok = false, tries = 0;
    while (!ok && tries++ < 200) {
      x = rand(-150, 150); z = rand(-150, 150);
      ok = used.every(u => Math.hypot(u[0] - x, u[1] - z) > 85);
    }
    used.push([x, z]);
    pois.push({ name: POI_NAMES[i], x, z });
    const n = randi(3, 5);
    const occ = [];
    for (let h = 0; h < n; h++) {
      const w = randi(1, 3), d = randi(1, 3), fl = rng() < .45 ? 2 : 1;
      let hx, hz, ok2 = false, t2 = 0;
      while (!ok2 && t2++ < 40) {
        hx = Math.floor((x + rand(-28, 28)) / CELL); hz = Math.floor((z + rand(-28, 28)) / CELL);
        ok2 = occ.every(o => hx + w + 1 < o[0] || o[0] + o[2] + 1 < hx || hz + d + 1 < o[1] || o[1] + o[3] + 1 < hz);
      }
      if (!ok2) continue;
      occ.push([hx, hz, w, d]);
      buildHouse(hx, hz, w, d, fl, pick(['wood', 'wood', 'stone', 'metal']));
    }
    for (let k = 0; k < 4; k++) addWorldObject('crate', x + rand(-35, 35), z + rand(-35, 35));
    for (let k = 0; k < 2; k++) addChest(x + rand(-30, 30), 0, z + rand(-30, 30), rand(0, 6));
  }
  const freeSpot = (r) => {
    for (let t = 0; t < 30; t++) {
      const x = rand(-MAP_HALF + 5, MAP_HALF - 5), z = rand(-MAP_HALF + 5, MAP_HALF - 5);
      if (queryColliders(x - r, z - r, x + r, z + r, []).length === 0) return [x, z];
    }
    return null;
  };
  for (let i = 0; i < 220; i++) { const s = freeSpot(2.5); if (s) addWorldObject('tree', s[0], s[1]); }
  for (let i = 0; i < 70; i++) { const s = freeSpot(2); if (s) addWorldObject('rock', s[0], s[1]); }
  for (let i = 0; i < 20; i++) { const s = freeSpot(2); if (s) addWorldObject('crate', s[0], s[1]); }
  // Bodenloot
  for (let i = 0; i < 70; i++) {
    const s = freeSpot(1.5); if (!s) continue;
    spawnLoot(rollLootItem(rng() < .6 ? 'weapon' : 'consumable'), new T.Vector3(s[0], 0, s[1]));
  }
  rng = Math.random;
}

function clearWorld() {
  for (const p of [...pieceList]) p.dispose();
  pieces.clear(); pieceList.clear();
  for (const o of worldObjects) { for (const c of o.colliders) removeCollider(c); worldGroup.remove(o.mesh); }
  worldObjects.length = 0;
  for (const c of chests) worldGroup.remove(c.grp);
  chests.length = 0;
  spatial.clear();
  for (const l of loot) scene.remove(l.mesh);
  loot.length = 0;
  for (const pr of projectiles) scene.remove(pr.mesh);
  projectiles.length = 0;
  while (worldGroup.children.length) worldGroup.remove(worldGroup.children[0]);
}

// ============================================================
// Sturm
// ============================================================
const STORM_PHASES = [
  { wait: 45, shrink: 35, radius: 170, dmg: 1 },
  { wait: 40, shrink: 30, radius: 110, dmg: 1 },
  { wait: 35, shrink: 25, radius: 65, dmg: 2 },
  { wait: 30, shrink: 20, radius: 35, dmg: 5 },
  { wait: 25, shrink: 18, radius: 15, dmg: 8 },
  { wait: 20, shrink: 15, radius: 3, dmg: 10 },
];
const storm = {
  phase: 0, t: 0, state: 'wait', cur: { x: 0, z: 0, r: 300 }, from: null, next: null, dmg: 1,
  mesh: (() => {
    const g = new T.CylinderGeometry(1, 1, 400, 96, 1, true);
    const m = new T.MeshBasicMaterial({ color: 0x9b30ff, transparent: true, opacity: .28, side: T.DoubleSide, depthWrite: false });
    const mesh = new T.Mesh(g, m); mesh.position.y = 150; mesh.renderOrder = 2; return mesh;
  })(),
};
scene.add(storm.mesh);
function resetStorm() {
  storm.phase = 0; storm.t = 0; storm.state = 'wait'; storm.cur = { x: 0, z: 0, r: 300 }; storm.dmg = 1;
  storm.next = pickNextCircle(storm.cur, STORM_PHASES[0].radius);
}
function pickNextCircle(c, r) {
  const maxOff = Math.max(0, c.r - r);
  const a = rand(0, Math.PI * 2), d = rand(0, maxOff * 0.8);
  let x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
  x = clamp(x, -MAP_HALF + r * .5, MAP_HALF - r * .5); z = clamp(z, -MAP_HALF + r * .5, MAP_HALF - r * .5);
  return { x, z, r };
}
function updateStorm(dt) {
  if (storm.phase >= STORM_PHASES.length) { storm.mesh.scale.set(storm.cur.r, 1, storm.cur.r); return; }
  const ph = STORM_PHASES[storm.phase];
  storm.t += dt;
  if (storm.state === 'wait' && storm.t >= ph.wait) { storm.state = 'shrink'; storm.t = 0; storm.from = Object.assign({}, storm.cur); }
  if (storm.state === 'shrink') {
    const k = clamp(storm.t / ph.shrink, 0, 1);
    storm.cur.x = lerp(storm.from.x, storm.next.x, k); storm.cur.z = lerp(storm.from.z, storm.next.z, k); storm.cur.r = lerp(storm.from.r, storm.next.r, k);
    storm.dmg = ph.dmg;
    if (k >= 1) {
      storm.phase++; storm.state = 'wait'; storm.t = 0;
      if (storm.phase < STORM_PHASES.length) storm.next = pickNextCircle(storm.cur, STORM_PHASES[storm.phase].radius);
    }
  }
  storm.mesh.position.x = storm.cur.x; storm.mesh.position.z = storm.cur.z;
  storm.mesh.scale.set(Math.max(storm.cur.r, 0.5), 1, Math.max(storm.cur.r, 0.5));
}
function inStorm(pos) { return Math.hypot(pos.x - storm.cur.x, pos.z - storm.cur.z) > storm.cur.r; }
function stormLabel() {
  if (storm.phase >= STORM_PHASES.length) return 'Finaler Kreis';
  const ph = STORM_PHASES[storm.phase];
  return storm.state === 'wait' ? `Sturm schließt in ${fmtTime(ph.wait - storm.t)}` : `Sturm schrumpft · ${fmtTime(ph.shrink - storm.t)}`;
}
