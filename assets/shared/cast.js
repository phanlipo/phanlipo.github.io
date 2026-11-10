/* Stream a live picture + sound to a Chromecast / Android TV (Google Cast), without a server.
   Chrome on Android cannot record the screen (no getDisplayMedia), so an app draws what the TV shows into a
   <canvas> and makes its sound with Web Audio. Both go as one MediaStream over WebRTC straight to the TV in the
   same Wi-Fi. The TV runs our receiver page (assets/shared/cast-receiver.html, registered once as a custom
   receiver in the Google Cast SDK Developer Console → app ID); the Cast message channel only carries the
   WebRTC handshake (offer/answer, non-trickle) and status messages.

   The Google Cast sender SDK (www.gstatic.com) is loaded only on the first CastStream.start() – the page
   needs <meta name="tool:cast" content="true"> (CSP, scripts/build.mjs). Works in Chrome/Edge on Android
   and on computers; not on iPhone, Firefox or Safari (→ error 'unsupported').

   Include with <script src="../assets/shared/cast.js"></script>.

   CastStream.RECEIVER_URL           address to register in the Cast console
   CastStream.start({ appId, stream, maxBitrate, stun, tvLog })
                                      → Promise; picks a TV (Chrome's device list), then streams `stream`
                                        (MediaStream with a video and/or audio track). Throws Error with
                                        .code: 'no-app-id' | 'unsupported' | 'sdk-load' | 'cancel' |
                                        'session' | 'no-answer' | 'ice-failed' | 'receiver' | 'webrtc'
   CastStream.stop()                 ends streaming and the TV app
   CastStream.state                   'idle' | 'loading' | 'choosing' | 'connecting' | 'streaming'
   CastStream.device                  friendly name of the TV or ''
   CastStream.stats                   last numbers { fps, width, height, kbps, audioKbps, route, rx } or null
   CastStream.onChange(fn)            fn(state, { device, stats, error }) on every change; returns unsubscribe
   CastStream.setTvLog(on)            show/hide the log overlay on the TV
   CastStream.info()                  short state for Tools.diag.info */
