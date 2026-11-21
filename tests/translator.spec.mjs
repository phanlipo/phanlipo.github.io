// Übersetzer: the browser's Translator API (stand-in, translator-fakes.mjs) – available, download after asking
// (with user activation), language detection, swapping; the Opus-MT fallback with a stand-in worker – routes
// (direct, through English, impossible), download size, asking only before the first download, sentence
// splitting, load errors, deleting only our models; the real worker starts offline; shared text, clearing
// with undo, reload, English. Real Opus-MT models are not downloaded here (large, external).
import { test, expect, openSettings, closeMenu, onDialog, switchLang, clipboardText } from './helpers.mjs';
import { fakeTranslatorApi, noTranslatorApi, fakeOpusWorker, markOpusDownloaded } from './translator-fakes.mjs';

const URL_ = '/translator/';
const HF_PROBLEMS = /huggingface\.co|hf\.co|Failed to load resource|ERR_FAILED|ERR_INTERNET_DISCONNECTED|Failed to fetch|Unable to fetch|Could not locate/;
const draft = page => page.evaluate(() => JSON.parse(localStorage.getItem('translator.draft.v1')));
const asked = page => {
  const questions = [];
  return { questions, answer: async accept => onDialog(page, d => { questions.push(d.message()); accept ? d.accept() : d.dismiss(); }) };
};
async function pick(page, src, tgt) {
  await page.selectOption('#src', src);
  await page.selectOption('#tgt', tgt);
}

