// Chess rules, notation and computer player (no DOM). Used by the page (rules, notation) and by
// ai-worker.js (search). Architecture and decisions: README.md in this folder.
//
// Board: 0x88 array of 128 entries, square = rank * 16 + file (a1 = 0, h1 = 7, a8 = 112). Pieces are
// signed numbers: 1 pawn, 2 knight, 3 bishop, 4 rook, 5 queen, 6 king – positive white, negative black.
// At the outside (Game, notation, worker messages) squares are names ("e4") and moves UCI ("e2e4",
// "e7e8q") or SAN ("Nf3", "exd5", "O-O", "e8=Q+"). SAN is always English (PGN), the page translates
// the piece letters for display.
(function (root) {
  'use strict';
  const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
  const LETTER = ' PNBRQK';
  const FILES = 'abcdefgh';
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const N_OFF = [33, 31, 18, 14, -33, -31, -18, -14];
  const K_OFF = [1, -1, 16, -16, 15, 17, -15, -17];
  const B_DIR = [15, 17, -15, -17];
  const R_DIR = [1, -1, 16, -16];
  // Castling rights: 1 white O-O, 2 white O-O-O, 4 black O-O, 8 black O-O-O. A move from or to one of
  // these squares removes the rights listed here (king or rook moved, rook captured).
  const CASTLE_MASK = new Uint8Array(128).fill(15);
  CASTLE_MASK[0] = 13; CASTLE_MASK[4] = 12; CASTLE_MASK[7] = 14;
  CASTLE_MASK[112] = 7; CASTLE_MASK[116] = 3; CASTLE_MASK[119] = 11;

  const onBoard = s => !(s & 0x88);
  const sqName = s => FILES[s & 7] + ((s >> 4) + 1);
  const sqOf = n => (typeof n === 'string' && /^[a-h][1-8]$/.test(n) ? (n.charCodeAt(1) - 49) * 16 + n.charCodeAt(0) - 97 : -1);

  // Zobrist keys for the search (repetitions); fixed seed, so every run gets the same keys
  let zs = 0x2545f491;
  const zrand = () => { zs ^= zs << 13; zs ^= zs >>> 17; zs ^= zs << 5; return zs | 0; };
  const Z = new Int32Array(13 * 128).map(() => zrand());
  const ZCAS = new Int32Array(16).map(() => zrand());
  const ZEP = new Int32Array(128).map(() => zrand());
  const ZSIDE = zrand();

  class Position {
    constructor(fen) { this.load(fen || START); }

    load(fen) {
      const parts = String(fen).trim().split(/\s+/);
      if (parts.length < 4) throw new Error('bad_fen');
      const rows = parts[0].split('/');
      if (rows.length !== 8) throw new Error('bad_fen');
      const b = new Int8Array(128);
      const king = [-1, -1];
      for (let r = 0; r < 8; r++) {
        let f = 0;
        for (const ch of rows[r]) {
          if (ch >= '1' && ch <= '8') { f += +ch; continue; }
          const t = 'pnbrqk'.indexOf(ch.toLowerCase()) + 1;
          if (!t || f > 7) throw new Error('bad_fen');
          const c = ch === ch.toUpperCase() ? 1 : -1, s = (7 - r) * 16 + f;
          if (t === K) { if (king[c > 0 ? 0 : 1] >= 0) throw new Error('bad_fen'); king[c > 0 ? 0 : 1] = s; }
          if (t === P && (r === 0 || r === 7)) throw new Error('bad_fen');
          b[s] = t * c; f++;
        }
        if (f !== 8) throw new Error('bad_fen');
      }
      if (king[0] < 0 || king[1] < 0) throw new Error('bad_fen');
      if (parts[1] !== 'w' && parts[1] !== 'b') throw new Error('bad_fen');
      let castle = 0;
      if (parts[2] !== '-') for (const ch of parts[2]) {
        const i = 'KQkq'.indexOf(ch);
        if (i < 0) throw new Error('bad_fen');
        castle |= 1 << i;
      }
      // Only rights that the pieces still allow
      if (b[4] !== K || b[7] !== R) castle &= ~1;
      if (b[4] !== K || b[0] !== R) castle &= ~2;
      if (b[116] !== -K || b[119] !== -R) castle &= ~4;
      if (b[116] !== -K || b[112] !== -R) castle &= ~8;
      const ep = parts[3] === '-' ? -1 : sqOf(parts[3]);
      if (parts[3] !== '-' && ep < 0) throw new Error('bad_fen');
      this.b = b; this.king = king; this.turn = parts[1] === 'w' ? 1 : -1; this.castle = castle;
      this.ep = ep; this.half = Math.max(0, parseInt(parts[4], 10) || 0); this.full = Math.max(1, parseInt(parts[5], 10) || 1);
      this.hist = [];
      this.hash = this.computeHash();
      this.hashes = [];
      if (this.attacked(this.king[this.turn > 0 ? 1 : 0], this.turn)) throw new Error('bad_fen'); // side not to move in check
    }

    computeHash() {
      let h = 0;
      for (let s = 0; s < 120; s++) if (onBoard(s) && this.b[s]) h ^= Z[(this.b[s] + 6) * 128 + s];
      h ^= ZCAS[this.castle];
      if (this.ep >= 0) h ^= ZEP[this.ep];
      if (this.turn < 0) h ^= ZSIDE;
      return h;
    }

    fen() {
      let out = '';
      for (let r = 7; r >= 0; r--) {
        let empty = 0;
        for (let f = 0; f < 8; f++) {
          const p = this.b[r * 16 + f];
          if (!p) { empty++; continue; }
          if (empty) { out += empty; empty = 0; }
          const l = LETTER[Math.abs(p)];
          out += p > 0 ? l : l.toLowerCase();
        }
        if (empty) out += empty;
        if (r) out += '/';
      }
      let c = '';
      if (this.castle & 1) c += 'K';
      if (this.castle & 2) c += 'Q';
      if (this.castle & 4) c += 'k';
      if (this.castle & 8) c += 'q';
      return `${out} ${this.turn > 0 ? 'w' : 'b'} ${c || '-'} ${this.ep >= 0 ? sqName(this.ep) : '-'} ${this.half} ${this.full}`;
    }

    // Is square s attacked by colour `by` (1 white, -1 black)?
    attacked(s, by) {
      const b = this.b;
      if (by > 0) {
        if (onBoard(s - 15) && b[s - 15] === P) return true;
        if (onBoard(s - 17) && b[s - 17] === P) return true;
      } else {
        if (onBoard(s + 15) && b[s + 15] === -P) return true;
        if (onBoard(s + 17) && b[s + 17] === -P) return true;
      }
      for (const o of N_OFF) { const t = s + o; if (onBoard(t) && b[t] === N * by) return true; }
      for (const o of K_OFF) { const t = s + o; if (onBoard(t) && b[t] === K * by) return true; }
      for (const d of B_DIR) {
        for (let t = s + d; onBoard(t); t += d) {
          const p = b[t];
          if (p) { if (p === B * by || p === Q * by) return true; break; }
        }
      }
      for (const d of R_DIR) {
        for (let t = s + d; onBoard(t); t += d) {
          const p = b[t];
          if (p) { if (p === R * by || p === Q * by) return true; break; }
        }
      }
      return false;
    }

    inCheck() { return this.attacked(this.king[this.turn > 0 ? 0 : 1], -this.turn); }

    // Pseudo-legal moves (own king may be left in check) of the side to move.
    // tactical: only captures and promotions (quiescence search).
    gen(tactical) {
      const b = this.b, c = this.turn, out = [];
      const add = (from, to, piece, cap, promo, flag) => out.push({ from, to, piece, cap, promo, flag });
      const pawnTo = (from, to, cap) => {
        const r = to >> 4;
        if (r === 7 || r === 0) for (const pr of [Q, N, R, B]) add(from, to, P * c, cap, pr, 0);
        else add(from, to, P * c, cap, 0, 0);
      };
      for (let s = 0; s < 120; s++) {
        if (s & 0x88) { s += 7; continue; }
        const p = b[s];
        if (!p || (p > 0) !== (c > 0)) continue;
        const t = p * c;
        if (t === P) {
          const fwd = 16 * c, one = s + fwd, r = s >> 4;
          if (!b[one]) {
            const promoting = (one >> 4) === 7 || (one >> 4) === 0;
            if (!tactical || promoting) pawnTo(s, one, 0);
            if (!tactical && r === (c > 0 ? 1 : 6) && !b[one + fwd]) add(s, one + fwd, p, 0, 0, 1);
          }
          for (const to of [one - 1, one + 1]) {
            if (!onBoard(to)) continue;
            const q = b[to];
            if (q && (q > 0) !== (c > 0)) pawnTo(s, to, q);
            else if (to === this.ep && !q) add(s, to, p, -P * c, 0, 2);
          }
        } else if (t === N || t === K) {
          for (const o of t === N ? N_OFF : K_OFF) {
            const to = s + o;
            if (!onBoard(to)) continue;
            const q = b[to];
            if (!q) { if (!tactical) add(s, to, p, 0, 0, 0); } else if ((q > 0) !== (c > 0)) add(s, to, p, q, 0, 0);
          }
        } else {
          const dirs = t === B ? B_DIR : t === R ? R_DIR : K_OFF;
          for (const d of dirs) {
            for (let to = s + d; onBoard(to); to += d) {
              const q = b[to];
              if (!q) { if (!tactical) add(s, to, p, 0, 0, 0); continue; }
              if ((q > 0) !== (c > 0)) add(s, to, p, q, 0, 0);
              break;
            }
          }
        }
      }
      if (!tactical) {
        // Castling: rights, empty squares, king not in check and not passing an attacked square
        const e = c > 0 ? 4 : 116, ks = c > 0 ? 1 : 4, qs = c > 0 ? 2 : 8;
        if ((this.castle & ks) && !b[e + 1] && !b[e + 2] && !this.attacked(e, -c) && !this.attacked(e + 1, -c) && !this.attacked(e + 2, -c)) add(e, e + 2, K * c, 0, 0, 3);
        if ((this.castle & qs) && !b[e - 1] && !b[e - 2] && !b[e - 3] && !this.attacked(e, -c) && !this.attacked(e - 1, -c) && !this.attacked(e - 2, -c)) add(e, e - 2, K * c, 0, 0, 3);
      }
      return out;
    }

    make(m) {
      const b = this.b, c = this.turn;
      this.hist.push({ m, castle: this.castle, ep: this.ep, half: this.half, hash: this.hash });
      this.hashes.push(this.hash);
      let h = this.hash ^ Z[(m.piece + 6) * 128 + m.from];
      const placed = m.promo ? m.promo * c : m.piece;
      if (m.cap) { const cs = m.flag === 2 ? m.to - 16 * c : m.to; h ^= Z[(m.cap + 6) * 128 + cs]; b[cs] = 0; }
      b[m.from] = 0; b[m.to] = placed;
      h ^= Z[(placed + 6) * 128 + m.to];
      if (m.flag === 3) {
        const [rf, rt] = m.to > m.from ? [m.from + 3, m.from + 1] : [m.from - 4, m.from - 1];
        b[rt] = b[rf]; b[rf] = 0;
        h ^= Z[(R * c + 6) * 128 + rf] ^ Z[(R * c + 6) * 128 + rt];
      }
      if (m.piece === K * c) this.king[c > 0 ? 0 : 1] = m.to;
      h ^= ZCAS[this.castle];
      this.castle &= CASTLE_MASK[m.from] & CASTLE_MASK[m.to];
      h ^= ZCAS[this.castle];
      if (this.ep >= 0) h ^= ZEP[this.ep];
      // En passant square only if an enemy pawn stands next to the pawn (keeps repetitions exact)
      this.ep = -1;
      if (m.flag === 1 && ((onBoard(m.to - 1) && b[m.to - 1] === -P * c) || (onBoard(m.to + 1) && b[m.to + 1] === -P * c))) {
        this.ep = m.from + 16 * c; h ^= ZEP[this.ep];
      }
      this.half = m.piece === P * c || m.cap ? 0 : this.half + 1;
      if (c < 0) this.full++;
      this.turn = -c;
      this.hash = h ^ ZSIDE;
    }

    unmake() {
      const u = this.hist.pop(), m = u.m, b = this.b;
      this.hashes.pop();
      this.turn = -this.turn;
      const c = this.turn;
      b[m.from] = m.piece; b[m.to] = 0;
      if (m.cap) b[m.flag === 2 ? m.to - 16 * c : m.to] = m.cap;
      if (m.flag === 3) {
        const [rf, rt] = m.to > m.from ? [m.from + 3, m.from + 1] : [m.from - 4, m.from - 1];
        b[rf] = b[rt]; b[rt] = 0;
      }
      if (m.piece === K * c) this.king[c > 0 ? 0 : 1] = m.from;
      this.castle = u.castle; this.ep = u.ep; this.half = u.half; this.hash = u.hash;
      if (c < 0) this.full--;
    }

    // Did the last move leave the mover's own king in check?
    leftInCheck() { return this.attacked(this.king[this.turn > 0 ? 1 : 0], this.turn); }

    moves() {
      const out = [];
      for (const m of this.gen(false)) {
        this.make(m);
        if (!this.leftInCheck()) out.push(m);
        this.unmake();
      }
      return out;
    }

    // Exact position for repetitions in the game (board, side, castling, en passant)
    key() { return this.fen().split(' ').slice(0, 4).join(' '); }

    // Not enough material for anybody to mate: no pawns, rooks, queens and at most one minor piece,
    // or only bishops all on squares of one colour
    insufficient() {
      const minors = [];
      for (let s = 0; s < 120; s++) {
        if (!onBoard(s)) continue;
        const t = Math.abs(this.b[s]);
        if (!t || t === K) continue;
        if (t !== N && t !== B) return false;
        minors.push({ t, shade: ((s >> 4) + (s & 7)) % 2 });
      }
      if (minors.length <= 1) return true;
      return minors.every(x => x.t === B && x.shade === minors[0].shade);
    }
  }

  const uci = m => sqName(m.from) + sqName(m.to) + (m.promo ? LETTER[m.promo].toLowerCase() : '');

  // Standard algebraic notation of a legal move `m` in position `pos` (legal = pos.moves())
  function san(pos, m, legal) {
    let s;
    const t = Math.abs(m.piece);
    if (m.flag === 3) s = m.to > m.from ? 'O-O' : 'O-O-O';
    else if (t === P) {
      s = (m.cap ? FILES[m.from & 7] + 'x' : '') + sqName(m.to) + (m.promo ? '=' + LETTER[m.promo] : '');
    } else {
      s = LETTER[t];
      const others = legal.filter(o => o.piece === m.piece && o.to === m.to && o.from !== m.from);
      if (others.length) {
        const sameFile = others.some(o => (o.from & 7) === (m.from & 7));
        const sameRank = others.some(o => (o.from >> 4) === (m.from >> 4));
        s += !sameFile ? FILES[m.from & 7] : !sameRank ? String((m.from >> 4) + 1) : sqName(m.from);
      }
      s += (m.cap ? 'x' : '') + sqName(m.to);
    }
    pos.make(m);
    if (pos.inCheck()) s += pos.moves().length ? '+' : '#';
    pos.unmake();
    return s;
  }

  // Comparable form of a SAN: no check marks, annotations, "x" or "="; castling with zeros accepted
  const normSan = s => String(s).trim().replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O').replace(/[+#!?x=:]/g, '');

  /* ---------- Game: a position with its history, notation and result ---------- */
  class Game {
    constructor(fen) {
      this.pos = new Position(fen || START);
      this.startFen = this.pos.fen();
      this.log = []; // { uci, san, from, to, piece, cap, promo, flag }
      this.keys = [this.pos.key()];
      this.ended = null; // { result, reason } for resign / agreed draw
      this.cache = null;
    }

    legal() {
      if (!this.cache) {
        const list = this.pos.moves();
        this.cache = list.map(m => Object.assign({ uci: uci(m), san: san(this.pos, m, list) }, m));
      }
      return this.cache;
    }

    turn() { return this.pos.turn > 0 ? 'w' : 'b'; }
    fen() { return this.pos.fen(); }

    // Finds a legal move from UCI ("e2e4", "e7e8q") or SAN ("Nf3", "exd5", "O-O"); null if none fits
    find(input) {
      const s = String(input || '').trim();
      if (!s) return null;
      const list = this.legal();
      const u = s.toLowerCase();
      if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u)) {
        const hit = list.find(m => m.uci === u) || (u.length === 4 ? list.find(m => m.uci === u + 'q') : null);
        if (hit) return hit;
      }
      const n = normSan(s);
      return list.find(m => normSan(m.san) === n) || null;
    }

    play(input) {
      if (this.status().over) throw new Error('game_over');
      const m = typeof input === 'object' && input ? this.find(input.uci || uci(input)) : this.find(input);
      if (!m) throw new Error('illegal');
      this.pos.make(m);
      this.log.push(m);
      this.keys.push(this.pos.key());
      this.cache = null;
      return m;
    }

    undo() {
      if (!this.log.length) return null;
      this.pos.unmake();
      this.keys.pop();
      this.cache = null;
      this.ended = null;
      return this.log.pop();
    }

    // { over, result: '1-0' | '0-1' | '1/2-1/2' | '*', reason, winner: 'w' | 'b' | null, check }
    status() {
      const check = this.pos.inCheck();
      const done = (result, reason) => ({ over: true, result, reason, winner: result === '1-0' ? 'w' : result === '0-1' ? 'b' : null, check });
      if (this.ended) return done(this.ended.result, this.ended.reason);
      if (!this.legal().length) return check ? done(this.pos.turn > 0 ? '0-1' : '1-0', 'checkmate') : done('1/2-1/2', 'stalemate');
      if (this.pos.insufficient()) return done('1/2-1/2', 'material');
      const key = this.keys[this.keys.length - 1];
      if (this.keys.filter(k => k === key).length >= 3) return done('1/2-1/2', 'repetition');
      if (this.pos.half >= 100) return done('1/2-1/2', 'fifty');
      return { over: false, result: '*', reason: null, winner: null, check };
    }

    resign(color) {
      if (this.status().over) throw new Error('game_over');
      this.ended = { result: color === 'w' ? '0-1' : '1-0', reason: 'resign' };
    }
    agreeDraw() {
      if (this.status().over) throw new Error('game_over');
      this.ended = { result: '1/2-1/2', reason: 'agreed' };
    }

    // Piece on a square name: { color: 'w' | 'b', type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k' } or null
    at(name) {
      const p = this.pos.b[sqOf(name)];
      return p ? { color: p > 0 ? 'w' : 'b', type: 'pnbrqk'[Math.abs(p) - 1] } : null;
    }

    // Movetext in PGN: "1. e4 e5 2. Nf3 …" (with the start move number of the FEN)
    movetext() {
      const g = new Game(this.startFen);
      let out = '', first = true;
      for (const m of this.log) {
        const num = g.pos.full;
        if (g.pos.turn > 0) out += (out ? ' ' : '') + num + '. ';
        else if (first) out += num + '... ';
        else out += ' ';
        out += g.find(uci(m)).san;
        g.play(uci(m));
        first = false;
      }
      return out;
    }

    pgn(tags) {
      const st = this.status();
      const t = Object.assign({ Event: 'Casual game', Site: '?', Date: '????.??.??', Round: '-', White: '?', Black: '?', Result: st.result }, tags || {});
      if (this.startFen !== START) { t.SetUp = '1'; t.FEN = this.startFen; }
      const head = Object.entries(t).map(([k, v]) => `[${k} "${String(v).replace(/["\\]/g, '')}"]`).join('\n');
      const text = (this.movetext() + ' ' + st.result).trim();
      // Lines of at most 80 characters
      const lines = [];
      let line = '';
      for (const w of text.split(' ')) {
        if (line && (line + ' ' + w).length > 80) { lines.push(line); line = w; } else line = line ? line + ' ' + w : w;
      }
      if (line) lines.push(line);
      return head + '\n\n' + lines.join('\n') + '\n';
    }
  }

  /* ---------- Computer player ---------- */
  const VAL = [0, 100, 320, 330, 500, 900, 0];
  const PHASE = [0, 0, 1, 1, 2, 4, 0];
  // Piece-square tables from White's view, a8 … h1 row by row (classic "simplified evaluation")
  const PST = [null,
    [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
      0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
      -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
      -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
      0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
      -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
  ];
  const KING_END = [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50];
  const pstIndex = (s, white) => (white ? (7 - (s >> 4)) * 8 : (s >> 4) * 8) + (s & 7);
  const centerDist = s => Math.max(3 - (s >> 4), (s >> 4) - 4) + Math.max(3 - (s & 7), (s & 7) - 4);

  // Static evaluation in centipawns from the view of the side to move
  function evaluate(pos) {
    const b = pos.b;
    let mid = 0, endK = 0, midK = 0, phase = 0, matW = 0, matB = 0, bishW = 0, bishB = 0;
    for (let s = 0; s < 120; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = b[s];
      if (!p) continue;
      const t = Math.abs(p), white = p > 0, i = pstIndex(s, white), sign = white ? 1 : -1;
      phase += PHASE[t];
      if (t === K) { midK += sign * PST[K][i]; endK += sign * KING_END[i]; continue; }
      mid += sign * (VAL[t] + PST[t][i]);
      if (white) matW += VAL[t]; else matB += VAL[t];
      if (t === B) { if (white) bishW++; else bishB++; }
    }
    phase = Math.min(24, phase);
    let score = mid + (midK * phase + endK * (24 - phase)) / 24;
    if (bishW >= 2) score += 30;
    if (bishB >= 2) score -= 30;
    // Endgame with a clear lead: drive the lone king to the edge and bring the own king closer
    const lead = matW - matB;
    if (phase <= 8 && Math.abs(lead) >= 300) {
      const [wk, bk] = pos.king, loser = lead > 0 ? bk : wk;
      const dist = Math.abs((wk >> 4) - (bk >> 4)) + Math.abs((wk & 7) - (bk & 7));
      const mop = 10 * centerDist(loser) + 4 * (14 - dist);
      score += lead > 0 ? mop : -mop;
    }
    return Math.round(score) * pos.turn;
  }

  const MATE = 100000, INF = 1000000;
  const LEVELS = {
    // depth: plies at the root; quiet: quiescence search; noise: random centipawns per root move;
    // time: limit in ms (the first depth always finishes)
    easy: { depth: 1, quiet: false, noise: 180, time: 400 },
    medium: { depth: 2, quiet: true, noise: 45, time: 800 },
    hard: { depth: 3, quiet: true, noise: 12, time: 1500 },
    expert: { depth: 8, quiet: true, noise: 0, time: 2000 },
  };
  const ABORT = { abort: true };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // Best move for the side to move: { move, score, depth, nodes } or null without legal moves.
  // opts: { level: 'easy' | 'medium' | 'hard' | 'expert' } or explicit { depth, quiet, noise, time }, rnd
  function search(pos, opts) {
    const o = Object.assign({}, LEVELS[(opts && opts.level) || 'medium'] || LEVELS.medium, opts || {});
    const rnd = o.rnd || Math.random;
    const start = now(), rootLen = pos.hist.length;
    let nodes = 0, deadline = Infinity, maxPly = 0;
    const killers = [];

    const order = (list, ply) => {
      const k = killers[ply] || [];
      for (const m of list) {
        m.o = m.cap ? 10000 + VAL[Math.abs(m.cap)] * 10 - VAL[Math.abs(m.piece)] / 10 : m.promo ? 9000 + VAL[m.promo]
          : (k[0] && k[0].from === m.from && k[0].to === m.to) ? 8000 : (k[1] && k[1].from === m.from && k[1].to === m.to) ? 7000 : 0;
      }
      return list.sort((a, b) => b.o - a.o);
    };
    const repeated = () => {
      // Same position earlier within the half-move clock (same side to move): draw
      const hs = pos.hashes, n = hs.length;
      for (let i = n - 2, k = 0; i >= 0 && k < pos.half; i -= 2, k += 2) if (hs[i] === pos.hash) return true;
      return false;
    };

    function quiesce(alpha, beta, ply) {
      if ((++nodes & 1023) === 0 && now() > deadline) throw ABORT;
      const stand = evaluate(pos);
      if (!o.quiet || ply > 40) return stand;
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      for (const m of order(pos.gen(true), ply)) {
        pos.make(m);
        if (pos.leftInCheck()) { pos.unmake(); continue; }
        const v = -quiesce(-beta, -alpha, ply + 1);
        pos.unmake();
        if (v >= beta) return v;
        if (v > alpha) alpha = v;
      }
      return alpha;
    }

    function negamax(depth, alpha, beta, ply) {
      if ((++nodes & 1023) === 0 && now() > deadline) throw ABORT;
      if (pos.half >= 100 || repeated()) return 0;
      const check = pos.inCheck();
      if (depth <= 0 && (!check || ply >= maxPly)) return quiesce(alpha, beta, ply);
      let best = -INF, legal = 0;
      for (const m of order(pos.gen(false), ply)) {
        pos.make(m);
        if (pos.leftInCheck()) { pos.unmake(); continue; }
        legal++;
        const v = -negamax(depth - 1, -beta, -alpha, ply + 1);
        pos.unmake();
        if (v > best) best = v;
        if (v > alpha) alpha = v;
        if (alpha >= beta) {
          if (!m.cap) { const k = killers[ply] || (killers[ply] = []); if (!k[0] || k[0].from !== m.from || k[0].to !== m.to) { k[1] = k[0]; k[0] = m; } }
          break;
        }
      }
      if (!legal) return check ? -MATE + ply : 0;
      return best;
    }

    const root = pos.moves();
    if (!root.length) return null;
    // Shuffle first: equally good moves are picked at random (variety between games)
    for (let i = root.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [root[i], root[j]] = [root[j], root[i]]; }
    let scores = null, depth = 0;
    let list = order(root.slice(), 0);
    for (let d = 1; d <= o.depth; d++) {
      if (d > 1) deadline = start + o.time;
      maxPly = d * 2 + 4;
      const sc = new Map();
      let alpha = -INF, bestD = null;
      try {
        // With noise every root move gets its exact value; without, the others only need to be worse (a bound)
        for (const m of list) {
          pos.make(m);
          const v = o.noise > 0 ? -negamax(d - 1, -INF, INF, 1) : -negamax(d - 1, -INF, -alpha, 1);
          pos.unmake();
          sc.set(m, v);
          if (v > alpha) { alpha = v; bestD = m; }
        }
      } catch (e) {
        if (e !== ABORT) throw e;
        // Undo the moves of the interrupted search
        while (pos.hist.length > rootLen) pos.unmake();
        break;
      }
      scores = sc; depth = d;
      list = [bestD, ...root.filter(m => m !== bestD).sort((a, b) => sc.get(b) - sc.get(a))];
      if (Math.abs(alpha) >= MATE - 100) break; // a mate was found
      if (now() - start > o.time / 2) break; // the next depth would not finish in time
    }
    let best = list[0], bestV = -Infinity;
    const top = scores.get(list[0]);
    if (o.noise > 0 && top < MATE - 100) {
      for (const m of list) {
        const v = scores.get(m) + (rnd() * 2 - 1) * o.noise;
        if (v > bestV) { bestV = v; best = m; }
      }
    }
    return { move: best, uci: uci(best), score: scores.get(best), depth, nodes, ms: Math.round(now() - start) };
  }

  // Search from a game: start position and moves in UCI (so repetitions are known)
  function think(startFen, moves, opts) {
    const pos = new Position(startFen || START);
    for (const u of moves || []) {
      const m = pos.moves().find(x => uci(x) === u);
      if (!m) throw new Error('illegal');
      pos.make(m);
    }
    return search(pos, opts);
  }

  // Count leaf nodes (move generator check)
  function perft(pos, depth) {
    if (!depth) return 1;
    let n = 0;
    for (const m of pos.gen(false)) {
      pos.make(m);
      if (!pos.leftInCheck()) n += depth === 1 ? 1 : perft(pos, depth - 1);
      pos.unmake();
    }
    return n;
  }

  root.Chess = { START, LEVELS, Position, Game, think, evaluate, perft, uci, sqName, sqOf };
})(typeof self !== 'undefined' ? self : globalThis);
