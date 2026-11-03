/* Treasure hunt – data model and story engine (no DOM). Exposes window.HuntEngine.
   See treasure-hunt/README.md for the format and the architecture.

   Hunt (configuration, portable as a JSON file):
     { format, version, id, title, intro, finale, radius, megaCost, pin,
       characters: [{ id, name, emoji, image, side: 'ally'|'enemy'|'other', power, hp, ability }],
       stations:   [{ id, name, emoji, hint, image, lat, lon, radius, when, scenes: [Scene] }] }
     Scene:   { id, title, text, character, battle, repeat, when, puzzle, win: Effects, lose: Effects }
     when:    { flags: [], notFlags: [], team, energy, visits }   – all must hold
     Effects: { text, flags: [], unflags: [], ally, energy, treasure }
   Game (progress, stored separately per hunt):
     { huntId, started, flags: [], team: [], energy, done: [], visits: {}, target, active, finished } */
window.HuntEngine = (function () {
  'use strict';

  const FORMAT = 'phanlipo-treasure-hunt';
  const VERSION = 1;
  const SIDES = ['ally', 'enemy', 'other'];
  const MAX_TEXT = 4000, MAX_IMAGE = 1500000;

  const uid = p => p + '-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

  /* ---------- Normalising (imported files, editor, AI agents) ---------- */
  const str = (v, max) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max || 200);
  const num = (v, d, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
  const int = (v, d, min, max) => Math.round(num(v, d, min, max));
  const list = v => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [])
    .map(x => str(x, 60).trim()).filter(Boolean).slice(0, 30);
  // Images only as embedded data URLs – never a link to another server
  const image = v => typeof v === 'string' && /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= MAX_IMAGE ? v : '';
  const coord = (v, lim) => { if (v === '' || v == null) return null; const n = Number(v); return Number.isFinite(n) && Math.abs(n) <= lim ? n : null; };

  function cond(w) {
    w = w || {};
    return { flags: list(w.flags), notFlags: list(w.notFlags), team: int(w.team, 0, 0, 99), energy: int(w.energy, 0, 0, 999), visits: int(w.visits, 0, 0, 99) };
  }
  function effects(e) {
    e = e || {};
    return { text: str(e.text, MAX_TEXT), flags: list(e.flags), unflags: list(e.unflags), ally: str(e.ally, 60),
      energy: int(e.energy, 0, -99, 99), treasure: e.treasure === true };
  }
  function puzzle(p, types) {
    if (!p || typeof p !== 'object' || !types[p.type]) return null;
    return types[p.type].clean(p, { str, num, int, list, image, MAX_TEXT });
  }
  function scene(s, types) {
    s = s || {};
    return { id: str(s.id, 60) || uid('sc'), title: str(s.title, 120), text: str(s.text, MAX_TEXT), character: str(s.character, 60),
      battle: s.battle === true, repeat: s.repeat === true, when: cond(s.when), puzzle: puzzle(s.puzzle, types),
      win: effects(s.win), lose: effects(s.lose) };
  }
  function station(s, types) {
    s = s || {};
    return { id: str(s.id, 60) || uid('st'), name: str(s.name, 80), emoji: str(s.emoji, 16), hint: str(s.hint, MAX_TEXT),
      image: image(s.image), lat: coord(s.lat, 90), lon: coord(s.lon, 180), radius: int(s.radius, 0, 0, 500),
      when: cond(s.when), scenes: (Array.isArray(s.scenes) ? s.scenes : []).slice(0, 50).map(x => scene(x, types)) };
  }
  function character(c) {
    c = c || {};
    return { id: str(c.id, 60) || uid('ch'), name: str(c.name, 80), emoji: str(c.emoji, 16), image: image(c.image),
      side: SIDES.includes(c.side) ? c.side : 'ally', power: int(c.power, 2, 0, 99), hp: int(c.hp, 10, 1, 999), ability: str(c.ability, 120) };
  }
  // Brings any object into the hunt shape (unknown fields are dropped, ids made unique)
  function normalize(h, types) {
    if (!h || typeof h !== 'object' || Array.isArray(h)) throw new Error('not a hunt');
    const out = {
      format: FORMAT, version: VERSION, id: str(h.id, 60) || uid('h'), title: str(h.title, 120),
      intro: str(h.intro, MAX_TEXT), finale: str(h.finale, MAX_TEXT),
      radius: int(h.radius, 20, 5, 500), megaCost: int(h.megaCost, 3, 1, 99), pin: str(h.pin, 12).replace(/\D/g, ''),
      characters: (Array.isArray(h.characters) ? h.characters : []).slice(0, 60).map(character),
      stations: (Array.isArray(h.stations) ? h.stations : []).slice(0, 60).map(s => station(s, types)),
    };
    // Ids are unique per kind (a character and a station may both be called "fox")
    const unique = (list, p) => { const seen = new Set(); for (const o of list) { while (seen.has(o.id)) o.id = uid(p); seen.add(o.id); } };
    unique(out.characters, 'ch');
    unique(out.stations, 'st');
    unique(out.stations.flatMap(s => s.scenes), 'sc');
    return out;
  }
  // Parses an imported file; throws Error('format') / Error('version') for foreign or newer files
  function parse(text, types) {
    let h;
    try { h = JSON.parse(text); } catch (_) { throw new Error('json'); }
    if (!h || h.format !== FORMAT) throw new Error('format');
    if (!Number.isInteger(h.version) || h.version > VERSION) throw new Error('version');
    return normalize(h, types);
  }

  /* ---------- Lookups ---------- */
  const charOf = (h, id) => h.characters.find(c => c.id === id) || null;
  const stationOf = (h, id) => h.stations.find(s => s.id === id) || null;
  const allScenes = h => h.stations.flatMap(s => s.scenes);
  // Every flag name used anywhere in the hunt (sorted) – also the order of the flags in the resume code
  function flagsOf(h) {
    const set = new Set();
    const add = w => w && [...(w.flags || []), ...(w.notFlags || []), ...(w.unflags || [])].forEach(f => set.add(f));
    for (const s of h.stations) { add(s.when); for (const x of s.scenes) { add(x.when); add(x.win); add(x.lose); } }
    return [...set].sort();
  }
  // Problems a parent should know about before playing (shown in the editor)
  function check(h) {
    const out = [];
    if (!h.stations.length) out.push({ k: 'noStations' });
    if (!allScenes(h).some(x => x.win.treasure || x.lose.treasure)) out.push({ k: 'noTreasure' });
    for (const s of h.stations) {
      if (!s.scenes.length) out.push({ k: 'noScenes', name: s.name });
      for (const x of s.scenes) {
        if (x.battle && (!charOf(h, x.character) || charOf(h, x.character).side !== 'enemy')) out.push({ k: 'noEnemy', name: s.name });
        for (const e of [x.win, x.lose]) if (e.ally && !charOf(h, e.ally)) out.push({ k: 'noAlly', name: s.name });
      }
    }
    return out;
  }

  /* ---------- Game state ---------- */
  function newGame(h) {
    return { huntId: h.id, started: false, flags: [], team: [], energy: 0, done: [], visits: {}, target: '', active: '', finished: false, mega: 0 };
  }
  function cleanGame(g, h) {
    const base = newGame(h);
    if (!g || typeof g !== 'object') return base;
    const ids = new Set(allScenes(h).map(x => x.id));
    return Object.assign(base, {
      started: g.started === true, flags: list(g.flags), team: list(g.team).filter(id => charOf(h, id)),
      energy: int(g.energy, 0, 0, 999), done: list(g.done).filter(id => ids.has(id)),
      visits: Object.fromEntries(Object.entries(g.visits && typeof g.visits === 'object' ? g.visits : {})
        .filter(([k]) => stationOf(h, k)).map(([k, v]) => [k, int(v, 0, 0, 99)])),
      target: stationOf(h, g.target) ? g.target : '', active: ids.has(g.active) ? g.active : '',
      finished: g.finished === true, mega: int(g.mega, 0, 0, 999),
    });
  }

  const has = (g, f) => g.flags.includes(f);
  function condOk(w, g, st) {
    if (!w) return true;
    if (w.flags.some(f => !has(g, f))) return false;
    if (w.notFlags.some(f => has(g, f))) return false;
    if (g.team.length < w.team) return false;
    if (g.energy < w.energy) return false;
    if (st && (g.visits[st.id] || 0) < w.visits) return false;
    return true;
  }
  // The scene that plays at a station now: the first one whose conditions hold and that is not done yet
  // (scenes marked "repeat" stay available after a win). null = nothing to do here at the moment.
  function pickScene(h, g, st) {
    return st.scenes.find(x => condOk(x.when, g, st) && (x.repeat || !g.done.includes(x.id))) || null;
  }
  // 'locked' (conditions of the station not met), 'new' (a scene waits that was never won – repeatable story texts
  // without task or battle do not count), 'open' (nothing new)
  function stationState(h, g, st) {
    if (!condOk(st.when, g, null)) return 'locked';
    const x = pickScene(h, g, st);
    return x && !g.done.includes(x.id) && !(x.repeat && !x.puzzle && !x.battle) ? 'new' : 'open';
  }

  // Applies the effects of a scene result; returns what changed (for the result screen)
  function apply(h, g, e) {
    const got = { ally: null, energy: 0, treasure: false };
    for (const f of e.flags) if (!has(g, f)) g.flags.push(f);
    g.flags = g.flags.filter(f => !e.unflags.includes(f));
    if (e.ally && charOf(h, e.ally) && !g.team.includes(e.ally)) { g.team.push(e.ally); got.ally = charOf(h, e.ally); }
    if (e.energy) { const before = g.energy; g.energy = Math.max(0, g.energy + e.energy); got.energy = g.energy - before; }
    if (e.treasure) { g.finished = true; got.treasure = true; }
    return got;
  }
  function finish(h, g, sc, success) {
    if (success && !g.done.includes(sc.id)) g.done.push(sc.id);
    g.active = '';
    return apply(h, g, success ? sc.win : sc.lose);
  }

  /* ---------- Battle ----------
     Damage = (children 1 + power of every ally + bonus of a solved task) × 2 with the Mega evolution.
     The Mega evolution needs at least one ally and costs megaCost energy. */
  const KIDS_POWER = 1;
  const canMega = (h, g) => g.team.length > 0 && g.energy >= h.megaCost;
  function battle(h, g, enemy, bonus, mega) {
    const hits = [{ who: null, power: KIDS_POWER }];
    for (const id of g.team) { const c = charOf(h, id); if (c) hits.push({ who: c, power: c.power }); }
    if (bonus) hits.push({ who: 'bonus', power: bonus });
    const useMega = !!mega && canMega(h, g);
    const sum = hits.reduce((n, x) => n + x.power, 0);
    const damage = useMega ? sum * 2 : sum;
    return { hits, mega: useMega, damage, hp: enemy.hp, win: damage >= enemy.hp };
  }
  function payMega(h, g) { g.energy = Math.max(0, g.energy - h.megaCost); g.mega++; }

  /* ---------- Resume code ----------
     The progress as a short code (Crockford base32, groups of 4), to continue on another device that has
     the same hunt (imported from the file). Positions follow the hunt: flags (flagsOf), characters, scenes,
     stations. A 16-bit hash of that structure detects codes of another hunt or of a changed hunt. */
  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  function structHash(h) {
    const s = [h.id, flagsOf(h).join(','), h.characters.map(c => c.id).join(','), h.stations.map(st => st.id + ':' + st.scenes.map(x => x.id).join('.')).join(',')].join('|');
    let x = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; }
    return (x ^ (x >>> 16)) & 0xffff;
  }
  function bitsOut(bytes, items, isSet) {
    for (let i = 0; i < items.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8 && i + j < items.length; j++) if (isSet(items[i + j])) b |= 1 << j;
      bytes.push(b);
    }
  }
  function bitsIn(bytes, pos, items) {
    const out = [];
    for (let i = 0; i < items.length; i++) if (bytes[pos + (i >> 3)] & (1 << (i & 7))) out.push(items[i]);
    return [out, pos + Math.ceil(items.length / 8)];
  }
  function encode(h, g) {
    const flags = flagsOf(h), scenes = allScenes(h).map(x => x.id), chars = h.characters.map(c => c.id);
    const hash = structHash(h);
    const bytes = [1, hash >> 8, hash & 255, Math.min(255, g.energy), (g.finished ? 1 : 0) | (g.started ? 2 : 0),
      Math.max(0, h.stations.findIndex(s => s.id === g.target) + 1) & 255];
    bitsOut(bytes, flags, f => g.flags.includes(f));
    bitsOut(bytes, chars, id => g.team.includes(id));
    bitsOut(bytes, scenes, id => g.done.includes(id));
    for (let i = 0; i < h.stations.length; i += 2) {
      const v = s => s ? Math.min(15, g.visits[s.id] || 0) : 0;
      bytes.push(v(h.stations[i]) | (v(h.stations[i + 1]) << 4));
    }
    // Team order (who joined first) is not kept – the order of the characters in the hunt is used
    let sum = 0; for (const b of bytes) sum = (sum * 31 + b) & 255;
    bytes.push(sum);
    let bits = 0, val = 0, out = '';
    for (const b of bytes) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >> (bits - 5)) & 31]; bits -= 5; } val &= (1 << bits) - 1; }
    if (bits) out += B32[(val << (5 - bits)) & 31];
    return out.match(/.{1,4}/g).join('-');
  }
  // Returns a game or throws Error('code') (typo) / Error('codeHunt') (other or changed hunt)
  function decode(h, code) {
    const clean = String(code || '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
    if (!clean || /[^0-9A-Z]/.test(clean)) throw new Error('code');
    const bytes = [];
    let bits = 0, val = 0;
    for (const ch of clean) {
      const v = B32.indexOf(ch);
      if (v < 0) throw new Error('code');
      val = (val << 5) | v; bits += 5;
      if (bits >= 8) { bytes.push((val >> (bits - 8)) & 255); bits -= 8; val &= (1 << bits) - 1; }
    }
    const flags = flagsOf(h), scenes = allScenes(h).map(x => x.id), chars = h.characters.map(c => c.id);
    const need = 6 + Math.ceil(flags.length / 8) + Math.ceil(chars.length / 8) + Math.ceil(scenes.length / 8) + Math.ceil(h.stations.length / 2) + 1;
    if (bytes.length < need || bytes[0] !== 1) throw new Error('code');
    let sum = 0; for (let i = 0; i < need - 1; i++) sum = (sum * 31 + bytes[i]) & 255;
    if (sum !== bytes[need - 1]) throw new Error('code');
    if (((bytes[1] << 8) | bytes[2]) !== structHash(h)) throw new Error('codeHunt');
    const g = newGame(h);
    g.energy = bytes[3]; g.finished = !!(bytes[4] & 1); g.started = !!(bytes[4] & 2);
    g.target = bytes[5] && h.stations[bytes[5] - 1] ? h.stations[bytes[5] - 1].id : '';
    let pos = 6;
    [g.flags, pos] = bitsIn(bytes, pos, flags);
    [g.team, pos] = bitsIn(bytes, pos, chars);
    [g.done, pos] = bitsIn(bytes, pos, scenes);
    for (let i = 0; i < h.stations.length; i++) {
      const v = (bytes[pos + (i >> 1)] >> ((i & 1) * 4)) & 15;
      if (v) g.visits[h.stations[i].id] = v;
    }
    return g;
  }

  /* ---------- Geo ---------- */
  const R = 6371008.8, rad = d => d * Math.PI / 180;
  function distance(a, b) {
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }
  function bearing(a, b) {
    const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  // Point at distance d (m) in direction deg from p
  function offset(p, d, deg) {
    const br = rad(deg), la = rad(p.lat), lo = rad(p.lon), k = d / R;
    const lat2 = Math.asin(Math.sin(la) * Math.cos(k) + Math.cos(la) * Math.sin(k) * Math.cos(br));
    const lon2 = lo + Math.atan2(Math.sin(br) * Math.sin(k) * Math.cos(la), Math.cos(k) - Math.sin(la) * Math.sin(lat2));
    return { lat: +(lat2 * 180 / Math.PI).toFixed(6), lon: +(lon2 * 180 / Math.PI).toFixed(6) };
  }
  // GPS is inaccurate: the reported accuracy (capped at 30 m) counts in the children's favour
  const ACC_CAP = 30;
  function arrived(h, st, pos) {
    if (st.lat == null || st.lon == null || !pos) return false;
    const r = st.radius || h.radius;
    return Math.max(0, distance(pos, st) - Math.min(pos.acc || 0, ACC_CAP)) <= r;
  }
  const hasCoords = st => st.lat != null && st.lon != null;

  return { FORMAT, VERSION, uid, normalize, parse, character, station, scene, effects, cond, check,
    charOf, stationOf, allScenes, flagsOf, newGame, cleanGame, condOk, pickScene, stationState, apply, finish,
    battle, canMega, payMega, KIDS_POWER, encode, decode, distance, bearing, offset, arrived, hasCoords, ACC_CAP };
})();
