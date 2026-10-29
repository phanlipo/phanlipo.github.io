// WebMCP: app functions as tools for AI agents (document.modelContext, draft standard).
// Browsers do not ship it yet, so a stand-in modelContext records what the page registers;
// the tests then call the tools like an agent would.
import { test, expect, apps } from './helpers.mjs';

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
