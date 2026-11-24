// Anatomie 3D: model data (names, Latin, German, files), the 3D view (front/back, turning, zoom, tap = name,
// hide, labels), layers, search, quiz, settings, offline and English. WebGL runs in the test browser
// (software rendering); visibleParts() is the app's own list of parts drawn on screen (rendered part ids).
import { readFileSync } from 'node:fs';
import { test, expect, openMenu, switchLang } from './helpers.mjs';

const INDEX = JSON.parse(readFileSync(new URL('../anatomy/models/index.json', import.meta.url), 'utf8'));
const LAYERS = ['skin', 'muscles', 'skeleton', 'organs', 'vessels', 'nerves', 'lymph'];
const find = (en, side = '') => INDEX.parts.findIndex(p => p[1] === en && p[2] === side);

/** Waits until the given layers are loaded and drawn */
const ready = (page, layers = ['skeleton']) => page.waitForFunction(ls => window.__anatomy
  && ls.every(l => window.__anatomy.viewer.layers.has(l)) && !document.querySelector('#status progress'), layers, { timeout: 30000 });
/** Parts visible on screen right now: [{ i, x, y, px }] in CSS pixels of the canvas. Waits two frames first:
 *  the canvas changes size when the name card opens or closes (ResizeObserver) */
const visible = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
  .then(() => page.evaluate(() => window.__anatomy.viewer.visibleParts()));
/** Screen point (page coordinates) of a visible part, or null */
async function pointOf(page, i) {
  const v = (await visible(page)).find(p => p.i === i);
  if (!v) return null;
  const r = await page.locator('#cv').boundingBox();
  return { x: r.x + v.x, y: r.y + v.y, px: v.px };
}
const camera = page => page.evaluate(() => window.__anatomy.viewer.state());
const settings = page => page.evaluate(() => JSON.parse(localStorage.getItem('anatomy.settings.v1')));

test.describe('model data', () => {
  test('index lists every layer file with its exact size; parts are consistent', () => {
    expect(INDEX.layers.map(l => l.id)).toEqual(LAYERS);
    for (const [li, l] of INDEX.layers.entries()) {
      const bytes = readFileSync(new URL(`../anatomy/models/${l.file}`, import.meta.url));
      expect(bytes.length, l.id).toBe(l.bytes);
      const own = INDEX.parts.filter(p => p[0] === li);
      // Parts tile the vertex and index arrays without gaps; 2 bytes per coordinate and per index
      let v = 0, i = 0;
      for (const p of own) { expect(p[6]).toBe(v); expect(p[8]).toBe(i); v += p[7]; i += p[9]; expect(p[9] % 3).toBe(0); }
      expect(v).toBe(l.verts);
      expect(l.bytes).toBe(v * 6 + i * 2);
      // Every index points inside its part
      const idx = new Uint16Array(bytes.buffer, bytes.byteOffset + v * 6, i);
      for (const p of own) for (let k = p[8]; k < p[8] + p[9]; k++) if (idx[k] >= p[7]) throw new Error(`${p[1]}: index out of range`);
    }
    expect(INDEX.parts.length).toBeGreaterThan(2000);
  });

  test('the skeleton has every bone, paired bones on both sides, with Latin and German names', () => {
    const sk = INDEX.parts.filter(p => p[0] === 2);
    const names = new Set(sk.map(p => p[1]));
    for (const bone of ['Femur', 'Tibia', 'Fibula', 'Patella', 'Humerus', 'Radius', 'Ulna', 'Scapula', 'Clavicle', 'Hip bone', 'Talus', 'Calcaneus'])
      for (const side of ['l', 'r']) expect(find(bone, side), `${bone}.${side}`).toBeGreaterThanOrEqual(0);
    // Axial skeleton: 24 presacral vertebrae, 12 ribs per side, skull bones
    const vertebrae = [...names].filter(n => /^Vertebra [CTL]\d+$|^(Atlas|Axis) /.test(n));
    expect(vertebrae.length).toBe(24);
    for (const n of ['First rib', 'Sixth rib', 'Twelfth rib']) for (const s of ['l', 'r']) expect(find(n, s)).toBeGreaterThanOrEqual(0);
    for (const n of ['Frontal bone', 'Occipital bone', 'Sphenoid bone', 'Mandible', 'Sacrum', 'Coccyx', 'Hyoid bone']) expect(names.has(n), n).toBe(true);
    // Hand: 8 carpal bones, 5 metacarpals, 14 phalanges per hand
    const hand = sk.filter(p => p[2] === 'l' && /(Scaphoid|Lunate|Triquetrum|Pisiform|Trapezium|Trapezoid|Capitate|Hamate) bone$|metacarpal|finger of hand/.test(p[1]));
    expect(hand.length).toBe(27);
    // Names: Latin from Terminologia Anatomica, German from scripts/anatomy/names-de.mjs
    const femur = INDEX.parts[find('Femur', 'l')];
    expect([femur[3], femur[4]]).toEqual(['Os femoris', 'Oberschenkelknochen']);
    expect(INDEX.parts[find('Sixth rib', 'r')][4]).toBe('6. Rippe');
    expect(INDEX.parts[find('Vertebra L3')][4]).toBe('3. Lendenwirbel (L3)');
    expect(INDEX.parts[find('Proximal phalanx of first finger of hand', 'l')][4]).toBe('Grundglied des Daumens');
    expect(INDEX.parts[find('Distal phalanx of first finger of foot', 'r')][4]).toBe('Endglied der Großzehe');
    // Every bone has a German name, nearly every part a Latin one
    expect(sk.filter(p => !p[4]).map(p => p[1])).toEqual([]);
    expect(INDEX.parts.filter(p => !p[3]).length).toBeLessThan(INDEX.parts.length / 20);
  });

  test('organs, heart and brain are there; the model licence names its sources', () => {
    for (const [layer, en] of [[3, 'Liver'], [3, 'Stomach'], [3, 'Kidney'], [3, 'Urinary bladder'], [3, 'Superior lobe of right lung'],
      [4, 'Left ventricle'], [4, 'Aortic arch'], [5, 'Corpus callosum'], [5, 'Sciatic nerve'], [6, 'Spleen'], [1, 'Gluteus maximus muscle']])
      expect(INDEX.parts.some(p => p[0] === layer && p[1] === en), en).toBe(true);
    const lic = readFileSync(new URL('../anatomy/models/LICENSE.txt', import.meta.url), 'utf8');
    expect(lic).toContain('Z-Anatomy'); expect(lic).toContain('BodyParts3D'); expect(lic).toContain('CC BY-SA 4.0');
  });
});

