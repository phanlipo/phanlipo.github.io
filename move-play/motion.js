// MovePlay – motion engine (no DOM). Turns the 33 body points of MediaPipe Pose into movements.
//
//   const m = Motion.create({ full: true })          full: the whole body (down to the ankles) must be visible
//   const events = m.update(points, t, aspect)       points: Float32Array x,y,z,visibility × 33 (x, y: 0…1) or null,
//                                                    t: ms, aspect: picture width / height
//   m.state                                          see below; m.recalibrate() starts the calibration again
//
// Events (only once calibrated): { type, t } with type in Motion.EVENTS.
// Distances are measured in "torso lengths" (shoulders to hips while standing, u) – the same for children and
// adults and independent of how far the player stands from the camera. x is multiplied by the aspect ratio first,
// so a step sideways and a step up are the same distance.
(function (root) {
  'use strict';

  const P = { nose: 0, lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16, lIdx: 19, rIdx: 20, lHip: 23, rHip: 24, lKnee: 25, rKnee: 26, lAnk: 27, rAnk: 28 };
  // Lines of the stick figure (for drawing)
  const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
  const EVENTS = ['jump', 'duck', 'squat', 'armsUp', 'armLeft', 'armRight', 'clap', 'jumpingJack'];

  // Thresholds in torso lengths (see the tests in tests/move-play.spec.mjs)
  const T = {
    vis: 0.5,           // a point counts as seen from this visibility on
    calibMs: 1200,      // stand still this long to calibrate
    still: 0.12,        // … moving less than this
    jumpUp: 0.2, jumpDown: 0.1, jumpShoulder: 0.15, jumpAnkle: 0.08,
    duckDown: 0.45, duckUp: 0.25,
    squatDown: 0.35, squatUp: 0.18,
    armUp: 0.1,         // wrist this far above the nose
    singleMs: 250,      // one arm up (the other stays down) this long → armLeft / armRight
    clapIn: 0.3, clapOut: 0.7,
    jackOpen: 0.8, jackClosed: 0.6,
    lostMs: 600,        // no person this long → forget the smoothing
    forgetMs: 5000,     // … this long → calibrate again
    scaleDiff: 0.3, scaleMs: 1500,  // torso length differs this much for this long (player came closer) → calibrate again
  };

  function create(opts) {
    const full = !(opts && opts.full === false);
    const sm = new Float32Array(33 * 3);   // smoothed x (× aspect), y, visibility
    let have = false, lastSeen = -1e9, lastT = null, aspect = 1;
    let base = null, anchor = null, calibT = 0, sums = null;
    let scaleSince = null;
    const st = {
      present: false, visible: false, calibrated: false, calib: 0,
      airborne: false, ducking: false, squatting: false, armL: false, armR: false, armsUp: false,
      hands: [], body: null, energy: 0, points: null, aspect: 1,
    };
    let single = null, apart = null, jack = 'closed', prev = null;

    const X = i => sm[3 * i], Y = i => sm[3 * i + 1], V = i => sm[3 * i + 2];
    const seen = i => V(i) >= T.vis && Y(i) > 0 && Y(i) < 1 && X(i) > 0 && X(i) < aspect;
    const mid = (a, b) => [(X(a) + X(b)) / 2, (Y(a) + Y(b)) / 2];
    const needed = () => [P.nose, P.lSh, P.rSh, P.lHip, P.rHip].concat(full ? [P.lAnk, P.rAnk] : []);
    const anklesSeen = () => seen(P.lAnk) && seen(P.rAnk);

    function measure() {
      const sh = mid(P.lSh, P.rSh), hip = mid(P.lHip, P.rHip);
      return { shX: sh[0], shY: sh[1], hipX: hip[0], hipY: hip[1], noseY: Y(P.nose),
        ankY: anklesSeen() ? (Y(P.lAnk) + Y(P.rAnk)) / 2 : null, torso: Math.hypot(sh[0] - hip[0], sh[1] - hip[1]) };
    }

    function resetMoves() {
      Object.assign(st, { airborne: false, ducking: false, squatting: false, armL: false, armR: false, armsUp: false });
      single = null; apart = null; jack = 'closed';
    }
    function recalibrate() {
      base = null; anchor = null; calibT = 0; sums = null; scaleSince = null;
      st.calibrated = false; st.calib = 0; resetMoves();
    }

    function calibrate(m, dt) {
      if (!anchor || Math.hypot(m.hipX - anchor.hipX, m.hipY - anchor.hipY) > T.still * anchor.torso
        || Math.abs(m.torso - anchor.torso) > T.still * anchor.torso) {
        anchor = m; calibT = 0; sums = null;
      } else calibT += dt;
      sums = sums || { n: 0, shY: 0, hipX: 0, hipY: 0, noseY: 0, ankY: 0, ankN: 0, torso: 0 };
      sums.n++; sums.shY += m.shY; sums.hipX += m.hipX; sums.hipY += m.hipY; sums.noseY += m.noseY; sums.torso += m.torso;
      if (m.ankY != null) { sums.ankY += m.ankY; sums.ankN++; }
      st.calib = Math.min(1, calibT / T.calibMs);
      if (calibT >= T.calibMs) {
        const n = sums.n;
        base = { shY: sums.shY / n, hipX: sums.hipX / n, hipY: sums.hipY / n, noseY: sums.noseY / n, torso: sums.torso / n,
          ankY: sums.ankN ? sums.ankY / sums.ankN : null };
        st.calibrated = true; st.calib = 1; resetMoves();
      }
    }

    function moves(m, t, dt, out) {
      const u = base.torso;
      const emit = type => out.push({ type, t });
      const hipRel = (base.hipY - m.hipY) / u;          // > 0: hips higher than when standing
      const shRel = (base.shY - m.shY) / u;
      const noseDrop = (m.noseY - base.noseY) / u;      // > 0: head lower
      const ankRel = m.ankY != null && base.ankY != null ? (base.ankY - m.ankY) / u : null;

      // Jump: hips and shoulders go up together (and the feet leave the ground, if they are in the picture)
      if (!st.airborne && hipRel > T.jumpUp && shRel > T.jumpShoulder && (ankRel == null || ankRel > T.jumpAnkle)) { st.airborne = true; emit('jump'); }
      else if (st.airborne && hipRel < T.jumpDown) st.airborne = false;
      // Duck: the head goes down
      if (!st.ducking && noseDrop > T.duckDown) { st.ducking = true; emit('duck'); }
      else if (st.ducking && noseDrop < T.duckUp) st.ducking = false;
      // Squat: the hips go down
      if (!st.squatting && -hipRel > T.squatDown) { st.squatting = true; emit('squat'); }
      else if (st.squatting && -hipRel < T.squatUp) st.squatting = false;

      // Arms: up = wrist clearly above the nose, down again = wrist below the shoulders (hysteresis)
      const arm = (wr, sh, was) => !seen(wr) ? false : was ? Y(wr) < Y(sh) : Y(wr) < m.noseY - T.armUp * u;
      const wasBoth = st.armsUp, wasL = st.armL, wasR = st.armR;
      st.armL = arm(P.lWr, P.lSh, st.armL); st.armR = arm(P.rWr, P.rSh, st.armR);
      st.armsUp = st.armL && st.armR;
      if (st.armsUp && !wasBoth) emit('armsUp');
      // One arm: it goes up while the other one is down, and the other one stays down for a moment
      // (raising both is rarely exactly simultaneous; lowering both neither – that must not count)
      if (st.armL && !wasL && !st.armR) single = { type: 'armLeft', t };
      else if (st.armR && !wasR && !st.armL) single = { type: 'armRight', t };
      if (single && (st.armL && st.armR || !st.armL && !st.armR)) single = null;
      if (single && t - single.t >= T.singleMs) { emit(single.type); single = null; }

      // Clap: hands come together after having been apart
      if (seen(P.lWr) && seen(P.rWr)) {
        const d = Math.hypot(X(P.lWr) - X(P.rWr), Y(P.lWr) - Y(P.rWr)) / u;
        if (apart == null) apart = d > T.clapIn;
        else if (apart && d < T.clapIn) { apart = false; emit('clap'); }
        else if (!apart && d > T.clapOut) apart = true;
      }

      // Jumping jack: arms up (and legs apart, if seen) → arms down (and legs together) = one
      const spread = anklesSeen() ? Math.abs(X(P.lAnk) - X(P.rAnk)) / u : null;
      const down = seen(P.lWr) && seen(P.rWr) && Y(P.lWr) > Y(P.lSh) && Y(P.rWr) > Y(P.rSh);
      if (jack === 'closed' && st.armsUp && (spread == null || spread > T.jackOpen)) jack = 'open';
      else if (jack === 'open' && down && (spread == null || spread < T.jackClosed)) { jack = 'closed'; emit('jumpingJack'); }

      // Slowly follow the standing position (the phone may slip, the player may shift a little)
      const calm = !st.airborne && !st.ducking && !st.squatting && Math.abs(hipRel) < T.still && Math.abs(shRel) < T.still && Math.abs(noseDrop) < T.still;
      if (calm) {
        const k = Math.min(1, dt / 2000);
        // (not the torso length: a big change of it means the player came closer – see below)
        for (const key of ['shY', 'hipX', 'hipY', 'noseY']) base[key] += (m[key] - base[key]) * k;
        if (m.ankY != null && base.ankY != null) base.ankY += (m.ankY - base.ankY) * k;
      }
      // Came much closer or went further away: calibrate again
      if (!st.ducking && !st.squatting && Math.abs(m.torso - base.torso) > T.scaleDiff * base.torso) {
        if (scaleSince == null) scaleSince = t;
        else if (t - scaleSince > T.scaleMs) { recalibrate(); out.push({ type: 'recalibrate', t }); }
      } else scaleSince = null;
    }

    function update(points, t, asp) {
      const out = [];
      const dt = lastT == null ? 0 : Math.max(0, Math.min(200, t - lastT));
      lastT = t;
      aspect = asp || 1; st.aspect = aspect;
      if (!points) {
        st.present = false; st.visible = false; st.hands = []; st.points = null;
        if (t - lastSeen > T.lostMs) { have = false; resetMoves(); }
        if (t - lastSeen > T.forgetMs && (st.calibrated || anchor)) recalibrate();
        if (!st.calibrated) { anchor = null; calibT = 0; st.calib = 0; }
        return out;
      }
      // Smoothing: a little (fast movements must not be delayed much)
      const a = have ? 0.6 : 1;
      for (let i = 0; i < 33; i++) {
        sm[3 * i] += (points[4 * i] * aspect - sm[3 * i]) * a;
        sm[3 * i + 1] += (points[4 * i + 1] - sm[3 * i + 1]) * a;
        sm[3 * i + 2] += (points[4 * i + 3] - sm[3 * i + 2]) * a;
      }
      have = true; lastSeen = t;
      st.present = true;
      st.visible = needed().every(seen);
      const m = measure();
      // Energy: how much the body moves (torso lengths per second, smoothed) – e.g. for freeze games
      if (prev && dt > 0 && m.torso > 0) {
        const v = (Math.hypot(m.hipX - prev.hipX, m.hipY - prev.hipY) + Math.abs(m.noseY - prev.noseY)
          + Math.hypot(X(P.lWr) - prev.lw[0], Y(P.lWr) - prev.lw[1]) + Math.hypot(X(P.rWr) - prev.rw[0], Y(P.rWr) - prev.rw[1])) / m.torso / (dt / 1000);
        st.energy += (v - st.energy) * Math.min(1, dt / 300);
      }
      prev = { hipX: m.hipX, hipY: m.hipY, noseY: m.noseY, lw: [X(P.lWr), Y(P.lWr)], rw: [X(P.rWr), Y(P.rWr)] };

      if (!st.calibrated) { if (st.visible) calibrate(m, dt); else { anchor = null; calibT = 0; st.calib = 0; } }
      else if (st.visible || (seen(P.lSh) && seen(P.rSh) && seen(P.lHip) && seen(P.rHip))) moves(m, t, dt, out);

      // Hands (middle of wrist and index finger) and body, in picture coordinates 0…1 (not mirrored)
      st.hands = [[P.lWr, P.lIdx], [P.rWr, P.rIdx]].filter(([w]) => seen(w))
        .map(([w, f]) => ({ x: (seen(f) ? (X(w) + X(f)) / 2 : X(w)) / aspect, y: seen(f) ? (Y(w) + Y(f)) / 2 : Y(w) }));
      const u = base ? base.torso : m.torso;
      st.body = { x: m.shX / aspect, shoulderY: m.shY, hipY: m.hipY, headY: m.noseY, u, ux: u / aspect };
      st.points = Array.from({ length: 33 }, (_, i) => ({ x: X(i) / aspect, y: Y(i), seen: seen(i) }));
      return out;
    }

    return { update, recalibrate, state: st, get base() { return base && { ...base }; } };
  }

  root.Motion = { create, EVENTS, BONES, P, T };
})(typeof self !== 'undefined' ? self : globalThis);