test.describe('browser translation (Translator API)', () => {
  test('translates line by line on the device, keeps empty lines, survives a reload', async ({ page }) => {
    await fakeTranslatorApi(page, { avail: { 'de-en': 'available' } });
    const q = asked(page); await q.answer(true);
    await page.goto(URL_);
    await pick(page, 'de', 'en');
    await expect(page.locator('#engineInfo')).toHaveText('Übersetzt mit dem Browser auf dem Gerät.');
    await page.fill('#input', 'Guten Morgen. Wie geht es?\n\nTschüss');
    await expect(page.locator('#count')).toHaveText('35 / 5.000 Zeichen');
    await page.click('#btnRun');
    await expect(page.locator('#output')).toHaveValue('[en] Guten Morgen. Wie geht es?\n\n[en] Tschüss');
    await expect(page.locator('#status')).toHaveText(/^Fertig · Browser · \d+,\d s$/);
    expect(q.questions).toEqual([]);                                   // nothing to download → no question
    expect(await page.evaluate(() => window.__tr.pieces)).toEqual(['Guten Morgen. Wie geht es?', 'Tschüss']);
    await expect(page.locator('#output')).toHaveAttribute('lang', 'en');
    await page.reload();
    await expect(page.locator('#input')).toHaveValue('Guten Morgen. Wie geht es?\n\nTschüss');
    await expect(page.locator('#output')).toHaveValue('[en] Guten Morgen. Wie geht es?\n\n[en] Tschüss');
    await expect(page.locator('#src')).toHaveValue('de');
    await expect(page.locator('#tgt')).toHaveValue('en');
    // Ctrl+Enter translates too
    await page.fill('#input', 'Hallo');
    await page.press('#input', 'Control+Enter');
    await expect(page.locator('#output')).toHaveValue('[en] Hallo');
  });

  test('asks before the browser downloads a language pack; declined → nothing happens', async ({ page }) => {
    await fakeTranslatorApi(page, { avail: { 'de-fr': 'downloadable' } });
    await page.goto(URL_);
    await pick(page, 'de', 'fr');
    await expect(page.locator('#engineInfo')).toHaveText('Übersetzt mit dem Browser – beim ersten Mal lädt er das Sprachpaket.');
    await page.fill('#input', 'Hallo');
    const no = asked(page); await no.answer(false);
    await page.click('#btnRun');
    await expect.poll(() => no.questions.length).toBe(1);
    expect(no.questions[0]).toContain('Deutsch → Französisch');
    await expect(page.locator('#btnRun')).toBeEnabled();
    await expect(page.locator('#output')).toHaveValue('');
    expect(await page.evaluate(() => window.__tr.created)).toEqual([]);
  });

  test('download after yes: progress, created with user activation, no question afterwards', async ({ page }) => {
    await fakeTranslatorApi(page, { avail: { 'de-fr': 'downloadable' } });
    await page.goto(URL_);
    await pick(page, 'de', 'fr');
    await page.fill('#input', 'Hallo');
    const yes = asked(page); await yes.answer(true);
    await page.click('#btnRun');
    await expect(page.locator('#output')).toHaveValue('[fr] Hallo');
    expect(await page.evaluate(() => window.__tr)).toMatchObject({ created: ['de-fr'], progress: [0, 0.5, 1] });
    expect(yes.questions).toHaveLength(1);
    await expect(page.locator('#engineInfo')).toHaveText('Übersetzt mit dem Browser auf dem Gerät.');
    await page.fill('#input', 'Hallo Welt');
    await page.click('#btnRun');
    await expect(page.locator('#output')).toHaveValue('[fr] Hallo Welt');
    expect(yes.questions).toHaveLength(1);
  });

  test('detects the language, shows it, and swapping uses it', async ({ page }) => {
    await fakeTranslatorApi(page, { avail: { 'fr-de': 'available', 'de-fr': 'available' } });
    await page.goto(URL_);
    await expect(page.locator('#src')).toHaveValue('auto');           // default when the browser can detect
    await expect(page.locator('#src option').first()).toHaveText('Erkennen');
    await page.selectOption('#tgt', 'de');
    await expect(page.locator('#engineInfo')).toHaveText('Die Sprache erkennt der Browser.');
    await page.fill('#input', 'Bonjour tout le monde');
    await page.click('#btnRun');
    await expect(page.locator('#output')).toHaveValue('[de] Bonjour tout le monde');
    await expect(page.locator('#detected')).toHaveText('Erkannt: Französisch');
    await page.click('#btnSwap');
    await expect(page.locator('#src')).toHaveValue('de');
    await expect(page.locator('#tgt')).toHaveValue('fr');
    await expect(page.locator('#input')).toHaveValue('[de] Bonjour tout le monde');
    await expect(page.locator('#output')).toHaveValue('Bonjour tout le monde');
  });

  test('unclear language or text already in the target language: a clear message', async ({ page }) => {
    await fakeTranslatorApi(page, { avail: { '*': 'available' }, detect: [{ detectedLanguage: 'und', confidence: 0.3 }] });
    await page.goto(URL_);
    await page.selectOption('#tgt', 'de');
    await page.fill('#input', 'xyz');
    await page.click('#btnRun');
    await expect(page.locator('#status')).toHaveText('Die Sprache wurde nicht erkannt – bitte oben wählen.');
    await expect(page.locator('#status')).toHaveClass(/err/);
    await page.evaluate(() => { window.__tr.detect = [{ detectedLanguage: 'de-AT', confidence: 0.95 }]; });
    await page.fill('#input', 'Grüß Gott');
    await page.click('#btnRun');
    await expect(page.locator('#status')).toHaveText('Der Text ist schon auf Deutsch.');
    expect(await page.evaluate(() => window.__tr.pieces)).toEqual([]);
    await page.click('#btnSwap');                                     // nothing translated yet → nothing to swap with
    await expect(page.locator('#src')).toHaveValue('auto');
  });

  test('no text, same languages', async ({ page }) => {
    await fakeTranslatorApi(page, { avail: { '*': 'available' } });
    await page.goto(URL_);
    await pick(page, 'en', 'en');
    await expect(page.locator('#engineInfo')).toHaveText('Bitte zwei verschiedene Sprachen wählen.');
    await page.click('#btnRun');
    await expect(page.locator('#status')).toHaveText('Bitte erst einen Text eingeben.');
    await page.fill('#input', 'Hello');
    await page.click('#btnRun');
    await expect(page.locator('#status')).toHaveText('Ausgangs- und Zielsprache sind gleich.');
  });
});

