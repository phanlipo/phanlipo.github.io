/* "Show on TV": the phone mirrors its screen with the system's own screen casting (Android "Screen cast" /
   Smart View / Google Home, iPhone AirPlay, Chrome on a computer "Cast tab"). A web page cannot start that
   itself, but it can prepare the picture for the TV: full screen without browser and system bars, landscape
   (fills a 16:9 TV without black bars) and the screen kept on (mirroring stops when the phone screen turns off).
   Kept small and without DOM of its own, so other apps can use it later (then move it to assets/shared/).

   TvMode.platform()            'android' | 'ios' | 'desktop'
   TvMode.CAST_SETTINGS         intent: link to Android's cast settings (put on an <a>, tapped by the user)
   TvMode.watchLaunch(fn)       after a tap on that link: fn(opened) – opened = the page went to the background
                                within 2.5 s (settings opened), false = Chrome did not open them
   TvMode.enter(el)             → Promise { fullscreen, landscape, wakeLock } (call in a tap)
   TvMode.exit()                leaves full screen, unlocks rotation, lets the screen turn off again
   TvMode.active()              true while in TV mode
   TvMode.onChange(fn)          fn(active) – also when the back gesture ends full screen
   TvMode.info()                short state for Tools.diag.info */
(() => {
  'use strict';
  const log = (...a) => window.Tools && Tools.diag && Tools.diag.log(...a);
  const ua = navigator.userAgent || '';
  const platform = () => /Android/i.test(ua) ? 'android'
    : /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'ios' : 'desktop';
  // Settings.ACTION_CAST_SETTINGS. Chrome may refuse to open system settings from a web page – watchLaunch tells.
  const CAST_SETTINGS = 'intent:#Intent;action=android.settings.CAST_SETTINGS;end';

  let on = false, wake = null, landscape = false, fakeFull = false, el = null;
  const listeners = new Set();
  const emit = () => listeners.forEach(fn => { try { fn(on); } catch (e) { console.error(e); } });

  async function lockWake() {
    if (!('wakeLock' in navigator) || wake || document.visibilityState !== 'visible') return !!wake;
    try {
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => { wake = null; });
      return true;
    } catch (e) { log('tv: wake lock failed', { error: String(e && e.name) }); return false; }
  }
  document.addEventListener('visibilitychange', () => { if (on && document.visibilityState === 'visible') lockWake(); });

  async function enter(target) {
    el = target || document.documentElement;
    on = true;
    let full = false;
    if (Tools.fullscreen.system()) full = true;            // installed app already without bars
    else if (Tools.fullscreen.supported()) full = await Tools.fullscreen.enter(el);
    if (!full) { fakeFull = true; el.classList.add('tv-fill'); }   // iPhone: fill the window instead
    landscape = false;
    try { if (screen.orientation && screen.orientation.lock) { await screen.orientation.lock('landscape'); landscape = true; } }
    catch (e) { log('tv: rotation lock failed', { error: String(e && e.name) }); }
    const w = await lockWake();
    log('tv on', { fullscreen: full ? 'yes' : 'fill', landscape, wakeLock: w });
    emit();
    return { fullscreen: full, landscape, wakeLock: w };
  }

  async function exit() {
    if (!on) return;
    on = false;
    try { if (landscape && screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (_) {}
    landscape = false;
    if (fakeFull && el) el.classList.remove('tv-fill');
    fakeFull = false;
    if (document.fullscreenElement || document.webkitFullscreenElement) await Tools.fullscreen.exit();
    if (wake) { try { await wake.release(); } catch (_) {} wake = null; }
    log('tv off');
    emit();
  }
  // Back gesture / Escape ends full screen → leave TV mode as well
  Tools.fullscreen.onChange(active => { if (!active && on && !fakeFull && !Tools.fullscreen.system()) exit(); });

  function watchLaunch(fn) {
    let hidden = false;
    const vis = () => { if (document.visibilityState === 'hidden') hidden = true; };
    document.addEventListener('visibilitychange', vis);
    setTimeout(() => {
      document.removeEventListener('visibilitychange', vis);
      log('tv: cast settings', { opened: hidden });
      fn(hidden);
    }, 2500);
  }

  window.TvMode = {
    CAST_SETTINGS, platform, enter, exit, watchLaunch,
    active: () => on,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    info: () => ({ platform: platform(), active: on, fullscreen: fakeFull ? 'fill' : Tools.fullscreen.active(), landscape, wakeLock: !!wake,
      orientationLock: !!(screen.orientation && screen.orientation.lock), wakeLockApi: 'wakeLock' in navigator }),
  };
})();
