// KI-Chat: model choice per graphics card, chat flow with streaming, stop, errors, history, settings,
// safe rendering of answers, deleting only our model files, offline, English.
// The model itself is replaced by a stand-in worker (tests/fake-llm.mjs) – the real Gemma download is
// far too big for `npm test`; see tests/manual/chat-e2e.mjs.
import { test, expect } from './helpers.mjs';
import { fakeLlm, markDownloaded } from './fake-llm.mjs';

const URL_ = '/ai-chat/';
const GEMMA4 = { id: 'onnx-community/gemma-4-E2B-it-qat-mobile-ONNX', revision: 'a7f19b0ab28252b77cea830f52b8290b2479c87d' };
const GEMMA3_1B = { id: 'onnx-community/gemma-3-1b-it-ONNX', revision: 'a58439f40017d3b99c7d378ff525e54e0ba08ebf' };
const posted = page => page.evaluate(() => window.__llm.posted);
const setReply = (page, reply) => page.evaluate(r => { window.__llm.reply = r; }, reply);

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
  await page.selectOption('#model', 'gemma3-270m');
  await page.reload();
  await expect(page.locator('#model')).toHaveValue('gemma3-270m');
});

for (const [name, opts, size] of [
  ['no shader-f16', { gpu: 'f32' }, '880 MB'],
  ['buffers smaller than the 1.17 GB embedding table', { gpu: 'f16', maxBuffer: 1024 ** 3 }, '780 MB'],
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
  await page.selectOption('#model', 'gemma3-1b');
  await setReply(page, { tokens: ['Das ist **wichtig**:\n', '- eins\n', '- zwei\n\n', '```\nx = 1\n```'], delay: 30 });
  await send(page, 'Erkläre etwas');
  await expect(page.locator('.msg.user')).toHaveText('Erkläre etwas');
  await expect(page.locator('#input')).toHaveValue('');
  await expect(page.locator('#btnSend')).toHaveText('Senden');
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
  await expect(page.locator('#btnSend')).toHaveText('Stopp');
  await expect(page.locator('#model')).toBeDisabled();
  await expect(page.locator('.msg.assistant .body')).toContainText('w2');
  await page.click('#btnSend');
  await expect(page.locator('#btnSend')).toHaveText('Senden');
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
  await expect(page.locator('#btnSend')).toHaveText('Senden');
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
  await markDownloaded(page, GEMMA4.id, GEMMA4.revision);
  const whisper = 'https://huggingface.co/onnx-community/whisper-base/resolve/main/onnx/encoder_model.onnx';
  await page.evaluate(u => caches.open('transformers-cache').then(c => c.put(u, new Response('w'))), whisper);
  await page.reload();
  await expect(page.locator('#modelInfo')).toHaveText('✓ Heruntergeladen – startet ohne Internet.');
  await page.locator('#modelBox summary').click();
  await expect(page.locator('#modelList')).toContainText('Gemma 4 E2B');
  page.once('dialog', d => d.accept());
  await page.click('#btnDeleteModels');
  await expect(page.locator('#modelList')).toContainText('Noch kein Modell heruntergeladen.');
  await expect(page.locator('#modelInfo')).toContainText('Wird beim ersten Senden heruntergeladen');
  const left = await page.evaluate(() => caches.open('transformers-cache').then(c => c.keys()).then(k => k.map(r => r.url)));
  expect(left).toEqual([whisper]);
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
    await page.selectOption('#model', 'gemma3-270m');
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

test.describe('English', () => {
  test.use({ locale: 'en-US' });

  test('texts in English, English default instruction, numbers with a decimal point', async ({ page }) => {
    await fakeLlm(page, { gpu: 'f16' });
    await page.goto(URL_);
    await expect(page.locator('#btnSend')).toHaveText('Send');
    await expect(page.locator('#model option[value="gemma4-e2b"]')).toHaveText('Gemma 4 E2B – recommended (approx. 2.3 GB)');
    await send(page, 'Hi');
    await expect(page.locator('.msg.assistant .foot span')).toHaveText('Gemma 4 E2B · 3 tokens · 1.5 tokens/s');
    const gen = (await posted(page)).find(m => m.type === 'generate');
    expect(gen.messages[0].content).toMatch(/^You are a helpful assistant\. Answer in English/);
    expect(gen.model).toMatchObject({ ...GEMMA4, arch: 'gemma4', dtypes: { f16: 'q2f16' } });
  });
});