test.describe('language detection without the Translator API (Chrome on Android)', () => {
  test('short text: uncertain detection still translates with Opus-MT and says so', async ({ page }) => {
    await fakeTranslatorApi(page, { translator: false, detect: [{ detectedLanguage: 'de', confidence: 0.31 }, { detectedLanguage: 'nl', confidence: 0.22 }] });
    await fakeOpusWorker(page);
    await onDialog(page, d => d.accept());
    await page.goto(URL_);
    await expect(page.locator('#src')).toHaveValue('auto');
    await page.selectOption('#tgt', 'en');
    await expect(page.locator('#engineInfo')).toHaveText('Die Sprache erkennt der Browser.');
    await page.fill('#input', 'Hallo');
    await page.click('#btnRun');
    await expect(page.locator('#output')).toHaveValue('en(Hallo)');
    await expect(page.locator('#detected')).toHaveText('Erkannt: Deutsch (unsicher – sonst oben wählen)');
    // The diagnostics name the detected languages, never the text
    const diag = await page.evaluate(() => Tools.diag.text());
    expect(diag).toContain('de 31%');
    expect(diag).not.toContain('Hallo');
    // Sure detection: no hint
    await page.evaluate(() => { window.__tr.detect = [{ detectedLanguage: 'fr', confidence: 0.97 }]; });
    await page.fill('#input', 'Bonjour à tous');
    await page.click('#btnRun');
    await expect(page.locator('#output')).toHaveValue('en(Bonjour à tous)');
    await expect(page.locator('#detected')).toHaveText('Erkannt: Französisch');
  });

  test('only very unsure or unknown languages count as not detected', async ({ page }) => {
    await fakeTranslatorApi(page, { translator: false, detect: [{ detectedLanguage: 'la', confidence: 0.6 }, { detectedLanguage: 'it', confidence: 0.1 }] });
    await fakeOpusWorker(page);
    await page.goto(URL_);
    await page.selectOption('#tgt', 'en');
    await page.fill('#input', 'Lorem ipsum');
    await page.click('#btnRun');
    await expect(page.locator('#status')).toHaveText('Die Sprache wurde nicht erkannt – bitte oben wählen.');
    expect(await page.evaluate(() => Tools.diag.text())).toContain('translate failed');
  });
});

test('the main button sits right under the text, before the translation (phone)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto(URL_);
  const input = await page.locator('#input').boundingBox();
  const run = await page.locator('#btnRun').boundingBox();
  const output = await page.locator('#output').boundingBox();
  expect(run.y).toBeGreaterThan(input.y + input.height);
  expect(run.y + run.height).toBeLessThan(output.y);
  expect(run.y + run.height).toBeLessThan(740);                       // visible without scrolling
});

