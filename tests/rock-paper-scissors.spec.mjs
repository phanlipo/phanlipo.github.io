// Schere, Stein, Papier: rules of all three variants, computer independent of the player's choice,
// "smart" computer learns from history, score and persistence.
import { test, expect } from './helpers.mjs';

// Rules written down independently of the page: winner → losers
const BEATS = {
  3: { schere: ['papier'], stein: ['schere'], papier: ['stein'] },
  4: { schere: ['papier'], stein: ['schere'], papier: ['stein', 'brunnen'], brunnen: ['schere', 'stein'] },
  5: {
    schere: ['papier', 'echse'], papier: ['stein', 'spock'], stein: ['echse', 'schere'],
    echse: ['spock', 'papier'], spock: ['schere', 'stein'],
  },
};
const expected = (v, p, c) => (p === c ? 'draw' : BEATS[v][p].includes(c) ? 'win' : 'lose');

async function play(page, move) {
  await page.click(`#choices [data-move="${move}"]`);
  return {
    p: await page.locator('#you').getAttribute('data-move'),
    c: await page.locator('#cpu').getAttribute('data-move'),
    o: await page.locator('#result').getAttribute('data-outcome'),
  };
}

test('every variant: each pair of moves loses against the other', () => {
  for (const [v, beats] of Object.entries(BEATS)) {
    const moves = Object.keys(beats);
    for (const a of moves) for (const b of moves) {
      if (a === b) continue;
      expect(beats[a].includes(b) !== beats[b].includes(a), `${v}: ${a}/${b}`).toBe(true);
    }
  }
});

for (const v of ['3', '4', '5']) {
  test(`variant ${v}: outcomes follow the rules`, async ({ page }) => {
    await page.goto('/rock-paper-scissors/');
    await page.click(`#variants [data-v="${v}"]`);
    await page.click('#modes [data-m="random"]');
    const moves = Object.keys(BEATS[v]);
    await expect(page.locator('#choices .choice')).toHaveCount(moves.length);
    const seen = new Set();
    for (let i = 0; i < 60; i++) {
      const r = await play(page, moves[i % moves.length]);
      expect(moves).toContain(r.c);
      expect(r.o, `${r.p} vs ${r.c}`).toBe(expected(v, r.p, r.c));
      seen.add(r.c);
    }
    expect(seen.size).toBe(moves.length);
    // Score adds up
    const n = async id => Number(await page.locator(id).textContent());
    expect((await n('#sWin')) + (await n('#sDraw')) + (await n('#sLose'))).toBe(60);
  });

  test(`variant ${v}: help shows a diagram with one arrow per rule`, async ({ page }) => {
    await page.goto('/rock-paper-scissors/');
    const rules = Object.values(BEATS[v]).flat().length;
    const box = page.locator(`#ruleDiagrams [data-variant="${v}"]`);
    await expect(box.locator('svg line.arrow')).toHaveCount(rules);
    await expect(box.locator('li')).toHaveCount(rules);
  });
}

test('computer has chosen before the player – its move does not depend on the choice', async ({ page }) => {
  for (const seed of [1, 7, 42, 99]) {
    // Same history and same random numbers on every load
    await page.addInitScript(([s]) => {
      if (sessionStorage.getItem('seed') !== String(s)) return;
      let x = s;
      Math.random = () => ((x = (x * 16807) % 2147483647) / 2147483647);
      localStorage.setItem('rock-paper-scissors.state.v1', JSON.stringify({
        variant: '5', mode: 'smart',
        v: { 5: { rounds: [['stein', 'papier', 'lose'], ['echse', 'stein', 'lose'], ['stein', 'spock', 'lose']], win: 0, lose: 3, draw: 0 } },
      }));
    }, [seed]);
    const results = [];
    for (const move of ['schere', 'stein', 'papier', 'echse', 'spock']) {
      await page.goto('/rock-paper-scissors/');
      await page.evaluate(s => sessionStorage.setItem('seed', String(s)), seed);
      await page.reload();
      results.push((await play(page, move)).c);
    }
    expect(new Set(results).size, `seed ${seed}: ${results}`).toBe(1);
  }
});

test('smart computer learns when the player always picks the same', async ({ page }) => {
  await page.goto('/rock-paper-scissors/');
  await page.click('#modes [data-m="smart"]');
  const late = [];
  for (let i = 0; i < 40; i++) {
    const r = await play(page, 'stein');
    if (i >= 20) late.push(r.c);
  }
  // Only Papier beats Stein; pure chance would give about 7 of 20
  expect(late.filter(c => c === 'papier').length).toBeGreaterThanOrEqual(12);
});

test('score is kept per variant, survives reload and can be reset', async ({ page }) => {
  await page.goto('/rock-paper-scissors/');
  await page.click('#variants [data-v="4"]');
  for (let i = 0; i < 3; i++) await play(page, 'brunnen');
  await expect(page.locator('#last li')).toHaveCount(3);
  await page.reload();
  await expect(page.locator('#variants [data-v="4"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#last li')).toHaveCount(3);
  await page.click('#variants [data-v="3"]');
  await expect(page.locator('#last li')).toHaveCount(0);
  await page.click('#variants [data-v="4"]');
  page.once('dialog', d => d.accept());
  await page.click('#btnReset');
  await expect(page.locator('#last li')).toHaveCount(0);
  await expect(page.locator('#sWin')).toHaveText('0');
});
