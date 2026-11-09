// Video zu Audio: the sound track of test videos (made with ffmpeg, see fixtures/README.md) is extracted
// unchanged or as WAV; the files are checked with independent readers (audio-files.mjs).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, openDetails, clipboardText, switchLang, openMenu, mockAndroidShare } from './helpers.mjs';
import { CLIPS, FIX, clip, mp4Info, oggInfo, wavInfo, mp3Info, toneHz, peak, mp4Tags, id3Tags, oggTags, wavTags } from './audio-files.mjs';

const URL_ = '/video-to-audio/';

async function choose(page, key) {
  await page.setInputFiles('#file', clip(key));
}
/** Chooses a video, extracts with the given format and returns the downloaded file */
async function extract(page, key, format) {
  await choose(page, key);
  await expect(page.locator('#btnRun')).toBeEnabled();
  await page.check(`input[name="format"][value="${format}"]`);
  await page.click('#btnRun');
  await expect(page.locator('#result')).toBeVisible({ timeout: 30000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
  return { name: download.suggestedFilename(), buf: readFileSync(await download.path()) };
}

/** Decodes an MP3 with the browser's own decoder (not LAME, which wrote it): first channel, rate */
const browserDecode = (page, buf) => page.evaluate(async b64 => {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const audio = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(bytes.buffer);
  return { rate: audio.sampleRate, samples: [...audio.getChannelData(0)] };
}, buf.toString('base64'));
/** Checks an MP3 the app wrote from a test video: frames, 192 kbit/s, length and the tone of the video */
async function expectMp3(page, buf, c) {
  const mp3 = mp3Info(buf);
  expect(mp3).toMatchObject({ rate: c.rate, channels: 1, kbps: [192], complete: true });
  // LAME adds a little delay and padding (< 0.1 s)
  expect(mp3.seconds).toBeGreaterThan(c.seconds - 0.05);
  expect(mp3.seconds).toBeLessThan(c.seconds + 0.1);
  const dec = await browserDecode(page, buf);
  const samples = Float32Array.from(dec.samples);
  expect(Math.abs(toneHz(samples, dec.rate) - c.hz)).toBeLessThan(5);
  expect(peak(samples)).toBeGreaterThan(0.05);
}

test('AAC from an MP4: copied unchanged into an .m4a without the picture', async ({ page }) => {
  await page.goto(URL_);
  await choose(page, 'aac');
  await expect(page.locator('#fileInfo')).toContainText('„clip-aac.mp4“');
  await expect(page.locator('#fileInfo')).toContainText('Tonspur: AAC, Mono, 44,1 kHz · 0:02');
  const { name, buf } = await extract(page, 'aac', 'original');
  expect(name).toBe('clip-aac.m4a');
  await expect(page.locator('#status')).toHaveText('Fertig.');
  await expect(page.locator('#result')).toHaveAttribute('data-format', 'original');
  const out = mp4Info(buf);
  expect(out.tracks.map(t => t.handler)).toEqual(['soun']);
  expect(out.tracks[0].entry).toBe('mp4a');
  expect(out.tracks[0].seconds).toBeGreaterThan(CLIPS.aac.seconds - 0.1);
  expect(out.tracks[0].seconds).toBeLessThan(CLIPS.aac.seconds + 0.1);
  // Not re-encoded: the same AAC frames (count and bytes) as in the video
  const src = mp4Info(readFileSync(join(FIX, CLIPS.aac.file))).tracks.find(t => t.handler === 'soun');
  expect(out.tracks[0].samples).toBe(src.samples);
  expect(out.tracks[0].bytes).toBe(src.bytes);
  // Plays in the page
  const dur = await page.locator('#player').evaluate(a => new Promise(r => a.readyState >= 1 ? r(a.duration) : a.addEventListener('loadedmetadata', () => r(a.duration))));
  expect(dur).toBeGreaterThan(1.8);
});

test('share on Android: .m4a goes out as audio/x-m4a (audio/mp4 is refused), .ogg and .wav unchanged', async ({ page }) => {
  await mockAndroidShare(page);
  await page.goto(URL_);
  const cases = [['aac', 'original', 'clip-aac.m4a', 'audio/x-m4a'], ['opus', 'original', 'clip-opus.ogg', 'audio/ogg'], ['opus', 'wav', 'clip-opus.wav', 'audio/wav'], ['aac', 'mp3', 'clip-aac.mp3', 'audio/mpeg']];
  for (const [key, format, name, type] of cases) {
    const { buf } = await extract(page, key, format);
    await expect(page.locator('#btnShare')).toBeVisible();
    await page.click('#btnShare');
    await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(cases.findIndex(c => c[2] === name) + 1);
    const [f] = (await page.evaluate(() => window.__shared)).at(-1);
    expect(f).toEqual({ name, type, size: buf.length });
  }
  await expect(page.getByText('Teilen nicht möglich')).toHaveCount(0);
  await openMenu(page);
  await openDetails(page, 'Anleitung & Hinweise');
  await page.click('[data-diag="copy"]');
  await expect(page.locator('#toast')).toHaveText(/Diagnose kopiert|Diagnostics copied/);
  expect(await clipboardText(page)).toContain('shared {"type":"audio/x-m4a"}');
});

test('Opus from a WebM: copied unchanged into an .ogg', async ({ page }) => {
  await page.goto(URL_);
  const { name, buf } = await extract(page, 'opus', 'original');
  expect(name).toBe('clip-opus.ogg');
  const ogg = oggInfo(buf);
  expect(ogg.codec).toBe('opus');
  expect(ogg.complete).toBe(true);
  expect(ogg.seconds).toBeGreaterThan(CLIPS.opus.seconds - 0.1);
  expect(ogg.seconds).toBeLessThan(CLIPS.opus.seconds + 0.1);
});

test('WAV: decoded, right tone, length and format', async ({ page }) => {
  await page.goto(URL_);
  const { name, buf } = await extract(page, 'opus', 'wav');
  expect(name).toBe('clip-opus.wav');
  await expect(page.locator('#result')).toHaveAttribute('data-format', 'wav');
  const wav = wavInfo(buf);
  expect(wav).toMatchObject({ format: 1, bits: 16, channels: 1, rate: CLIPS.opus.rate });
  expect(Math.abs(wav.seconds - CLIPS.opus.seconds)).toBeLessThan(0.1);
  expect(Math.abs(toneHz(wav.samples, wav.rate) - CLIPS.opus.hz)).toBeLessThan(5);
  expect(peak(wav.samples)).toBeGreaterThan(0.05);
});

test('MP3 from AAC (44.1 kHz) and Opus (48 kHz): re-encoded at 192 kbit/s, right tone and length', async ({ page }) => {
  await page.goto(URL_);
  const aac = await extract(page, 'aac', 'mp3');
  expect(aac.name).toBe('clip-aac.mp3');
  await expect(page.locator('#status')).toHaveText('Fertig.');
  await expect(page.locator('#result')).toHaveAttribute('data-format', 'mp3');
  await expect(page.locator('#resultMeta')).toContainText('clip-aac.mp3 · ' + Math.round(aac.buf.length / 1024) + ' KB');
  await expectMp3(page, aac.buf, CLIPS.aac);
  // 192 kbit/s × ~2 s ≈ 48 KB of audio after the ID3 tag (title, cover)
  const audioBytes = aac.buf.length - id3Tags(aac.buf).size;
  expect(audioBytes).toBeGreaterThan(192000 / 8 * CLIPS.aac.seconds * 0.95);
  expect(audioBytes).toBeLessThan(192000 / 8 * (CLIPS.aac.seconds + 0.1) + 2000);
  const opus = await extract(page, 'opus', 'mp3');
  expect(opus.name).toBe('clip-opus.mp3');
  await expectMp3(page, opus.buf, CLIPS.opus);
  // Plays in the page
  const dur = await page.locator('#player').evaluate(a => new Promise(r => a.readyState >= 1 ? r(a.duration) : a.addEventListener('loadedmetadata', () => r(a.duration))));
  expect(dur).toBeGreaterThan(1.8);
});

test('MP3 without WebCodecs: the browser decodes, LAME encodes', async ({ page }) => {
  await page.addInitScript(() => { delete window.AudioDecoder; delete window.AudioEncoder; });
  await page.goto(URL_);
  const { name, buf } = await extract(page, 'opus', 'mp3');
  expect(name).toBe('clip-opus.mp3');
  await expectMp3(page, buf, CLIPS.opus);
  await expect(page.locator('#status')).toHaveText('Fertig.');
});

test('MP3 encoder: loaded only when MP3 is used, then available offline', async ({ page, context }) => {
  const loads = [];
  page.on('request', r => { if (r.url().includes('/mediabunny-mp3/')) loads.push(r.url()); });
  await page.goto(URL_);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // page now controlled → the encoder goes through the offline cache
  await extract(page, 'aac', 'original');
  expect(loads).toEqual([]);
  await extract(page, 'aac', 'mp3');
  expect(loads.length).toBeGreaterThan(0);
  await context.setOffline(true);
  await page.reload();
  const { name, buf } = await extract(page, 'opus', 'mp3');
  expect(name).toBe('clip-opus.mp3');
  expect(mp3Info(buf)).toMatchObject({ rate: CLIPS.opus.rate, kbps: [192], complete: true });
  await context.setOffline(false);
});

test.describe('MP3 offline before its first use', () => {
  test.use({ allowedProblems: /mediabunny-mp3|Failed to load resource|ERR_FAILED|ERR_INTERNET_DISCONNECTED/ });
  test('clear message, other formats still work', async ({ page, context }) => {
    await page.goto(URL_);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await context.setOffline(true);
    await page.reload();
    await choose(page, 'aac');
    await page.check('input[value="mp3"]');
    await page.click('#btnRun');
    await expect(page.locator('#status')).toHaveText('Der MP3-Encoder ließ sich nicht laden. Bitte einmal mit Internet öffnen – danach geht MP3 auch offline.');
    await expect(page.locator('#status')).toHaveClass(/err/);
    await expect(page.locator('#result')).toBeHidden();
    const { name } = await extract(page, 'aac', 'original');
    expect(name).toBe('clip-aac.m4a');
    // Back online, MP3 works without reloading
    await context.setOffline(false);
    const mp3 = await extract(page, 'aac', 'mp3');
    expect(mp3Info(mp3.buf)).toMatchObject({ rate: CLIPS.aac.rate, kbps: [192], complete: true });
  });
});

test('WAV without WebCodecs: the browser decodes the file instead', async ({ page }) => {
  await page.addInitScript(() => { delete window.AudioDecoder; delete window.AudioEncoder; });
  await page.goto(URL_);
  const { buf } = await extract(page, 'opus', 'wav');
  const wav = wavInfo(buf);
  expect(wav).toMatchObject({ format: 1, bits: 16 });
  expect(Math.abs(wav.seconds - CLIPS.opus.seconds)).toBeLessThan(0.1);
  expect(Math.abs(toneHz(wav.samples, wav.rate) - CLIPS.opus.hz)).toBeLessThan(5);
  await expect(page.locator('#status')).toHaveText('Fertig.');
});

test('original without WebCodecs still works (just copying)', async ({ page }) => {
  await page.addInitScript(() => { delete window.AudioDecoder; delete window.AudioEncoder; });
  await page.goto(URL_);
  const { name, buf } = await extract(page, 'aac', 'original');
  expect(name).toBe('clip-aac.m4a');
  expect(mp4Info(buf).tracks.map(t => t.entry)).toEqual(['mp4a']);
});

/** Size and number of distinct colours of an image, decoded by the browser */
const imageInfo = (page, data, mime) => page.evaluate(async ([b64, mime]) => {
  const bm = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: mime }));
  const ctx = new OffscreenCanvas(bm.width, bm.height).getContext('2d');
  ctx.drawImage(bm, 0, 0);
  const d = ctx.getImageData(0, 0, bm.width, bm.height).data, colours = new Set();
  for (let i = 0; i < d.length; i += 4 * 37) colours.add((d[i] >> 5) << 6 | (d[i + 1] >> 5) << 3 | d[i + 2] >> 5);
  return { width: bm.width, height: bm.height, colours: colours.size };
}, [data.toString('base64'), mime]);
const renamed = (key, name) => ({ ...clip(key), name });
const isJpeg = b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

