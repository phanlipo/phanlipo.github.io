// Text zu Sprache: browser voices (stand-in speechSynthesis), sentence splitting, playback and clips with a
// stand-in model worker, the real Piper pipeline (onnxruntime + eSpeak NG phonemizer) with a tiny test model,
// download errors, offline use, deleting models, English.
// The real voice models are not downloaded here (large, external) – see tests/manual/tts-e2e.mjs.
import { test, expect, openMenu, closeMenu } from './helpers.mjs';
import { readFileSync } from 'node:fs';

const URL_ = '/text-to-speech/';
const HF = /huggingface\.co/;
const HF_PROBLEMS = /huggingface\.co|Failed to load resource|ERR_FAILED|ERR_INTERNET_DISCONNECTED|Failed to fetch/;

/** Stand-in speechSynthesis with three voices; records what is spoken */
async function fakeSpeech(page) {
  await page.addInitScript(() => {
    const voices = [
      { name: 'Anna', lang: 'de-DE', voiceURI: 'anna', localService: true, default: false },
      { name: 'Google Deutsch', lang: 'de-DE', voiceURI: 'google-de', localService: false, default: true },
      { name: 'Samantha', lang: 'en-US', voiceURI: 'samantha', localService: true, default: true },
    ];
    const spoken = window.__spoken = [];
    window.__cancels = 0;
    const queue = [];
    let busy = false;
    const synth = new EventTarget();
    const pump = () => {
      if (busy || !queue.length) return;
      busy = true;
      const u = queue.shift();
      setTimeout(() => { u.onstart && u.onstart({}); setTimeout(() => { busy = false; u.onend && u.onend({}); pump(); }, window.__utterMs || 30); }, 5);
    };
    Object.assign(synth, {
      paused: false, speaking: false, pending: false,
      getVoices: () => voices,
      speak(u) { spoken.push({ text: u.text, voice: u.voice ? u.voice.voiceURI : null, rate: u.rate, lang: u.lang }); queue.push(u); pump(); },
      cancel() { queue.length = 0; window.__cancels++; },
      pause() {}, resume() {},
    });
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; this.rate = 1; this.voice = null; this.lang = ''; } };
  });
}

/** Stand-in for onnx-worker.js: "downloads" in two steps, answers each sentence with a constant tone
 *  of 100 samples per character at 16 kHz (amplitude 0.5) */
async function fakeModelWorker(page) {
  // On the context: the service worker caches the app's files too
  await page.context().route('**/text-to-speech/onnx-worker.js', r => r.fulfill({ contentType: 'text/javascript', body: `
    self.onmessage = ({ data }) => {
      const { id } = data;
      if (data.type === 'load') {
        self.postMessage({ type: 'progress', id, loaded: 50 * 1048576, total: 100 * 1048576 });
        setTimeout(() => self.postMessage({ type: 'loaded', id, device: 'wasm', seconds: 0.2 }), 50);
        return;
      }
      self.__count = (self.__count || 0) + 1;
      const samples = new Float32Array(data.text.length * 100).fill(0.5);
      self.postMessage({ type: 'log', msg: 'fake speak', data: { n: self.__count, engine: data.engine, voice: data.voice, speed: data.speed, steps: data.steps } });
      setTimeout(() => self.postMessage({ type: 'audio', id, device: 'wasm', samples, sampleRate: 16000, seconds: 0.1 }, [samples.buffer]), 20);
    };` }));
}

/** Parses a 16-bit mono WAV file */
function readWav(buf) {
  expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
  expect(buf.toString('ascii', 8, 12)).toBe('WAVE');
  const sampleRate = buf.readUInt32LE(24), channels = buf.readUInt16LE(22), bits = buf.readUInt16LE(34);
  const n = buf.readUInt32LE(40) / 2;
  const samples = [];
  for (let i = 0; i < n; i++) samples.push(buf.readInt16LE(44 + i * 2) / 32767);
  return { sampleRate, channels, bits, samples };
}
async function saveFirstClip(page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#clips li:first-child [data-act=save]')]);
  return { name: dl.suggestedFilename(), wav: readWav(readFileSync(await dl.path())) };
}