test.describe('Opus-MT fallback', () => {
  test('without the Translator API: asks with the size once, then translates sentence by sentence', async ({ page }) => {
    await noTranslatorApi(page);
    await fakeOpusWorker(page);
    await page.goto(URL_);
    await expect(page.locator('#src option[value="auto"]')).toHaveCount(0);   // no detection without the browser
    await pick(page, 'de', 'en');
    await expect(page.locator('#engineInfo')).toHaveText('Übersetzt mit Opus-MT – einmaliger Download ca. 110 MB.');
    await page.fill('#input', 'Guten Morgen. Wie geht es dir?\nTschüss!');
    const q = asked(page); await q.answer(true);
    await page.click('#btnRun');
    await expect(page.locator('#output')).toHaveValue('en(Guten Morgen.) en(Wie geht es dir?)\nen(Tschüss!)');
    await expect(page.locator('#status')).toHaveText(/^Fertig · Opus-MT · \d+,\d s$/);
    expect(q.questions).toHaveLength(1);
    expect(q.questions[0]).toContain('Deutsch → Englisch');
    expect(q.questions[0]).toContain('110 MB');
    expect(q.questions[0]).toContain('Hugging Face');
    await expect(page.locator('#engineInfo')).toHaveText('Übersetzt mit Opus-MT – Modell ist geladen.');
    await page.fill('#input', 'Hallo');
    await page.click('#btnRun');
    await expect(page.locator('#output')).toHaveValue('en(Hallo)');
    expect(q.questions).toHaveLength(1);                               // downloaded → no second question
  });

  test('pairs without their own model go through English; impossible pairs are said so', async ({ page }) => {
    await noTranslatorApi(page);
    await fakeOpusWorker(page);
    const q = asked(page); await q.answer(true);
    await page.goto(URL_);
    await pick(page, 'pl', 'de');
    await expect(page.locator('#engineInfo')).toHaveText('Übersetzt mit Opus-MT – einmaliger Download ca. 220 MB. (über Englisch)');
    await page.fill('#input', 'Dzień dobry');
    await page.click('#btnRun');
    await expect(page.locator('#output')).toHaveValue('de(en(Dzień dobry))');
    expect(q.questions[0]).toContain('220 MB');
    // Direct model for de → fr: no detour
    await pick(page, 'de', 'fr');
    await expect(page.locator('#engineInfo')).toHaveText('Übersetzt mit Opus-MT – einmaliger Download ca. 110 MB.');
    await page.fill('#input', 'Hallo');
    await page.click('#btnRun');
    await expect(page.locator('#output')).toHaveValue('fr(Hallo)');
    // Portuguese has no Opus-MT model at all, Polish only into English
    for (const [s, t] of [['de', 'pt'], ['de', 'pl']]) {
      await pick(page, s, t);
      await expect(page.locator('#engineInfo')).toHaveText('Dieses Sprachpaar kann dieser Browser nicht übersetzen.');
    }
    await page.click('#btnRun');
    await expect(page.locator('#status')).toHaveText('Dieses Sprachpaar kann hier nicht übersetzt werden.');
    await expect(page.locator('#output')).toHaveValue('fr(Hallo)');
  });

  test('"Automatic" uses the browser where it can, Opus-MT for the other pairs; the setting forces one', async ({ page }) => {
    await fakeTranslatorApi(page, { avail: { 'de-en': 'available' } });
    await fakeOpusWorker(page);
    await page.goto(URL_);
    await markOpusDownloaded(page, ['Xenova/opus-mt-de-en', 'Xenova/opus-mt-de-fr']);
    await pick(page, 'de', 'fr');
    await expect(page.locator('#engineInfo')).toHaveText('Übersetzt mit Opus-MT – Modell ist geladen.');
    await page.fill('#input', 'Hallo');
    await page.click('#btnRun');
    await expect(page.locator('#output')).toHaveValue('fr(Hallo)');
    await page.selectOption('#tgt', 'en');
    await page.click('#btnRun');
    await expect(page.locator('#output')).toHaveValue('[en] Hallo');
    await openSettings(page);
    await expect(page.locator('#apiInfo')).toHaveText('Dieser Browser hat eine eingebaute Übersetzung (Translator API).');
    await page.selectOption('#engine', 'opus');
    await closeMenu(page);
    await page.click('#btnRun');
    await expect(page.locator('#output')).toHaveValue('en(Hallo)');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('translator.settings.v1')).engine)).toBe('opus');
  });

  test.describe('errors', () => {
    test.use({ allowedProblems: /fake load error/ });
    test('model not loadable: clear message, retry possible', async ({ page }) => {
      await noTranslatorApi(page);
      await fakeOpusWorker(page, { fail: 'load' });
      await onDialog(page, d => d.accept());
      await page.goto(URL_);
      await pick(page, 'en', 'de');
      await page.fill('#input', 'Hello');
      await page.click('#btnRun');
      await expect(page.locator('#status')).toHaveText('Das Modell konnte nicht geladen werden. Für den ersten Download ist eine Internetverbindung nötig. (fake load error)');
      await expect(page.locator('#status')).toHaveClass(/err/);
      await expect(page.locator('#btnRun')).toBeEnabled();
      await expect(page.locator('#btnRun')).toHaveText('Übersetzen');
      await expect(page.locator('#progressBox')).toBeHidden();
    });
  });

  test('menu: lists downloaded models and deletes only ours (Whisper stays)', async ({ page }) => {
    await noTranslatorApi(page);
    await page.goto(URL_);
    await markOpusDownloaded(page, ['Xenova/opus-mt-de-en', 'Xenova/opus-mt-en-fr']);
    await page.evaluate(async () => (await caches.open('transformers-cache')).put('https://huggingface.co/onnx-community/whisper-base/resolve/main/onnx/encoder_model.onnx', new Response('w')));
    await page.reload();
    await openSettings(page);
    await expect(page.locator('#apiInfo')).toHaveText('Dieser Browser hat keine eingebaute Übersetzung – es wird das Opus-MT-Modell genutzt.');
    await expect(page.locator('#modelInfo')).toHaveText('Deutsch → Englisch, Englisch → Französisch · zusammen ca. 220 MB');
    await onDialog(page, d => d.accept(), { once: true });
    await page.click('#btnDeleteModels');
    await expect(page.locator('#modelInfo')).toHaveText('Noch kein Modell heruntergeladen.');
    await expect(page.locator('#btnDeleteModels')).toBeDisabled();
    const left = await page.evaluate(async () => (await (await caches.open('transformers-cache')).keys()).map(r => r.url));
    expect(left).toEqual(['https://huggingface.co/onnx-community/whisper-base/resolve/main/onnx/encoder_model.onnx']);
  });
});