test.describe('3D view', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.beforeEach(async ({ page }) => { await page.goto('/anatomy/'); await ready(page); });

  test('starts with the skeleton from the front: skull above pelvis above feet, sternum in view', async ({ page }) => {
    await expect(page.locator('#layers [data-layer="skeleton"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#layers [aria-pressed="true"]')).toHaveCount(1);
    const skull = await pointOf(page, find('Frontal bone')), pelvis = await pointOf(page, find('Sacrum')), foot = await pointOf(page, find('Tibia', 'l'));
    expect(skull.y).toBeLessThan(pelvis.y);
    expect(pelvis.y).toBeLessThan(foot.y);
    // Front: the sternum is seen, the body's left side is on the right of the screen
    expect(await pointOf(page, find('Body of sternum'))).not.toBeNull();
    const left = await pointOf(page, find('Humerus', 'l')), right = await pointOf(page, find('Humerus', 'r'));
    expect(left.x).toBeGreaterThan(right.x);
  });

  test('turns all the way round by dragging and with the arrow keys', async ({ page }) => {
    const box = await page.locator('#cv').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    // Half a turn: the back – sternum hidden behind the spine, the body's left side now on the left
    const half = Math.PI / 0.0085;   // pixels for 180° (viewer.mjs: 0.0085 rad per pixel)
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (let k = 1; k <= 10; k++) await page.mouse.move(cx - half * k / 10 / 3, cy);
    await page.mouse.up();
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (let k = 1; k <= 20; k++) await page.mouse.move(cx - half * k / 20 * 2 / 3, cy);
    await page.mouse.up();
    expect((await camera(page)).azimuthDeg).toBe(180);
    await expect.poll(async () => (await pointOf(page, find('Body of sternum')))?.px ?? 0).toBeLessThan(50);
    const left = await pointOf(page, find('Humerus', 'l')), right = await pointOf(page, find('Humerus', 'r'));
    expect(left.x).toBeLessThan(right.x);
    // Keyboard: 360° in steps, back where it started
    await page.locator('#cv').focus();
    const before = (await camera(page)).azimuthDeg;
    const steps = Math.round(2 * Math.PI / 0.16);
    for (let k = 0; k < 3; k++) await page.keyboard.press('ArrowLeft');
    expect((await camera(page)).azimuthDeg).toBe((before + Math.round(3 * 0.16 * 180 / Math.PI)) % 360);
    expect(steps).toBeGreaterThan(30);
    await page.keyboard.press('ArrowUp');
    expect((await camera(page)).elevationDeg).toBeGreaterThan(5);
  });

  test('zoom buttons and reset view', async ({ page }) => {
    await page.click('#btnZoomIn');
    await expect.poll(async () => (await camera(page)).zoom).toBeCloseTo(1 / 0.75, 2);
    await page.click('#btnZoomOut'); await page.click('#btnZoomOut');
    await expect.poll(async () => (await camera(page)).zoom).toBeCloseTo(0.75, 2);
    await page.locator('#cv').focus(); await page.keyboard.press('ArrowLeft');
    await page.click('#btnHome');
    await expect.poll(() => camera(page)).toEqual({ azimuthDeg: 0, elevationDeg: 5, zoom: 1 });
  });

  test('tapping a bone shows its names and side; hide with undo, show all', async ({ page }) => {
    const femur = find('Femur', 'l');
    const pt = await pointOf(page, femur);
    await page.mouse.click(pt.x, pt.y);
    await expect(page.locator('#info')).toBeVisible();
    await expect(page.locator('#infoName')).toHaveText('Oberschenkelknochen');
    await expect(page.locator('#infoSub')).toHaveText('Os femoris · Femur · Skelett, links');
    // The selected part is labelled on the model
    await expect(page.locator('#labels .lbl.sel')).toHaveText('Oberschenkelknochen (links)');
    // Hide: gone from the screen, the card closes; undo brings it back
    await page.click('#btnHide');
    await expect(page.locator('#info')).toBeHidden();
    await expect.poll(async () => await pointOf(page, femur)).toBeNull();
    await expect(page.locator('#btnShowAll')).toBeEnabled();
    await page.getByRole('button', { name: 'Rückgängig' }).click();
    await expect.poll(async () => await pointOf(page, femur)).not.toBeNull();
    // Hide two, "Show all" brings both back
    for (const i of [femur, find('Femur', 'r')]) {
      const p = await pointOf(page, i); await page.mouse.click(p.x, p.y);
      await expect(page.locator('#info')).toBeVisible();
      await page.click('#btnHide');
    }
    await expect.poll(() => page.evaluate(() => window.__anatomy.viewer.hidden.size)).toBe(2);
    await page.click('#btnShowAll');
    await expect(page.locator('#btnShowAll')).toBeDisabled();
    await expect.poll(async () => (await pointOf(page, find('Femur', 'r'))) !== null).toBe(true);
    // Tapping empty space selects nothing
    const box = await page.locator('#cv').boundingBox();
    const p = await pointOf(page, femur); await page.mouse.click(p.x, p.y);
    await expect(page.locator('#info')).toBeVisible();
    await page.mouse.click(box.x + 8, box.y + 8);
    await expect(page.locator('#info')).toBeHidden();
  });

  test('names: labels for the largest visible parts, gone while turning, back afterwards', async ({ page }) => {
    await page.click('#btnLabels');
    await expect(page.locator('#btnLabels')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#labels .lbl').first()).toBeVisible();
    const texts = await page.locator('#labels .lbl span').allTextContents();
    expect(texts.length).toBeGreaterThan(4);
    expect(texts.length).toBeLessThanOrEqual(14);
    // The labels are the biggest parts on screen, with their German names
    const vis = await visible(page);
    const names = await page.evaluate(ids => ids.map(i => { const p = window.__anatomy.index.parts[i]; return p[4] + (p[2] ? (p[2] === 'l' ? ' (links)' : ' (rechts)') : ''); }), vis.slice(0, 1).map(v => v.i));
    expect(texts).toContain(names[0]);
    // Labels do not overlap
    const rects = await page.locator('#labels .lbl span').evaluateAll(els => els.map(e => e.getBoundingClientRect().toJSON()));
    for (const [a, ra] of rects.entries()) for (const rb of rects.slice(a + 1))
      expect(ra.right <= rb.left + 1 || rb.right <= ra.left + 1 || ra.bottom <= rb.top + 1 || rb.bottom <= ra.top + 1).toBe(true);
    const box = await page.locator('#cv').boundingBox();
    await page.mouse.move(box.x + 100, box.y + 200); await page.mouse.down(); await page.mouse.move(box.x + 160, box.y + 200, { steps: 4 });
    await expect(page.locator('#labels')).toBeHidden();
    await page.mouse.up();
    await expect(page.locator('#labels')).toBeVisible();
    expect((await settings(page)).labels).toBe(true);
  });

  test('layers switch on and off, load once, and are remembered with the skin opacity', async ({ page }) => {
    const requests = [];
    page.on('request', r => { if (r.url().includes('/models/')) requests.push(r.url().split('/').pop()); });
    await page.click('#layers [data-layer="muscles"]');
    await page.click('#layers [data-layer="skeleton"]');
    await ready(page, ['muscles']);
    expect(await page.evaluate(() => [...window.__anatomy.viewer.layers.values()].map(l => [l.id, l.mesh.visible])))
      .toEqual([['skeleton', false], ['muscles', true]]);
    // Muscles are in front of the bones: from the front the femur is covered
    await expect.poll(async () => (await visible(page)).some(v => v.i === find('Femur', 'l'))).toBe(false);
    await page.click('#layers [data-layer="skeleton"]');
    await page.click('#layers [data-layer="skin"]');
    await ready(page, ['skin']);
    expect(requests.sort()).toEqual(['muscles.bin', 'skin.bin']);
    // See-through skin does not catch taps: the muscle beneath is picked
    const pt = await pointOf(page, find('Rectus femoris muscle', 'l'));
    expect(pt).not.toBeNull();
    await page.mouse.click(pt.x, pt.y);
    await expect(page.locator('#infoName')).toHaveText('Gerader Schenkelmuskel');
    await openMenu(page);
    await page.locator('#optSkin').fill('70');
    await expect(page.locator('#optSkinOut')).toHaveText('70 %');
    expect(await page.evaluate(() => window.__anatomy.viewer.layers.get('skin').mesh.material.opacity)).toBeCloseTo(0.7, 5);
    await page.reload();
    await ready(page, ['skin', 'muscles', 'skeleton']);
    await expect(page.locator('#layers [aria-pressed="true"]')).toHaveText(['Haut', 'Muskeln', 'Skelett']);
    expect(await settings(page)).toMatchObject({ layers: ['skin', 'muscles', 'skeleton'], skin: 70 });
    // No layer: a hint instead of an empty screen
    for (const l of ['skin', 'muscles', 'skeleton']) await page.click(`#layers [data-layer="${l}"]`);
    await expect(page.locator('#status')).toHaveText('Oben eine Ebene einschalten.');
  });

  test('search finds German, Latin and English names, switches the layer on and zooms in', async ({ page }) => {
    await page.click('#btnSearch');
    await expect(page.locator('#searchDlg')).toBeVisible();
    await expect(page.locator('#searchInfo')).toHaveText('Mindestens 2 Buchstaben eingeben.');
    await page.fill('#searchInput', 'oberschenkelknochen');
    await expect(page.locator('#searchList .name')).toHaveText(['Oberschenkelknochen']);   // left and right: one hit
    await page.fill('#searchInput', 'os femoris');
    await expect(page.locator('#searchList .name').first()).toHaveText('Oberschenkelknochen');
    await page.fill('#searchInput', 'liver');
    await expect(page.locator('#searchList .name').first()).toHaveText('Leber');
    await page.fill('#searchInput', 'xyzxyz');
    await expect(page.locator('#searchInfo')).toHaveText('Nichts gefunden.');
    // Umlauts and ß: "grosser gesassmuskel" finds "Großer Gesäßmuskel"
    await page.fill('#searchInput', 'grosser gesassmuskel');
    await expect(page.locator('#searchList .name').first()).toHaveText('Großer Gesäßmuskel');
    const zoom = (await camera(page)).zoom;
    await page.locator('#searchList .open').first().click();
    await expect(page.locator('#searchDlg')).toBeHidden();
    await ready(page, ['muscles']);
    await expect(page.locator('#layers [data-layer="muscles"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#infoName')).toHaveText('Großer Gesäßmuskel');
    await expect.poll(async () => (await camera(page)).zoom).toBeGreaterThan(zoom * 2);
  });

  test('quiz: asks for visible parts, right and wrong answers, ten questions, best score kept', async ({ page }) => {
    await page.click('#btnQuiz');
    await expect(page.locator('#quiz')).toBeVisible();
    await expect(page.locator('#info')).toBeHidden();
    const q = () => page.evaluate(() => window.__anatomy.quiz());
    // Right: tap the part asked for
    let target = (await q()).target;
    const de = i => INDEX.parts[i][4] || INDEX.parts[i][3] || INDEX.parts[i][1];
    await expect(page.locator('#quizQ')).toHaveText(`Wo ist: ${de(target)}?`);
    let pt = await pointOf(page, target);
    await page.mouse.click(pt.x, pt.y);
    await expect(page.locator('#quizQ')).toContainText('Richtig');
    await expect(page.locator('#quizScore')).toHaveText('Frage 1 von 10 · 1 richtig · Bestwert: 0 von 10');
    await page.click('#btnQuizNext');
    // Wrong: tap another visible part with a different name
    target = (await q()).target;
    const other = (await visible(page)).find(v => INDEX.parts[v.i][1] !== INDEX.parts[target][1] && v.px > 300);
    pt = await pointOf(page, other.i);
    await page.mouse.click(pt.x, pt.y);
    await expect(page.locator('#quizQ')).toContainText(`Gesucht: ${de(target)}`);
    await expect(page.locator('#quizScore')).toContainText('Frage 2 von 10 · 1 richtig');
    // No question twice; skip the rest, then right answers do not count twice
    const asked = [];
    for (let k = 3; k <= 10; k++) {
      await page.click('#btnQuizNext');
      const s = await q(); asked.push(INDEX.parts[s.target][1]);
      await page.click('#btnQuizSkip');
      await expect(page.locator('#quizQ')).toContainText('Daneben');
    }
    expect(new Set(asked).size).toBe(asked.length);
    await page.click('#btnQuizNext');
    await expect(page.locator('#quizQ')).toHaveText('Fertig: 1 von 10 richtig. Neuer Bestwert!');
    await expect(page.locator('#btnQuizNext')).toHaveText('Nochmal');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('anatomy.quiz.v1')))).toEqual({ best: 1, played: 1 });
    await page.click('#btnQuizEnd');
    await expect(page.locator('#quiz')).toBeHidden();
  });

  test('quiz needs something to see', async ({ page }) => {
    await page.click('#layers [data-layer="skeleton"]');
    await page.click('#btnQuiz');
    await expect(page.locator('#quiz')).toBeHidden();
    await expect(page.locator('.toast')).toContainText('erst eine Ebene einschalten');
  });

  test('Latin as main name (setting)', async ({ page }) => {
    await openMenu(page);
    await page.check('#optLatin');
    await page.keyboard.press('Escape');
    const pt = await pointOf(page, find('Femur', 'r'));
    await page.mouse.click(pt.x, pt.y);
    await expect(page.locator('#infoName')).toHaveText('Os femoris');
    await expect(page.locator('#infoSub')).toHaveText('Femur · Oberschenkelknochen · Skelett, rechts');
  });
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('names in English with Latin, layers translated, switching without reload', async ({ page }) => {
    await page.goto('/anatomy/');
    await ready(page);
    await expect(page.locator('#layers button')).toHaveText(['Skin', 'Muscles', 'Skeleton', 'Organs', 'Heart & vessels', 'Nerves & senses', 'Lymphatic system']);
    const pt = await pointOf(page, find('Femur', 'l'));
    await page.mouse.click(pt.x, pt.y);
    await expect(page.locator('#infoName')).toHaveText('Femur');
    await expect(page.locator('#infoSub')).toHaveText('Os femoris · Skeleton, left');
    await switchLang(page, 'de');
    await expect(page.locator('#infoName')).toHaveText('Oberschenkelknochen');
    await expect(page.locator('#layers button').first()).toHaveText('Haut');
  });
});

