// Playlist-Player: logic without DOM (playlist links, listening progress, resume point, history).
// Used by index.html as window.PlaylistLogic; architecture in README.md.
(function () {
  'use strict';

  // Playlist IDs: PL…, OLAK5uy_…, UU…, RD… – letters, digits, "-" and "_". Video IDs have 11 characters,
  // so a bare ID needs at least 12 to be taken as a playlist.
  const ID_RE = /^[A-Za-z0-9_-]{12,64}$/;
  const HOSTS = /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/i;

  const VIDEO_RE = /^[A-Za-z0-9_-]{11}$/;

  /** Playlist ID and, if the link points at one video of it, that video:
   *  youtube.com/playlist?list=…, watch?v=…&list=…, youtu.be/<video>?list=…, music.youtube.com, m.youtube.com,
   *  or a bare playlist ID; also finds the link inside shared text ("Schau mal: https://…").
   *  → { list, video } (video '' if none), or null if there is no playlist. */
  function parseLink(input) {
    const s = String(input || '').trim();
    if (!s) return null;
    if (ID_RE.test(s)) return { list: s, video: '' };
    // The host must start there – not "youtube.com" inside "notyoutube.com" (no lookbehind: older Safari)
    const found = s.match(/(^|[^\w.-])((?:https?:\/\/)?(?:[\w-]+\.)*(?:youtube\.com|youtube-nocookie\.com|youtu\.be)\/\S*)/i);
    if (!found) return null;
    let url;
    try { url = new URL(/^https?:/i.test(found[2]) ? found[2] : 'https://' + found[2]); } catch (_) { return null; }
    if (!HOSTS.test(url.hostname)) return null;
    const list = url.searchParams.get('list');
    if (!list || !ID_RE.test(list)) return null;
    let video = url.searchParams.get('v') || '';
    if (/youtu\.be$/i.test(url.hostname)) video = url.pathname.slice(1);
    else if (/^\/(embed|shorts|live)\//.test(url.pathname)) video = url.pathname.split('/')[2] || '';
    return { list, video: VIDEO_RE.test(video) ? video : '' };
  }
  /** Only the playlist ID (see parseLink) */
  const parsePlaylistId = input => (parseLink(input) || {}).list || null;

  const newTrack = id => ({ id, title: '', author: '', dur: 0, pos: 0, done: false, doneAt: 0, lastAt: 0 });

  /** Takes the order of the player's playlist (video IDs) and keeps what is known about each video.
   *  Returns true if something changed. */
  function syncTracks(list, ids) {
    if (!Array.isArray(ids) || !ids.length) return false;
    const clean = ids.filter(id => typeof id === 'string' && /^[A-Za-z0-9_-]{6,20}$/.test(id));
    if (!clean.length) return false;
    const same = clean.length === list.tracks.length && clean.every((id, i) => list.tracks[i].id === id);
    if (same) return false;
    const known = new Map(list.tracks.map(t => [t.id, t]));
    list.tracks = clean.map(id => known.has(id) ? { ...known.get(id) } : newTrack(id));
    if (list.index >= list.tracks.length) list.index = 0;
    return true;
  }

  // A part counts as heard when it ended or less than this is left (credits, outro)
  const END_LEFT = 10;   // seconds
  const END_SHARE = 0.98;

  const finished = (time, dur) => dur > 0 && (time >= dur * END_SHARE || dur - time <= Math.min(END_LEFT, dur * 0.1));

  // Parts shorter than this are ticked only when the player moves on to the next part: an ad (mostly 6–30 s)
  // reports its own time and length under the part's video ID and must not tick the part
  const MIN_TICK = 60;

  /** Position update while playing the part itself (not an ad). The length is the part's known length.
   *  Returns true when the track was just marked as heard. */
  function progress(track, time, now) {
    if (!(time >= 0)) return false;
    track.pos = Math.round(time);
    track.lastAt = now;
    if (!track.done && track.dur >= MIN_TICK && finished(time, track.dur)) { track.done = true; track.doneAt = now; return true; }
    return false;
  }

  /** The player's reported length is the part's (longest seen for this video) – shorter = an ad is playing.
   *  Returns 'ad' while an ad seems to play, otherwise true if the known length changed. */
  function takeDuration(track, dur) {
    if (!(dur > 0)) return false;
    const d = Math.round(dur);
    if (track.dur && d < track.dur - 2) return 'ad';
    if (d > track.dur) { track.dur = d; return true; }
    return false;
  }

  /** Mark as heard because the player moved on from it by itself (it ended). Returns true if newly ticked. */
  function ended(track, now) {
    if (track.done) return false;
    track.done = true; track.doneAt = now;
    if (track.dur) track.pos = track.dur;
    return true;
  }

  /** Mark as heard (or not) by hand. */
  function setDone(track, done, now) {
    track.done = !!done;
    track.doneAt = done ? (track.doneAt || now) : 0;
    if (!done && track.dur && track.pos >= track.dur - 1) track.pos = 0;
  }

  /** Where to continue: the current part if not heard yet, otherwise the next part not heard yet. */
  function resumePoint(list) {
    const n = list.tracks.length;
    if (!n) return { index: 0, start: 0 };
    let index = Math.min(Math.max(list.index || 0, 0), n - 1);
    if (list.tracks[index].done) {
      for (let k = 1; k <= n; k++) {
        const i = (index + k) % n;
        if (!list.tracks[i].done) { index = i; break; }
      }
    }
    return { index, start: startOf(list.tracks[index]) };
  }

  /** Seconds to start a part at: where it was left, from the start if heard or nearly over */
  function startOf(t) {
    if (!t || t.done) return 0;
    if (t.dur && t.pos >= t.dur - 5) return 0;
    return t.pos > 3 ? t.pos : 0;
  }

  function summary(list) {
    const tracks = list.tracks;
    const done = tracks.filter(t => t.done).length;
    const known = tracks.filter(t => t.dur > 0);
    const total = known.reduce((s, t) => s + t.dur, 0);
    const heard = known.reduce((s, t) => s + (t.done ? t.dur : Math.min(t.pos, t.dur)), 0);
    // Times only when every part's length is known – otherwise "0:02 of 15:03" would mean only some parts
    return { count: tracks.length, done, known: known.length, total, heard, complete: known.length === tracks.length && tracks.length > 0 };
  }

  /** 3725 → "1:02:05", 65 → "1:05" */
  function fmtTime(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = s % 60;
    const pad = v => String(v).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
  }

  /* ---------- Listening history: one entry per stretch of listening ---------- */
  const HISTORY_MAX = 300;
  const MIN_SESSION = 10; // seconds – shorter stretches (skipping around) are not recorded

  /** Adds a finished stretch; merges with the previous entry if it simply continues it. Returns the list. */
  function addSession(history, s) {
    if (!(s.to - s.from >= MIN_SESSION)) return history;
    const last = history[0];
    if (last && last.list === s.list && last.vid === s.vid && Math.abs(last.to - s.from) <= 3 && s.at - last.end < 5 * 60e3) {
      last.to = s.to; last.end = s.end;
      return history;
    }
    history.unshift({ list: s.list, vid: s.vid, idx: s.idx, from: Math.round(s.from), to: Math.round(s.to), at: s.at, end: s.end });
    if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
    return history;
  }

  window.PlaylistLogic = { parseLink, parsePlaylistId, syncTracks, progress, takeDuration, ended, MIN_TICK, setDone, resumePoint, startOf, summary, fmtTime, addSession, newTrack, finished };
})();