test.describe('real worker', () => {
  // The real worker.js + transformers.js are loaded; Hugging Face is blocked, so loading the model fails.
  // After the first visit the worker and the library come from the cache – also offline.
  test.use({ allowedProblems: HF_PROBLEMS });

  test('starts and reports a clear error – also offline after the first use', async ({ page, context }) => {
    await context.route(/huggingface\.co|hf\.co/, r => r.abort());
    await noTranslatorApi(page);
    await onDialog(page, d => d.accept());
    await page.goto(URL_);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();                              // controlled by the service worker → libraries get cached
    await pick(page, 'de', 'en');
    await page.fill('#input', 'Hallo');
    await page.click('#btnRun');
    const expected = /^Das Modell konnte nicht geladen werden\. Für den ersten Download ist eine Internetverbindung nötig\./;
    await expect(page.locator('#status')).toHaveText(expected, { timeout: 30000 });
    await context.setOffline(true);
    await page.reload();
    await page.click('#btnRun');
    await expect(page.locator('#status')).toHaveText(expected, { timeout: 30000 });
    // The failure came from the model download, not from a worker that could not start
    expect(await page.evaluate(() => Tools.diag.text())).not.toContain('worker failed to start');
    await context.setOffline(false);
  });
});

test('text shared to the installed app lands in the input field', async ({ page }) => {
  await fakeTranslatorApi(page, { avail: { '*': 'available' } });
  await page.goto(`${URL_}?title=Nachricht&text=${encodeURIComponent('Nachricht: Bonjour')}&url=${encodeURIComponent('https://example.org/a')}`);
  await expect(page.locator('#input')).toHaveValue('Nachricht: Bonjour\nhttps://example.org/a');
  await expect(page.locator('#output')).toHaveValue('');
  expect(new URL(page.url()).search).toBe('');
});

