/* Direct connections between devices (WebRTC data channels) without a server – window.P2P.
   Used by card-games; the format of the codes is the one of sea-battle and rock-paper-scissors.

   Two codes are exchanged (QR code, link or copied text):
     offer  "O1~…"  host → guest   (as link: <page>#join=<code>, opens the page on the other phone)
     answer "A1~…"  guest → host
   A code holds only what a data-channel SDP needs (setup role, ICE user/password, DTLS fingerprint,
   candidates); the full SDP is rebuilt from it. One peer = one connection between two devices,
   a host with several guests keeps one peer per guest.

   Without STUN only local candidates exist (same Wi-Fi or hotspot), nothing leaves the network.
   With opts.stun the devices ask a Google STUN server for their public address (setting of the app).

   Page needs: ../assets/vendor/qrcode-generator/qrcode.js (drawQr) and for the scanner
   ../assets/vendor/zxing-wasm/iife/reader/index.js (fallback when BarcodeDetector is missing).

   API
     P2P.peer({ stun, label })        → peer
       await peer.offer()             → offer code         (host)
       await peer.answer(offerCode)   → answer code        (guest)
       await peer.accept(answerCode)                       (host)
       peer.on('open' | 'message' | 'close', fn)  message: parsed JSON; close: once, not after peer.close()
       peer.send(obj), peer.isOpen(), peer.close(), peer.state()
       errors: Error('noRtc'), Error('noCandidates'), Error('badCode')
     P2P.check(text, expect)          → { ok, code, kind } | { ok:false, why:'badCode'|'isAnswer'|'isOffer' }
     P2P.link(code)                   → link to this page that joins with the code
     P2P.drawQr(canvas, text)
     P2P.scanner(video, { onText(text) → true to stop, onStatus(code, detail) })
       → { start(), stop(), active(), engine() }
       status codes: 'noCam', 'noDecoder', 'camDenied', 'camFail' (detail: error name), 'hint'
*/
(function () {
  'use strict';
  const log = (...a) => { try { window.Tools && window.Tools.diag.log(...a); } catch (_) { /* no diagnostics */ } };
  const STUN = 'stun:stun.l.google.com:19302';

  /* ---------- Codes ---------- */
  const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  function encode(sdp, kind) {
    const lines = sdp.split(/\r?\n/).map(l => l.trim());
    const get = k => { const l = lines.find(x => x.startsWith('a=' + k + ':')); return l ? l.slice(k.length + 3).trim() : ''; };
    const fp = get('fingerprint').split(' ');
    if (!fp[1] || fp[0].toLowerCase() !== 'sha-256') throw new Error('no sha-256 fingerprint');
    const setup = { actpass: 'x', active: 'a', passive: 'p' }[get('setup')] || 'x';
    const cands = lines.filter(l => l.startsWith('a=candidate:')).map(l => {
      const p = l.slice(12).split(' '), i = p.indexOf('raddr');
      return p.slice(0, 8).concat(i > 0 ? ['raddr', p[i + 1], 'rport', p[i + 3]] : []).join('_');
    });
    return { code: [kind + '1', setup, get('ice-ufrag'), get('ice-pwd'), b64u(fp[1].split(':').map(h => parseInt(h, 16))), ...cands].join('~'), candidates: cands };
  }
  function decode(code) {
    const p = String(code).trim().split('~');
    if (p.length < 6 || !/^[OA]1$/.test(p[0]) || !/^[xap]$/.test(p[1])) throw new Error('badCode');
    const [, setup, ufrag, pwd, fp, ...cands] = p;
    if (!/^[A-Za-z0-9+/]{4,256}$/.test(ufrag) || !/^[A-Za-z0-9+/]{22,256}$/.test(pwd)) throw new Error('badCode');
    let bytes;
    try { bytes = unb64u(fp); } catch (_) { throw new Error('badCode'); }
    if (bytes.length !== 32) throw new Error('badCode');
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
    for (const c of cands) if (!/^[A-Za-z0-9+/._:-]+$/.test(c)) throw new Error('badCode');
    const sdp = ['v=0', 'o=- 0 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0',
      'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
      ...cands.map(c => 'a=candidate:' + c.replace(/_/g, ' ')), 'a=end-of-candidates',
      'a=ice-ufrag:' + ufrag, 'a=ice-pwd:' + pwd, 'a=fingerprint:sha-256 ' + hex,
      'a=setup:' + { x: 'actpass', a: 'active', p: 'passive' }[setup], 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144', ''].join('\r\n');
    return { type: p[0][0] === 'O' ? 'offer' : 'answer', sdp };
  }
  /** Code from scanned/pasted text: the link (#join=…) or the bare code */
  function extract(text) {
    const s = String(text || '').trim(), m = s.match(/[#&?]join=([^&\s]+)/);
    try { return m ? decodeURIComponent(m[1]) : s; } catch (_) { return s; }
  }
  const kindOf = code => /^O1~/.test(code) ? 'offer' : /^A1~/.test(code) ? 'answer' : null;
  function check(text, expect) {
    const code = extract(text), kind = kindOf(code);
    if (!kind) return { ok: false, why: 'badCode' };
    try { decode(code); } catch (_) { return { ok: false, why: 'badCode' }; }
    if (expect === 'offer' && kind === 'answer') return { ok: false, why: 'isAnswer' };
    if (expect === 'answer' && kind === 'offer') return { ok: false, why: 'isOffer' };
    return { ok: true, code, kind };
  }
  const link = code => location.origin + location.pathname + '#join=' + code;

  /* ---------- QR code ---------- */
  function drawQr(canvas, text) {
    const qr = window.qrcode(0, 'L'); qr.addData(text, 'Byte'); qr.make();
    const n = qr.getModuleCount(), Q = 4, scale = Math.max(4, Math.floor(600 / (n + 2 * Q))), size = (n + 2 * Q) * scale;
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size); ctx.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect((c + Q) * scale, (r + Q) * scale, scale, scale);
    canvas.dataset.text = text;
    log('qr drawn', { modules: n, chars: text.length });
  }

  /* ---------- Peer ---------- */
  function peer(opts) {
    opts = opts || {};
    if (!window.RTCPeerConnection) throw new Error('noRtc');
    const stun = !!opts.stun;
    const pc = new RTCPeerConnection({ iceServers: stun ? [{ urls: STUN }] : [] });
    const dc = pc.createDataChannel(opts.label || 'p2p', { negotiated: true, id: 0, ordered: true });
    const handlers = { open: [], message: [], close: [] };
    let closed = false, lost = false;
    const emit = (type, arg) => { for (const fn of handlers[type]) { try { fn(arg); } catch (e) { log('p2p handler', e); } } };
    const fail = why => { if (closed || lost) return; lost = true; log('p2p lost', why); emit('close', why); };
    pc.addEventListener('connectionstatechange', () => { log('pc state', pc.connectionState); if (pc.connectionState === 'failed') fail('failed'); });
    pc.addEventListener('iceconnectionstatechange', () => log('ice state', pc.iceConnectionState));
    dc.addEventListener('open', () => { log('channel open'); emit('open'); });
    dc.addEventListener('close', () => fail('closed'));
    dc.addEventListener('message', e => {
      let m; try { m = JSON.parse(e.data); } catch (_) { log('bad message'); return; }
      if (m && typeof m === 'object' && !Array.isArray(m)) emit('message', m);
    });
    function gathered() {
      return new Promise(res => {
        if (pc.iceGatheringState === 'complete') return res();
        const to = setTimeout(res, stun ? 5000 : 2500);
        pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(to); res(); } });
      });
    }
    async function localCode(kind) {
      await gathered();
      const { code, candidates } = encode(pc.localDescription.sdp, kind);
      log((kind === 'O' ? 'offer' : 'answer') + ' created', { chars: code.length, candidates: candidates.length,
        types: candidates.map(c => c.split('_')[7]).join(',') || 'none', stun });
      if (!candidates.length) throw new Error('noCandidates');
      return code;
    }
    return {
      on(type, fn) { handlers[type].push(fn); return this; },
      async offer() { await pc.setLocalDescription(await pc.createOffer()); return localCode('O'); },
      async answer(code) {
        let desc; try { desc = decode(code); } catch (_) { throw new Error('badCode'); }
        if (desc.type !== 'offer') throw new Error('badCode');
        await pc.setRemoteDescription(desc);
        await pc.setLocalDescription(await pc.createAnswer());
        return localCode('A');
      },
      async accept(code) {
        let desc; try { desc = decode(code); } catch (_) { throw new Error('badCode'); }
        if (desc.type !== 'answer' || pc.signalingState !== 'have-local-offer') throw new Error('badCode');
        await pc.setRemoteDescription(desc);
        log('answer set');
      },
      send(obj) { if (dc.readyState === 'open') { dc.send(JSON.stringify(obj)); return true; } return false; },
      isOpen: () => dc.readyState === 'open',
      close() { closed = true; try { dc.close(); } catch (_) { /* already closed */ } try { pc.close(); } catch (_) { /* already closed */ } },
      state: () => ({ pc: pc.connectionState, ice: pc.iceConnectionState, channel: dc.readyState }),
    };
  }

  /* ---------- QR scanner (BarcodeDetector → zxing-wasm) ---------- */
  let detector = null, wasmReady = null;
  async function getDetector() {
    if (detector !== null) return detector;
    detector = false;
    try {
      if ('BarcodeDetector' in window && (await window.BarcodeDetector.getSupportedFormats()).includes('qr_code'))
        detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    } catch (_) { /* not supported */ }
    return detector;
  }
  function prepareWasm() {
    if (wasmReady) return wasmReady;
    wasmReady = Promise.resolve().then(() => {
      if (!window.ZXingWASM) return false;
      return Promise.resolve(window.ZXingWASM.prepareZXingModule({ fireImmediately: true, overrides: {
        locateFile: (path, prefix) => path.endsWith('.wasm') ? new URL('../assets/vendor/zxing-wasm/reader/' + path, location.href).href : prefix + path,
      } })).then(() => true);
    }).catch(e => { log('zxing-wasm', e); return false; });
    return wasmReady;
  }
  function scanner(video, cb) {
    let stream = null, timer = null, busy = false, engine = '', run = 0;
    const canvas = document.createElement('canvas');
    const status = (code, detail) => { try { cb.onStatus && cb.onStatus(code, detail); } catch (e) { log('scan status', e); } };
    async function decodeFrame() {
      if (detector) { const r = await detector.detect(video); return r && r[0] ? r[0].rawValue : null; }
      const W = video.videoWidth, H = video.videoHeight, sc = Math.min(1, 960 / Math.max(W, H));
      canvas.width = Math.round(W * sc); canvas.height = Math.round(H * sc);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const res = await window.ZXingWASM.readBarcodes(ctx.getImageData(0, 0, canvas.width, canvas.height), { formats: ['QRCode'], tryHarder: true, maxNumberOfSymbols: 1 });
      const hit = res && res.find(r => r.isValid !== false && r.text); return hit ? hit.text : null;
    }
    async function frame() {
      if (!stream) return;
      if (!busy && video.videoWidth) {
        busy = true;
        try {
          const text = await decodeFrame();
          if (text && stream && cb.onText(text)) { log('code scanned'); if (navigator.vibrate) navigator.vibrate(60); stop(); return; }
        } catch (e) { log('scan error', e); } finally { busy = false; }
      }
      if (stream) timer = setTimeout(frame, 200);
    }
    function stop() {
      run++;
      clearTimeout(timer); timer = null;
      if (stream) { stream.getTracks().forEach(tr => tr.stop()); stream = null; }
      video.srcObject = null;
    }
    async function start() {
      stop();
      const my = run;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { status('noCam'); return; }
      const det = await getDetector();
      if (!det && !(await prepareWasm())) { status('noDecoder'); return; }
      engine = det ? 'BarcodeDetector' : 'zxing-wasm';
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } });
        if (my !== run) { s.getTracks().forEach(tr => tr.stop()); return; }
        stream = s; video.srcObject = s; await video.play();
        log('camera on', { engine, w: video.videoWidth, h: video.videoHeight });
        status('hint');
        timer = setTimeout(frame, 250);
      } catch (e) {
        log('camera failed', e);
        status(e && e.name === 'NotAllowedError' ? 'camDenied' : 'camFail', e && e.name || String(e));
      }
    }
    return { start, stop, active: () => !!stream, engine: () => engine };
  }

  window.P2P = { peer, check, link, drawQr, scanner, encode, decode, extract, kindOf };
})();
