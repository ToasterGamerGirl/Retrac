// ============================================================
// 30 · Bausystem: Bauteile, Raster, Platzierung, Statik, Editieren
// ============================================================
const pieces = new Map();       // key -> Piece
const pieceList = new Set();
const WALL_T = 0.2, TILE = CELL / 3;

const GEO = {
  wallX: new T.BoxGeometry(WALL_T, CELL, CELL),
  wallZ: new T.BoxGeometry(CELL, CELL, WALL_T),
  tileX: new T.BoxGeometry(WALL_T, TILE, TILE),
  tileZ: new T.BoxGeometry(TILE, TILE, WALL_T),
  floor: new T.BoxGeometry(CELL, 0.2, CELL),
  floorQ: new T.BoxGeometry(CELL / 2, 0.2, CELL / 2),
  rampQ: new T.BoxGeometry(CELL / 2, 0.2, CELL / 2 * Math.SQRT2),
  pyrQ: [0, 1, 2, 3].map(t => {
    const sx = (t & 1) ? 1 : -1, sz = (t & 2) ? 1 : -1, H = PYR_H;
    const v = [0, H, 0, 2 * sx, 0, 0, 2 * sx, 0, 2 * sz, 0, H, 0, 2 * sx, 0, 2 * sz, 0, 0, 2 * sz];
    const uv = [0.5, 1, 0, 0, 1, 0, 0.5, 1, 0, 0, 1, 0];
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(v, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }),
};
const PYR_MATS = {};
function pyrMat(base) {
  if (!PYR_MATS[base.uuid]) { const m = base.clone(); m.side = T.DoubleSide; PYR_MATS[base.uuid] = m; }
  return PYR_MATS[base.uuid];
}

class Piece {
  constructor(info, matKey, owner, opts) {
    this.isPiece = true;
    this.info = info; this.type = info.type; this.key = pieceKey(info);
    this.matKey = matKey; this.owner = owner || null; // null = Welt
    this.maxHp = MATS[matKey].hp;
    const instant = opts && opts.instant;
    this.hp = instant ? this.maxHp : Math.max(1, this.maxHp * 0.1);
    this.buildT = instant ? MATS[matKey].time : 0;
    this.mask = (opts && opts.mask !== undefined) ? opts.mask : FULL_MASK[this.type];
    this.group = new T.Group();
    this.colliders = [];
    this.aabb = pieceAABB(info);
    this.rebuild();
    scene.add(this.group);
  }
  rebuild(ghostMat) {
    for (const c of this.colliders) removeCollider(c);
    this.colliders = [];
    while (this.group.children.length) this.group.remove(this.group.children[0]);
    const r = buildPieceVisual(this.info, this.mask, ghostMat || MAT_MATERIALS[this.matKey], !ghostMat, this);
    this.group.add(r.group);
    if (!ghostMat) { this.colliders = r.colliders; for (const c of this.colliders) addCollider(c); }
  }
  setVisible(v) { this.group.visible = v; }
  dispose() {
    for (const c of this.colliders) removeCollider(c);
    this.colliders = [];
    scene.remove(this.group);
  }
}

function pieceKey(i) {
  if (i.type === 'wall') return `W${i.axis}:${i.ix}:${i.level}:${i.iz}`;
  return `${i.type[0].toUpperCase()}:${i.ix}:${i.level}:${i.iz}`;
}
function pieceAABB(i) {
  const x = i.ix * CELL, z = i.iz * CELL, y = i.level * CELL;
  switch (i.type) {
    case 'wall': return i.axis === 'x' ? [x - .1, y, z, x + .1, y + CELL, z + CELL] : [x, y, z - .1, x + CELL, y + CELL, z + .1];
    case 'floor': return [x, y - .1, z, x + CELL, y + .1, z + CELL];
    case 'ramp': return [x, y, z, x + CELL, y + CELL, z + CELL];
    default: return [x, y, z, x + CELL, y + PYR_H, z + CELL];
  }
}
function pieceCenter(p) {
  const a = p.aabb; return new T.Vector3((a[0] + a[3]) / 2, (a[1] + a[4]) / 2, (a[2] + a[5]) / 2);
}

// Erzeugt Meshes + Kollider für ein Bauteil (auch für Ghost/Vorschau)
function buildPieceVisual(i, mask, mat, withColliders, owner) {
  const g = new T.Group(); const cols = [];
  const x0 = i.ix * CELL, z0 = i.iz * CELL, y0 = i.level * CELL;
  const shadow = renderer.shadowMap.enabled && withColliders;
  const add = (geo, m, px, py, pz) => {
    const mesh = new T.Mesh(geo, m); mesh.position.set(px, py, pz);
    mesh.castShadow = shadow; mesh.receiveShadow = shadow; g.add(mesh); return mesh;
  };
  if (i.type === 'wall') {
    if (mask === FULL_MASK.wall) {
      if (i.axis === 'x') { add(GEO.wallX, mat, x0, y0 + 2, z0 + 2); cols.push(boxCollider(x0 - .1, y0, z0, x0 + .1, y0 + CELL, z0 + CELL, owner)); }
      else { add(GEO.wallZ, mat, x0 + 2, y0 + 2, z0); cols.push(boxCollider(x0, y0, z0 - .1, x0 + CELL, y0 + CELL, z0 + .1, owner)); }
    } else {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        if (!(mask & (1 << (r * 3 + c)))) continue;
        const yy = y0 + CELL - (r + 0.5) * TILE, along = (c + 0.5) * TILE;
        if (i.axis === 'x') {
          add(GEO.tileX, mat, x0, yy, z0 + along);
          cols.push(boxCollider(x0 - .1, yy - TILE / 2, z0 + c * TILE, x0 + .1, yy + TILE / 2, z0 + (c + 1) * TILE, owner));
        } else {
          add(GEO.tileZ, mat, x0 + along, yy, z0);
          cols.push(boxCollider(x0 + c * TILE, yy - TILE / 2, z0 - .1, x0 + (c + 1) * TILE, yy + TILE / 2, z0 + .1, owner));
        }
      }
    }
  } else if (i.type === 'floor') {
    if (mask === FULL_MASK.floor) {
      add(GEO.floor, mat, x0 + 2, y0, z0 + 2);
      cols.push(boxCollider(x0, y0 - .1, z0, x0 + CELL, y0 + .1, z0 + CELL, owner));
    } else for (let q = 0; q < 4; q++) {
      if (!(mask & (1 << q))) continue;
      const qx = q & 1, qz = q >> 1;
      add(GEO.floorQ, mat, x0 + 1 + 2 * qx, y0, z0 + 1 + 2 * qz);
      cols.push(boxCollider(x0 + 2 * qx, y0 - .1, z0 + 2 * qz, x0 + 2 * qx + 2, y0 + .1, z0 + 2 * qz + 2, owner));
    }
  } else if (i.type === 'ramp') {
    const rg = new T.Group(); rg.position.set(x0 + 2, y0, z0 + 2); rg.rotation.y = [0, Math.PI / 2, Math.PI, -Math.PI / 2][i.dir];
    for (let t = 0; t < 4; t++) {
      if (!(mask & (1 << t))) continue;
      const iu = t >> 1, iv = t & 1, a = iu * 2 - 1, lx = iv * 2 - 1;
      const m = new T.Mesh(GEO.rampQ, mat); m.position.set(lx, a + 2 - 0.07, a); m.rotation.x = -Math.PI / 4;
      m.castShadow = shadow; m.receiveShadow = shadow; rg.add(m);
    }
    g.add(rg);
    cols.push({ kind: 'ramp', minx: x0, minz: z0, maxx: x0 + CELL, maxz: z0 + CELL, miny: y0, maxy: y0 + CELL, cx: x0 + 2, cz: z0 + 2, y0, dir: i.dir, mask, owner });
  } else {
    const pm = mat.isMeshBasicMaterial ? mat : pyrMat(mat);
    for (let t = 0; t < 4; t++) {
      if (!(mask & (1 << t))) continue;
      add(GEO.pyrQ[t], pm, x0 + 2, y0, z0 + 2);
    }
    cols.push({ kind: 'pyr', minx: x0, minz: z0, maxx: x0 + CELL, maxz: z0 + CELL, miny: y0, maxy: y0 + PYR_H, cx: x0 + 2, cz: z0 + 2, y0, mask, owner });
  }
  return { group: g, colliders: withColliders ? cols : [] };
}