test('copy, clear with undo', async ({ page }) => {
  await fakeTranslatorApi(page, { avail: { '*': 'available' } });
  await page.goto(URL_);
  await pick(page, 'de', 'en');
  await page.fill('#input', 'Hallo');
  await page.click('#btnRun');
  await expect(page.locator('#output')).toHaveValue('[en] Hallo');
  await page.fill('#output', 'Hello');                               // corrected by hand
  await page.click('#btnCopy');
  expect(await clipboardText(page)).toBe('Hello');
  await page.click('#btnClear');
  await expect(page.locator('#input')).toHaveValue('');
  await expect(page.locator('#output')).toHaveValue('');
  expect(await draft(page)).toMatchObject({ text: '', result: '' });
  await page.locator('#toast button').click();
  await expect(page.locator('#input')).toHaveValue('Hallo');
  await expect(page.locator('#output')).toHaveValue('Hello');
  expect(await draft(page)).toMatchObject({ text: 'Hallo', result: 'Hello' });
});

test('actions under the translation fit in one row on a phone; read aloud toggles to stop', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.share = async () => {};
    window.__spoken = [];
    const synth = { speak: u => { window.__spoken.push({ text: u.text, lang: u.lang }); window.__utter = u; }, cancel: () => {} };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; this.lang = ''; } };
  });
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto(URL_);
  const buttons = page.locator('.out-actions > button');
  await expect(buttons).toHaveCount(4);
  const boxes = await buttons.evaluateAll(bs => bs.map(b => { const r = b.getBoundingClientRect(); return { y: r.y, h: r.height }; }));
  expect(new Set(boxes.map(b => Math.round(b.y))).size).toBe(1);   // one row
  await expect(page.locator('.out-actions .tb-label').first()).toBeVisible();   // with the word
  await page.fill('#output', 'Привет.');
  await page.evaluate(() => { localStorage.setItem('translator.draft.v1', JSON.stringify({ text: '', result: '', from: 'de', to: 'ru' })); });
  const speak = page.locator('#btnSpeak');
  await expect(speak).toHaveAccessibleName('Vorlesen');
  await speak.click();
  await expect(speak).toHaveAccessibleName('Stopp');
  await expect(speak).toHaveText('Stopp');
  expect(await page.evaluate(() => window.__spoken[0].text)).toBe('Привет.');
  await page.evaluate(() => window.__utter.onend());
  await expect(speak).toHaveAccessibleName('Vorlesen');
});

test('diagnostics contain no text', async ({ page }) => {
  await fakeTranslatorApi(page, { avail: { '*': 'available' } });
  await page.goto(URL_);
  await pick(page, 'de', 'en');
  await page.fill('#input', 'Geheimer Satz');
  await page.click('#btnRun');
  await expect(page.locator('#output')).toHaveValue('[en] Geheimer Satz');
  const diag = await page.evaluate(() => Tools.diag.text());
  expect(diag).toContain('translatorApi');
  expect(diag).not.toContain('Geheim');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('language names, texts and messages in English', async ({ page }) => {
    await noTranslatorApi(page);
    await fakeOpusWorker(page);
    await page.goto(URL_);
    await expect(page.locator('#src')).toHaveValue('de');            // English page: from German into English
    await expect(page.locator('#tgt')).toHaveValue('en');
    await expect(page.locator('#tgt option[value="de"]')).toHaveText('German');
    await expect(page.locator('#engineInfo')).toHaveText('Translated with Opus-MT – one-time download of about 110 MB.');
    await expect(page.locator('#btnRun')).toHaveText('Translate');
    await page.fill('#input', 'Hallo.');
    await onDialog(page, d => d.accept());
    await page.click('#btnRun');
    await expect(page.locator('#output')).toHaveValue('en(Hallo.)');
    await expect(page.locator('#status')).toHaveText(/^Done · Opus-MT · \d+\.\d s$/);
  });

  test('switching the language re-renders names', async ({ page }) => {
    await noTranslatorApi(page);
    await page.goto(URL_);
    await switchLang(page, 'de');
    await expect(page.locator('#tgt option[value="de"]')).toHaveText('Deutsch');
    await expect(page.locator('#count')).toHaveText('0 / 5.000 Zeichen');
  });
});
