// Stand-in for the YouTube embed (www.youtube-nocookie.com) and its oEmbed endpoint, for playlist-player.
// The fake player speaks the same postMessage protocol as the real one (observed against YouTube:
// "listening" → initialDelivery + onReady, commands as {event:'command', func, args}, infoDelivery,
// onStateChange/onError after addEventListener). Time does not run by itself: tests move it with
// fake.advance(seconds) in the player frame, so nothing depends on timing.
import { expect } from '@playwright/test';

export const YT = 'https://www.youtube-nocookie.com';
/** Player host with the setting "Mit YouTube-Konto abspielen" */
export const YT_ACCOUNT = 'https://www.youtube.com';
export const LIST = 'PLalIG1eq_GwWgya1Z8-f0yE4MCxb3eaH9';
export const LIST_TITLE = 'Hörspiele (3 Stück in Folge)';
export const VIDEOS = [
  { id: 'vidAAAAAAA1', title: 'Kapitel 1: Der Anfang', author: 'Erzähler', dur: 120 },
  { id: 'vidBBBBBBB2', title: 'Kapitel 2: Die Mitte', author: 'Erzähler', dur: 90 },
  { id: 'vidCCCCCCC3', title: 'Kapitel 3: Das Ende', author: 'Erzähler', dur: 60 },
];
/** A list ID the fake player answers with error 150 (embedding not allowed) */
export const LIST_BLOCKED = 'PLblockedblockedblocked1';

function playerHtml() {
  return `<!doctype html><html><body style="background:#000;color:#fff">fake player<script>
const VIDEOS = ${JSON.stringify(VIDEOS)};
const q = new URLSearchParams(location.search);
const vid = location.pathname.split('/').pop();
const blocked = q.get('list') === ${JSON.stringify(LIST_BLOCKED)};
let idx = Math.max(0, VIDEOS.findIndex(v => v.id === vid));
let time = Number(q.get('start')) || 0, state = -1, rate = 1, parent = null, origin = q.get('origin');
const events = new Set();
window.commands = [];
const v = () => VIDEOS[idx];
const send = m => parent && parent.postMessage(JSON.stringify({ ...m, channel: 'widget', id: 1 }), origin);
const deliver = info => send({ event: 'infoDelivery', info });
const videoData = () => ({ video_id: v().id, title: v().title, author: v().author, errorCode: blocked ? 'embedder' : null });
const full = () => ({ playerState: state, currentTime: time, duration: v().dur, playlist: VIDEOS.map(x => x.id),
  playlistIndex: idx, videoData: videoData(), playbackRate: rate });
function setState(s) {
  state = s;
  if (events.has('onStateChange')) send({ event: 'onStateChange', info: s });
  deliver({ playerState: s });
}
function load(i, t) {
  idx = i; time = t || 0;
  deliver({ playlistIndex: idx, videoData: videoData(), duration: v().dur, currentTime: time });
  setState(1);
}
window.fake = {
  state: () => ({ idx, time, state, rate, src: location.href }),
  // Plays on by sec seconds, reporting the time in 1-second steps like the real player does while playing
  advance(sec) {
    const end = Math.min(time + sec, v().dur);
    while (time < end) { time = Math.min(time + 1, end); deliver({ currentTime: time }); }
    if (time >= v().dur) {
      setState(0);
      if (idx < VIDEOS.length - 1) load(idx + 1, 0);
    }
  },
};
addEventListener('message', e => {
  let d; try { d = JSON.parse(e.data); } catch { return; }
  if (d.event === 'listening') {
    if (parent) return;
    parent = e.source;
    send({ event: 'initialDelivery', info: blocked ? { playerState: -1, videoData: videoData() } : full() });
    send({ event: 'onReady', info: null });
    return;
  }
  if (d.event !== 'command') return;
  window.commands.push([d.func, ...d.args]);
  const a = d.args;
  switch (d.func) {
    case 'addEventListener':
      events.add(a[0]);
      if (a[0] === 'onError' && blocked) send({ event: 'onError', info: 150 });
      break;
    case 'playVideo': if (!blocked) setState(1); break;
    case 'pauseVideo': setState(2); break;
    case 'seekTo': time = a[0]; deliver({ currentTime: time }); break;
    case 'playVideoAt': load(a[0], 0); break;
    case 'nextVideo': load(Math.min(idx + 1, VIDEOS.length - 1), 0); break;
    case 'previousVideo': load(Math.max(idx - 1, 0), 0); break;
    case 'setPlaybackRate':
      rate = a[0];
      if (events.has('onPlaybackRateChange')) send({ event: 'onPlaybackRateChange', info: rate });
      break;
  }
});
</script></body></html>`;
}

/** Routes the embed and oEmbed to the fakes. Returns counters of what was requested. */
export async function fakeYoutube(page) {
  const seen = { embed: [], oembed: [] };
  const handler = async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/embed/')) {
      seen.embed.push(url.href);
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: playerHtml() });
    }
    if (url.pathname === '/oembed') {
      seen.oembed.push(url.searchParams.get('url'));
      // Like YouTube: no cookies are expected, CORS for the calling page
      const req = route.request();
      const target = new URL(url.searchParams.get('url'));
      const list = target.searchParams.get('list'), v = target.searchParams.get('v');
      const video = VIDEOS.find(x => x.id === v);
      const body = list === LIST ? { title: LIST_TITLE, author_name: 'Nico', type: 'video' }
        : video ? { title: video.title, author_name: video.author, type: 'video' } : null;
      const headers = { 'access-control-allow-origin': req.headers().origin || '*' };
      return body ? route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) })
        : route.fulfill({ status: 404, headers, body: 'Not Found' });
    }
    return route.fulfill({ status: 404, body: '' });
  };
  await page.route(`${YT}/**`, handler);
  await page.route(`${YT_ACCOUNT}/**`, handler);
  return seen;
}

/** The fake player's frame (the newest, after the app replaced it) */
export async function playerFrame(page) {
  const players = () => page.frames().filter(f => [YT, YT_ACCOUNT].some(h => f.url().startsWith(`${h}/embed/`)));
  await expect.poll(() => players().length).toBeGreaterThan(0);
  const frame = players().at(-1);
  await frame.waitForFunction(() => !!window.fake);
  return frame;
}
