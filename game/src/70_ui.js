// ============================================================
// 70 · UI: HUD, Fadenkreuz, Minimap, Kill-Feed, Menüs, Spind, Einstellungen
// ============================================================
const $ = id => document.getElementById(id);
const UI = {
  els: {},
  crossLines: [],
  init() {
    const ch = $('crosshair');
    for (let i = 0; i < 4; i++) { const d = document.createElement('div'); d.className = 'ln'; ch.appendChild(d); this.crossLines.push(d); }
    const dot = document.createElement('div'); dot.className = 'dot'; ch.appendChild(dot);
    // Materialien
    $('mats').innerHTML = MAT_ORDER.map(m => `<div class="mat" id="mat_${m}"><i style="background:${MATS[m].css}"></i><span>0</span></div>`).join('');
    $('buildbar').innerHTML = [['wall', 'Q', 'Wand'], ['floor', 'F', 'Boden'], ['ramp', 'E', 'Rampe'], ['pyr', 'V', 'Dach']]
      .map(([t, k, n]) => `<div class="slot" id="bs_${t}"><span class="k">${k}</span><span class="ic">${{ wall: '▮', floor: '▬', ramp: '◢', pyr: '▲' }[t]}</span>${n}</div>`).join('');
    $('quickbar').innerHTML = [0, 1, 2, 3, 4, 5].map(i => `<div class="slot" id="qs_${i}"></div>`).join('');
  },
  // ---------- Fadenkreuz mit echtem Bloom ----------
  updateCrosshair(spreadDeg, mode) {
    const ch = $('crosshair');
    if (mode === 'build' || mode === 'edit') {
      ch.style.display = '';
      this.crossLines.forEach(l => l.style.display = 'none');
      return;
    }
    ch.style.display = '';
    const vfov = camera.fov * DEG;
    const px = Math.tan(spreadDeg * DEG) / Math.tan(vfov / 2) * (window.innerHeight / 2);
    const gap = Math.max(3, px), len = 9, th = 2;
    const [t, b, l, r] = this.crossLines;
    for (const x of this.crossLines) x.style.display = '';
    Object.assign(t.style, { width: th + 'px', height: len + 'px', left: -th / 2 + 'px', top: -(gap + len) + 'px' });
    Object.assign(b.style, { width: th + 'px', height: len + 'px', left: -th / 2 + 'px', top: gap + 'px' });
    Object.assign(l.style, { width: len + 'px', height: th + 'px', left: -(gap + len) + 'px', top: -th / 2 + 'px' });
    Object.assign(r.style, { width: len + 'px', height: th + 'px', left: gap + 'px', top: -th / 2 + 'px' });
  },
  hitT: 0,
  hitmarker(head) { const h = $('hitmarker'); h.classList.toggle('head', !!head); h.style.opacity = 1; this.hitT = 0.15; },
  hurtT: 0,
  hurt() { this.hurtT = 0.4; },
  damageNumber(target, amount, head, shield) {
    const d = document.createElement('div'); d.className = 'dmg';
    d.textContent = Math.round(amount);
    d.style.color = head ? '#ffd23f' : shield ? '#7fd0ff' : '#ffffff';
    if (head) d.style.fontSize = '28px';
    $('hud').appendChild(d);
    const p = new T.Vector3(target.pos.x + rand(-.4, .4), target.pos.y + target.crouchH + .2, target.pos.z + rand(-.4, .4));
    this.dmgNums.push({ el: d, p, t: 0 });
  },
  dmgNums: [],
  feed(msg, me) {
    const f = $('feed'), d = document.createElement('div'); d.textContent = msg; if (me) d.className = 'me';
    f.prepend(d); setTimeout(() => d.remove(), 6000);
    while (f.children.length > 6) f.lastChild.remove();
  },
  annT: 0,
  announce(title, sub) { $('announce').innerHTML = title + (sub ? `<small>${sub}</small>` : ''); $('announce').style.opacity = 1; this.annT = 2.2; },
  toast(msg) { this.announce('', msg); },
  matGain(mat, n) { /* Anzeige erfolgt über Material-Zähler */ },
  slotHtml(it, i, sel) {
    if (i === 0) { const p = cosmetic('pickaxe', player.look.pickaxe); return `<span class="k">1</span><span class="ic">⛏</span>${p.name}`; }
    const k = `<span class="k">${i + 1}</span>`;
    if (!it) return k;
    if (it.type === 'weapon') { const w = WEAPONS[it.id]; return `${k}<span class="c">${it.mag}</span><span class="ic">${w.icon}</span>${w.name}`; }
    const c = CONSUMABLES[it.id]; return `${k}<span class="c">${it.count}</span><span class="ic">${c.icon}</span>${c.name}`;
  },
  lastHudKey: '',
  updateHud(dt) {
    const p = player;
    // Vitalwerte
    $('hpBar').querySelector('.fill').style.width = Math.max(0, p.hp) + '%';
    $('hpBar').querySelector('.num').textContent = Math.ceil(Math.max(0, p.hp));
    $('shBar').querySelector('.fill').style.width = p.shield + '%';
    $('shBar').querySelector('.num').textContent = Math.ceil(p.shield);
    // Inventar (nur bei Änderung neu rendern)
    const key = JSON.stringify([p.inv.slots, p.inv.sel, p.mode, p.buildType, p.matSel, p.inv.mats, p.reloadT > 0]);
    if (key !== this.lastHudKey) {
      this.lastHudKey = key;
      for (let i = 0; i < 6; i++) {
        const el = $('qs_' + i), it = i === 0 ? null : p.inv.slots[i - 1];
        el.innerHTML = this.slotHtml(it, i);
        el.classList.toggle('on', p.mode === 'combat' && p.inv.sel === i);
        el.style.background = it ? `linear-gradient(180deg,${RARITY[itemRarity(it)].css}cc,rgba(0,0,0,.5))` : '';
      }
      for (const m of MAT_ORDER) { const el = $('mat_' + m); el.querySelector('span').textContent = p.inv.mats[m]; el.classList.toggle('on', p.matSel === m && p.mode === 'build'); }
      for (const t of ['wall', 'floor', 'ramp', 'pyr']) $('bs_' + t).classList.toggle('on', p.mode === 'build' && p.buildType === t);
      $('buildbar').style.opacity = p.mode === 'build' ? 1 : .55;
    }
    // Munition
    const w = p.weaponDef, it = p.heldItem;
    if (p.mode === 'combat' && w) $('ammoInfo').innerHTML = p.reloadT > 0 ? 'Nachladen…' : `${it.mag} <small>/ ${p.inv.ammo[w.ammo]} ${AMMO_NAMES[w.ammo]}</small>`;
    else $('ammoInfo').innerHTML = '';
    // Statistiken
    $('aliveTxt').textContent = '👤 ' + actors.filter(a => a.alive).length;
    $('killsTxt').textContent = '✖ ' + p.kills;
    $('stormTxt').textContent = stormLabel();
    // Effekte
    this.hitT -= dt; if (this.hitT <= 0) $('hitmarker').style.opacity = 0;
    this.hurtT -= dt; $('vignette').style.boxShadow = `inset 0 0 160px 40px rgba(255,0,40,${Math.max(0, this.hurtT) * 1.2})`;
    this.annT -= dt; if (this.annT <= 0) $('announce').style.opacity = 0;
    $('stormTint').style.opacity = inStorm(p.pos) && p.alive ? 1 : 0;
    // Schadenszahlen
    for (let i = this.dmgNums.length - 1; i >= 0; i--) {
      const n = this.dmgNums[i]; n.t += dt;
      const v = n.p.clone(); v.y += n.t * 1.2; v.project(camera);
      if (v.z > 1 || n.t > 0.9) { n.el.remove(); this.dmgNums.splice(i, 1); continue; }
      n.el.style.left = ((v.x + 1) / 2 * window.innerWidth) + 'px'; n.el.style.top = ((1 - v.y) / 2 * window.innerHeight) + 'px';
      n.el.style.opacity = 1 - n.t / 0.9;
    }
  },
  setPrompt(html) { const el = $('prompt'); if (html) { el.innerHTML = html; el.classList.remove('hidden'); } else el.classList.add('hidden'); },
  setProgress(k) { const el = $('progress'); if (k === null) el.classList.add('hidden'); else { el.classList.remove('hidden'); el.firstChild.style.width = (k * 100) + '%'; } },
  setPieceHp(p) {
    const el = $('pieceHp');
    if (!p) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    $('pieceHpTxt').textContent = `${Math.ceil(p.hp)} | ${p.maxHp}`;
    $('pieceHpFill').style.width = (p.hp / p.maxHp * 100) + '%';
  },
  setMode(txt) { const el = $('modeTag'); if (txt) { el.textContent = txt; el.classList.remove('hidden'); } else el.classList.add('hidden'); },
  // ---------- Karte ----------
  drawMap(cv, full) {
    const g = cv.getContext('2d'), W = cv.width, S = W / (MAP_HALF * 2);
    const tx = x => (x + MAP_HALF) * S, tz = z => (z + MAP_HALF) * S;
    g.fillStyle = '#3f8a3a'; g.fillRect(0, 0, W, W);
    g.fillStyle = 'rgba(0,0,0,.08)'; for (let i = 0; i < 10; i++) { g.fillRect(i * W / 10, 0, 1, W); g.fillRect(0, i * W / 10, W, 1); }
    g.fillStyle = '#c8b890';
    for (const p of pieceList) if (p.type === 'pyr' || p.type === 'floor') { const a = p.aabb; g.fillRect(tx(a[0]), tz(a[2]), Math.max(1, CELL * S), Math.max(1, CELL * S)); }
    if (full) { g.fillStyle = '#fff'; g.font = 'bold 14px system-ui'; g.textAlign = 'center'; for (const p of pois) g.fillText(p.name, tx(p.x), tz(p.z) - 22); }
    // Sturm
    g.fillStyle = 'rgba(140,40,255,.35)'; g.beginPath(); g.rect(0, 0, W, W);
    g.arc(tx(storm.cur.x), tz(storm.cur.z), storm.cur.r * S, 0, Math.PI * 2, true); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(tx(storm.cur.x), tz(storm.cur.z), storm.cur.r * S, 0, 7); g.stroke();
    if (storm.next && storm.phase < STORM_PHASES.length) { g.setLineDash([5, 4]); g.beginPath(); g.arc(tx(storm.next.x), tz(storm.next.z), storm.next.r * S, 0, 7); g.stroke(); g.setLineDash([]); }
    // Spieler
    const p = player; g.save(); g.translate(tx(p.pos.x), tz(p.pos.z)); g.rotate(-p.yaw);
    g.fillStyle = '#ffe14d'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill(); g.stroke(); g.restore();
  },
  // ---------- Menüs ----------
  show(id) { $(id).classList.remove('hidden'); },
  hide(id) { $(id).classList.add('hidden'); },
  renderLoadoutInfo() {
    const L = profile.loadout;
    $('loadoutInfo').innerHTML = `Outfit: <b>${cosmetic('skin', L.skin).name}</b><br>Rucksack: <b>${cosmetic('backbling', L.backbling).name}</b> · Hacke: <b>${cosmetic('pickaxe', L.pickaxe).name}</b><br>Lackierung: <b>${cosmetic('wrap', L.wrap).name}</b> · Emote: <b>${cosmetic('emote', L.emote).name}</b>`;
  },
  lockerCat: 'skin',
  renderLocker() {
    $('lockerCats').innerHTML = COSMETIC_CATS.map(c => `<button data-cat="${c.key}" class="${c.key === this.lockerCat ? 'on' : ''}">${c.name}</button>`).join('');
    const items = COSMETICS[this.lockerCat].filter(c => ownsCosmetic(this.lockerCat, c.id));
    $('lockerGrid').innerHTML = items.map(c => {
      const col = c.c ? '#' + c.c.top.toString(16).padStart(6, '0') : c.color !== undefined ? '#' + c.color.toString(16).padStart(6, '0') : (c.tex === 'galaxy' ? 'linear-gradient(135deg,#1a0640,#4a0a80,#0a2a70)' : c.tex === 'camo' ? 'linear-gradient(135deg,#4a5a32,#2e3a1e,#8a7a52)' : '#334');
      return `<div class="card ${profile.loadout[this.lockerCat] === c.id ? 'on' : ''}" data-id="${c.id}" style="background:linear-gradient(180deg,${RARITY[c.rarity].css},#0b1a3a)">
        <div class="sw" style="background:${col}"></div><div class="nm">${c.name}</div><div class="rr">${RARITY[c.rarity].name}</div></div>`;
    }).join('');
  },
  settingsDefs: [
    ['fov', 'Sichtfeld (FOV)', 'range', 70, 110, 1],
    ['sens', 'Maus-Empfindlichkeit', 'range', 0.2, 3, 0.05],
    ['adsMul', 'Zielen-Empfindlichkeit (ADS)', 'range', 0.2, 1.5, 0.05],
    ['editOnRelease', 'Edit beim Loslassen bestätigen', 'check'],
    ['turbo', 'Turbo-Bauen (Taste halten)', 'check'],
    ['shadows', 'Schatten (Neustart der Runde)', 'check'],
    ['bots', 'Anzahl Bots', 'range', 3, 30, 1],
    ['difficulty', 'Bot-Schwierigkeit (0–2)', 'range', 0, 2, 1],
    ['volume', 'Lautstärke', 'range', 0, 1, 0.05],
    ['showFps', 'FPS anzeigen', 'check'],
  ],
  renderSettings() {
    $('settingsRows').innerHTML = this.settingsDefs.map(([k, label, type, min, max, step]) => {
      if (type === 'check') return `<div class="row"><label for="s_${k}">${label}</label><input type="checkbox" id="s_${k}" data-k="${k}" ${settings[k] ? 'checked' : ''}></div>`;
      const v = settings[k];
      const disp = k === 'difficulty' ? DIFF[v].name : v;
      return `<div class="row"><label for="s_${k}">${label}</label><span><input type="range" id="s_${k}" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${v}"> <span class="val" id="v_${k}">${disp}</span></span></div>`;
    }).join('');
  },
};

