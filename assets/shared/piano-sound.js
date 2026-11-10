/* Generated instrument sounds (Web Audio, no recordings) for the Klavier (piano/) and the Liederbuch
   (songbook/). PianoSound({ sound: () => 'piano'|'epiano'|'organ'|'synth', volume: () => 0…100, log })
   returns { ctx, peek, unlock, voice, setVolume, now, state }:
   - ctx() creates the AudioContext on first use (null if the browser has none), peek() only returns it
   - unlock() resumes it – call it in a tap/click handler, browsers only play sound after a user gesture
   - voice(note, velocity 0…1, when, duration?) starts a MIDI note at AudioContext time `when` and
     returns { stop(at) }; with a duration the release is scheduled too. */
(function () {
'use strict';
const SOUNDS = ['piano', 'epiano', 'organ', 'synth'];

function PianoSound(opts) {
  const log = opts.log || (() => {});
  let ac = null, master = null;
  const waves = {};
  function ctx() {
    if (ac) return ac;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) { log('no AudioContext'); return null; }
    try {
      ac = new C();
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 6;
      master = ac.createGain(); master.gain.value = opts.volume() / 100;
      master.connect(comp); comp.connect(ac.destination);
      const wave = h => { const re = new Float32Array(h.length), im = new Float32Array(h); return ac.createPeriodicWave(re, im); };
      waves.piano = wave([0, 1, .55, .32, .22, .14, .1, .06, .045, .03, .02]);
      waves.organ = wave([0, 1, .8, .5, 0, .3, 0, .15, .2]);
      log('audio context created', { state: ac.state, rate: ac.sampleRate });
    } catch (e) { log('audio context failed', { error: String(e) }); ac = null; }
    return ac;
  }
  function unlock() {
    const c = ctx();
    if (c && c.state !== 'running') c.resume().then(() => log('audio resumed', { state: c.state }), e => log('audio resume failed', { error: String(e) }));
  }
  const freq = n => 440 * Math.pow(2, (n - 69) / 12);
  function voice(n, vel, when, dur) {
    const c = ctx(); if (!c) return null;
    const f = freq(n), kind = SOUNDS.includes(opts.sound()) ? opts.sound() : 'piano';
    const out = c.createGain(); out.gain.value = 0; out.connect(master);
    const g = out.gain, nodes = [];
    const osc = (type, detune, dst) => { const o = c.createOscillator(); if (type === 'piano' || type === 'organ') o.setPeriodicWave(waves[type]); else o.type = type; o.frequency.value = f; o.detune.value = detune; o.connect(dst); nodes.push(o); return o; };
    let rel = .15;
    const peak = .28 * (.35 + .65 * vel);
    if (kind === 'piano' || kind === 'synth') {
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = .7; lp.connect(out);
      const tau = Math.min(2.4, Math.max(.25, .9 * Math.sqrt(261.6 / f)));
      if (kind === 'piano') {
        osc('piano', -3, lp); osc('piano', 3, lp);
        lp.frequency.setValueAtTime(Math.min(16000, f * 6 + 2500 * vel), when);
        lp.frequency.setTargetAtTime(f * 2 + 400, when, tau * .7);
        g.setValueAtTime(0, when); g.linearRampToValueAtTime(peak, when + .004); g.setTargetAtTime(0, when + .004, tau);
        rel = .12;
      } else {
        osc('sawtooth', -8, lp); osc('sawtooth', 8, lp);
        lp.frequency.setValueAtTime(Math.min(14000, f * 4 + 1500 * vel), when);
        lp.frequency.setTargetAtTime(f * 2.5 + 500, when, .35);
        g.setValueAtTime(0, when); g.linearRampToValueAtTime(peak * .55, when + .01); g.setTargetAtTime(peak * .35, when + .01, .3);
        rel = .25;
      }
    } else if (kind === 'epiano') {
      const car = osc('sine', 0, out);
      const mod = c.createOscillator(); mod.frequency.value = f; nodes.push(mod);
      const mg = c.createGain(); mod.connect(mg); mg.connect(car.frequency);
      mg.gain.setValueAtTime(f * 2.2 * vel, when); mg.gain.setTargetAtTime(f * .2, when, .25);
      const tau = Math.min(2, Math.max(.3, 1.1 * Math.sqrt(261.6 / f)));
      g.setValueAtTime(0, when); g.linearRampToValueAtTime(peak * 1.1, when + .003); g.setTargetAtTime(0, when + .003, tau);
      rel = .2;
    } else {
      osc('organ', 0, out);
      g.setValueAtTime(0, when); g.linearRampToValueAtTime(peak * .7, when + .012);
      rel = .06;
    }
    for (const o of nodes) o.start(when);
    let stopped = false;
    const stop = at => {
      if (stopped) return; stopped = true;
      at = Math.max(at, when + .02, c.currentTime);
      g.cancelScheduledValues(at); g.setTargetAtTime(0, at, rel / 3);
      for (const o of nodes) try { o.stop(at + rel * 2 + .05); } catch (_) {}
    };
    nodes[0].onended = () => { try { out.disconnect(); } catch (_) {} };
    if (dur != null) stop(when + dur);
    else for (const o of nodes) o.stop(when + 30);   // safety: no endless voices
    return { stop };
  }
  return {
    ctx, unlock, voice,
    peek: () => ac,
    now: () => ac ? ac.currentTime : 0,
    state: () => ac ? ac.state : 'not created',
    setVolume: v => { if (master) master.gain.value = v / 100; }
  };
}
PianoSound.SOUNDS = SOUNDS;
window.PianoSound = PianoSound;
})();
