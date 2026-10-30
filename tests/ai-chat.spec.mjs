// KI-Chat: model choice per graphics card, chat flow with streaming, stop, errors, history, settings,
// safe rendering of answers, deleting only our model files, offline, English.
// The model itself is replaced by a stand-in worker (tests/fake-llm.mjs) – the real Gemma download is
// far too big for `npm test`; see tests/manual/chat-e2e.mjs.
import { test, expect } from './helpers.mjs';
import { fakeLlm, markDownloaded } from './fake-llm.mjs';

const URL_ = '/ai-chat/';
const GEMMA4 = { id: 'onnx-community/gemma-4-E2B-it-qat-mobile-ONNX', revision: 'a7f19b0ab28252b77cea830f52b8290b2479c87d' };
const GEMMA4_FILES = { ...GEMMA4, sessions: ['embed_tokens', 'decoder_model_merged'], dtype: 'q2f16' };
const GEMMA3_1B = { id: 'onnx-community/gemma-3-1b-it-ONNX', revision: 'a58439f40017d3b99c7d378ff525e54e0ba08ebf' };
const posted = page => page.evaluate(() => window.__llm.posted);
const setReply = (page, reply) => page.evaluate(r => { window.__llm.reply = r; }, reply);

// The model choice is inside the (collapsed) settings
async function pickModel(page, key) {
  if (!(await page.locator('#settingsBox').evaluate(d => d.open))) await page.locator('#settingsBox summary').click();
  await page.selectOption('#model', key);
}

async function send(page, text) {
  await page.fill('#input', text);
  await page.click('#btnSend');
}

test('without WebGPU: notice, nothing can be sent', async ({ page }) => {
  await fakeLlm(page, { gpu: 'none' });
  await page.goto(URL_);
  await expect(page.locator('#noGpu')).toBeVisible();
  await expect(page.locator('#model')).toHaveAttribute('data-gpu', 'none');
  await expect(page.locator('#btnSend')).toBeDisabled();
  await expect(page.locator('#input')).toBeDisabled();
  await expect(page.locator('#modelInfo')).toHaveText('Ohne WebGPU kann das Modell nicht laufen.');
  await expect(page.locator('#modelBadge')).toBeHidden();
  await expect(page.locator('#firstHint')).toBeHidden();
});

test('graphics card with shader-f16 and big buffers: Gemma 4 is the default', async ({ page }) => {
  await fakeLlm(page, { gpu: 'f16' });
  await page.goto(URL_);
  await expect(page.locator('#model')).toHaveValue('gemma4-e2b');
  await expect(page.locator('#noGpu')).toBeHidden();
  // Sizes = ONNX files + tokenizer of the dtype this device loads (q2f16 / q4f16)
  await expect(page.locator('#model option[value="gemma4-e2b"]')).toHaveText('Gemma 4 E2B – empfohlen (ca. 2,3 GB)');
  await expect(page.locator('#model option[value="gemma3-1b"]')).toHaveText('Gemma 3 1B – mittel (ca. 780 MB)');
  await expect(page.locator('#model option[value="gemma3-270m"]')).toHaveText('Gemma 3 270M – klein, schnell (ca. 290 MB)');
  await expect(page.locator('#modelInfo')).toHaveText('Wird beim ersten Senden heruntergeladen: ca. 2,3 GB – am besten im WLAN.');
  await expect(page.locator('#btnSend')).toBeEnabled();
  // The choice is remembered
  await pickModel(page, 'gemma3-270m');
  await page.reload();
  await expect(page.locator('#model')).toHaveValue('gemma3-270m');
});