// ---------- Platzieren / Entfernen ----------
function aabbTouch(a, b, e) {
  return a[0] <= b[3] + e && a[3] >= b[0] - e && a[1] <= b[4] + e && a[4] >= b[1] - e && a[2] <= b[5] + e && a[5] >= b[2] - e;
}
function neighborsOf(aabb, exclude) {
  const out = [], e = 0.12;
  const cols = queryColliders(aabb[0] - e, aabb[2] - e, aabb[3] + e, aabb[5] + e, []);
  const seen = new Set();
  for (const c of cols) {
    const p = c.owner; if (!p || !p.isPiece || p === exclude || seen.has(p)) continue;
    seen.add(p);
    if (aabbTouch(aabb, p.aabb, e)) out.push(p);
  }
  return out;
}
function canPlace(info) {
  if (info.level < 0 || info.level > 40) return false;
  const k = pieceKey(info);
  if (pieces.has(k)) return false;
  const a = pieceAABB(info);
  if (a[0] < -MAP_HALF || a[3] > MAP_HALF || a[2] < -MAP_HALF || a[5] > MAP_HALF) return false;
  if (info.level === 0) return true;
  return neighborsOf(a, null).length > 0;
}
function placePiece(info, matKey, owner, opts) {
  const p = new Piece(info, matKey, owner, opts);
  pieces.set(p.key, p); pieceList.add(p);
  return p;
}
function removePiece(p, collapse) {
  if (!pieces.has(p.key)) return;
  pieces.delete(p.key); pieceList.delete(p);
  const nb = collapse !== false ? neighborsOf(p.aabb, p) : [];
  p.dispose();
  if (editState && editState.piece === p) cancelEdit();
  if (collapse !== false) checkCollapse(nb);
}
function damagePiece(p, amount, attacker) {
  if (!pieces.has(p.key)) return;
  p.hp -= amount;
  if (p.hp <= 0) {
    spawnDebris(pieceCenter(p), p.matKey);
    Sound.destroy(pieceCenter(p));
    removePiece(p, true);
  }
}
// Statik: Teile ohne Verbindung zum Boden stürzen ein
function isGrounded(p) { return p.aabb[1] <= 0.15; }
function checkCollapse(starts) {
  const done = new Set();
  for (const s of starts) {
    if (done.has(s) || !pieces.has(s.key)) continue;
    const visited = new Set([s]); const queue = [s]; let grounded = false;
    while (queue.length && !grounded) {
      const cur = queue.shift();
      if (isGrounded(cur)) { grounded = true; break; }
      if (visited.size > 700) { grounded = true; break; }
      for (const n of neighborsOf(cur.aabb, cur)) if (!visited.has(n)) { visited.add(n); queue.push(n); }
    }
    for (const v of visited) done.add(v);
    if (!grounded) {
      let i = 0;
      for (const v of visited) {
        if (!pieces.has(v.key)) continue;
        if (i++ < 25) spawnDebris(pieceCenter(v), v.matKey);
        removePiece(v, false);
      }
      Sound.destroy(s.aabb ? pieceCenter(s) : null);
    }
  }
}

