// WebMCP: app functions as tools for AI agents (document.modelContext, draft standard).
// Browsers do not ship it yet, so a stand-in modelContext records what the page registers;
// the tests then call the tools like an agent would.
import { test, expect, apps } from './helpers.mjs';
import { makePdf } from './pdf-tools.mjs';

/** Installs a stand-in modelContext before the page loads (on document, or on navigator for older drafts) */
async function fakeModelContext(page, where = 'document') {
  await page.addInitScript(where => {
    const tools = [];
    const mc = {
      registerTool(tool, options) {
        if (!tool.name || !tool.description || tools.some(t => t.tool.name === tool.name))
          return Promise.reject(new DOMException('invalid or duplicate tool', 'InvalidStateError'));
        const entry = { tool, options: options || {} };
        tools.push(entry);
        if (options && options.signal) options.signal.addEventListener('abort', () => tools.splice(tools.indexOf(entry), 1));
        return Promise.resolve();
      },
    };
    Object.defineProperty(where === 'navigator' ? Navigator.prototype : Document.prototype, 'modelContext', { get: () => mc, configurable: true });
    window.__webmcp = {
      list: () => tools.map(({ tool, options }) => ({
        name: tool.name, title: tool.title, description: tool.description, inputSchema: tool.inputSchema,
        annotations: tool.annotations, optionKeys: Object.keys(options), hasSignal: options.signal instanceof AbortSignal,
      })),
      call: (name, input) => {
        const entry = tools.find(t => t.tool.name === name);
        if (!entry) return Promise.resolve({ ok: false, error: `no tool ${name}` });
        return Promise.resolve()
          .then(() => entry.tool.execute(input, { signal: new AbortController().signal }))
          .then(result => ({ ok: true, result: JSON.parse(JSON.stringify(result)) }), e => ({ ok: false, error: e.message }));
      },
    };
  }, where);
}
const listTools = page => page.evaluate(() => window.__webmcp.list());
const call = (page, name, input) => page.evaluate(([n, i]) => window.__webmcp.call(n, i), [name, input]);
const prefix = folder => folder.replace(/[^A-Za-z0-9]+/g, '_') + '_';