for (const [name, opts, size] of [
  ['no shader-f16', { gpu: 'f32' }, '880 MB'],
  ['buffers smaller than the 1.17 GB embedding table', { gpu: 'f16', maxBuffer: 1024 ** 3 }, '780 MB'],
  ['less than 8 GB of memory', { gpu: 'f16', memory: 4 }, '780 MB'],
]) {
  test(`Gemma 4 not offered: ${name}`, async ({ page }) => {
    await fakeLlm(page, opts);
    await page.goto(URL_);
    await expect(page.locator('#model')).toHaveValue('gemma3-1b');
    const g4 = page.locator('#model option[value="gemma4-e2b"]');
    await expect(g4).toHaveText('Gemma 4 E2B – empfohlen – nicht auf diesem Gerät');
    expect(await g4.evaluate(o => o.disabled)).toBe(true);
    await expect(page.locator('#model option[value="gemma3-1b"]')).toHaveText(`Gemma 3 1B – mittel (ca. ${size})`);
    // A saved Gemma 4 choice falls back as well
    await page.evaluate(() => localStorage.setItem('ai-chat.settings.v1', JSON.stringify({ model: 'gemma4-e2b' })));
    await page.reload();
    await expect(page.locator('#model')).toHaveValue('gemma3-1b');
  });
}