test('tags: title from the file name and a still of the video as cover, filled in automatically', async ({ page }) => {
  await page.goto(URL_);
  await choose(page, 'aac');
  await expect(page.locator('#tags')).toBeVisible();
  await expect(page.locator('#tagTitle')).toHaveValue('clip-aac');
  await expect(page.locator('#tagArtist')).toHaveValue('');
  await expect(page.locator('#tagsSum')).toHaveText('clip-aac');
  await expect(page.locator('#tagCover')).toBeChecked();
  // 10 % of 2 s
  await expect(page.locator('#coverNote')).toHaveText('Standbild nach 0,2 s');
  await expect(page.locator('#coverImg')).toHaveAttribute('src', /^blob:/);
  const { buf } = await extract(page, 'aac', 'original');
  const tags = mp4Tags(buf);
  expect(tags['©nam']).toBe('clip-aac');
  expect(tags['©day']).toBeUndefined(); // the test video has no recording time
  expect(tags.covr.mime).toBe('image/jpeg');
  expect(isJpeg(tags.covr.data)).toBe(true);
  const img = await imageInfo(page, tags.covr.data, 'image/jpeg');
  expect(img).toMatchObject({ width: 600, height: 600 });
  expect(img.colours).toBeGreaterThan(4); // the colour bars of the test picture, not a black frame
  await expect(page.locator('#resultTags')).toHaveText('clip-aac · mit Cover');
  // Still the same audio frames as in the video
  const src = mp4Info(readFileSync(join(FIX, CLIPS.aac.file))).tracks.find(t => t.handler === 'soun');
  expect(mp4Info(buf).tracks[0].bytes).toBe(src.bytes);
});