for (const app of apps()) {
  test(`${app.folder}: registers exactly the tools in tool:webmcp, well described and harmless`, async ({ page }) => {
    await fakeModelContext(page);
    await page.goto(`/${app.folder}/`);
    const tools = await listTools(page);
    expect(tools.map(t => t.name).sort()).toEqual((app.webmcp || []).map(n => prefix(app.folder) + n).sort());
    for (const t of tools) {
      expect(t.name).toMatch(/^[A-Za-z0-9_.-]{1,128}$/);
      // Agents get English: no German special characters in names, titles and descriptions
      expect(t.description.length, t.name).toBeGreaterThan(30);
      expect(`${t.title} ${t.description} ${JSON.stringify(t.inputSchema)}`, t.name).not.toMatch(/[äöüÄÖÜß]/);
      expect(t.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
      expect(typeof t.annotations.readOnlyHint).toBe('boolean');
      // Only for this origin, removable via AbortSignal
      expect(t.optionKeys).toEqual(['signal']);
      expect(t.hasSignal).toBe(true);
      // Never destructive
      expect(t.name).not.toMatch(/delete|clear|remove|import|restore|reset/i);
    }
  });
}

test('older drafts: navigator.modelContext works too', async ({ page }) => {
  await fakeModelContext(page, 'navigator');
  await page.goto('/dice-coin/');
  expect((await listTools(page)).map(t => t.name)).toContain('dice_coin_roll_dice');
});

test('without WebMCP the page works and registers nothing', async ({ page }) => {
  await page.goto('/dice-coin/');
  expect(await page.evaluate(() => Tools.mcp.available())).toBe(false);
  await page.click('#btnRoll');
  await expect(page.locator('#histCount')).toHaveText('1');
});

test.describe('dice-coin tools', () => {
  test.beforeEach(async ({ page }) => {
    await fakeModelContext(page);
    await page.goto('/dice-coin/');
  });

  test('roll_dice: values in range, total with modifier, shown in the app and its history', async ({ page }) => {
    const { ok, result } = await call(page, 'dice_coin_roll_dice', { count: 3, sides: 20, modifier: 2 });
    expect(ok).toBe(true);
    expect(result.dice).toBe('3d20');
    expect(result.rolls).toHaveLength(3);
    for (const v of result.rolls) expect(v).toBeGreaterThanOrEqual(1), expect(v).toBeLessThanOrEqual(20);
    const sum = result.rolls[0] + result.rolls[1] + result.rolls[2];
    expect(result.sum).toBe(sum);
    expect(result.total).toBe(sum + 2);
    // Same values in the app
    const board = await page.locator('#board .die').evaluateAll(els => els.map(e => [Number(e.dataset.v), Number(e.dataset.s)]));
    expect(board).toEqual(result.rolls.map(v => [v, 20]));
    await expect(page.locator('#summary .total')).toHaveText(String(sum + 2));
    await expect(page.locator('#histCount')).toHaveText('1');
    await expect(page.locator('#toast')).toHaveText('KI-Agent: gewürfelt');
  });

  test('roll_dice without input: one d6', async ({ page }) => {
    const { ok, result } = await call(page, 'dice_coin_roll_dice', {});
    expect(ok).toBe(true);
    expect(result).toMatchObject({ dice: '1d6', modifier: 0 });
    expect(result.rolls[0]).toBeGreaterThanOrEqual(1);
    expect(result.rolls[0]).toBeLessThanOrEqual(6);
  });

  test('invalid input is rejected with a clear message and changes nothing', async ({ page }) => {
    for (const [input, msg] of [
      [{ count: 0 }, 'input.count must be >= 1'],
      [{ count: 31 }, 'input.count must be <= 30'],
      [{ count: 2.5 }, 'input.count must be of type integer'],
      [{ sides: '6' }, 'input.sides must be of type integer'],
      [{ dice: 2 }, 'input.dice is not allowed'],
    ]) {
      expect(await call(page, 'dice_coin_roll_dice', input)).toEqual({ ok: false, error: msg });
    }
    await expect(page.locator('#histCount')).toHaveText('0');
  });

  test('flip_coin: heads and tails add up, shown with the user labels', async ({ page }) => {
    await page.click('[data-tab=coin]');
    await page.fill('#coinHeads', 'Ja');
    const { ok, result } = await call(page, 'dice_coin_flip_coin', { count: 5 });
    expect(ok).toBe(true);
    expect(result.results).toHaveLength(5);
    expect(result.heads).toBe(result.results.filter(r => r === 'heads').length);
    expect(result.heads + result.tails).toBe(5);
    expect(result.labels).toEqual({ heads: 'Ja', tails: 'Zahl' });
    expect(await page.locator('#board .coin').allTextContents()).toEqual(result.results.map(r => (r === 'heads' ? 'Ja' : 'Zahl')));
  });

  test('get_history: newest first, limited, read only', async ({ page }) => {
    for (let i = 0; i < 3; i++) await call(page, 'dice_coin_roll_dice', { count: 1, sides: 6 });
    const { result } = await call(page, 'dice_coin_get_history', { limit: 2 });
    expect(result.total).toBe(3);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].text).toMatch(/^1W6: \d$/);
    expect(Date.parse(result.entries[0].time)).toBeGreaterThanOrEqual(Date.parse(result.entries[1].time));
    const tools = await listTools(page);
    expect(tools.find(t => t.name === 'dice_coin_get_history').annotations.readOnlyHint).toBe(true);
    expect(tools.find(t => t.name === 'dice_coin_roll_dice').annotations.readOnlyHint).toBe(false);
  });

  test('works offline', async ({ page, context }) => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await context.setOffline(true);
    await page.reload();
    const { ok, result } = await call(page, 'dice_coin_roll_dice', { count: 2 });
    expect(ok).toBe(true);
    expect(result.rolls).toHaveLength(2);
    await context.setOffline(false);
  });
});