// ---------- Ziel-Bestimmung (Snap-to-Grid) ----------
function facingDir(yaw) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  if (Math.abs(fx) > Math.abs(fz)) return fx > 0 ? 1 : 3;
  return fz > 0 ? 0 : 2;
}
const _v1 = new T.Vector3(), _v2 = new T.Vector3();
function viewDir(yaw, pitch, out) {
  return out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}
// actor: {pos, yaw, pitch, groundCol, crouchH}
function computeBuildTarget(actor, type) {
  const pivot = _v1.set(actor.pos.x, actor.pos.y + (actor.eye || 1.6), actor.pos.z);
  const dir = viewDir(actor.yaw, actor.pitch, _v2);
  const maxD = (type === 'floor' || type === 'pyr') ? 4.6 : 3.3;
  const hit = raycast(pivot, dir, maxD, { ignoreActor: actor, noActors: true });
  const d = hit ? Math.max(0, hit.t - 0.05) : maxD;
  const P = new T.Vector3(pivot.x + dir.x * d, pivot.y + dir.y * d, pivot.z + dir.z * d);
  const tcx = Math.floor(P.x / CELL), tcz = Math.floor(P.z / CELL);
  const pcx = Math.floor(actor.pos.x / CELL), pcz = Math.floor(actor.pos.z / CELL);
  const fd = facingDir(actor.yaw);
  const same = tcx === pcx && tcz === pcz;
  if (type === 'floor' || type === 'pyr') {
    let level = Math.round(P.y / CELL);
    if (type === 'pyr') level = Math.floor((P.y + 0.6) / CELL);
    return { type, ix: tcx, iz: tcz, level: Math.max(0, level) };
  }
  // Basis-Höhe: Läuft der Spieler eine Rampe in Blickrichtung hoch, zählt das Rampenende
  let baseY = actor.pos.y;
  const gc = actor.groundCol;
  if (gc && gc.kind === 'ramp' && gc.dir === fd && !same) baseY = gc.y0 + CELL;
  let level = Math.floor((baseY + 0.3) / CELL);
  if (actor.pitch > 0.6) level += 1;
  level = Math.max(0, level);
  if (type === 'ramp') {
    return { type, ix: tcx, iz: tcz, level, dir: fd };
  }
  // Wand
  let ix, iz, axis;
  if (fd === 1 || fd === 3) {
    axis = 'x'; iz = tcz;
    if (fd === 1) ix = same ? tcx + 1 : tcx; else ix = same ? tcx : tcx + 1;
  } else {
    axis = 'z'; ix = tcx;
    if (fd === 0) iz = same ? tcz + 1 : tcz; else iz = same ? tcz : tcz + 1;
  }
  return { type: 'wall', axis, ix, iz, level };
}