test('tags already in the video are taken over: title, artist, album and the recording time', async ({ page }) => {
  await page.goto(URL_);
  await choose(page, 'tagged');
  await expect(page.locator('#tagTitle')).toHaveValue('Konzert im Park');
  await expect(page.locator('#tagArtist')).toHaveValue('Die Band');
  await expect(page.locator('#tagAlbum')).toHaveValue('Live 2024');
  await expect(page.locator('#tagsSum')).toHaveText('Konzert im Park – Die Band');
  const { name, buf } = await extract(page, 'tagged', 'original');
  expect(name).toBe('clip-tagged.m4a');
  const tags = mp4Tags(buf);
  expect(tags).toMatchObject({ '©nam': 'Konzert im Park', '©ART': 'Die Band', '©alb': 'Live 2024' });
  expect(tags['©day']).toMatch(/^2024-05-01/);
  await expect(page.locator('#resultTags')).toHaveText('Konzert im Park – Die Band · Live 2024 · aufgenommen 1.5.2024 · mit Cover');
});

test('edited tags and the date from a camera file name end up in M4A, MP3, Ogg and WAV', async ({ page }) => {
  await page.goto(URL_);
  const fill = async () => {
    await openDetails(page, 'Titel, Interpret & Cover');
    await page.fill('#tagTitle', 'Mein Lied – Ä');
    await page.fill('#tagArtist', 'Die Band');
    await page.fill('#tagAlbum', '');
  };
  const run = async format => {
    await page.check(`input[name="format"][value="${format}"]`);
    await page.click('#btnRun');
    await expect(page.locator('#status')).toHaveText('Fertig.', { timeout: 30000 });
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
    return { name: download.suggestedFilename(), buf: readFileSync(await download.path()) };
  };
  await page.setInputFiles('#file', renamed('aac', 'VID_20240501_123456.mp4'));
  await expect(page.locator('#btnRun')).toBeEnabled();
  await expect(page.locator('#tagTitle')).toHaveValue('VID_20240501_123456');
  await fill();
  const m4a = mp4Tags((await run('original')).buf);
  expect(m4a).toMatchObject({ '©nam': 'Mein Lied – Ä', '©ART': 'Die Band' });
  expect(m4a['©alb']).toBeUndefined();
  expect(m4a['©day']).toMatch(/^2024-05-01/);
  await expect(page.locator('#resultTags')).toHaveText('Mein Lied – Ä – Die Band · aufgenommen 1.5.2024 · mit Cover');

  const mp3 = await run('mp3');
  expect(mp3.name).toBe('VID_20240501_123456.mp3');
  const id3 = id3Tags(mp3.buf);
  expect(id3).toMatchObject({ TIT2: 'Mein Lied – Ä', TPE1: 'Die Band' });
  expect(id3.TDRC || id3.TYER).toMatch(/^2024/);
  expect(id3.APIC).toMatchObject({ mime: 'image/jpeg', type: 3 }); // 3 = front cover
  expect(isJpeg(id3.APIC.data)).toBe(true);
  expect(mp3Info(mp3.buf).complete).toBe(true);

  const wav = await run('wav');
  const w = wavTags(wav.buf);
  // RIFF INFO only holds ISO 8859-1: the dash becomes "-", the umlaut stays
  expect(w.info).toMatchObject({ INAM: 'Mein Lied - Ä', IART: 'Die Band', ICRD: '2024-05-01' });
  expect(wavInfo(wav.buf)).toMatchObject({ format: 1, bits: 16 });
  await expect(page.locator('#resultTags')).toHaveText('Mein Lied – Ä – Die Band · aufgenommen 1.5.2024'); // WAV: no cover

  // Opus → Ogg: Vorbis comments with the picture
  await page.setInputFiles('#file', renamed('opus', 'PXL_20231224_183000123.webm'));
  await expect(page.locator('#tagTitle')).toHaveValue('PXL_20231224_183000123');
  await expect(page.locator('#coverImg')).toHaveAttribute('src', /^blob:/);
  const ogg = await run('original');
  expect(ogg.name).toBe('PXL_20231224_183000123.ogg');
  const vc = oggTags(ogg.buf);
  expect(vc.TITLE).toEqual(['PXL_20231224_183000123']);
  expect(vc.DATE[0]).toMatch(/^2023-12-24/);
  expect(vc.METADATA_BLOCK_PICTURE[0]).toMatchObject({ type: 3, mime: 'image/jpeg' });
  expect(await imageInfo(page, vc.METADATA_BLOCK_PICTURE[0].data, 'image/jpeg')).toMatchObject({ width: 600, height: 600 });
  expect(oggInfo(ogg.buf)).toMatchObject({ codec: 'opus', complete: true });
});