// The German sample text, split by hand: "3." before "November" is an ordinal, "Hallo!" is merged
// with the next sentence, the two short questions are merged
const SAMPLE_SENTENCES = [
  'Hallo! Das ist ein Test der Sprachausgabe.',
  'Am Montag, dem 3. November, um 14:30 Uhr waren es 12,5 Grad – ziemlich frisch für die Jahreszeit.',
  'Wie klingt diese Stimme für dich? Natürlich, oder eher wie ein Roboter?',
];

test('browser voices: only the text language, device voice first, online voice marked', async ({ page }) => {
  await fakeSpeech(page);
  await page.goto(URL_);
  await expect(page.locator('input[name=engine][value=browser]')).toBeChecked();
  const options = await page.locator('#voice option').allTextContents();
  expect(options).toEqual(['Anna (de-DE)', 'Google Deutsch (de-DE) · ☁ online']);
  // The browser default is an online voice – the device voice is preferred
  await expect(page.locator('#voice')).toHaveValue('anna');
  await expect(page.locator('#engineNote')).toBeHidden();
  await page.selectOption('#voice', 'google-de');
  await expect(page.locator('#engineNote')).toContainText('Der Text geht an den Anbieter');
  await page.selectOption('#lang', 'en');
  expect(await page.locator('#voice option').allTextContents()).toEqual(['Samantha (en-US)']);
  // Choices are kept per language
  await page.reload();
  await expect(page.locator('#lang')).toHaveValue('en');
  await page.selectOption('#lang', 'de');
  await expect(page.locator('#voice')).toHaveValue('google-de');
});

test('browser: reads the text sentence by sentence with voice and speed, then stops', async ({ page }) => {
  await fakeSpeech(page);
  await page.goto(URL_);
  await page.click('#btnSample');
  await page.locator('#speed').fill('1.5');
  await expect(page.locator('#speedVal')).toHaveText('1,5×');
  await page.click('#btnSpeak');
  await expect(page.locator('#status')).toHaveText('Fertig.');
  const spoken = await page.evaluate(() => window.__spoken);
  expect(spoken.map(s => s.text)).toEqual(SAMPLE_SENTENCES);
  for (const s of spoken) expect(s).toMatchObject({ voice: 'anna', rate: 1.5, lang: 'de-DE' });
  await expect(page.locator('#btnSpeak')).toBeEnabled();
  await expect(page.locator('#btnStop')).toBeDisabled();
  // Nothing to keep for comparing: browser speech cannot be recorded
  await expect(page.locator('#clips li')).toHaveCount(0);

  await page.evaluate(() => { window.__utterMs = 2000; });
  await page.click('#btnSpeak');
  await expect(page.locator('#status')).toContainText('Liest vor');
  const before = await page.evaluate(() => window.__cancels);
  await page.click('#btnStop');
  await expect(page.locator('#status')).toHaveText('Angehalten.');
  expect(await page.evaluate(() => window.__cancels)).toBeGreaterThan(before);
});

test('long text: paragraphs, abbreviations and over-long sentences are split sensibly', async ({ page }) => {
  await fakeSpeech(page);
  await page.goto(URL_);
  const long = Array.from({ length: 30 }, (_, i) => `Teil ${i + 1}, mit ein paar Wörtern`).join(' ');   // ~1000 characters, no sentence end
  const text = `Dr. Müller kommt z. B. am 1. Mai.\n\nZweiter Absatz ohne Punkt\n\n${long}`;
  await page.fill('#text', text);
  await page.click('#btnSpeak');
  await expect(page.locator('#status')).toHaveText('Fertig.');
  const parts = (await page.evaluate(() => window.__spoken)).map(s => s.text);
  expect(parts[0]).toBe('Dr. Müller kommt z. B. am 1. Mai.');
  expect(parts[1]).toBe('Zweiter Absatz ohne Punkt');
  const rest = parts.slice(2);
  expect(rest.length).toBeGreaterThan(3);
  for (const p of rest) expect(p.length).toBeLessThanOrEqual(220);
  // Cut after a comma where possible, nothing lost
  for (const p of rest.slice(0, -1)) expect(p).toMatch(/,$/);
  expect(rest.join(' ')).toBe(long);
});

