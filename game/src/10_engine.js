// ============================================================
// 10 · Renderer, Texturen, Kollision (Spatial Hash), Raycasts, Physik, Sound, Effekte
// ============================================================
const canvas = document.getElementById('game');
const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = T.sRGBEncoding;
renderer.shadowMap.enabled = !!settings.shadows;
renderer.shadowMap.type = T.PCFSoftShadowMap;

const scene = new T.Scene();
const SKY = 0x8fd0ff;
scene.background = new T.Color(SKY);
scene.fog = new T.Fog(SKY, 140, 420);
const camera = new T.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 900);
camera.rotation.order = 'YXZ';

const hemi = new T.HemisphereLight(0xdff2ff, 0x5a7a3a, 0.75);
scene.add(hemi);
const sun = new T.DirectionalLight(0xfff2dd, 1.05);
sun.position.set(60, 120, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -70; sun.shadow.camera.right = 70;
sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 300;
sun.shadow.bias = -0.0008;
scene.add(sun); scene.add(sun.target);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ---------- Prozedurale Texturen ----------
function canvasTex(size, draw, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); draw(g, size);
  const t = new T.CanvasTexture(c);
  t.encoding = T.sRGBEncoding;
  if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat, repeat); }
  t.anisotropy = 4;
  return t;
}
const TEX = {
  wood: canvasTex(128, (g, s) => {
    g.fillStyle = '#a8713c'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 4; i++) {
      const y = i * s / 4;
      g.fillStyle = ['#b67d45', '#9c6634', '#ad7640', '#a26c38'][i]; g.fillRect(0, y + 2, s, s / 4 - 4);
      g.strokeStyle = 'rgba(60,30,10,.35)'; g.lineWidth = 1;
      for (let k = 0; k < 6; k++) { g.beginPath(); const yy = y + 5 + Math.random() * (s / 4 - 10); g.moveTo(0, yy); g.bezierCurveTo(s * .3, yy + 3, s * .6, yy - 3, s, yy + 1); g.stroke(); }
      g.fillStyle = '#5a3416'; g.fillRect(0, y, s, 2);
      g.fillStyle = '#3a2410'; g.beginPath(); g.arc(8, y + s / 8, 2.5, 0, 7); g.arc(s - 8, y + s / 8, 2.5, 0, 7); g.fill();
    }
    g.strokeStyle = '#5a3416'; g.lineWidth = 4; g.strokeRect(2, 2, s - 4, s - 4);
  }),
  stone: canvasTex(128, (g, s) => {
    g.fillStyle = '#6e737a'; g.fillRect(0, 0, s, s);
    const rows = 5, h = s / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * 20;
      for (let x = -off; x < s; x += 40) {
        const v = 140 + Math.random() * 40 | 0;
        g.fillStyle = `rgb(${v},${v + 4},${v + 10})`; g.fillRect(x + 2, r * h + 2, 36, h - 4);
      }
    }
    g.strokeStyle = '#4a4e55'; g.lineWidth = 4; g.strokeRect(2, 2, s - 4, s - 4);
  }),
  metal: canvasTex(128, (g, s) => {
    const gr = g.createLinearGradient(0, 0, s, s); gr.addColorStop(0, '#8fb0cf'); gr.addColorStop(1, '#5d7d9c');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#3e5670'; g.lineWidth = 3;
    g.strokeRect(6, 6, s - 12, s - 12); g.beginPath(); g.moveTo(s / 2, 6); g.lineTo(s / 2, s - 6); g.stroke();
    g.fillStyle = '#d0e0f0';
    for (const [x, y] of [[12, 12], [s - 12, 12], [12, s - 12], [s - 12, s - 12], [s / 2, 12], [s / 2, s - 12]]) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(255,255,255,.15)'; g.lineWidth = 1;
    for (let i = 0; i < 20; i++) { g.beginPath(); const y = Math.random() * s; g.moveTo(0, y); g.lineTo(s, y + 4); g.stroke(); }
  }),
  grass: canvasTex(256, (g, s) => {
    g.fillStyle = '#5fae3e'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2500; i++) {
      const v = Math.random(); g.fillStyle = v < .5 ? 'rgba(70,140,40,.5)' : 'rgba(130,200,80,.4)';
      g.fillRect(Math.random() * s, Math.random() * s, 2, 3);
    }
  }, 80),
  camo: canvasTex(64, (g, s) => {
    g.fillStyle = '#4a5a32'; g.fillRect(0, 0, s, s);
    for (const c of ['#6b7a42', '#2e3a1e', '#8a7a52']) for (let i = 0; i < 7; i++) { g.fillStyle = c; g.beginPath(); g.ellipse(Math.random() * s, Math.random() * s, 4 + Math.random() * 8, 3 + Math.random() * 5, Math.random() * 3, 0, 7); g.fill(); }
  }),
  galaxy: canvasTex(64, (g, s) => {
    const gr = g.createLinearGradient(0, 0, s, s); gr.addColorStop(0, '#1a0640'); gr.addColorStop(.5, '#4a0a80'); gr.addColorStop(1, '#0a2a70');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,255,255,${Math.random()})`; g.fillRect(Math.random() * s, Math.random() * s, 1, 1); }
  }),
};

const MAT_MATERIALS = {
  wood: new T.MeshStandardMaterial({ map: TEX.wood, roughness: .9 }),
  stone: new T.MeshStandardMaterial({ map: TEX.stone, roughness: .95 }),
  metal: new T.MeshStandardMaterial({ map: TEX.metal, roughness: .5, metalness: .4 }),
};
const GHOST_MAT = new T.MeshBasicMaterial({ color: 0x4fb8ff, transparent: true, opacity: .38, depthWrite: false });
const GHOST_BAD = new T.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: .32, depthWrite: false });
const EDIT_ON = new T.MeshBasicMaterial({ color: 0x5fd0ff, transparent: true, opacity: .55, depthWrite: false, side: T.DoubleSide });
const EDIT_OFF = new T.MeshBasicMaterial({ color: 0x0a1a3a, transparent: true, opacity: .18, depthWrite: false, side: T.DoubleSide });
const EDIT_HOVER = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .7, depthWrite: false, side: T.DoubleSide });

// ============================================================
// Spatial Hash für Kollider (XZ, Zellen à CELL)
// Kollider-Typen: box | ramp | pyr
// ============================================================
const spatial = new Map();
let colStamp = 1;
const hk = (cx, cz) => (cx + 512) * 1024 + (cz + 512);
function addCollider(c) {
  c.cells = [];
  const x0 = Math.floor(c.minx / CELL), x1 = Math.floor((c.maxx - 1e-6) / CELL);
  const z0 = Math.floor(c.minz / CELL), z1 = Math.floor((c.maxz - 1e-6) / CELL);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const k = hk(x, z); let s = spatial.get(k); if (!s) { s = []; spatial.set(k, s); }
    s.push(c); c.cells.push(k);
  }
  c.stamp = 0;
}
function removeCollider(c) {
  if (!c.cells) return;
  for (const k of c.cells) { const s = spatial.get(k); if (s) { const i = s.indexOf(c); if (i >= 0) s.splice(i, 1); } }
  c.cells = null;
}
function queryColliders(minx, minz, maxx, maxz, out) {
  out.length = 0; colStamp++;
  const x0 = Math.floor(minx / CELL), x1 = Math.floor(maxx / CELL), z0 = Math.floor(minz / CELL), z1 = Math.floor(maxz / CELL);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const s = spatial.get(hk(x, z)); if (!s) continue;
    for (const c of s) { if (c.stamp !== colStamp) { c.stamp = colStamp; out.push(c); } }
  }
  return out;
}
function boxCollider(minx, miny, minz, maxx, maxy, maxz, owner, extra) {
  return Object.assign({ kind: 'box', minx, miny, minz, maxx, maxy, maxz, owner }, extra || {});
}

// Rampen-Lokalkoordinaten: dir 0:+z, 1:+x, 2:-z, 3:-x
function rampLocal(dir, dx, dz) {
  switch (dir) {
    case 0: return [dx, dz];
    case 1: return [-dz, dx];
    case 2: return [-dx, -dz];
    default: return [dz, -dx];
  }
}
const DIR_VEC = [[0, 1], [1, 0], [0, -1], [-1, 0]];
// Oberflächenhöhe eines Rampen-/Pyramiden-Kolliders an (x,z) oder null
function surfaceAt(c, x, z, ignoreMask) {
  const dx = x - c.cx, dz = z - c.cz;
  if (dx < -2 || dx > 2 || dz < -2 || dz > 2) return null;
  if (c.kind === 'ramp') {
    const [lx, lz] = rampLocal(c.dir, dx, dz);
    const tile = (lz < 0 ? 0 : 2) + (lx < 0 ? 0 : 1);
    if (!ignoreMask && !(c.mask & (1 << tile))) return null;
    return c.y0 + (lz + 2);
  }
  // pyr
  const tile = (dx < 0 ? 0 : 1) + (dz < 0 ? 0 : 2);
  if (!ignoreMask && !(c.mask & (1 << tile))) return null;
  const s = Math.max(Math.abs(dx), Math.abs(dz)) / 2;
  return c.y0 + PYR_H * (1 - s);
}

// ============================================================
// Raycast (eigene Implementierung, konsistent mit Kollision)
// ============================================================
const _rayCols = [];
function rayBox(ox, oy, oz, dx, dy, dz, c, maxT) {
  let tmin = 0, tmax = maxT;
  const o = [ox, oy, oz], d = [dx, dy, dz], mn = [c.minx, c.miny, c.minz], mx = [c.maxx, c.maxy, c.maxz];
  let nAxis = -1, nSign = 0;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < mn[i] || o[i] > mx[i]) return null; continue; }
    let t1 = (mn[i] - o[i]) / d[i], t2 = (mx[i] - o[i]) / d[i], s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; nAxis = i; nSign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (nAxis === -1) return null; // Ursprung im Kollider
  return { t: tmin, axis: nAxis, sign: nSign };
}
function rayRamp(ox, oy, oz, dx, dy, dz, c, maxT) {
  const [ax, az] = DIR_VEC[c.dir];
  const f0 = oy - ax * (ox - c.cx) - az * (oz - c.cz) - c.y0 - 2;
  const f1 = dy - ax * dx - az * dz;
  if (Math.abs(f1) < 1e-9) return null;
  const t = -f0 / f1;
  if (t < 0 || t > maxT) return null;
  if (surfaceAt(c, ox + dx * t, oz + dz * t, c.ignoreMaskForRay) === null) return null;
  return { t };
}
function rayPyr(ox, oy, oz, dx, dy, dz, c, maxT) {
  let best = null;
  for (const [ax, az] of DIR_VEC) {
    // y - y0 - H + (H/2)(ax*ddx+az*ddz) = 0
    const k = PYR_H / 2;
    const f0 = oy - c.y0 - PYR_H + k * (ax * (ox - c.cx) + az * (oz - c.cz));
    const f1 = dy + k * (ax * dx + az * dz);
    if (Math.abs(f1) < 1e-9) continue;
    const t = -f0 / f1; if (t < 0 || t > maxT || (best && t >= best.t)) continue;
    const px = ox + dx * t - c.cx, pz = oz + dz * t - c.cz;
    const along = ax * px + az * pz, perp = Math.abs(az * px - ax * pz);
    if (along < perp - 1e-6 || along > 2) continue;
    const tile = (px < 0 ? 0 : 1) + (pz < 0 ? 0 : 2);
    if (!(c.mask & (1 << tile))) continue;
    best = { t };
  }
  return best;
}
// Ergebnis: {t, point, collider|null, actor|null, part, ground}
function raycast(origin, dir, maxDist, opts) {
  opts = opts || {};
  const ox = origin.x, oy = origin.y, oz = origin.z, dx = dir.x, dy = dir.y, dz = dir.z;
  let best = null;
  // Boden
  if (dy < -1e-6) { const t = -oy / dy; if (t >= 0 && t <= maxDist) best = { t, ground: true }; }
  // DDA über Rasterzellen
  let cx = Math.floor(ox / CELL), cz = Math.floor(oz / CELL);
  const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDx = Math.abs(dx) > 1e-9 ? CELL / Math.abs(dx) : Infinity;
  const tDz = Math.abs(dz) > 1e-9 ? CELL / Math.abs(dz) : Infinity;
  let tMx = Math.abs(dx) > 1e-9 ? ((dx > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL) / Math.abs(dx)) : Infinity;
  let tMz = Math.abs(dz) > 1e-9 ? ((dz > 0 ? (cz + 1) * CELL - oz : oz - cz * CELL) / Math.abs(dz)) : Infinity;
  colStamp++;
  let tCell = 0;
  for (let iter = 0; iter < 400; iter++) {
    const lim = best ? Math.min(best.t, maxDist) : maxDist;
    if (tCell > lim) break;
    const s = spatial.get(hk(cx, cz));
    if (s) for (const c of s) {
      if (c.stamp === colStamp) continue; c.stamp = colStamp;
      if (c.noRay) continue;
      if (opts.ignorePiece && c.owner === opts.ignorePiece) continue;
      if (opts.onlyPieces && !(c.owner && c.owner.isPiece)) continue;
      const cur = best ? best.t : maxDist;
      let h = null;
      if (c.kind === 'box') h = rayBox(ox, oy, oz, dx, dy, dz, c, cur);
      else if (c.kind === 'ramp') h = rayRamp(ox, oy, oz, dx, dy, dz, c, cur);
      else h = rayPyr(ox, oy, oz, dx, dy, dz, c, cur);
      if (h && h.t < cur) best = { t: h.t, collider: c, axis: h.axis, sign: h.sign };
    }
    if (tMx < tMz) { tCell = tMx; tMx += tDx; cx += stepX; } else { tCell = tMz; tMz += tDz; cz += stepZ; }
  }
  // Charaktere
  if (!opts.noActors) {
    for (const a of actors) {
      if (!a.alive || a === opts.ignoreActor) continue;
      const h = a.crouchH, hx = a.pos.x, hz = a.pos.z;
      const cur = best ? best.t : maxDist;
      // Kopf (Kugel)
      const hy = a.pos.y + h - 0.22;
      const lx = ox - hx, ly = oy - hy, lz = oz - hz;
      const b = lx * dx + ly * dy + lz * dz, cc = lx * lx + ly * ly + lz * lz - 0.26 * 0.26;
      const disc = b * b - cc;
      if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t > 0 && t < cur) best = { t, actor: a, part: 'head' }; }
      const box = { minx: hx - 0.34, miny: a.pos.y, minz: hz - 0.34, maxx: hx + 0.34, maxy: a.pos.y + h - 0.45, maxz: hz + 0.34 };
      const hb = rayBox(ox, oy, oz, dx, dy, dz, box, best ? best.t : maxDist);
      if (hb && (!best || hb.t < best.t)) best = { t: hb.t, actor: a, part: 'body' };
    }
  }
  if (best) best.point = new T.Vector3(ox + dx * best.t, oy + dy * best.t, oz + dz * best.t);
  return best;
}

// ============================================================
// Physik eines Körpers (Spieler & Bots teilen dieselbe Logik)
// ============================================================
const _q = [];
function bodyBlocked(b, x, z) {
  const r = b.r, feet = b.pos.y, h = b.h;
  queryColliders(x - r, z - r, x + r, z + r, _q);
  for (const c of _q) {
    if (c.noMove) continue;
    if (c.kind === 'box') {
      if (x + r <= c.minx || x - r >= c.maxx || z + r <= c.minz || z - r >= c.maxz) continue;
      if (c.maxy <= feet + STEP_H || c.miny >= feet + h - 0.05) continue;
      // Bereits überlappend? Dann nicht blockieren (herauslaufen erlauben)
      const px = b.pos.x, pz = b.pos.z;
      if (px + r > c.minx && px - r < c.maxx && pz + r > c.minz && pz - r < c.maxz) continue;
      b.blocker = c;
      return true;
    } else {
      const s = surfaceAt(c, x, z);
      if (s === null) continue;
      if (s > feet + STEP_H && s - 0.35 < feet + h) {
        const s0 = surfaceAt(c, b.pos.x, b.pos.z);
        if (s0 !== null && s0 > feet + STEP_H && s0 - 0.35 < feet + h) continue;
        b.blocker = c; return true;
      }
    }
  }
  return false;
}
function supportHeight(b, x, z, maxY) {
  let best = 0, bestCol = null; const r = b.r * 0.85;
  queryColliders(x - r, z - r, x + r, z + r, _q);
  for (const c of _q) {
    if (c.noMove) continue;
    let top = null;
    if (c.kind === 'box') {
      if (x + r <= c.minx || x - r >= c.maxx || z + r <= c.minz || z - r >= c.maxz) continue;
      top = c.maxy;
    } else top = surfaceAt(c, x, z);
    if (top !== null && top <= maxY && top > best) { best = top; bestCol = c; }
  }
  b.groundCol = bestCol;
  return best;
}
function ceilingHeight(b, x, z) {
  let best = Infinity; const r = b.r * 0.85, feet = b.pos.y;
  queryColliders(x - r, z - r, x + r, z + r, _q);
  for (const c of _q) {
    if (c.noMove) continue;
    let bot = null;
    if (c.kind === 'box') {
      if (x + r <= c.minx || x - r >= c.maxx || z + r <= c.minz || z - r >= c.maxz) continue;
      bot = c.miny;
    } else { const s = surfaceAt(c, x, z); if (s !== null) bot = s - 0.35; }
    if (bot !== null && bot > feet + STEP_H && bot < best) best = bot;
  }
  return best;
}
function stepBody(b, dt) {
  b.vel.y -= GRAV * dt * (b.gravScale || 1);
  if (b.maxFall && b.vel.y < -b.maxFall) b.vel.y = -b.maxFall;
  b.blocker = null;
  const nx = b.pos.x + b.vel.x * dt;
  if (bodyBlocked(b, nx, b.pos.z)) { b.vel.x = 0; b.hitWall = true; } else b.pos.x = nx;
  const nz = b.pos.z + b.vel.z * dt;
  if (bodyBlocked(b, b.pos.x, nz)) { b.vel.z = 0; b.hitWall = true; } else b.pos.z = nz;
  const y = b.pos.y;
  let ny = y + b.vel.y * dt;
  const sup = supportHeight(b, b.pos.x, b.pos.z, y + STEP_H);
  if (b.vel.y <= 0 && ny <= sup) { ny = sup; b.vel.y = 0; b.onGround = true; }
  else if (b.onGround && b.vel.y <= 0 && sup >= y - 0.6) { ny = sup; b.vel.y = 0; b.onGround = true; }
  else b.onGround = false;
  if (b.vel.y > 0) {
    const ceil = ceilingHeight(b, b.pos.x, b.pos.z);
    if (ny + b.h > ceil) { ny = Math.max(y, ceil - b.h); b.vel.y = 0; }
  }
  b.pos.y = ny;
  const L = MAP_HALF - 1;
  b.pos.x = clamp(b.pos.x, -L, L); b.pos.z = clamp(b.pos.z, -L, L);
}
function moveBody(b, dt) {
  b.hitWall = false;
  const sp = Math.max(Math.abs(b.vel.x), Math.abs(b.vel.y), Math.abs(b.vel.z)) * dt;
  const steps = Math.min(8, Math.max(1, Math.ceil(sp / 0.25)));
  for (let i = 0; i < steps; i++) stepBody(b, dt / steps);
}

// ============================================================
// Sound (WebAudio, synthetisch)
// ============================================================
const Sound = {
  ctx: null, master: null, noise: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = settings.volume; this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    } catch (e) { this.ctx = null; }
  },
  setVolume(v) { if (this.master) this.master.gain.value = v; },
  vol(pos) { if (!pos || !player) return 1; const d = pos.distanceTo(player.pos); return 1 / (1 + d / 12); },
  burst(dur, freq, q, gain, type) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, src = this.ctx.createBufferSource(); src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq; f.Q.value = q || 1;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + dur);
  },
  tone(freq, dur, gain, type, slide) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur);
  },
  shot(kind, pos) {
    const v = this.vol(pos);
    if (v < 0.03) return;
    if (kind === 'shotgun') { this.burst(0.35, 900, 0.7, 0.9 * v); this.tone(70, 0.2, 0.5 * v, 'square', 40); }
    else if (kind === 'sniper') { this.burst(0.5, 1400, 0.6, 1.0 * v); this.tone(90, 0.3, 0.5 * v, 'sawtooth', 35); }
    else if (kind === 'smg') this.burst(0.08, 2200, 0.8, 0.35 * v);
    else if (kind === 'pistol') this.burst(0.12, 1800, 0.8, 0.45 * v);
    else this.burst(0.14, 1500, 0.8, 0.5 * v);
  },
  hit(head) { this.tone(head ? 1500 : 900, 0.08, 0.25, 'triangle', head ? 2200 : 700); },
  hurt() { this.burst(0.2, 400, 1, 0.5); },
  build(pos) { const v = this.vol(pos); this.tone(220, 0.08, 0.25 * v, 'square', 120); this.burst(0.06, 800, 1, 0.15 * v); },
  pickaxe(pos) { const v = this.vol(pos); this.tone(520, 0.05, 0.2 * v, 'square', 300); this.burst(0.05, 2500, 2, 0.2 * v, 'bandpass'); },
  pickup() { this.tone(660, 0.07, 0.2, 'sine', 990); },
  chest() { for (let i = 0; i < 4; i++) setTimeout(() => this.tone(600 + i * 200, 0.15, 0.15, 'triangle'), i * 70); },
  reload() { this.tone(300, 0.05, 0.15, 'square'); setTimeout(() => this.tone(420, 0.05, 0.15, 'square'), 120); },
  elim() { this.tone(500, 0.12, 0.3, 'triangle', 1000); setTimeout(() => this.tone(1000, 0.2, 0.3, 'triangle', 1500), 100); },
  destroy(pos) { const v = this.vol(pos); this.burst(0.3, 600, 0.8, 0.5 * v); },
  // Emote-Beat, synchron zur Startzeit geplant
  emoteLoop: null,
  startEmoteBeat(bpm) {
    this.stopEmoteBeat(); if (!this.ctx || !bpm) return;
    const ctx = this.ctx, start = ctx.currentTime + 0.05, beat = 60 / bpm;
    const out = ctx.createGain(); out.gain.value = 0.35; out.connect(this.master);
    const nodes = [];
    for (let i = 0; i < 64; i++) {
      const t = start + i * beat;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.2); nodes.push(o);
      if (i % 2 === 1) {
        const s = ctx.createBufferSource(); s.buffer = this.noise; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
        const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.3, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        s.connect(f); f.connect(g2); g2.connect(out); s.start(t); s.stop(t + 0.06); nodes.push(s);
      }
      const notes = [220, 262, 330, 294];
      const o2 = ctx.createOscillator(), g3 = ctx.createGain(); o2.type = 'triangle';
      o2.frequency.value = notes[Math.floor(i / 2) % 4] * (i % 2 ? 1.5 : 1);
      g3.gain.setValueAtTime(0.12, t); g3.gain.exponentialRampToValueAtTime(0.001, t + beat * 0.9);
      o2.connect(g3); g3.connect(out); o2.start(t); o2.stop(t + beat); nodes.push(o2);
    }
    this.emoteLoop = { out, nodes };
  },
  stopEmoteBeat() {
    if (!this.emoteLoop) return;
    try { this.emoteLoop.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); for (const n of this.emoteLoop.nodes) { try { n.stop(this.ctx.currentTime + 0.2); } catch (e) {} } } catch (e) {}
    this.emoteLoop = null;
  },
};

// ============================================================
// Effekte: Tracer, Einschläge, Partikel
// ============================================================
const effects = [];
const tracerMatPool = {};
function tracerMat(color) {
  if (!tracerMatPool[color]) tracerMatPool[color] = new T.LineBasicMaterial({ color, transparent: true, opacity: .9 });
  return tracerMatPool[color];
}
function spawnTracer(from, to, color) {
  const g = new T.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const m = tracerMat(color || 0xfff2a0).clone();
  const l = new T.Line(g, m); scene.add(l);
  effects.push({ obj: l, t: 0, life: 0.08, fade: true });
}
const sparkGeo = new T.BoxGeometry(0.08, 0.08, 0.08);
function spawnImpact(p, color, n) {
  n = n || 5;
  const m = new T.MeshBasicMaterial({ color: color || 0xffe080, transparent: true });
  for (let i = 0; i < n; i++) {
    const s = new T.Mesh(sparkGeo, m); s.position.copy(p); scene.add(s);
    effects.push({ obj: s, t: 0, life: 0.35, vel: new T.Vector3(rand(-3, 3), rand(1, 5), rand(-3, 3)), fade: true, shared: true });
  }
}
function spawnDebris(p, matKey) {
  const m = MAT_MATERIALS[matKey] || MAT_MATERIALS.wood;
  for (let i = 0; i < 6; i++) {
    const s = new T.Mesh(new T.BoxGeometry(rand(.3, .8), rand(.3, .8), .15), m);
    s.position.set(p.x + rand(-1.5, 1.5), p.y + rand(-1.5, 1.5), p.z + rand(-1.5, 1.5));
    scene.add(s);
    effects.push({ obj: s, t: 0, life: 0.8, vel: new T.Vector3(rand(-4, 4), rand(2, 6), rand(-4, 4)), spin: true, shrink: true, ownGeo: true });
  }
}
function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]; e.t += dt;
    if (e.vel) { e.vel.y -= 15 * dt; e.obj.position.addScaledVector(e.vel, dt); }
    if (e.spin) { e.obj.rotation.x += dt * 8; e.obj.rotation.y += dt * 6; }
    const k = 1 - e.t / e.life;
    if (e.fade && e.obj.material && !e.shared) e.obj.material.opacity = Math.max(0, k);
    if (e.shrink) e.obj.scale.setScalar(Math.max(0.01, k));
    if (e.t >= e.life) {
      scene.remove(e.obj);
      if (e.obj.geometry && (e.ownGeo || e.obj.isLine)) e.obj.geometry.dispose();
      if (e.obj.isLine) e.obj.material.dispose();
      effects.splice(i, 1);
    }
  }
}