// Event-Bindings für Spind & Einstellungen
document.addEventListener('click', e => {
  const cat = e.target.closest('#lockerCats button');
  if (cat) { UI.lockerCat = cat.dataset.cat; UI.renderLocker(); return; }
  const card = e.target.closest('#lockerGrid .card');
  if (card) {
    profile.loadout[UI.lockerCat] = card.dataset.id; saveJSON('gridfall_profile', profile);
    UI.renderLocker(); UI.renderLoadoutInfo(); Lobby.rebuild();
    if (UI.lockerCat === 'emote') Lobby.playEmote();
  }
});
document.addEventListener('input', e => {
  const k = e.target.dataset && e.target.dataset.k; if (!k) return;
  if (e.target.type === 'checkbox') settings[k] = e.target.checked;
  else { settings[k] = parseFloat(e.target.value); const v = $('v_' + k); if (v) v.textContent = k === 'difficulty' ? DIFF[settings[k]].name : settings[k]; }
  if (k === 'volume') Sound.setVolume(settings.volume);
  if (k === 'shadows') renderer.shadowMap.enabled = settings.shadows;
  saveJSON('gridfall_settings', settings);
});

// ============================================================
// Lobby-Szene (Charaktervorschau)
// ============================================================
const Lobby = {
  scene: new T.Scene(), cam: new T.PerspectiveCamera(35, 1, 0.1, 100), model: null, t: 0, emoteStart: -100, fake: null,
  init() {
    this.scene.background = new T.Color(0x1a3a8a);
    this.scene.add(new T.HemisphereLight(0xffffff, 0x2040a0, 1.0));
    const d = new T.DirectionalLight(0xffffff, 0.9); d.position.set(3, 5, 4); this.scene.add(d);
    const pad = new T.Mesh(new T.CylinderGeometry(1.3, 1.5, .25, 32), new T.MeshStandardMaterial({ color: 0x2ee6ff, emissive: 0x0a6a8a, emissiveIntensity: .6 }));
    pad.position.y = -.125; this.scene.add(pad);
    const ring = new T.Mesh(new T.TorusGeometry(1.6, .04, 8, 48), new T.MeshBasicMaterial({ color: 0xffe14d })); ring.rotation.x = Math.PI / 2; ring.position.y = .02; this.scene.add(ring);
    this.cam.position.set(-1.6, 1.4, 4.6); this.cam.lookAt(-0.9, 1.0, 0);
    this.rebuild();
  },
  rebuild() {
    if (this.model) this.scene.remove(this.model.root);
    const look = Object.assign({}, profile.loadout);
    this.model = buildCharacter(look); this.scene.add(this.model.root);
    setHeld(this.model, 'pickaxe', look.wrap, look.pickaxe);
    this.fake = { model: this.model, pos: new T.Vector3(0, 0, 0), vel: new T.Vector3(), yaw: Math.PI * 0.85, pitch: 0, onGround: true, phase: 'ground', crouch: false, sliding: false, emote: null, animT: this.t };
  },
  playEmote() {
    const e = profile.loadout.emote;
    this.fake.emote = { id: e, start: this.fake.animT };
    Sound.init(); Sound.startEmoteBeat(cosmetic('emote', e).bpm);
    clearTimeout(this._et); this._et = setTimeout(() => { this.fake.emote = null; Sound.stopEmoteBeat(); }, 6000);
  },
  render(dt) {
    this.t += dt;
    this.cam.aspect = window.innerWidth / window.innerHeight; this.cam.updateProjectionMatrix();
    const lockerOpen = !$('locker').classList.contains('hidden');
    const wide = window.innerWidth > 700;
    const tx = !wide ? 0 : lockerOpen ? 1.0 : -0.9;
    this.camX = lerp(this.camX === undefined ? tx : this.camX, tx, 1 - Math.exp(-dt * 6));
    this.cam.position.set(this.camX * 1.8, 1.4, 4.6); this.cam.lookAt(this.camX, 1.0, 0);
    if (!this.fake.emote) this.fake.yaw += dt * 0.4;
    animateCharacter(this.fake, dt);
    renderer.render(this.scene, this.cam);
  },
};