test('empty text: a hint instead of reading', async ({ page }) => {
  await fakeSpeech(page);
  await page.goto(URL_);
  await page.click('#btnClear');
  await page.click('#btnSpeak');
  await expect(page.locator('#status')).toHaveText('Bitte zuerst einen Text eingeben.');
  expect(await page.evaluate(() => window.__spoken.length)).toBe(0);
});

test('AI voice: asks before the download, shows progress, plays sentence by sentence, keeps a clip with timing', async ({ page }) => {
  await fakeModelWorker(page);
  await page.goto(URL_);
  await page.click('#btnSample');
  await page.check('input[name=engine][value=supertonic]');
  await expect(page.locator('#stepsField')).toBeVisible();
  await expect(page.locator('#engineNote')).toHaveText('Einmaliger Download ca. 398 MB, danach offline.');
  expect(await page.locator('#voice option').allTextContents()).toEqual(['Frau 1', 'Frau 2', 'Frau 3', 'Frau 4', 'Frau 5', 'Mann 1', 'Mann 2', 'Mann 3', 'Mann 4', 'Mann 5']);
  await page.selectOption('#voice', 'M2');
  await page.selectOption('#steps', '16');

  // Declined: nothing happens
  let asked = '';
  page.once('dialog', d => { asked = d.message(); d.dismiss(); });
  await page.click('#btnSpeak');
  await expect.poll(() => asked).toContain('Supertonic 3 einmalig herunterladen (ca. 398 MB)');
  await expect(page.locator('#btnSpeak')).toBeEnabled();
  await expect(page.locator('#status')).toHaveText('');

  page.once('dialog', d => d.accept());
  await page.click('#btnSpeak');
  await expect(page.locator('#status')).toHaveText('Fertig.', { timeout: 15000 });
  await expect(page.locator('#meta')).toContainText('Supertonic 3 · Mann 2 · Prozessor');
  await expect(page.locator('#meta')).toContainText('s Rechenzeit für');
  await expect(page.locator('#clips li')).toHaveCount(1);
  await expect(page.locator('#clips li .name')).toHaveText('Supertonic 3 · Mann 2');
  // 3 sentences à 0.1 s computing
  await expect(page.locator('#clips li .detail')).toContainText('0,3 s gerechnet');

  // WAV: all sentences one after another with a short pause between them (100 samples per character, 16 kHz)
  const { name, wav } = await saveFirstClip(page);
  expect(name).toBe('supertonic-3-mann-2.wav');
  expect(wav).toMatchObject({ sampleRate: 16000, channels: 1, bits: 16 });
  const pause = Math.round(0.15 * 16000);
  const expected = SAMPLE_SENTENCES.reduce((n, s) => n + s.length * 100, 0) + 2 * pause;
  expect(wav.samples.length).toBe(expected);
  const first = SAMPLE_SENTENCES[0].length * 100;
  expect(wav.samples[0]).toBeCloseTo(0.5, 3);
  expect(wav.samples[first - 1]).toBeCloseTo(0.5, 3);
  expect(wav.samples[first + 10]).toBe(0);                   // pause
  expect(wav.samples[first + pause]).toBeCloseTo(0.5, 3);

  // Played again from the list, removed from the list
  await page.click('#clips li:first-child [data-act=play]');
  await page.click('#clips li:first-child [data-act=remove]');
  await expect(page.locator('#clips li')).toHaveCount(0);
  await expect(page.locator('#clipsEmpty')).toBeVisible();
});

test('AI voice: settings reach the model, stop ends playback', async ({ page }) => {
  await fakeModelWorker(page);
  const logs = [];
  await page.goto(URL_);
  page.on('dialog', d => d.accept());
  await page.fill('#text', Array.from({ length: 12 }, (_, i) => `Das ist der Satz Nummer ${i + 1} in diesem Test.`).join(' '));
  await page.check('input[name=engine][value=piper]');
  await page.selectOption('#voice', 'de/de_DE/thorsten_emotional/medium/de_DE-thorsten_emotional-medium#whisper');
  await page.locator('#speed').fill('0.8');
  await page.click('#btnSpeak');
  await expect(page.locator('#status')).toContainText('Liest vor');
  await page.click('#btnStop');
  await expect(page.locator('#status')).toHaveText('Angehalten.');
  await expect(page.locator('#btnSpeak')).toBeEnabled();
  logs.push(await page.evaluate(() => Tools.diag.text()));
  expect(logs[0]).toContain('"engine":"piper"');
  expect(logs[0]).toContain('thorsten_emotional-medium#whisper');
  expect(logs[0]).toContain('"speed":0.8');
  // No text in the diagnostics
  expect(logs[0]).not.toContain('Satz Nummer');
  // Stays stopped (no "done" from sentences that were still scheduled)
  await page.waitForTimeout(800);
  await expect(page.locator('#status')).toHaveText('Angehalten.');
});

