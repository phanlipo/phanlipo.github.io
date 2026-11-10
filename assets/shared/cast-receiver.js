/* Receiver side of assets/shared/cast.js – runs on the TV (assets/shared/cast-receiver.html).
   Messages on the namespace (JSON): sender → TV { type: 'offer', sdp, log } | { type: 'bye' } | { type: 'log', on };
   TV → sender { type: 'answer', sdp } | { type: 'status', … } | { type: 'error', message }. */
(() => {
  'use strict';
  const NS = 'urn:x-cast:io.github.phanlipo.stream';
  const $ = id => document.getElementById(id);
  const video = $('video'), idle = $('idle'), logEl = $('log');
  const de = /^de\b/i.test(navigator.language || '');
  const T = de
    ? { ready: 'Bereit für den Stream', hint: 'Starte das Streamen in der App auf dem Handy.', connecting: 'Verbinde …', ended: 'Stream beendet', nocast: 'Diese Seite läuft auf dem Fernseher (Chromecast / Android TV).' }
    : { ready: 'Ready for the stream', hint: 'Start streaming in the app on your phone.', connecting: 'Connecting …', ended: 'Stream ended', nocast: 'This page runs on the TV (Chromecast / Android TV).' };
  document.documentElement.lang = de ? 'de' : 'en';
  const lines = [];
  function log(...a) {
    const s = new Date().toISOString().slice(11, 23) + ' ' + a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ');
    lines.push(s); if (lines.length > 30) lines.shift();
    logEl.textContent = lines.join('\n');
    try { console.log('[stream]', s); } catch (_) {}
  }
  function showIdle(title, text) { $('idleTitle').textContent = title; $('idleText').textContent = text || ''; idle.hidden = false; }
  showIdle(T.ready, T.hint);
  window.addEventListener('error', e => log('error', String(e.message)));

  if (!window.cast || !cast.framework) { showIdle(T.ready, T.nocast); log('no cast framework'); return; }

  const ctx = cast.framework.CastReceiverContext.getInstance();
  let pc = null, senderId = null, statsTimer = 0, prevFrames = null;

  function send(msg) {
    if (!senderId) return;
    try { ctx.sendCustomMessage(NS, senderId, msg); } catch (e) { log('send failed', String(e)); }
  }
  function reset(title) {
    clearInterval(statsTimer); statsTimer = 0; prevFrames = null;
    if (pc) { try { pc.close(); } catch (_) {} pc = null; }
    video.srcObject = null;
    showIdle(title || T.ready, T.hint);
  }
  function gathered(peer) {
    if (peer.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise(res => {
      const t = setTimeout(done, 4000);
      function done() { clearTimeout(t); peer.removeEventListener('icegatheringstatechange', check); res(); }
      function check() { if (peer.iceGatheringState === 'complete') done(); }
      peer.addEventListener('icegatheringstatechange', check);
    });
  }
  async function play() {
    try { video.muted = false; await video.play(); }
    catch (e) {
      log('play with sound failed', String(e && e.name), '→ muted');
      video.muted = true;
      try { await video.play(); } catch (e2) { log('play failed', String(e2 && e2.name)); }
    }
  }
  async function status() {
    let fps;
    if (pc) {
      try {
        const r = await pc.getStats();
        r.forEach(s => {
          if (s.type === 'inbound-rtp' && s.kind === 'video') {
            if (prevFrames && s.timestamp > prevFrames.t) fps = Math.round((s.framesDecoded - prevFrames.n) / ((s.timestamp - prevFrames.t) / 1000));
            prevFrames = { n: s.framesDecoded || 0, t: s.timestamp };
          }
        });
      } catch (_) {}
    }
    send({ type: 'status', state: pc ? pc.connectionState : 'idle', video: !!video.srcObject, width: video.videoWidth, height: video.videoHeight, fps, playing: !video.paused, muted: video.muted });
  }

  async function onOffer(m) {
    reset(T.connecting);
    showIdle(T.connecting, '');
    logEl.hidden = !m.log;
    pc = new RTCPeerConnection({ iceServers: m.stun ? [{ urls: 'stun:stun.l.google.com:19302' }] : [] });
    const peer = pc;
    peer.addEventListener('connectionstatechange', () => {
      log('webrtc', peer.connectionState);
      if (peer !== pc) return;
      if (peer.connectionState === 'failed') { send({ type: 'error', message: 'ice-failed' }); reset(T.ended); }
      if (peer.connectionState === 'connected') status();
    });
    peer.addEventListener('track', e => {
      log('track', e.track.kind);
      const stream = e.streams[0] || new MediaStream([e.track]);
      if (video.srcObject !== stream) video.srcObject = stream;
      idle.hidden = true;
      play();
    });
    try {
      await peer.setRemoteDescription({ type: 'offer', sdp: m.sdp });
      await peer.setLocalDescription(await peer.createAnswer());
      await gathered(peer);
      const c = (peer.localDescription.sdp.match(/a=candidate:[^\r\n]*/g) || []).length;
      log('answer', c + ' candidates');
      send({ type: 'answer', sdp: peer.localDescription.sdp });
      statsTimer = setInterval(status, 3000);
    } catch (e) {
      log('offer failed', String(e && e.message || e));
      send({ type: 'error', message: String(e && e.message || e).slice(0, 200) });
      reset();
    }
  }

  video.addEventListener('resize', () => { log('video', video.videoWidth + 'x' + video.videoHeight); status(); });
  ctx.addCustomMessageListener(NS, e => {
    senderId = e.senderId;
    const m = e.data || {};
    log('message', m.type);
    if (m.type === 'offer' && typeof m.sdp === 'string') onOffer(m);
    else if (m.type === 'bye') reset(T.ended);
    else if (m.type === 'log') logEl.hidden = !m.on;
  });
  ctx.addEventListener(cast.framework.system.EventType.SENDER_DISCONNECTED, e => {
    log('sender disconnected');
    if (e.senderId === senderId) { senderId = null; reset(T.ended); }
    if (!ctx.getSenders().length) ctx.stop();
  });
  ctx.start({
    customNamespaces: { [NS]: cast.framework.system.MessageType.JSON },
    disableIdleTimeout: true,   // no media session – the TV must not close the app after a few minutes
    skipPlayersLoad: true,      // we play a WebRTC stream ourselves, no Shaka/MPL needed
    statusText: de ? 'Live-Stream' : 'Live stream',
  });
  log('receiver started');
})();