test('cover can be switched off, the choice is remembered', async ({ page }) => {
  await page.goto(URL_);
  await choose(page, 'aac');
  await openDetails(page, 'Titel, Interpret & Cover');
  await page.uncheck('#tagCover');
  const { buf } = await extract(page, 'aac', 'original');
  const tags = mp4Tags(buf);
  expect(tags['©nam']).toBe('clip-aac');
  expect(tags.covr).toBeUndefined();
  await expect(page.locator('#resultTags')).toHaveText('clip-aac');
  await page.reload();
  await expect(page.locator('#tagCover')).not.toBeChecked();
});

test('without WebCodecs for audio, WAV and MP3 still get title, date and cover', async ({ page }) => {
  await page.addInitScript(() => { delete window.AudioDecoder; delete window.AudioEncoder; });
  await page.goto(URL_);
  await page.setInputFiles('#file', renamed('aac', '20240501_123456.mp4'));
  await expect(page.locator('#btnRun')).toBeEnabled();
  await page.check('input[value="wav"]');
  await page.click('#btnRun');
  await expect(page.locator('#status')).toHaveText('Fertig.', { timeout: 30000 });
  let [download] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
  const wav = readFileSync(await download.path());
  expect(wavTags(wav).info).toMatchObject({ INAM: '20240501_123456', ICRD: '2024-05-01' });
  expect(Math.abs(toneHz(wavInfo(wav).samples, wavInfo(wav).rate) - CLIPS.aac.hz)).toBeLessThan(5);
  await page.check('input[value="mp3"]');
  await page.click('#btnRun');
  await expect(page.locator('#status')).toHaveText('Fertig.', { timeout: 30000 });
  [download] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
  const mp3 = readFileSync(await download.path());
  const id3 = id3Tags(mp3);
  expect(id3.TIT2).toBe('20240501_123456');
  expect(id3.TDRC || id3.TYER).toMatch(/^2024/);
  expect(isJpeg(id3.APIC.data)).toBe(true);
  expect(mp3Info(mp3).complete).toBe(true);
});