test.describe('model not reachable', () => {
  test.use({ allowedProblems: HF_PROBLEMS });

  test('shows a clear error and allows a retry', async ({ page }) => {
    await page.context().route(HF, r => r.abort());
    await page.goto(URL_);
    page.on('dialog', d => d.accept());
    await page.click('#btnSample');
    await page.check('input[name=engine][value=piper]');
    await page.click('#btnSpeak');
    await expect(page.locator('#status')).toContainText('Die Stimme konnte nicht geladen werden', { timeout: 30000 });
    await expect(page.locator('#status')).toHaveClass(/err/);
    await expect(page.locator('#btnSpeak')).toBeEnabled();
  });
});

// Piper with a tiny stand-in model (tests/fixtures/tiny-piper.onnx: audio = phoneme IDs / 1000 × length scale):
// checks the real worker, onnxruntime and the eSpeak NG phonemizer, without the 60 MB voice
const TINY = readFileSync(new URL('fixtures/tiny-piper.onnx', import.meta.url));
const PIPER_CONFIG = JSON.stringify({ audio: { sample_rate: 16000 }, espeak: { voice: 'de' }, inference: { noise_scale: 0.667, length_scale: 1, noise_w: 0.8 }, num_speakers: 1 });
// "Hallo Welt." = h ˈ a l o ː ␣ v ˈ ɛ l t . in Piper's phoneme ID map (h 20, ˈ 120, a 14, l 24, o 27, ː 122,
// space 3, v 34, ɛ 61, t 32, . 10), with start ^ 1, end $ 2 and a pad 0 after each phoneme
const HALLO_WELT = [1, 0, 20, 0, 120, 0, 14, 0, 24, 0, 27, 0, 122, 0, 3, 0, 34, 0, 120, 0, 61, 0, 24, 0, 32, 0, 10, 0, 2];

// Older voices bring their own, smaller phoneme table: phonemes missing in it are skipped
const SMALL_MAP = { '^': [1], '_': [0], '$': [2], ' ': [3], h: [5], a: [6], l: [7], o: [8], v: [9], t: [11], '.': [12] };
const SMALL_CONFIG = JSON.stringify({ ...JSON.parse(PIPER_CONFIG), phoneme_id_map: SMALL_MAP });
// h (ˈ) a l o (ː) ␣ v (ˈ ɛ) l t .
const HALLO_WELT_SMALL = [1, 0, 5, 0, 6, 0, 7, 0, 8, 0, 3, 0, 9, 0, 7, 0, 11, 0, 12, 0, 2];

async function serveTinyPiper(context) {
  await context.route(HF, r => {
    const u = r.request().url();
    if (u.endsWith('.onnx.json')) return r.fulfill({ contentType: 'application/json', body: u.includes('kerstin') ? SMALL_CONFIG : PIPER_CONFIG });
    if (u.endsWith('.onnx')) return r.fulfill({ contentType: 'application/octet-stream', body: TINY });
    return r.abort();
  });
}
async function speakHallo(page) {
  await page.fill('#text', 'Hallo Welt.');
  const clips = await page.locator('#clips li').count();
  await page.click('#btnSpeak');
  await expect(page.locator('#clips li')).toHaveCount(clips + 1, { timeout: 60000 });
  await expect(page.locator('#status')).toHaveText('Fertig.');
  const { wav } = await saveFirstClip(page);
  return wav;
}