test('chat: streams the answer, renders Markdown, saves and continues from the history', async ({ page }) => {
  await fakeLlm(page, { gpu: 'f16' });
  await page.goto(URL_);
  await pickModel(page, 'gemma3-1b');
  await setReply(page, { tokens: ['Das ist **wichtig**:\n', '- eins\n', '- zwei\n\n', '```\nx = 1\n```'], delay: 30 });
  await send(page, 'Erkläre etwas');
  await expect(page.locator('.msg.user')).toHaveText('Erkläre etwas');
  await expect(page.locator('#input')).toHaveValue('');
  await expect(page.locator('#btnSend')).toHaveAttribute('aria-label', 'Senden');
  const answer = page.locator('.msg.assistant');
  await expect(answer.locator('strong')).toHaveText('wichtig');
  await expect(answer.locator('li')).toHaveText(['eins', 'zwei']);
  await expect(answer.locator('pre code')).toHaveText('x = 1');
  await expect(answer.locator('.foot span')).toHaveText('Gemma 3 1B · 4 Token · 2,0 Token/s');
  await expect(page.locator('#histCount')).toHaveText('1');

  // What the worker got: pinned model, default system text, the question
  const gen = (await posted(page)).find(m => m.type === 'generate');
  expect(gen.model).toMatchObject({ ...GEMMA3_1B, arch: 'gemma3', dtypes: { f16: 'q4f16', f32: 'q4' } });
  expect(gen.messages).toEqual([
    { role: 'system', content: 'Du bist ein hilfreicher Assistent. Antworte auf Deutsch, außer der Nutzer schreibt in einer anderen Sprache. Antworte klar und knapp.' },
    { role: 'user', content: 'Erkläre etwas' },
  ]);
  expect(gen).toMatchObject({ maxTokens: 1024, maxContext: 4096 });

  // After a reload: open from the history and continue – the model sees the earlier turns
  await page.reload();
  await expect(page.locator('.msg')).toHaveCount(0);
  await page.locator('#hist .open').click();
  await expect(page.locator('.msg')).toHaveCount(2);
  await setReply(page, { tokens: ['Gern.'], delay: 5 });
  await send(page, 'Danke');
  await expect(page.locator('.msg.assistant').last()).toContainText('Gern.');
  const gen2 = (await posted(page)).filter(m => m.type === 'generate').at(-1);
  expect(gen2.messages.map(m => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
  expect(gen2.messages[2].content).toContain('**wichtig**');
  await expect(page.locator('#histCount')).toHaveText('1');   // same chat, not a new entry
  // New chat starts empty; the history keeps both
  await page.click('#btnNew');
  await expect(page.locator('.msg')).toHaveCount(0);
  await expect(page.locator('#hist .meta')).toContainText('4 Nachrichten');
});

test('stop keeps the text so far and marks the answer', async ({ page }) => {
  await fakeLlm(page, { gpu: 'f16' });
  await page.goto(URL_);
  await setReply(page, { tokens: Array.from({ length: 200 }, (_, i) => `w${i} `), delay: 40 });
  await send(page, 'Erzähl lang');
  await expect(page.locator('#btnSend')).toHaveAttribute('aria-label', 'Stopp');
  await expect(page.locator('#model')).toBeDisabled();
  await expect(page.locator('.msg.assistant .body')).toContainText('w2');
  await page.click('#btnSend');
  await expect(page.locator('#btnSend')).toHaveAttribute('aria-label', 'Senden');
  expect((await posted(page)).some(m => m.type === 'stop')).toBe(true);
  await expect(page.locator('.msg.assistant .foot span')).toContainText('abgebrochen');
  const words = (await page.locator('.msg.assistant .body').textContent()).trim().split(/\s+/).length;
  expect(words).toBeGreaterThan(2);
  expect(words).toBeLessThan(200);
});

test('load error: clear message, question back in the input, nothing saved', async ({ page }) => {
  await fakeLlm(page, { gpu: 'f16' });
  await page.goto(URL_);
  await setReply(page, { tokens: [], error: { stage: 'load', message: 'Failed to fetch' } });
  await send(page, 'Hallo?');
  await expect(page.locator('#status')).toHaveText('Das Modell konnte nicht geladen werden. Für den ersten Download ist eine Internetverbindung nötig. (Failed to fetch)');
  await expect(page.locator('#status')).toHaveClass(/err/);
  await expect(page.locator('.msg')).toHaveCount(0);
  await expect(page.locator('#input')).toHaveValue('Hallo?');
  await expect(page.locator('#btnSend')).toHaveAttribute('aria-label', 'Senden');
  await expect(page.locator('#histCount')).toHaveText('0');
  // Out of memory: hint to choose a smaller model
  await setReply(page, { tokens: [], error: { stage: 'load', message: 'Out of memory while allocating' } });
  await page.click('#btnSend');
  await expect(page.locator('#status')).toContainText('ein kleineres Modell wählen');
});

test('answers are shown as text, never as HTML', async ({ page }) => {
  await fakeLlm(page, { gpu: 'f16' });
  await page.goto(URL_);
  await setReply(page, { tokens: ['<img src=x onerror="window.__pwned=1"> <b>fett</b> `<i>`'], delay: 5 });
  await send(page, 'Test');
  const body = page.locator('.msg.assistant .body');
  await expect(body).toContainText('<img src=x onerror="window.__pwned=1"> <b>fett</b>');
  await expect(body.locator('code')).toHaveText('<i>');
  expect(await body.locator('img, b, i').count()).toBe(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test('settings: own system text and answer length go to the model and are remembered', async ({ page }) => {
  await fakeLlm(page, { gpu: 'f16' });
  await page.goto(URL_);
  await page.locator('#settingsBox summary').click();
  await expect(page.locator('#system')).toHaveAttribute('placeholder', /^Leer = Standard: „Du bist ein hilfreicher Assistent/);
  await page.fill('#system', 'Antworte in Reimen.');
  await page.locator('#system').blur();
  await page.selectOption('#maxTokens', '256');
  await page.reload();
  await expect(page.locator('#system')).toHaveValue('Antworte in Reimen.');
  await expect(page.locator('#maxTokens')).toHaveValue('256');
  await send(page, 'Hallo');
  await expect(page.locator('.msg.assistant .foot')).toBeVisible();
  const gen = (await posted(page)).find(m => m.type === 'generate');
  expect(gen.messages[0]).toEqual({ role: 'system', content: 'Antworte in Reimen.' });
  expect(gen.maxTokens).toBe(256);
});

test('history: delete one chat, clear all', async ({ page }) => {
  await fakeLlm(page, { gpu: 'f16' });
  await page.goto(URL_);
  const chat = (id, q) => ({ id, t: Date.now(), model: 'gemma3-1b', messages: [{ role: 'user', content: q }, { role: 'assistant', content: 'A' }] });
  await page.evaluate(c => localStorage.setItem('ai-chat.chats.v1', JSON.stringify(c)), [chat('a', 'Erste Frage'), chat('b', 'Zweite Frage')]);
  await page.reload();
  await expect(page.locator('#histCount')).toHaveText('2');
  await expect(page.locator('#hist .snip')).toHaveText(['Erste Frage', 'Zweite Frage']);
  await page.locator('#hist li').first().getByRole('button', { name: 'Chat löschen' }).click();
  await expect(page.locator('#hist .snip')).toHaveText(['Zweite Frage']);
  page.once('dialog', d => d.accept());
  await page.click('#btnClearHist');
  await expect(page.locator('#histCount')).toHaveText('0');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ai-chat.chats.v1')))).toEqual([]);
});

test('downloaded models: shown as downloaded, deleting keeps other apps\' models (Whisper)', async ({ page }) => {
  await fakeLlm(page, { gpu: 'f16' });
  await page.goto(URL_);
  await markDownloaded(page, GEMMA4_FILES);
  const whisper = 'https://huggingface.co/onnx-community/whisper-base/resolve/main/onnx/encoder_model.onnx';
  await page.evaluate(u => caches.open('transformers-cache').then(c => c.put(u, new Response('w'))), whisper);
  await page.reload();
  await expect(page.locator('#modelInfo')).toHaveText('✓ Heruntergeladen – startet ohne Internet.');
  await page.locator('#settingsBox summary').click();
  await expect(page.locator('#modelList')).toContainText('Gemma 4 E2B');
  page.once('dialog', d => d.accept());
  await page.click('#btnDeleteModels');
  await expect(page.locator('#modelList')).toContainText('Noch kein Modell heruntergeladen.');
  await expect(page.locator('#modelInfo')).toContainText('Wird beim ersten Senden heruntergeladen');
  const left = await page.evaluate(() => caches.open('transformers-cache').then(c => c.keys()).then(k => k.map(r => r.url)));
  expect(left).toEqual([whisper]);
});

test('partly downloaded: shown as such, not as downloaded', async ({ page }) => {
  await fakeLlm(page, { gpu: 'f16' });
  await page.goto(URL_);
  await markDownloaded(page, GEMMA4_FILES, { only: 3 });   // the decoder's weights are missing
  await page.reload();
  await expect(page.locator('#modelInfo')).toHaveText('Teilweise heruntergeladen – beim nächsten Senden geht es weiter (insgesamt ca. 2,3 GB).');
  await markDownloaded(page, GEMMA4_FILES);
  await page.reload();
  await expect(page.locator('#modelInfo')).toHaveText('✓ Heruntergeladen – startet ohne Internet.');
  // Starting a downloaded model is not called a download
  await setReply(page, { tokens: [], hang: true });
  await send(page, 'Hallo');
  await expect(page.locator('#status')).toHaveText('Modell wird gestartet … 150 MB von 300 MB');
});

test('a load that never finished (tab crashed) is reported on the next start', async ({ page }) => {
  await fakeLlm(page, { gpu: 'f16' });
  await page.goto(URL_);
  await expect(page.locator('#crashNote')).toBeHidden();
  // Downloading file 2 of 4, then the tab "dies"
  await setReply(page, { tokens: [], hang: true, stages: [{ stage: 'download', index: 2, count: 4 }] });
  await send(page, 'Hallo');
  await expect(page.locator('#status')).toContainText('(Datei 2 von 4)');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ai-chat.loading.v1')))).toMatchObject({ model: 'gemma4-e2b', stage: 'download' });
  await page.reload();
  await expect(page.locator('#crashNote')).toBeVisible();
  await expect(page.locator('#crashNote')).toHaveText(/Herunterladen von Gemma 4 E2B nicht beendet.*geht es weiter/);
  // Shown once
  expect(await page.evaluate(() => localStorage.getItem('ai-chat.loading.v1'))).toBeNull();
  await page.reload();
  await expect(page.locator('#crashNote')).toBeHidden();

  // Crash while starting on the graphics card: memory hint; a successful load clears the marker
  await setReply(page, { tokens: [], hang: true, stages: [{ stage: 'download', index: 1, count: 1 }, { stage: 'prepare' }] });
  await send(page, 'Hallo');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ai-chat.loading.v1'))?.stage)).toBe('prepare');
  await page.reload();
  await expect(page.locator('#crashNote')).toHaveText(/beim Starten von Gemma 4 E2B abgestürzt – der Arbeitsspeicher des Geräts reicht dafür vermutlich nicht\. Deshalb ist jetzt ein kleineres Modell gewählt\..*\(ca\. 2,3 GB\)/);
  // Remembered: a smaller model is chosen, Gemma 4 is marked but can still be picked
  const g4 = page.locator('#model option[value="gemma4-e2b"]');
  await expect(page.locator('#model')).toHaveValue('gemma3-1b');
  await expect(g4).toHaveText('Gemma 4 E2B – empfohlen – auf diesem Gerät abgestürzt');
  expect(await g4.evaluate(o => o.disabled)).toBe(false);
  await page.reload();
  await expect(page.locator('#crashNote')).toBeHidden();
  await expect(page.locator('#model')).toHaveValue('gemma3-1b');           // stays on the smaller model
  // Picked again on purpose: kept after a reload; a successful start removes the mark
  await pickModel(page, 'gemma4-e2b');
  await page.reload();
  await expect(page.locator('#model')).toHaveValue('gemma4-e2b');
  await setReply(page, { tokens: ['Ok'], delay: 5, stages: [{ stage: 'prepare' }] });
  await send(page, 'Nochmal');
  await expect(page.locator('.msg.assistant .foot')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('ai-chat.loading.v1'))).toBeNull();
  await expect(g4).toHaveText('Gemma 4 E2B – empfohlen (ca. 2,3 GB)');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ai-chat.crashed.v1')))).toEqual({});
});

test('not enough storage: clear message', async ({ page }) => {
  await fakeLlm(page, { gpu: 'f16' });
  await page.goto(URL_);
  await setReply(page, { tokens: [], error: { stage: 'load', message: 'NO_SPACE' } });
  await send(page, 'Hallo');
  await expect(page.locator('#status')).toHaveText('Nicht genug freier Speicher auf dem Gerät für das Modell (ca. 2,3 GB). Bitte Platz schaffen oder ein kleineres Modell wählen.');
  expect(await page.evaluate(() => localStorage.getItem('ai-chat.loading.v1'))).toBeNull();
});

test('before the first download: model and size shown in the chat; the choice is in the settings', async ({ page }) => {
  await fakeLlm(page, { gpu: 'f16' });
  await page.goto(URL_);
  await expect(page.locator('#modelBadge')).toHaveText('Gemma 4 E2B');
  await expect(page.locator('#firstHint')).toHaveText('Beim ersten Senden wird Gemma 4 E2B heruntergeladen (ca. 2,3 GB) – am besten im WLAN. Ändern unter „Einstellungen“.');
  await expect(page.locator('#model')).toBeHidden();      // folded away in the settings
  await pickModel(page, 'gemma3-270m');
  await expect(page.locator('#modelBadge')).toHaveText('Gemma 3 270M');
  await expect(page.locator('#firstHint')).toContainText('Gemma 3 270M heruntergeladen (ca. 290 MB)');
  await markDownloaded(page, { id: 'onnx-community/gemma-3-270m-it-ONNX', revision: '2dbbfdb1b59bd034eb959428c6a7da9dd7ea27f0', sessions: ['model'], dtype: 'q4f16' });
  await page.reload();
  await expect(page.locator('#modelBadge')).toHaveText('Gemma 3 270M');
  await expect(page.locator('#firstHint')).toBeHidden();
});

test('icon buttons have names: send/stop, new chat, copy', async ({ page }) => {
  await fakeLlm(page, { gpu: 'f16' });
  await page.goto(URL_);
  await expect(page.getByRole('button', { name: 'Senden' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Neuer Chat' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chat kopieren' })).toBeVisible();
  await setReply(page, { tokens: Array.from({ length: 50 }, () => 'x '), delay: 30 });
  await send(page, 'Hallo');
  await expect(page.locator('.msg.assistant .body')).toContainText('x x');
  await page.getByRole('button', { name: 'Stopp' }).click();
  await expect(page.locator('.msg.assistant').getByRole('button', { name: 'Kopieren' })).toBeVisible();
});

test('share target: shared text and link land in the input, ready for an own question', async ({ page, request }) => {
  const manifest = await (await request.get(`${URL_}manifest.webmanifest`)).json();
  expect(manifest.share_target).toMatchObject({ action: './', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } });
  await fakeLlm(page, { gpu: 'f16' });
  // Many apps send the link inside text as well
  await page.goto(`${URL_}?title=${encodeURIComponent('Artikel')}&text=${encodeURIComponent('Lesenswert: https://example.org/a')}&url=${encodeURIComponent('https://example.org/a')}`);
  await expect(page).toHaveURL(/\/ai-chat\/$/);
  await expect(page.locator('#input')).toHaveValue('Artikel\nLesenswert: https://example.org/a\n\n');
  await expect(page.locator('#input')).toBeFocused();
  await expect(page.locator('#toast')).toContainText('Geteilter Text übernommen');
  await page.locator('#input').pressSequentially('Fasse das zusammen');
  await page.click('#btnSend');
  const gen = (await posted(page)).find(m => m.type === 'generate');
  expect(gen.messages.at(-1)).toEqual({ role: 'user', content: 'Artikel\nLesenswert: https://example.org/a\n\nFasse das zusammen' });
});

test('copy chat puts both sides into the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await fakeLlm(page, { gpu: 'f16' });
  await page.goto(URL_);
  await send(page, 'Frage');
  await expect(page.locator('.msg.assistant .foot')).toBeVisible();
  await page.click('#btnCopyChat');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Du: Frage\n\nKI: Hallo Welt.');
});

test.describe('real worker', () => {
  // The real worker.js + transformers.js are loaded; without a graphics card in the worker it answers
  // "no WebGPU" before any download. Should a test browser have WebGPU, the download is blocked instead.
  test.use({ allowedProblems: /huggingface\.co|hf\.co|Failed to load resource|ERR_FAILED|Failed to fetch/ });

  test('starts and reports a clear error – also offline after the first use', async ({ page, context }) => {
    await context.route(/huggingface\.co|hf\.co/, r => r.abort());
    await fakeLlm(page, { gpu: 'f16', worker: false });
    await page.goto(URL_);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();                              // controlled by the service worker → libraries get cached
    await pickModel(page, 'gemma3-270m');
    const expected = /Ohne WebGPU kann das Modell nicht laufen\.|Das Modell konnte nicht geladen werden/;
    await send(page, 'Hallo');
    await expect(page.locator('#status')).toHaveText(expected, { timeout: 30000 });
    await expect(page.locator('#input')).toHaveValue('Hallo');
    await context.setOffline(true);
    await page.reload();
    await send(page, 'Hallo');
    await expect(page.locator('#status')).toHaveText(expected, { timeout: 30000 });
    await expect(page.locator('#status')).not.toContainText('gestartet');   // worker and library came from the cache
    await context.setOffline(false);
  });
});

test.describe('download into the cache (real worker)', () => {
  // The worker streams the large files one by one into the cache of transformers.js (instead of
  // transformers.js keeping each whole file in memory). Hugging Face is replaced by small fake files;
  // the worker gets a fake graphics card (and storage estimate) put in front of worker.js.
  test.use({ serviceWorkers: 'block', allowedProblems: /huggingface\.co|Failed to load resource|ERR_FAILED|Failed to fetch/ });
  const SIZE = 300000;

  async function setup(page, context, { quota = 1e12, failData = false } = {}) {
    const hits = [];
    await context.route('**/ai-chat/worker.js', async route => {
      const res = await route.fetch();
      const prelude = `Object.defineProperty(WorkerNavigator.prototype, 'gpu', { configurable: true, get: () => ({ requestAdapter: async () => ({ features: new Set(['shader-f16']), limits: {} }) }) });
Object.defineProperty(navigator.storage, 'estimate', { configurable: true, value: async () => ({ usage: 0, quota: ${quota} }) });\n`;
      await route.fulfill({ response: res, body: prelude + await res.text() });
    });
    await context.route(/huggingface\.co/, async route => {
      const url = route.request().url();
      hits.push(url.split('/onnx/')[1] || url);
      if (!/\.onnx(_data)?$/.test(url)) return route.abort();       // config etc.: "offline" → load error afterwards
      if (failData.value && url.endsWith('.onnx_data')) return route.abort();
      return route.fulfill({ status: 200, body: Buffer.alloc(SIZE, 7), headers: { 'content-type': 'application/octet-stream', 'content-length': String(SIZE) } });
    });
    await fakeLlm(page, { gpu: 'f16', worker: false });
    await page.goto(URL_);
    return hits;
  }
  const cachedFiles = page => page.evaluate(async () => {
    const c = await caches.open('transformers-cache');
    return Promise.all((await c.keys()).map(async r => [r.url.split('/onnx/')[1], (await (await c.match(r)).arrayBuffer()).byteLength]));
  });

  test('files go one by one into the cache; an interrupted download continues', async ({ page, context }) => {
    const failData = { value: true };
    const hits = await setup(page, context, { failData });
    await pickModel(page, 'gemma3-270m');
    await send(page, 'Hallo');
    await expect(page.locator('#status')).toHaveText(/Das Modell konnte nicht geladen werden/, { timeout: 30000 });
    // The small graph file made it, the weights did not
    expect(await cachedFiles(page)).toEqual([['model_q4f16.onnx', SIZE]]);
    await expect(page.locator('#modelInfo')).toContainText('Teilweise heruntergeladen');
    expect(await page.evaluate(() => localStorage.getItem('ai-chat.loading.v1'))).toBeNull();
    // Second try: only the missing file is fetched, then transformers.js takes over (config → fails here)
    failData.value = false;
    hits.length = 0;
    await send(page, 'Hallo');
    await expect(page.locator('#status')).toHaveText(/Das Modell konnte nicht geladen werden/, { timeout: 30000 });
    expect(hits.filter(h => h.startsWith('model_'))).toEqual(['model_q4f16.onnx_data']);
    expect((await cachedFiles(page)).sort()).toEqual([['model_q4f16.onnx', SIZE], ['model_q4f16.onnx_data', SIZE]]);
    await expect(page.locator('#modelInfo')).toHaveText('✓ Heruntergeladen – startet ohne Internet.');
  });

  test('not enough storage: nothing is downloaded', async ({ page, context }) => {
    const hits = await setup(page, context, { quota: 1e8 });
    await pickModel(page, 'gemma3-1b');
    await send(page, 'Hallo');
    await expect(page.locator('#status')).toHaveText(/^Nicht genug freier Speicher auf dem Gerät für das Modell \(ca\. 780 MB\)/, { timeout: 30000 });
    expect(hits).toEqual([]);
  });
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });

  test('texts in English, English default instruction, numbers with a decimal point', async ({ page }) => {
    await fakeLlm(page, { gpu: 'f16' });
    await page.goto(URL_);
    await expect(page.locator('#btnSend')).toHaveAttribute('aria-label', 'Send');
    await expect(page.getByRole('button', { name: 'New chat' })).toBeVisible();
    await expect(page.locator('#firstHint')).toHaveText('Gemma 4 E2B is downloaded when you first send (approx. 2.3 GB) – preferably over Wi-Fi. Change it under “Settings”.');
    await expect(page.locator('#model option[value="gemma4-e2b"]')).toHaveText('Gemma 4 E2B – recommended (approx. 2.3 GB)');
    await send(page, 'Hi');
    await expect(page.locator('.msg.assistant .foot span')).toHaveText('Gemma 4 E2B · 3 tokens · 1.5 tokens/s');
    const gen = (await posted(page)).find(m => m.type === 'generate');
    expect(gen.messages[0].content).toMatch(/^You are a helpful assistant\. Answer in English/);
    expect(gen.model).toMatchObject({ ...GEMMA4, arch: 'gemma4', dtypes: { f16: 'q2f16' } });
  });
});