test('video without sound and files that are no video are reported', async ({ page }) => {
  await page.goto(URL_);
  await choose(page, 'silent');
  await expect(page.locator('#status')).toHaveText('Dieses Video hat keine Tonspur.');
  await expect(page.locator('#status')).toHaveClass(/err/);
  await expect(page.locator('#btnRun')).toBeDisabled();
  await page.setInputFiles('#file', { name: 'notiz.mp4', mimeType: 'video/mp4', buffer: Buffer.from('kein video, nur text') });
  await expect(page.locator('#status')).toHaveText('Das ist kein lesbares Video.');
  await expect(page.locator('#btnRun')).toBeDisabled();
  // A good video afterwards works again
  await choose(page, 'aac');
  await expect(page.locator('#btnRun')).toBeEnabled();
  await expect(page.locator('#status')).toHaveText('');
});

test('chosen format is remembered', async ({ page }) => {
  await page.goto(URL_);
  await expect(page.locator('input[value="original"]')).toBeChecked();
  await page.check('input[value="wav"]');
  await page.reload();
  await expect(page.locator('input[value="wav"]')).toBeChecked();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('video-to-audio.settings.v1')))).toEqual({ format: 'wav', cover: true });
  await page.check('input[value="mp3"]');
  await page.reload();
  await expect(page.locator('input[value="mp3"]')).toBeChecked();
});