test.describe('Piper pipeline', () => {
  test.use({ allowedProblems: HF_PROBLEMS });

  test('phonemes from eSpeak NG reach the model, speed sets the length scale; works offline, models can be deleted', async ({ page, context }) => {
    test.setTimeout(180000);
    await serveTinyPiper(context);
    await page.goto(URL_);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();                                   // page now controlled → libraries go through the offline cache
    page.on('dialog', d => d.accept());
    await page.check('input[name=engine][value=piper]');
    await page.selectOption('#voice', 'de/de_DE/eva_k/x_low/de_DE-eva_k-x_low');
    let wav = await speakHallo(page);
    expect(wav.sampleRate).toBe(16000);
    expect(wav.samples.map(s => Math.round(s * 1000))).toEqual(HALLO_WELT);
    await expect(page.locator('#engineNote')).toHaveText('Heruntergeladen – funktioniert offline.');

    // Twice the speed = half the length scale
    await page.locator('#speed').fill('2');
    await expect(page.locator('#speedVal')).toHaveText('2,0×');
    wav = await speakHallo(page);
    expect(wav.samples.map(s => Math.round(s * 2000))).toEqual(HALLO_WELT);

    // A voice with its own phoneme table
    await page.locator('#speed').fill('1');
    await page.selectOption('#voice', 'de/de_DE/kerstin/low/de_DE-kerstin-low');
    wav = await speakHallo(page);
    expect(wav.samples.map(s => Math.round(s * 1000))).toEqual(HALLO_WELT_SMALL);
    await page.selectOption('#voice', 'de/de_DE/eva_k/x_low/de_DE-eva_k-x_low');

    // Offline: model from the app's cache, onnxruntime and phonemizer from the offline cache
    await context.unroute(HF);
    await context.setOffline(true);
    await page.reload();
    await page.check('input[name=engine][value=piper]');
    await page.locator('#speed').fill('1');
    wav = await speakHallo(page);
    expect(wav.samples.map(s => Math.round(s * 1000))).toEqual(HALLO_WELT);
    await context.setOffline(false);

    // Menu: Piper is listed with one voice and can be deleted
    await openMenu(page);
    const row = page.locator('#models li', { hasText: 'Piper' });
    await expect(row).toContainText('Stimmen: 2');
    await expect(page.locator('#models li', { hasText: 'Supertonic' })).toContainText('nicht geladen');
    await row.getByRole('button', { name: 'Piper löschen' }).click();
    await expect(row).toContainText('nicht geladen');
    await closeMenu(page);
    await expect(page.locator('#engineNote')).toContainText('Einmaliger Download ca. 21 MB');
    expect(await page.evaluate(async () => (await (await caches.open('text-to-speech-models')).keys()).length)).toBe(0);
  });
});

test('Kokoro: warns that German text gets English pronunciation', async ({ page }) => {
  await page.goto(URL_);
  await page.check('input[name=engine][value=kokoro]');
  await expect(page.locator('#engineNote')).toContainText('nur englische Stimmen');
  await expect(page.locator('#engineNote')).toContainText('ca. 90 MB');
  await page.selectOption('#lang', 'en');
  await expect(page.locator('#engineNote')).not.toContainText('englische Stimmen');
  await openMenu(page);
  await page.selectOption('#device', 'webgpu');
  await closeMenu(page);
  await expect(page.locator('#engineNote')).toContainText('ca. 330 MB');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });

  test('texts in English; the text language follows the app until chosen', async ({ page }) => {
    await fakeSpeech(page);
    await page.goto(URL_);
    await expect(page.locator('h1')).toHaveText('Text to Speech');
    await expect(page.locator('#btnSpeak')).toHaveText('Read aloud');
    await expect(page.locator('#lang')).toHaveValue('en');
    await expect(page.locator('#voice')).toHaveValue('samantha');
    await page.click('#btnSample');
    await expect(page.locator('#text')).toHaveValue(/^Hello! This is a test/);
    await expect(page.locator('#count')).toContainText('characters');
    await page.check('input[name=engine][value=supertonic]');
    expect(await page.locator('#voice option').first().textContent()).toBe('Female 1');
    await page.check('input[name=engine][value=piper]');
    expect(await page.locator('#voice option').first().textContent()).toBe('Lessac (US) · medium · 63 MB');
    await page.check('input[name=engine][value=kokoro]');
    await expect(page.locator('#engineNote')).toHaveText('One-time download of about 90 MB, then offline.');
  });
});