test('offline: a layer never opened before loads from the cache', async ({ page, context }) => {
  await page.goto('/anatomy/');
  await ready(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await ready(page);
  await context.setOffline(true);
  await page.reload();
  await ready(page);
  await page.click('#layers [data-layer="organs"]');
  await ready(page, ['organs']);
  expect(await page.evaluate(() => window.__anatomy.viewer.layers.has('organs'))).toBe(true);
  await context.setOffline(false);
});

test.describe('missing model file', () => {
  // Without the service worker: its offline cache would deliver the file despite the route
  test.use({ serviceWorkers: 'block', allowedProblems: /Failed to load resource: .* 404/ });
  test('is reported, the other layers keep working', async ({ page }) => {
  await page.route('**/anatomy/models/nerves.bin', r => r.fulfill({ status: 404, body: '' }));
  await page.goto('/anatomy/');
  await ready(page);
  await page.click('#layers [data-layer="nerves"]');
  await expect(page.locator('.toast')).toHaveText('Nerven & Sinne ließ sich nicht laden.');
  await expect(page.locator('#status')).toBeHidden();
  const pt = await pointOf(page, find('Femur', 'l'));
  await page.mouse.click(pt.x, pt.y);
  await expect(page.locator('#infoName')).toHaveText('Oberschenkelknochen');
  });
});

test('without WebGL: a notice instead of the model, no errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...a) { return /webgl/.test(type) ? null : get.call(this, type, ...a); };
  });
  await page.goto('/anatomy/');
  await expect(page.locator('#status .notice')).toHaveText('Dieser Browser kann keine 3D-Grafik (WebGL) anzeigen.');
  await page.click('#btnQuiz');
  await page.click('#layers [data-layer="muscles"]');
  expect(errors).toEqual([]);
});
