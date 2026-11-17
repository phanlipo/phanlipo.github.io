/* Connecting devices for a game – window.P2PConnect. The part all multi-device apps share, on top of
   P2P (p2p.js): codes, QR codes, the scanner, copying and sharing codes, and the texts for all of it.
   The page keeps its own screens, its game and what happens on a game link (#join=…).

   Texts: P2PConnect.texts.de / .en – put them into the page's Tools.i18n call before its own texts
   (a page may override single keys). The page adds shareTitle (title when sharing a code).
   P2PConnect.errText(error) → text for a failed P2P.peer() / offer / answer.

   1. P2PConnect.codes(o): handling the codes – for every app (also one host with several guests).
      Elements by id: #btnJoin #offerIn #btnOfferIn #lobbyStatus · #btnScanAnswer #answerIn #btnAnswerIn
      · #btnCopyOffer #btnShareOffer #btnCopyAnswer #btnShareAnswer · #video #h-scan #scanStatus #btnScanCancel
        const codes = P2PConnect.codes({
          status(id, text, cls),       // writes a status line (#scanStatus …); cls 'err' for errors
          showScan(), back(expect),    // show the scanner screen / leave it (cancel) to the screen before
          onOffer(code), onAnswer(code),          // a valid game code (guest) / reply code (host) came in
          offerCode(), answerCode(),              // the code to copy/share: own game link (host) / own reply (guest)
          answerStatus: 'hostStatus',             // where errors of a pasted reply code are shown
        });
        codes.useCode(text, expect) → { ok } | { ok: false, msg }   (scanned, pasted or from a link)
        codes.startScan(expect), stopScan(), cancelScan(), scanning(), scanExpect(), scanEngine()

   2. P2PConnect.session(o): one host and one guest (rock-paper-scissors, sea-battle) – codes() plus the peer.
      Also uses #btnHost, #qrOffer, #qrAnswer and the status lines #hostStatus, #guestStatus.
        const conn = P2PConnect.session({
          label: 'sea-battle',              // for the diagnostics
          stun: () => settings.stun,        // also connect over the internet (setting of the app)
          show(step),                       // 'lobby' | 'host' | 'guest' | 'scan': the page shows that screen
          status(id, text, cls),
          onOpen(), onMessage(msg), onLost(reason)   // reason 'disconnected'; not called after conn.close()
        });
        conn.connected(), conn.role() ('host' | 'guest' | null), conn.peer(), conn.send(msg), conn.close()
        and everything of codes(): conn.useCode(…), conn.startScan(…) …
*/
(function () {
  'use strict';
  const texts = {
    de: {
      lead: 'Zwei Handys, ein Spiel: Die Verbindung entsteht über zwei QR-Codes und läuft danach direkt von Gerät zu Gerät.',
      host: 'Neues Spiel',
      join: 'Beitreten',
      pasteOffer: 'Spiel-Code von Hand eingeben',
      pasteOfferLbl: 'Spiel-Code oder Link des anderen (z. B. per Nachricht geschickt):',
      connect: 'Verbinden',
      step1: 'Handy A tippt auf „Neues Spiel“.',
      step2: 'Handy B tippt auf „Beitreten“ und scannt den Code von A.',
      step3: 'Handy A scannt den Antwort-Code von B – fertig.',
      hostH1: '1. Das andere Handy scannt diesen Code',
      qrOffer: 'QR-Code zum Beitreten',
      copyCode: 'Code kopieren',
      share: 'Teilen …',
      hostH2: '2. Dann den Antwort-Code scannen',
      scanAnswer: 'Antwort-Code scannen',
      pasteAnswer: 'Antwort-Code von Hand eingeben',
      pasteAnswerLbl: 'Antwort-Code des anderen:',
      guestH: 'Jetzt scannt das andere Handy diesen Antwort-Code',
      qrAnswer: 'QR-Code mit der Antwort',
      cancel: 'Abbrechen',
      scanH: 'scanH',
      scanOfferH: 'Spiel-Code des anderen scannen',
      scanAnswerH: 'Antwort-Code des anderen scannen',
      preparing: 'Verbindung wird vorbereitet …',
      noRtc: 'Dieser Browser kann keine Direktverbindung (WebRTC).',
      noCandidates: 'Keine Netzwerkverbindung gefunden. WLAN oder Hotspot einschalten.',
      waitAnswer: 'Warte auf den Antwort-Code …',
      waitHost: 'Warte, bis das andere Handy den Code scannt …',
      connecting: 'Verbinde …',
      connected: 'Verbunden!',
      connectFail: 'Keine Verbindung. Beide im selben WLAN? Beide Seiten neu starten.',
      badCode: 'Das ist kein gültiger Code.',
      isAnswer: 'Das ist ein Antwort-Code – den scannt das Handy, das das Spiel erstellt hat.',
      isOffer: 'Das ist ein Spiel-Code – hier wird der Antwort-Code gebraucht.',
      noCam: 'Keine Kamera verfügbar. Code von Hand eingeben.',
      camDenied: 'Kamera nicht erlaubt. Code von Hand eingeben oder Kamera in den Browser-Einstellungen erlauben.',
      camFail: 'Kamera-Fehler: {e}',
      noDecoder: 'Dieser Browser kann keine QR-Codes lesen. Code von Hand eingeben.',
      scanHint: 'QR-Code in den Rahmen halten.',
      copiedOk: 'Code kopiert',
      copyFail: 'Kopieren nicht möglich',
      disconnected: 'Verbindung getrennt.'
    },
    en: {
      lead: 'Two phones, one game: the connection is made with two QR codes and then runs directly from device to device.',
      host: 'New game',
      join: 'Join',
      pasteOffer: 'Enter game code manually',
      pasteOfferLbl: 'Game code or link of the other player (e.g. sent by message):',
      connect: 'Connect',
      step1: 'Phone A taps “New game”.',
      step2: 'Phone B taps “Join” and scans A’s code.',
      step3: 'Phone A scans B’s reply code – done.',
      hostH1: '1. The other phone scans this code',
      qrOffer: 'QR code to join',
      copyCode: 'Copy code',
      share: 'Share …',
      hostH2: '2. Then scan the reply code',
      scanAnswer: 'Scan reply code',
      pasteAnswer: 'Enter reply code manually',
      pasteAnswerLbl: 'Reply code of the other player:',
      guestH: 'Now the other phone scans this reply code',
      qrAnswer: 'QR code with the reply',
      cancel: 'Cancel',
      scanH: 'scanH',
      scanOfferH: 'Scan the other player’s game code',
      scanAnswerH: 'Scan the other player’s reply code',
      preparing: 'Preparing the connection …',
      noRtc: 'This browser cannot make direct connections (WebRTC).',
      noCandidates: 'No network connection found. Switch on Wi-Fi or a hotspot.',
      waitAnswer: 'Waiting for the reply code …',
      waitHost: 'Waiting for the other phone to scan the code …',
      connecting: 'Connecting …',
      connected: 'Connected!',
      connectFail: 'No connection. Both in the same Wi-Fi? Start again on both sides.',
      badCode: 'This is not a valid code.',
      isAnswer: 'This is a reply code – it is scanned by the phone that created the game.',
      isOffer: 'This is a game code – the reply code is needed here.',
      noCam: 'No camera available. Enter the code manually.',
      camDenied: 'Camera not allowed. Enter the code manually or allow the camera in the browser settings.',
      camFail: 'Camera error: {e}',
      noDecoder: 'This browser cannot read QR codes. Enter the code manually.',
      scanHint: 'Hold the QR code inside the frame.',
      copiedOk: 'Code copied',
      copyFail: 'Copying not possible',
      disconnected: 'Connection lost.'
    },
  };

  const $ = id => document.getElementById(id), t = (k, p) => Tools.t(k, p), log = (...a) => Tools.diag.log(...a);
  const errText = e => e && (e.message === 'noRtc' || e.message === 'noCandidates') ? t(e.message) : t('connectFail');

  function codes(o) {
    let scanExpect = null, lastHint = 0;
    /** Scanned, pasted or linked text: decides what to do with it */
    function useCode(text, expect) {
      const r = P2P.check(text, expect);
      if (!r.ok) return { ok: false, msg: t(r.why) };
      if (r.kind === 'offer') o.onOffer(r.code); else o.onAnswer(r.code);
      return { ok: true };
    }
    // Scanner (P2P.scanner: BarcodeDetector → zxing-wasm)
    const scanner = P2P.scanner($('video'), {
      onText(text) {
        const r = useCode(text, scanExpect);
        if (r.ok) { log('code scanned', { expect: scanExpect }); return true; }
        if (Date.now() - lastHint > 1500) { lastHint = Date.now(); o.status('scanStatus', r.msg, 'err'); }
        return false;
      },
      onStatus(code, detail) {
        if (code === 'hint') o.status('scanStatus', t('scanHint'));
        else o.status('scanStatus', code === 'camFail' ? t('camFail', { e: detail }) : t(code), 'err');
      },
    });
    const scanTitle = () => { $('h-scan').textContent = t(scanExpect === 'offer' ? 'scanOfferH' : 'scanAnswerH'); };
    function startScan(expect) {
      scanExpect = expect;
      scanTitle();
      o.showScan(); o.status('scanStatus', '');
      scanner.start();
    }
    const stopScan = () => scanner.stop();
    function cancelScan() { stopScan(); o.back(scanExpect); }
    Tools.onLang(() => { if (scanner.active()) scanTitle(); });

    $('btnJoin').addEventListener('click', () => startScan('offer'));
    $('btnScanAnswer').addEventListener('click', () => startScan('answer'));
    $('btnScanCancel').addEventListener('click', cancelScan);
    $('btnOfferIn').addEventListener('click', () => {
      const r = useCode($('offerIn').value, 'offer');
      if (!r.ok) o.status('lobbyStatus', r.msg, 'err'); else $('offerIn').value = '';
    });
    $('btnAnswerIn').addEventListener('click', () => {
      const r = useCode($('answerIn').value, 'answer');
      if (!r.ok) o.status(o.answerStatus, r.msg, 'err');
    });
    const copy = async text => { if (text) Tools.toast(t((await Tools.copyText(text)) ? 'copiedOk' : 'copyFail')); };
    $('btnCopyOffer').addEventListener('click', () => copy(o.offerCode()));
    $('btnCopyAnswer').addEventListener('click', () => copy(o.answerCode()));
    if (navigator.share) for (const [id, get] of [['btnShareOffer', o.offerCode], ['btnShareAnswer', o.answerCode]]) {
      $(id).hidden = false;
      $(id).addEventListener('click', () => { const c = get(); if (c) navigator.share({ title: t('shareTitle'), text: c }).catch(() => {}); });
    }
    return { useCode, startScan, stopScan, cancelScan, scanning: () => scanner.active(), scanExpect: () => scanExpect, scanEngine: () => scanner.engine() };
  }

  function session(o) {
    let peer = null, role = null, myCode = '', connectTimer = null;
    const connected = () => !!peer && peer.isOpen();
    const clearQr = id => { $(id).getContext('2d').clearRect(0, 0, 9999, 9999); delete $(id).dataset.text; };

    function close() {
      clearTimeout(connectTimer);
      const p = peer; peer = null; role = null; myCode = '';
      if (p) p.close();
    }
    function newPeer(r) {
      close();
      const p = P2P.peer({ stun: !!o.stun(), label: o.label });
      peer = p; role = r;
      p.on('open', () => { if (p === peer) { clearTimeout(connectTimer); log('channel open', { role }); o.onOpen(); } });
      p.on('message', m => { if (p === peer) o.onMessage(m); });
      p.on('close', () => { if (p === peer) o.onLost('disconnected'); });
      return p;
    }
    async function startHost() {
      o.show('host'); o.status('hostStatus', t('preparing'));
      clearQr('qrOffer'); $('answerIn').value = '';
      try {
        const p = newPeer('host');
        const code = await p.offer();
        if (p !== peer) return;
        myCode = P2P.link(code);
        P2P.drawQr($('qrOffer'), myCode);
        o.status('hostStatus', t('waitAnswer'));
      } catch (e) { log('host failed', e); o.status('hostStatus', errText(e), 'err'); }
    }
    async function acceptOffer(code) {
      o.show('guest'); o.status('guestStatus', t('preparing'));
      clearQr('qrAnswer');
      try {
        const p = newPeer('guest');
        const answer = await p.answer(code);
        if (p !== peer) return;
        myCode = answer;
        P2P.drawQr($('qrAnswer'), answer);
        if (!connected()) o.status('guestStatus', t('waitHost'));
      } catch (e) { log('join failed', e); o.status('guestStatus', errText(e), 'err'); }
    }
    async function acceptAnswer(code) {
      o.show('host');
      const p = peer;
      if (!p || role !== 'host') { o.status('hostStatus', t('connectFail'), 'err'); return; }
      try {
        await p.accept(code);
        o.status('hostStatus', t('connecting'));
        clearTimeout(connectTimer);
        connectTimer = setTimeout(() => {
          if (p === peer && !connected()) { log('connect timeout', p.state()); o.status('hostStatus', t('connectFail'), 'err'); }
        }, 20000);
      } catch (e) { log('answer failed', e); o.status('hostStatus', t('connectFail'), 'err'); }
    }
    const c = codes({
      status: o.status, showScan: () => o.show('scan'), back: expect => o.show(expect === 'answer' && peer ? 'host' : 'lobby'),
      onOffer: acceptOffer, onAnswer: acceptAnswer, offerCode: () => myCode, answerCode: () => myCode, answerStatus: 'hostStatus',
    });
    $('btnHost').addEventListener('click', startHost);
    return Object.assign(c, { connected, role: () => role, peer: () => peer, close, send: msg => { if (peer) peer.send(msg); } });
  }

  window.P2PConnect = { texts, errText, codes, session };
})();