test('share target: a video shared to the installed app is picked up', async ({ page, request }) => {
  const manifest = await (await request.get(`${URL_}manifest.webmanifest`)).json();
  expect(manifest.share_target).toMatchObject({ action: './share-target', method: 'POST', enctype: 'multipart/form-data' });
  expect(manifest.share_target.params.files[0].accept).toContain('video/*');
  await page.goto(URL_);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const b64 = clip('aac').buffer.toString('base64');
  const ok = await page.evaluate(async b64 => {
    const fd = new FormData();
    fd.append('file', new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], 'urlaub.mp4', { type: 'video/mp4' }));
    return (await fetch('share-target', { method: 'POST', body: fd })).ok;
  }, b64);
  expect(ok).toBe(true);
  await page.goto(`${URL_}?shared=1`);
  await expect(page).toHaveURL(/\/video-to-audio\/$/);
  await expect(page.locator('#fileInfo')).toContainText('urlaub.mp4');
  await expect(page.locator('#btnRun')).toBeEnabled();
});

test('works offline', async ({ page, context }) => {
  await page.goto(URL_);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  const { name } = await extract(page, 'opus', 'wav');
  expect(name).toBe('clip-opus.wav');
  await context.setOffline(false);
});

test('diagnostics: steps and codec, never the file name', async ({ page }) => {
  await page.goto(URL_);
  await extract(page, 'aac', 'original');
  await openMenu(page);
  await openDetails(page, 'Anleitung & Hinweise');
  await page.click('[data-diag="copy"]');
  await expect(page.locator('#toast')).toHaveText(/Diagnose kopiert|Diagnostics copied/);
  const text = await clipboardText(page);
  expect(text).toContain('audio track');
  expect(text).toContain('extracted');
  expect(text).toContain('"codec":"aac"');
  expect(text).not.toContain('clip-aac');
  expect(text).toContain('"cover":"frame"');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });

  test('texts, info and result in English', async ({ page }) => {
    await page.goto(URL_);
    await expect(page.locator('#btnRun')).toHaveText('Extract audio');
    await choose(page, 'aac');
    await expect(page.locator('#fileInfo')).toContainText('Sound track: AAC, mono, 44.1 kHz · 0:02');
    await page.click('#btnRun');
    await expect(page.locator('#status')).toHaveText('Done.');
    await expect(page.locator('#btnSave')).toHaveText('Save audio');
    await expect(page.locator('#coverNote')).toHaveText('Still at 0.2 s');
    await expect(page.locator('#resultTags')).toHaveText('clip-aac · with cover');
    await expect(page.locator('#tags summary')).toContainText('Title, artist & cover');
    await switchLang(page, 'de');
    await expect(page.locator('#fileInfo')).toContainText('Tonspur: AAC, Mono, 44,1 kHz');
    await expect(page.locator('#btnSave')).toHaveText('Audio speichern');
  });
});