test.describe('English interface', () => {
  test.use({ locale: 'en-US' });

  test('tools are the same in every interface language', async ({ page, browser }) => {
    await fakeModelContext(page);
    await page.goto('/dice-coin/');
    const en = await listTools(page);
    const de = await browser.newPage({ locale: 'de-DE' });
    await fakeModelContext(de);
    await de.goto(page.url());
    expect(await listTools(de)).toEqual(en);
    await de.close();
    await call(page, 'dice_coin_roll_dice', { count: 1 });
    await expect(page.locator('#toast')).toHaveText('AI agent: dice rolled');
  });
});

/** Opens a page with the stand-in modelContext */
async function open(page, path) {
  await fakeModelContext(page);
  await page.goto(path);
}

// ---------- Brau-Rechner: reference formulas, independent from the page (as in brew-calculator.spec.mjs) ----------
const rhoW = T => (999.83952 + 16.945176 * T - 7.9870401e-3 * T ** 2 - 46.170461e-6 * T ** 3
  + 105.56302e-9 * T ** 4 - 280.54253e-12 * T ** 5) / (1 + 16.879850e-3 * T);
const co2 = (T, p) => 10 * p * Math.exp(-10.73797 + 2617.25 / (T + 273.15));
const sgFromP = P => 1 + P / (258.6 - (P / 258.2) * 227.1);
const pFromSg = G => -616.868 + 1111.14 * G - 630.272 * G ** 2 + 135.997 * G ** 3;