(() => {
  'use strict';
  const SDK = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
  const NS = 'urn:x-cast:io.github.phanlipo.stream';
  const RECEIVER_URL = 'https://phanlipo.github.io/assets/shared/cast-receiver.html';
  const log = (...a) => window.Tools && Tools.diag && Tools.diag.log(...a);

  let sdk = null;           // Promise of the loaded SDK
  let sdkState = 'not loaded';
  let state = 'idle', device = '', stats = null, lastError = '';
  let pc = null, session = null, statsTimer = 0, answerWait = null, ctxListening = false, appIdSet = '';
  const listeners = new Set();
  const fail = (code, msg) => Object.assign(new Error(msg || code), { code });

  function set(next, extra = {}) {
    state = next;
    if ('error' in extra) lastError = extra.error || '';
    for (const fn of listeners) { try { fn(state, { device, stats, error: extra.error || '' }); } catch (e) { console.error(e); } }
  }

  function loadSdk() {
    if (sdk) return sdk;
    sdkState = 'loading';
    sdk = new Promise((resolve, reject) => {
      if (window.cast && cast.framework) return resolve();
      const timer = setTimeout(() => reject(fail('sdk-load', 'timeout')), 20000);
      window.__onGCastApiAvailable = ok => {
        clearTimeout(timer);
        log('cast sdk available', { ok });
        ok && window.cast && cast.framework ? resolve() : reject(fail('unsupported'));
      };
      const s = document.createElement('script');
      s.src = SDK;
      s.onerror = () => { clearTimeout(timer); reject(fail('sdk-load')); };
      document.head.append(s);
    }).then(() => { sdkState = 'ready'; }, e => { sdkState = e.code; sdk = null; throw e; });
    return sdk;
  }

  function context(appId) {
    const ctx = cast.framework.CastContext.getInstance();
    if (appIdSet !== appId) {
      ctx.setOptions({ receiverApplicationId: appId, autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED });
      appIdSet = appId;
    }
    if (!ctxListening) {
      ctxListening = true;
      ctx.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, e => {
        log('cast session', { state: e.sessionState });
        if (e.sessionState === cast.framework.SessionState.SESSION_ENDED) cleanup('idle');
      });
    }
    return ctx;
  }

  function send(msg) {
    if (!session) return Promise.resolve();
    return session.sendMessage(NS, msg).catch(e => log('cast send failed', { type: msg.type, error: String(e && (e.code || e.message || e)) }));
  }

  function onMessage(_ns, raw) {
    let m; try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { return; }
    if (!m || typeof m.type !== 'string') return;
    if (m.type === 'answer' && answerWait) answerWait.resolve(m);
    else if (m.type === 'status') {
      log('tv status', { video: m.video, w: m.width, h: m.height, playing: m.playing, muted: m.muted, state: m.state });
      stats = { ...(stats || {}), rx: { width: m.width, height: m.height, fps: m.fps, playing: m.playing, muted: m.muted } };
      set(state);
    } else if (m.type === 'error') {
      log('tv error', { message: String(m.message).slice(0, 200) });
      if (answerWait) answerWait.reject(fail('receiver', m.message));
    }
  }

  // Ask for Opus stereo with a music bitrate (WebRTC defaults to mono ~32 kbit/s, tuned for speech)
  function musicAudio(sdp) {
    const pt = (sdp.match(/a=rtpmap:(\d+) opus\/48000/i) || [])[1];
    if (!pt) return sdp;
    const re = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`);
    const add = 'stereo=1;sprop-stereo=1;maxaveragebitrate=256000;useinbandfec=1';
    return re.test(sdp) ? sdp.replace(re, (_, p) => `a=fmtp:${pt} ${p.split(';').filter(x => !/^(stereo|sprop-stereo|maxaveragebitrate|useinbandfec)=/.test(x)).concat(add).join(';')}`)
      : sdp.replace(new RegExp(`(a=rtpmap:${pt} opus/48000[^\\r\\n]*)`), `$1\r\na=fmtp:${pt} ${add}`);
  }

  // Non-trickle: wait until all candidates are in the description (max 4 s), then send it in one message
  function gathered(peer) {
    if (peer.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise(res => {
      const t = setTimeout(done, 4000);
      function done() { clearTimeout(t); peer.removeEventListener('icegatheringstatechange', check); res(); }
      function check() { if (peer.iceGatheringState === 'complete') done(); }
      peer.addEventListener('icegatheringstatechange', check);
    });
  }
  const candidates = sdp => (sdp.match(/a=candidate:[^\r\n]*/g) || []).map(c => (c.match(/ typ (\w+)/) || [])[1] + (/\.local /.test(c) ? '(mdns)' : ''));

  async function readStats() {
    if (!pc) return;
    try {
      const r = await pc.getStats();
      const prev = stats || {};
      const next = { rx: prev.rx };
      let pair = null;
      r.forEach(s => {
        if (s.type === 'outbound-rtp' && s.kind === 'video') {
          next.fps = s.framesPerSecond || 0; next.width = s.frameWidth || 0; next.height = s.frameHeight || 0;
          next.vBytes = s.bytesSent; next.t = s.timestamp; next.limit = s.qualityLimitationReason;
        }
        if (s.type === 'outbound-rtp' && s.kind === 'audio') next.aBytes = s.bytesSent;
        if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s;
      });
      const dt = prev.t && next.t ? (next.t - prev.t) / 1000 : 0;
      if (dt > 0) {
        next.kbps = Math.round(((next.vBytes || 0) - (prev.vBytes || 0)) * 8 / dt / 1000);
        next.audioKbps = Math.round(((next.aBytes || 0) - (prev.aBytes || 0)) * 8 / dt / 1000);
      }
      if (pair) {
        const l = r.get(pair.localCandidateId), rem = r.get(pair.remoteCandidateId);
        next.route = `${l ? l.candidateType : '?'}→${rem ? rem.candidateType : '?'}`;
        next.rtt = pair.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1000) : undefined;
      }
      stats = next;
      set(state);
    } catch (e) { log('stats failed', { error: String(e) }); }
  }

  function cleanup(next = 'idle', error) {
    clearInterval(statsTimer); statsTimer = 0;
    if (answerWait) { answerWait.reject(fail('cancel')); answerWait = null; }
    if (pc) { try { pc.close(); } catch (_) {} pc = null; }
    if (session) { try { session.removeMessageListener(NS, onMessage); } catch (_) {} }
    session = null;
    if (next === 'idle') { device = ''; stats = null; }
    set(next, { error });
  }

  async function start({ appId, stream, maxBitrate = 4000000, stun = false, tvLog = false } = {}) {
    if (state !== 'idle') return;
    appId = String(appId || '').trim().toUpperCase();
    if (!/^[0-9A-F]{8}$/.test(appId)) throw fail('no-app-id');
    if (!('RTCPeerConnection' in window)) throw fail('unsupported');
    try {
      set('loading', { error: '' });
      await loadSdk();
      const ctx = context(appId);
      session = ctx.getCurrentSession();
      if (!session) {
        set('choosing');
        log('cast request session');
        // Rejects with a chrome.cast.ErrorCode string ('cancel', 'session_error', …); older versions resolve with it
        let err = null;
        try { err = await ctx.requestSession(); } catch (x) { err = x && (x.code || x) || 'session'; }
        if (err) throw fail(String(err) === 'cancel' ? 'cancel' : 'session', String(err));
        session = ctx.getCurrentSession();
      }
      if (!session) throw fail('session');
      device = (session.getCastDevice() && session.getCastDevice().friendlyName) || '';
      session.addMessageListener(NS, onMessage);
      set('connecting');
      log('cast session ready', { device: !!device });

      pc = new RTCPeerConnection({ iceServers: stun ? [{ urls: 'stun:stun.l.google.com:19302' }] : [] });
      pc.addEventListener('connectionstatechange', () => {
        log('webrtc', { state: pc && pc.connectionState });
        if (!pc) return;
        if (pc.connectionState === 'connected' && state === 'connecting') {
          set('streaming');
          readStats(); statsTimer = setInterval(readStats, 2000);
        }
        if (pc.connectionState === 'failed') { stop(); set('idle', { error: 'ice-failed' }); }
      });
      for (const track of stream.getTracks()) {
        if (track.kind === 'video') {
          track.contentHint = 'motion';
          pc.addTransceiver(track, { direction: 'sendonly', streams: [stream], sendEncodings: [{ maxBitrate, maxFramerate: 30 }] });
        } else {
          pc.addTransceiver(track, { direction: 'sendonly', streams: [stream], sendEncodings: [{ maxBitrate: 256000 }] });
        }
      }
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      log('offer', { candidates: candidates(pc.localDescription.sdp).join(' ') || 'none' });

      const answer = new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(fail('no-answer')), 20000);
        answerWait = { resolve: v => { clearTimeout(t); resolve(v); }, reject: e => { clearTimeout(t); reject(e); } };
      });
      await send({ type: 'offer', sdp: pc.localDescription.sdp, log: !!tvLog, stun: !!stun });
      const m = await answer;
      answerWait = null;
      log('answer', { candidates: candidates(m.sdp).join(' ') || 'none' });
      await pc.setRemoteDescription({ type: 'answer', sdp: musicAudio(m.sdp) });
    } catch (e) {
      const code = e.code || 'webrtc';
      log('cast start failed', { code, message: String(e.message || e).slice(0, 200) });
      const ending = session;
      cleanup('idle', code === 'cancel' ? '' : code);
      if (ending && code !== 'cancel') { try { ending.endSession(true); } catch (_) {} }
      throw e.code ? e : fail(code, e.message);
    }
  }

  function stop() {
    const s = session;
    if (s) send({ type: 'bye' });
    cleanup('idle');
    if (s) setTimeout(() => { try { s.endSession(true); } catch (_) {} }, 100);
  }

  window.CastStream = {
    RECEIVER_URL, NAMESPACE: NS,
    start, stop,
    get state() { return state; },
    get device() { return device; },
    get stats() { return stats; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    setTvLog(on) { return send({ type: 'log', on: !!on }); },
    info: () => ({ state, sdk: sdkState, error: lastError || undefined, route: stats && stats.route, fps: stats && stats.fps,
      size: stats && stats.width ? `${stats.width}x${stats.height}` : undefined, kbps: stats && stats.kbps, rtt: stats && stats.rtt,
      tv: stats && stats.rx, limit: stats && stats.limit }),
  };
})();