// ---------- Ghost-Vorschau ----------
const ghost = { group: null, key: '', valid: false, info: null };
function updateGhost(info, valid) {
  const k = info ? pieceKey(info) + (info.dir || 0) + (valid ? 'v' : 'x') : '';
  if (k === ghost.key) return;
  ghost.key = k;
  if (ghost.group) { scene.remove(ghost.group); ghost.group = null; }
  ghost.info = info; ghost.valid = valid;
  if (!info) return;
  const r = buildPieceVisual(info, FULL_MASK[info.type], valid ? GHOST_MAT : GHOST_BAD, false, null);
  r.group.traverse(o => { o.renderOrder = 5; });
  ghost.group = r.group; scene.add(ghost.group);
}

// ============================================================
// Editieren
// ============================================================
let editState = null; // {piece, mask, dragging, dragAdd, overlay:[meshes], hover}
function editTileCount(type) { return type === 'wall' ? 9 : 4; }
// Kachel unter dem Fadenkreuz (ignoriert Maske, damit auch entfernte Kacheln wählbar sind)
function pickEditTile(piece, origin, dir) {
  const i = piece.info, x0 = i.ix * CELL, z0 = i.iz * CELL, y0 = i.level * CELL;
  if (i.type === 'wall') {
    if (i.axis === 'x') {
      if (Math.abs(dir.x) < 1e-6) return -1;
      const t = (x0 - origin.x) / dir.x; if (t < 0) return -1;
      const y = origin.y + dir.y * t, z = origin.z + dir.z * t;
      const c = Math.floor((z - z0) / TILE), r = Math.floor((y0 + CELL - y) / TILE);
      if (c < 0 || c > 2 || r < 0 || r > 2) return -1; return r * 3 + c;
    } else {
      if (Math.abs(dir.z) < 1e-6) return -1;
      const t = (z0 - origin.z) / dir.z; if (t < 0) return -1;
      const y = origin.y + dir.y * t, x = origin.x + dir.x * t;
      const c = Math.floor((x - x0) / TILE), r = Math.floor((y0 + CELL - y) / TILE);
      if (c < 0 || c > 2 || r < 0 || r > 2) return -1; return r * 3 + c;
    }
  }
  let px, pz;
  if (i.type === 'floor' || i.type === 'pyr') {
    const py = i.type === 'floor' ? y0 : y0 + PYR_H / 2;
    if (Math.abs(dir.y) < 1e-6) return -1;
    const t = (py - origin.y) / dir.y; if (t < 0) return -1;
    px = origin.x + dir.x * t; pz = origin.z + dir.z * t;
    if (px < x0 || px > x0 + CELL || pz < z0 || pz > z0 + CELL) return -1;
    return (px - x0 < 2 ? 0 : 1) + (pz - z0 < 2 ? 0 : 2);
  }
  // Rampe
  const c = piece.colliders[0]; if (!c) return -1;
  c.ignoreMaskForRay = true;
  const h = rayRamp(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, c, 20);
  c.ignoreMaskForRay = false;
  if (!h) return -1;
  px = origin.x + dir.x * h.t - c.cx; pz = origin.z + dir.z * h.t - c.cz;
  const [lx, lz] = rampLocal(c.dir, px, pz);
  return (lz < 0 ? 0 : 2) + (lx < 0 ? 0 : 1);
}
function buildEditOverlay(piece) {
  const i = piece.info, x0 = i.ix * CELL, z0 = i.iz * CELL, y0 = i.level * CELL;
  const meshes = [];
  const grp = new T.Group();
  for (let t = 0; t < editTileCount(i.type); t++) {
    let m;
    if (i.type === 'wall') {
      const r = Math.floor(t / 3), c = t % 3, yy = y0 + CELL - (r + .5) * TILE, along = (c + .5) * TILE;
      m = new T.Mesh(i.axis === 'x' ? GEO.tileX : GEO.tileZ, EDIT_ON);
      if (i.axis === 'x') m.position.set(x0, yy, z0 + along); else m.position.set(x0 + along, yy, z0);
      m.scale.set(i.axis === 'x' ? 1.3 : 0.94, 0.94, i.axis === 'x' ? 0.94 : 1.3);
    } else if (i.type === 'floor') {
      const qx = t & 1, qz = t >> 1;
      m = new T.Mesh(GEO.floorQ, EDIT_ON); m.position.set(x0 + 1 + 2 * qx, y0, z0 + 1 + 2 * qz); m.scale.set(.94, 1.4, .94);
    } else if (i.type === 'ramp') {
      const rg = new T.Group(); rg.position.set(x0 + 2, y0, z0 + 2); rg.rotation.y = [0, Math.PI / 2, Math.PI, -Math.PI / 2][i.dir];
      const iu = t >> 1, iv = t & 1, a = iu * 2 - 1, lx = iv * 2 - 1;
      m = new T.Mesh(GEO.rampQ, EDIT_ON); m.position.set(lx, a + 2 - 0.05, a); m.rotation.x = -Math.PI / 4; m.scale.set(.94, 1.5, .94);
      rg.add(m); grp.add(rg); meshes.push(m); continue;
    } else {
      m = new T.Mesh(GEO.pyrQ[t], EDIT_ON); m.position.set(x0 + 2, y0 + 0.04, z0 + 2); m.scale.set(.97, 1, .97);
    }
    m.renderOrder = 6;
    grp.add(m); meshes.push(m);
  }
  scene.add(grp);
  return { grp, meshes };
}
function refreshEditOverlay() {
  if (!editState) return;
  editState.overlay.meshes.forEach((m, t) => {
    m.material = t === editState.hover ? EDIT_HOVER : (editState.mask & (1 << t) ? EDIT_ON : EDIT_OFF);
  });
}
function canEditPiece(p, actor) {
  return p && (p.owner === null || p.owner === actor);
}
function startEdit(piece) {
  const ov = buildEditOverlay(piece);
  editState = { piece, mask: piece.mask, dragging: false, dragAdd: false, overlay: ov, hover: -1, lastTile: -1 };
  piece.setVisible(false);
  refreshEditOverlay();
}
function editPress(tile) {
  if (!editState || tile < 0) return;
  editState.dragging = true;
  editState.dragAdd = !(editState.mask & (1 << tile)); // erste Kachel bestimmt den Modus
  editApply(tile);
}
function editApply(tile) {
  if (!editState || tile < 0) return;
  if (editState.dragAdd) editState.mask |= (1 << tile); else editState.mask &= ~(1 << tile);
  editState.lastTile = tile;
  refreshEditOverlay();
}
function editMove(tile) {
  if (!editState) return;
  editState.hover = tile;
  if (editState.dragging && tile >= 0 && tile !== editState.lastTile) editApply(tile);
  refreshEditOverlay();
}
function editRelease() {
  if (!editState) return;
  editState.dragging = false;
  if (settings.editOnRelease && editState.mask !== editState.piece.mask) confirmEdit();
}
function validEditMask(type, mask) {
  return mask !== 0; // jede nicht-leere Form ist erlaubt
}
function closeEditOverlay() {
  if (!editState) return;
  scene.remove(editState.overlay.grp);
  if (pieces.has(editState.piece.key)) editState.piece.setVisible(true);
  editState = null;
}
function confirmEdit() {
  if (!editState) return;
  const p = editState.piece, m = editState.mask;
  if (validEditMask(p.type, m) && m !== p.mask && pieces.has(p.key)) {
    p.mask = m; p.rebuild(); Sound.build(pieceCenter(p));
    const nb = neighborsOf(p.aabb, p); checkCollapse(nb);
  }
  closeEditOverlay();
}
function resetEdit() {
  if (!editState) return;
  const p = editState.piece;
  if (p.mask !== FULL_MASK[p.type] && pieces.has(p.key)) { p.mask = FULL_MASK[p.type]; p.rebuild(); Sound.build(pieceCenter(p)); }
  closeEditOverlay();
}
function cancelEdit() { closeEditOverlay(); }
