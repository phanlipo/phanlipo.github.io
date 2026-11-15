// Playlist-Player: the YouTube player as a cross-origin iframe, controlled by postMessage.
// This is the message protocol the official IFrame Player API (www.youtube.com/iframe_api) speaks with the
// embed – done here directly so that no script from YouTube runs in this page (CSP: only own scripts,
// frame-src www.youtube-nocookie.com). See README.md.
//
//   const p = YtEmbed.create(container, { list, video, start, title, account, onReady, onInfo, onState, onRate, onError })
//   account: true = www.youtube.com (the browser's YouTube sign-in counts, e.g. Premium without ads) instead of
//   the privacy-enhanced www.youtube-nocookie.com – only when the user chose it in the settings
//   p.command('playVideo') / ('pauseVideo') / ('seekTo', 30, true) / ('playVideoAt', 2) / ('setPlaybackRate', 1.5)
//   p.info        latest state the player reported (playerState, currentTime, duration, playlist,
//                 playlistIndex, videoData {video_id, title, author}, playbackRate)
//   p.destroy()
(function () {
  'use strict';
  const ORIGIN = 'https://www.youtube-nocookie.com';
  const ORIGIN_ACCOUNT = 'https://www.youtube.com';
  const EVENTS = ['onStateChange', 'onError', 'onPlaybackRateChange'];

  function create(container, o) {
    const origin = o.account ? ORIGIN_ACCOUNT : ORIGIN;
    const iframe = document.createElement('iframe');
    const q = new URLSearchParams({ list: o.list, enablejsapi: '1', origin: location.origin, widgetid: '1', playsinline: '1', rel: '0', autoplay: '1' });
    if (o.start > 0) q.set('start', String(Math.floor(o.start)));
    // A video of the playlist: starts there (with the playlist around it); otherwise the playlist from the beginning
    const path = o.video && /^[A-Za-z0-9_-]{6,20}$/.test(o.video) ? encodeURIComponent(o.video) : 'videoseries';
    iframe.src = `${origin}/embed/${path}?${q}`;
    iframe.title = o.title || 'YouTube';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    // YouTube refuses embeds without a referrer (error 153); only the origin is sent
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    const p = { iframe, origin, info: {}, ready: false, destroyed: false };
    let heard = false, tries = 0, timer = 0;

    const post = msg => {
      if (p.destroyed || !iframe.contentWindow) return;
      try { iframe.contentWindow.postMessage(JSON.stringify({ ...msg, id: 1, channel: 'widget' }), origin); } catch (_) {}
    };
    p.command = (func, ...args) => post({ event: 'command', func, args });

    function onMessage(e) {
      if (e.source !== iframe.contentWindow || e.origin !== origin) return;
      let d = e.data;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch (_) { return; } }
      if (!d || typeof d !== 'object') return;
      heard = true;
      switch (d.event) {
        case 'initialDelivery':
        case 'infoDelivery':
          if (d.info && typeof d.info === 'object') {
            // Another video: time and length of the previous one must not be taken for it (they come later)
            const prev = p.info.videoData && p.info.videoData.video_id;
            const next = d.info.videoData && d.info.videoData.video_id;
            if (next && prev && next !== prev) {
              if (!('currentTime' in d.info)) delete p.info.currentTime;
              if (!('duration' in d.info)) delete p.info.duration;
            }
            Object.assign(p.info, d.info);
            o.onInfo && o.onInfo(p.info, d.info);
          }
          break;
        case 'onReady':
          if (p.ready) break;
          p.ready = true;
          for (const ev of EVENTS) p.command('addEventListener', ev);
          o.onReady && o.onReady();
          break;
        case 'onStateChange':
          p.info.playerState = d.info;
          o.onState && o.onState(d.info);
          break;
        case 'onPlaybackRateChange':
          p.info.playbackRate = d.info;
          o.onRate && o.onRate(d.info);
          break;
        case 'onError':
          o.onError && o.onError(d.info);
          break;
      }
    }
    window.addEventListener('message', onMessage);

    // Handshake: tell the player we listen until it answers (it may not be ready right after "load")
    const listen = () => {
      clearInterval(timer);
      tries = 0;
      timer = setInterval(() => {
        if (p.ready || p.destroyed) { clearInterval(timer); return; }
        if (++tries > 60) { clearInterval(timer); if (!heard && o.onError) o.onError('no-response'); return; }
        post({ event: 'listening' });
      }, 250);
      post({ event: 'listening' });
    };
    iframe.addEventListener('load', listen);
    container.replaceChildren(iframe);

    p.destroy = () => {
      p.destroyed = true;
      clearInterval(timer);
      window.removeEventListener('message', onMessage);
      iframe.remove();
    };
    return p;
  }

  window.YtEmbed = { create, ORIGIN, ORIGIN_ACCOUNT };
})();