test.describe('brew-calculator tools', () => {
  test.beforeEach(async ({ page }) => open(page, '/brew-calculator/'));

  test('pot_volume: from fill height and from the gap, hot wort at 20 °C, values shown in the app', async ({ page }) => {
    const V = Math.PI * 18 ** 2 * 25 / 1000;
    let r = await call(page, 'brew_calculator_pot_volume', { diameter_cm: 36, fill_height_cm: 25, temperature_c: 98 });
    expect(r.ok).toBe(true);
    expect(r.result.volume_l).toBeCloseTo(V, 3);
    expect(r.result.liters_per_cm).toBeCloseTo(Math.PI * 18 ** 2 / 1000, 4);
    expect(r.result.volume_at_20c_l).toBeCloseTo(V * rhoW(98) / rhoW(20), 3);
    await expect(page.locator('[data-key="v.d"]')).toHaveValue('36');
    await expect(page.locator('#vRes .res.main .v')).toContainText('25,45');
    r = await call(page, 'brew_calculator_pot_volume', { diameter_cm: 36, pot_height_cm: 34, gap_cm: 9 });
    expect(r.result.volume_l).toBeCloseTo(V, 3);
    expect(r.result.fill_height_cm).toBe(25);
    await expect(page.locator('[data-key="v.mode"] [data-v="gap"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('pot_volume: contradicting or missing heights are rejected', async ({ page }) => {
    expect(await call(page, 'brew_calculator_pot_volume', { diameter_cm: 36 }))
      .toEqual({ ok: false, error: 'Give fill_height_cm, or pot_height_cm together with gap_cm.' });
    expect((await call(page, 'brew_calculator_pot_volume', { diameter_cm: 36, fill_height_cm: 5, gap_cm: 2 })).ok).toBe(false);
    expect(await call(page, 'brew_calculator_pot_volume', { diameter_cm: 36, pot_height_cm: 10, gap_cm: 12 }))
      .toEqual({ ok: false, error: 'gap_cm is larger than pot_height_cm.' });
    expect((await call(page, 'brew_calculator_pot_volume', { diameter_cm: 0, fill_height_cm: 5 })).ok).toBe(false);
  });

  test('fill_height_for_volume', async ({ page }) => {
    const r = await call(page, 'brew_calculator_fill_height_for_volume', { diameter_cm: 36, target_volume_l: 25 });
    expect(r.result.fill_height_cm).toBeCloseTo(25000 / (Math.PI * 18 ** 2), 2);
    await expect(page.locator('#vRes .res.main .v')).toContainText('24,6');
  });

  test('correct_gravity: Plato and SG', async ({ page }) => {
    let r = await call(page, 'brew_calculator_correct_gravity', { reading: 12, sample_temperature_c: 30 });
    const Pk = pFromSg(sgFromP(12) * rhoW(20) / rhoW(30));
    expect(r.result.corrected_plato).toBeCloseTo(Pk, 2);
    expect(r.result.correction_plato).toBeCloseTo(Pk - 12, 2);
    r = await call(page, 'brew_calculator_correct_gravity', { reading: 1.05, unit: 'sg', sample_temperature_c: 25, calibration_temperature_c: 15 });
    expect(r.result.corrected_sg).toBeCloseTo(1.05 * rhoW(15) / rhoW(25), 4);
    await expect(page.locator('[data-key="s.unit"] [data-v="SG"]')).toHaveAttribute('aria-pressed', 'true');
    expect((await call(page, 'brew_calculator_correct_gravity', { reading: 2, unit: 'sg', sample_temperature_c: 20 })).error)
      .toMatch(/Implausible reading/);
  });

  test('priming_sugar: sugar, per bottle, residual CO2 and pressure', async ({ page }) => {
    const r = await call(page, 'brew_calculator_priming_sugar', { beer_volume_l: 20, max_temperature_c: 20, target_co2_g_per_l: 5, bottle_size_l: 0.5, storage_temperature_c: 8 });
    const rest = co2(20, 1.013), m = (5 - rest) * 20 / (4 * 44.0095 / 342.2965);
    expect(r.result.sugar_g).toBeCloseTo(m, 1);
    expect(r.result.sugar_g_per_bottle).toBeCloseTo(m / 20 * 0.5, 2);
    expect(r.result.residual_co2_g_per_l).toBeCloseTo(rest, 2);
    expect(r.result.pressure_bar_at_storage).toBeCloseTo(5 / co2(8, 1) - 1.013, 2);
    const g = await call(page, 'brew_calculator_priming_sugar', { beer_volume_l: 20, max_temperature_c: 20, target_co2_g_per_l: 5, sugar: 'glucose_monohydrate' });
    expect(g.result.sugar_g).toBeCloseTo((5 - rest) * 20 / (2 * 44.0095 / 198.171), 1);
    await expect(page.locator('[data-key="z.sugar"]')).toHaveValue('dextrose');
  });
});

test.describe('qr-code tools', () => {
  test.beforeEach(async ({ page }) => open(page, '/qr-code/'));

  test('create_qr_code shows the code and returns a PNG and a page link', async ({ page }) => {
    const r = await call(page, 'qr_code_create_qr_code', { text: 'https://example.org/ä', error_correction: 'H' });
    expect(r.ok).toBe(true);
    expect(r.result.error_correction).toBe('H');
    expect(r.result.bytes).toBe(Buffer.byteLength('https://example.org/ä'));
    expect(r.result.image_png_data_url).toMatch(/^data:image\/png;base64,/);
    expect(new URL(r.result.page_link).searchParams.get('q')).toBe('https://example.org/ä');
    await expect(page.locator('#txt')).toHaveValue('https://example.org/ä');
    await expect(page.locator('#qr')).toBeVisible();
    await expect(page.locator('#ec')).toHaveValue('H');
  });

  test('create_wifi_qr_code needs a password unless the network is open', async ({ page }) => {
    expect(await call(page, 'qr_code_create_wifi_qr_code', { ssid: 'Gast' }))
      .toEqual({ ok: false, error: 'A password is needed unless encryption is nopass.' });
    const r = await call(page, 'qr_code_create_wifi_qr_code', { ssid: 'Gast;1', password: 'geheim', encryption: 'WPA' });
    expect(r.ok).toBe(true);
    expect(new URL(r.result.page_link).searchParams.get('q')).toBe('WIFI:T:WPA;S:Gast\\;1;P:geheim;;');
    await expect(page.locator('#wSsid')).toHaveValue('Gast;1');
  });

  test('get_history never returns WLAN passwords', async ({ page }) => {
    await call(page, 'qr_code_create_wifi_qr_code', { ssid: 'Heim', password: 'sehr-geheim' });
    await page.click('#btnKeep');
    await call(page, 'qr_code_create_qr_code', { text: 'https://example.org' });
    await page.click('#btnKeep');
    const { result } = await call(page, 'qr_code_get_history', {});
    expect(result.total).toBe(2);
    expect(result.entries.map(e => e.kind)).toEqual(['link', 'wifi']);
    expect(result.entries[0].content).toBe('https://example.org');
    expect(result.entries[1]).toMatchObject({ kind: 'wifi', network: 'Heim' });
    expect(JSON.stringify(result)).not.toContain('sehr-geheim');
  });
});

test.describe('rock-paper-scissors tools', () => {
  test.beforeEach(async ({ page }) => open(page, '/rock-paper-scissors/'));

  // Rules written out independently: winner → losers
  const BEATS = {
    classic: { rock: ['scissors'], paper: ['rock'], scissors: ['paper'] },
    lizard_spock: { rock: ['scissors', 'lizard'], paper: ['rock', 'spock'], scissors: ['paper', 'lizard'], lizard: ['spock', 'paper'], spock: ['scissors', 'rock'] },
  };
  const expected = (v, a, b) => a === b ? 'draw' : BEATS[v][a].includes(b) ? 'you_win' : 'computer_wins';

  test('play_round follows the rules and counts the score', async ({ page }) => {
    for (let i = 0; i < 12; i++) {
      const move = ['rock', 'paper', 'scissors'][i % 3];
      const { ok, result } = await call(page, 'rock_paper_scissors_play_round', { move, variant: 'classic' });
      expect(ok).toBe(true);
      expect(result.outcome).toBe(expected('classic', move, result.computer_move));
    }
    const { result } = await call(page, 'rock_paper_scissors_get_score', {});
    expect(result.score.you + result.score.draws + result.score.computer).toBe(12);
    await expect(page.locator('#sWin')).toHaveText(String(result.score.you));
    expect(result.last_rounds).toHaveLength(10);
  });

  test('variant switch and moves outside the variant', async ({ page }) => {
    expect((await call(page, 'rock_paper_scissors_play_round', { move: 'spock' })).error).toMatch(/not part of the variant classic/);
    const { result } = await call(page, 'rock_paper_scissors_play_round', { move: 'spock', variant: 'lizard_spock' });
    expect(result.variant).toBe('lizard_spock');
    expect(result.outcome).toBe(expected('lizard_spock', 'spock', result.computer_move));
    await expect(page.locator('#variants [data-v="5"]')).toHaveAttribute('aria-pressed', 'true');
    // Each variant keeps its own score
    expect((await call(page, 'rock_paper_scissors_get_score', { variant: 'classic' })).result.last_rounds).toEqual([]);
  });
});

test.describe('securpharm-scanner tools', () => {
  test.beforeEach(async ({ page }) => open(page, '/securpharm-scanner/'));

  test('parse_pack_code splits a GS1 code, checks digits and saves nothing', async ({ page }) => {
    const { ok, result } = await call(page, 'securpharm_scanner_parse_pack_code', { code: '010415012345678221ABC123XYZ9<GS>10CH4711<GS>17281231' });
    expect(ok).toBe(true);
    expect(result).toMatchObject({ format: 'GS1', pzn: '12345678', gtin: '04150123456782', batch: 'CH4711', serial: 'ABC123XYZ9', expiry_raw: '281231', expired: false });
    expect(result.expiry).toMatch(/^2028-12-31/);
    // PZN check digit: (1·1 + 2·2 + … + 7·7) mod 11 = 140 mod 11 = 8
    expect(result.check_digits.pzn).toBe(true);
    await expect(page.locator('#fields')).toContainText('CH4711');
    await expect(page.locator('#histCount')).toHaveText('0');
    expect((await call(page, 'securpharm_scanner_parse_pack_code', { code: 'hello' })).error).toMatch(/Not a readable securPharm code/);
  });

  test('get_scan_history with search', async ({ page }) => {
    for (const batch of ['AAA1', 'BBB2']) {
      await page.fill('#manual', `010415012345678221SN${batch}<GS>10${batch}<GS>17281231`);
      await page.click('#btnParse');
    }
    const all = (await call(page, 'securpharm_scanner_get_scan_history', {})).result;
    expect(all.total).toBe(2);
    expect(all.entries.map(e => e.batch)).toEqual(['BBB2', 'AAA1']);
    const hit = (await call(page, 'securpharm_scanner_get_scan_history', { search: 'aaa1' })).result;
    expect(hit.matches).toBe(1);
    expect(hit.entries[0]).toMatchObject({ pzn: '12345678', serial: 'SNAAA1' });
  });
});

test.describe('sensors tools', () => {
  test.use({ permissions: ['accelerometer', 'gyroscope', 'magnetometer'] });

  test('get_step_count reads today’s steps', async ({ page }) => {
    await open(page, '/sensors/');
    await page.evaluate(() => {
      const d = new Date();
      localStorage.setItem('sensors.settings.v1', JSON.stringify({ steps: { day: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`, count: 1234, len: 0.75, sens: 'mid' } }));
    });
    await page.reload();
    const { result } = await call(page, 'sensors_get_step_count', {});
    expect(result).toMatchObject({ steps: 1234, step_length_m: 0.75, distance_m: 925.5 });
  });

  test('get_compass_heading only while the compass runs', async ({ page }) => {
    await open(page, '/sensors/');
    expect((await call(page, 'sensors_get_compass_heading', {})).error).toMatch(/compass is not running/);
    await page.locator('#overview').getByRole('button', { name: 'Kompass', exact: true }).click();
    await expect(page.locator('[data-start="compass"]')).toHaveText('Stoppen');
    // alpha is counter-clockwise: alpha 90° → the top of the device points west
    await page.evaluate(() => { for (let i = 0; i < 40; i++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha: 90, beta: 0, gamma: 0, absolute: true })); });
    await expect(page.locator('#cDeg')).toHaveText('270°');
    const { result } = await call(page, 'sensors_get_compass_heading', {});
    expect(result).toMatchObject({ heading_deg: 270, direction: 'W', reference: 'magnetic_north' });
  });
});

test.describe('pdf2word tools', () => {
  test.beforeEach(async ({ page }) => open(page, '/pdf2word/'));
  const pdf = () => makePdf([
    { texts: [{ x: 72, y: 760, size: 11, text: 'Erster Absatz der Testdatei.' }] },
    { texts: [{ x: 72, y: 760, size: 11, text: 'Zweite Seite.' }] },
  ]);

  test('convert_selected_pdf converts the chosen file and returns its text', async ({ page }) => {
    expect((await call(page, 'pdf2word_convert_selected_pdf', {})).error).toMatch(/No PDF chosen/);
    expect((await call(page, 'pdf2word_get_converted_text', {})).error).toMatch(/Nothing converted yet/);
    await page.setInputFiles('#file', { name: 'test.pdf', mimeType: 'application/pdf', buffer: pdf() });
    const { ok, result } = await call(page, 'pdf2word_convert_selected_pdf', {});
    expect(ok).toBe(true);
    expect(result).toMatchObject({ pdf_name: 'test.pdf', docx_name: 'test.docx', pages: 2, images: 0, truncated: false });
    expect(result.text).toBe('Erster Absatz der Testdatei.\n\n--- page break ---\n\nZweite Seite.');
    await expect(page.locator('#result')).toBeVisible();
    const short = (await call(page, 'pdf2word_get_converted_text', { max_characters: 100 })).result;
    expect(short.text).toBe(result.text);
    const tools = await listTools(page);
    expect(tools.find(t => t.name === 'pdf2word_get_converted_text').annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true });
  });

  test('convert_selected_pdf reports a file that is no PDF', async ({ page }) => {
    await page.setInputFiles('#file', { name: 'notiz.pdf', mimeType: 'application/pdf', buffer: Buffer.from('kein pdf') });
    expect(await call(page, 'pdf2word_convert_selected_pdf', {})).toEqual({ ok: false, error: 'The chosen file is not a readable PDF.' });
  });
});

test.describe('voice-transcriber tools', () => {
  test('get_transcript and get_transcript_history', async ({ page }) => {
    await open(page, '/voice-transcriber/');
    expect((await call(page, 'voice_transcriber_get_transcript', {})).error).toMatch(/No transcript yet/);
    const t = Date.UTC(2026, 9, 29, 10, 0, 0);
    await page.evaluate(t => localStorage.setItem('voice-transcriber.history.v1', JSON.stringify([
      { t, file: 'a.opus', duration: 12.4, model: 'onnx-community/whisper-base', text: 'Hallo Welt', chunks: [] },
    ])), t);
    await page.reload();
    const h = (await call(page, 'voice_transcriber_get_transcript_history', {})).result;
    expect(h).toEqual({ total: 1, entries: [{ time: '2026-10-29T10:00:00.000Z', file_name: 'a.opus', duration_s: 12, text: 'Hallo Welt' }] });
    await page.locator('#hist .open').click();
    await page.fill('#text', 'Hallo Welt, korrigiert');
    expect((await call(page, 'voice_transcriber_get_transcript', {})).result.text).toBe('Hallo Welt, korrigiert');
  });
});

test.describe('reminders tools', () => {
  test.use({ timezoneId: 'Europe/Berlin' });
  const START = new Date('2026-10-29T12:00:00+01:00');
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: START });
    await page.addInitScript(() => {
      // Stand-in Notification API: permission granted, notifications recorded
      window.__notes = [];
      window.Notification = class { constructor(title) { window.__notes.push(title); } static get permission() { return 'granted'; } };
      ServiceWorkerRegistration.prototype.showNotification = function (title) { window.__notes.push(title); return Promise.resolve(); };
    });
    await open(page, '/reminders/');
  });

  test('create_reminder with at and in_minutes, shown in the app, fires on time', async ({ page }) => {
    const a = await call(page, 'reminders_create_reminder', { text: 'Tee ziehen lassen', in_minutes: 5 });
    expect(a.ok).toBe(true);
    expect(a.result).toMatchObject({ now: '2026-10-29T12:00', time_zone: 'Europe/Berlin', notifications: 'granted',
      reminder: { text: 'Tee ziehen lassen', at: '2026-10-29T12:05', at_utc: '2026-10-29T11:05:00.000Z', status: 'scheduled' } });
    const b = await call(page, 'reminders_create_reminder', { text: 'Meeting', at: '2026-10-29T12:03' });
    expect(b.result.reminder.at_utc).toBe('2026-10-29T11:03:00.000Z');
    await expect(page.locator('#upList li .text')).toHaveText(['Meeting', 'Tee ziehen lassen']);
    await page.clock.runFor(6 * 60e3);
    await expect.poll(() => page.evaluate(() => window.__notes)).toEqual(['Meeting', 'Tee ziehen lassen']);
    const { result } = await call(page, 'reminders_list_reminders', {});
    expect(result.scheduled).toEqual([]);
    expect(result.due.map(r => [r.text, r.status, r.notification_shown])).toEqual([['Tee ziehen lassen', 'due', true], ['Meeting', 'due', true]]);
    expect((await call(page, 'reminders_list_reminders', { include_due: false, limit: 1 })).result.due).toBeUndefined();
  });

  test('invalid times and texts are rejected and change nothing', async ({ page }) => {
    const err = async input => (await call(page, 'reminders_create_reminder', input)).error;
    expect(await err({ text: 'x', at: '2026-10-29T11:00' })).toMatch(/in the past – it is now 2026-10-29T12:00/);
    expect(await err({ text: 'x', at: '29.10.2026 13:00' })).toMatch(/format|look like/);
    expect(await err({ text: 'x', at: '2026-02-31T10:00' })).toMatch(/not a valid date/);
    expect(await err({ text: 'x' })).toMatch(/at or in_minutes/);
    expect(await err({ text: 'x', at: '2026-10-30T10:00', in_minutes: 5 })).toMatch(/not both/);
    expect(await err({ text: '   ', in_minutes: 5 })).toMatch(/must not be empty/);
    expect(await err({ text: 'x', in_minutes: 0 })).toMatch(/>= 1/);
    expect((await call(page, 'reminders_list_reminders', {})).result).toMatchObject({ scheduled: [], due: [] });
  });

  test('update_reminder changes text and time, also of a due reminder', async ({ page }) => {
    const { result: { reminder } } = await call(page, 'reminders_create_reminder', { text: 'Wäsche', in_minutes: 1 });
    await page.clock.runFor(2 * 60e3);
    expect((await call(page, 'reminders_update_reminder', { id: reminder.id, text: 'Wäsche aufhängen' })).error).toMatch(/in the past/);
    const u = await call(page, 'reminders_update_reminder', { id: reminder.id, text: 'Wäsche aufhängen', at: '2026-10-29T18:00' });
    expect(u.result.reminder).toMatchObject({ id: reminder.id, text: 'Wäsche aufhängen', at: '2026-10-29T18:00', status: 'scheduled' });
    await expect(page.locator('#upList li .text')).toHaveText(['Wäsche aufhängen']);
    await expect(page.locator('#pastList li')).toHaveCount(0);
    expect((await call(page, 'reminders_update_reminder', { id: 'nope', text: 'x' })).error).toMatch(/No reminder with id nope/);
    expect((await call(page, 'reminders_update_reminder', { id: reminder.id })).error).toMatch(/Nothing to change/);
  });

  test('repeat: daily series stays scheduled, ends with repeat none', async ({ page }) => {
    const { result: { reminder } } = await call(page, 'reminders_create_reminder', { text: 'Tabletten', at: '2026-10-29T12:01', repeat: 'daily' });
    expect(reminder.repeat).toBe('daily');
    await page.clock.runFor(2 * 60e3);
    // Firing runs asynchronously (Web Lock, then saving): wait until the date is in the history
    await expect.poll(async () => (await call(page, 'reminders_list_reminders', {})).result.due.length).toBe(1);
    const { result } = await call(page, 'reminders_list_reminders', {});
    expect(result.scheduled).toMatchObject([{ id: reminder.id, at: '2026-10-30T12:01', repeat: 'daily' }]);
    expect(result.due).toMatchObject([{ text: 'Tabletten', at: '2026-10-29T12:01', status: 'due' }]);
    await call(page, 'reminders_update_reminder', { id: reminder.id, text: 'Tabletten (abends)' });
    expect((await call(page, 'reminders_list_reminders', {})).result.scheduled[0]).toMatchObject({ text: 'Tabletten (abends)', repeat: 'daily' });
    const u = await call(page, 'reminders_update_reminder', { id: reminder.id, repeat: 'none' });
    expect(u.result.reminder).toMatchObject({ repeat: 'none', at: '2026-10-30T12:01' });
    await expect(page.locator('#upList .rel')).not.toContainText('🔁');
  });
});
