// Chess: rules engine (perft against published counts, notation, draws), the computer (mates, wins material,
// thinks in a worker), two players on one phone (moves, checkmate, undo, promotion, resign, draw, PGN),
// against the computer (answers, undo of both moves, playing black), persistence and English.
import { test, expect, openMenu, closeMenu, clipboardText } from './helpers.mjs';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const LS_SET = 'chess.settings.v1', LS_GAME = 'chess.game.v1';
// Rules engine loaded outside the browser
const ctx = { performance };
vm.runInNewContext(readFileSync(new URL('../chess/engine.js', import.meta.url), 'utf8'), ctx);
const C = ctx.Chess;
const seeded = (s = 1) => () => (s = (s * 16807) % 2147483647) / 2147483647;

const sq = (page, name) => page.locator(`#board .sq[data-sq="${name}"]`);
async function move(page, from, to) {
  await sq(page, from).click();
  await sq(page, to).click();
}
const seed = (page, settings, game) => page.addInitScript(([a, b, s, g]) => {
  if (sessionStorage.getItem('seeded')) return;
  if (s) localStorage.setItem(a, JSON.stringify(s));
  if (g) localStorage.setItem(b, JSON.stringify(g));
  sessionStorage.setItem('seeded', '1');
}, [LS_SET, LS_GAME, settings, game]);

test('rules: move generation matches the published perft counts', () => {
  // Counts from the chess programming wiki ("Perft Results"): start position, Kiwipete, positions 3–5
  const cases = [
    [C.START, [20, 400, 8902]],
    ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
    ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
    ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
    ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
  ];
  for (const [fen, counts] of cases) {
    const p = new C.Position(fen);
    expect(counts.map((_, i) => C.perft(p, i + 1)), fen).toEqual(counts);
    expect(p.fen(), 'position restored after the search').toBe(fen);
  }
});

test('rules: notation, castling, en passant, promotion and PGN', () => {
  const g = new C.Game();
  for (const m of ['e4', 'd5', 'exd5', 'c5', 'dxc6', 'Nf6', 'cxb7', 'Nbd7', 'bxa8=N', 'e6', 'Nf3', 'Bc5', 'Bb5', 'O-O', 'O-O', 'Qb6']) g.play(m);
  expect(g.log.map(m => m.flag)).toEqual([1, 1, 0, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 0]);
  expect(g.at('a8')).toEqual({ color: 'w', type: 'n' });
  expect(g.at('c5')).toEqual({ color: 'b', type: 'b' });
  expect(g.at('g1')).toEqual({ color: 'w', type: 'k' });
  expect(g.at('f8')).toEqual({ color: 'b', type: 'r' });
  expect(g.movetext()).toBe('1. e4 d5 2. exd5 c5 3. dxc6 Nf6 4. cxb7 Nbd7 5. bxa8=N e6 6. Nf3 Bc5 7. Bb5 O-O 8. O-O Qb6');
  // Disambiguation by file, by rank, check and mate marks
  const d = new C.Game('4k3/8/8/8/8/8/1N3N2/R3K2R w KQ - 0 1');
  const sans = d.legal().map(m => m.san);
  expect(sans).toEqual(expect.arrayContaining(['Nbd3', 'Nfd3', 'Rd1', 'Rf1', 'O-O', 'O-O-O']));
  expect(sans).not.toContain('Nd3');
  const r = new C.Game('7k/8/8/8/R7/8/8/R3K3 w - - 0 1');
  expect(r.legal().map(m => m.san)).toEqual(expect.arrayContaining(['R4a2', 'R1a2', 'R4a3', 'Ra8+']));
  expect(new C.Game('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1').find('a1a8').san).toBe('Ra8#');
  // Input: SAN with or without marks, castling with zeros, UCI; nonsense is refused
  const g2 = new C.Game();
  expect(g2.find('Nf3').uci).toBe('g1f3');
  expect(g2.find('g1f3').san).toBe('Nf3');
  expect(g2.find('e5')).toBe(null);
  expect(g2.find('Ke2')).toBe(null);
  expect(() => g2.play('Qh5')).toThrow('illegal');
  const pgn = g.pgn({ White: 'Anna', Black: 'Ben "B"' });
  expect(pgn).toContain('[White "Anna"]');
  expect(pgn).toContain('[Black "Ben B"]');
  expect(pgn).toContain('[Result "*"]');
  expect(pgn.trim().endsWith('Qb6 *')).toBe(true);
});

test('rules: checkmate, stalemate, repetition, fifty moves and too little material', () => {
  const mate = new C.Game();
  for (const m of ['f3', 'e5', 'g4', 'Qh4#']) mate.play(m);
  expect(mate.status()).toMatchObject({ over: true, result: '0-1', reason: 'checkmate', winner: 'b', check: true });
  expect(() => mate.play('a3')).toThrow('game_over');
  expect(new C.Game('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').status()).toMatchObject({ over: true, result: '1/2-1/2', reason: 'stalemate' });
  const rep = new C.Game();
  for (const m of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1']) { rep.play(m); expect(rep.status().over).toBe(false); }
  rep.play('Ng8');
  expect(rep.status()).toMatchObject({ over: true, reason: 'repetition' });
  rep.undo();
  expect(rep.status().over).toBe(false);
  const fifty = new C.Game('4k3/8/8/8/8/8/R7/4K3 w - - 99 80');
  expect(fifty.status().over).toBe(false);
  fifty.play('Rb2');
  expect(fifty.status()).toMatchObject({ over: true, reason: 'fifty' });
  for (const fen of ['4k3/8/8/8/8/8/8/4K3 w - - 0 1', '4k3/8/8/8/8/8/8/2N1K3 w - - 0 1', '4k3/2b5/8/8/8/8/8/2B1K3 w - - 0 1'])
    expect(new C.Game(fen).status().reason, fen).toBe('material');
  for (const fen of ['4k3/3b4/8/8/8/8/8/2B1K3 w - - 0 1', '4k3/8/8/8/8/8/8/1NN1K3 w - - 0 1', '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1'])
    expect(new C.Game(fen).status().over, fen).toBe(false);
  const res = new C.Game();
  res.resign('w');
  expect(res.status()).toMatchObject({ over: true, result: '0-1', reason: 'resign' });
  res.undo();
  expect(res.status().over).toBe(true); // nothing to take back: still resigned
  expect(() => new C.Game('8/8/8/8/8/8/8/8 w - - 0 1')).toThrow();
});

test('computer: takes mate in one and a free queen on every level, finds mate in two', () => {
  for (const level of ['easy', 'medium', 'hard', 'expert']) {
    for (let s = 1; s <= 3; s++) {
      expect(C.think('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', [], { level, rnd: seeded(s) }).uci, level).toBe('a1a8');
      expect(C.think('4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1', [], { level, rnd: seeded(s) }).uci, level).toBe('d1d5');
    }
  }
  // Mate in two: after the computer's move every reply allows a mate (checked with the rules, not the search)
  for (const level of ['hard', 'expert']) {
    const fen = '1k6/8/8/8/8/8/7R/R5K1 w - - 0 1';
    const first = C.think(fen, [], { level, rnd: seeded(5) }).uci;
    const g = new C.Game(fen);
    g.play(first);
    expect(g.legal().length).toBeGreaterThan(0);
    for (const reply of g.legal().map(m => m.uci)) {
      g.play(reply);
      const mates = g.legal().filter(m => { g.play(m.uci); const ok = g.status().reason === 'checkmate'; g.undo(); return ok; });
      expect(mates.length, `${first} ${reply}`).toBeGreaterThan(0);
      g.undo();
    }
  }
  // The search leaves the position as it was and honours the move history (positions and side to move)
  const r = C.think(C.START, ['e2e4', 'e7e5'], { level: 'medium', rnd: seeded(2) });
  const after = new C.Game();
  after.play('e4'); after.play('e5');
  expect(after.find(r.uci)).not.toBe(null);
  expect(C.think('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', [], { level: 'easy' })).toBe(null);
});

test('two players: tap to move, move dots, checkmate, undo and the game survives a reload', async ({ page }) => {
  await seed(page, { opp: 'human' });
  await page.goto('/chess/');
  await expect(page.locator('#status')).toHaveText('Weiß ist am Zug');
  await expect(page.locator('#moves li')).toHaveCount(0);
  // Only own pieces can be picked; a pawn on its start shows two targets
  await sq(page, 'e7').click();
  await expect(page.locator('#board .sq.sel')).toHaveCount(0);
  await sq(page, 'e2').click();
  await expect(sq(page, 'e2')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#board .sq.target')).toHaveCount(2);
  await sq(page, 'e2').click();
  await expect(page.locator('#board .sq.sel, #board .sq.target')).toHaveCount(0);
  await move(page, 'f2', 'f3');
  await expect(sq(page, 'f3')).toHaveAttribute('aria-label', 'f3, weißer Bauer');
  await expect(sq(page, 'f2')).toHaveAttribute('aria-label', 'f2, leer');
  await expect(page.locator('#board .sq.last')).toHaveCount(2);
  await expect(page.locator('#status')).toHaveText('Schwarz ist am Zug');
  await move(page, 'e7', 'e5');
  await move(page, 'g2', 'g4');
  await move(page, 'd8', 'h4');
  await expect(page.locator('#status')).toHaveText('Schachmatt – Schwarz gewinnt');
  await expect(page.locator('#moves')).toHaveText('1.f3e52.g4Dh4#');
  await expect(sq(page, 'e1')).toHaveClass(/check/);
  await expect(page.locator('#btnAgain')).toBeVisible();
  await expect(page.locator('#barTop .lead')).toHaveText('');
  // After the end nothing moves; undo goes back one move and the game goes on
  await sq(page, 'a2').click();
  await expect(page.locator('#board .sq.sel')).toHaveCount(0);
  await page.click('#btnUndo');
  await expect(page.locator('#status')).toHaveText('Schwarz ist am Zug');
  await expect(page.locator('#btnAgain')).toBeHidden();
  await page.reload();
  await expect(page.locator('#moves')).toHaveText('1.f3e52.g4');
  await expect(sq(page, 'g4')).toHaveAttribute('aria-label', 'g4, weißer Bauer');
  const saved = JSON.parse(await page.evaluate(k => localStorage.getItem(k), LS_GAME));
  expect(saved).toMatchObject({ opp: 'human', moves: ['f2f3', 'e7e5', 'g2g4'], ended: null });
});

test('two players: captures and material, promotion with a choice, flip and names', async ({ page }) => {
  await seed(page, { opp: 'human', names: { w: 'Anna', b: 'Ben' } }, { opp: 'human', start: '1n2k3/P6p/8/8/8/8/8/4K3 w - - 0 1', moves: [] });
  await page.goto('/chess/');
  await expect(page.locator('#status')).toHaveText('Anna ist am Zug');
  await expect(page.locator('#barBottom .pname')).toHaveText('Anna');
  await expect(page.locator('#barTop .pname')).toHaveText('Ben');
  // Promotion by capture: a dialog asks; closing it moves nothing
  await move(page, 'a7', 'b8');
  await expect(page.locator('#promoDlg')).toBeVisible();
  await page.locator('#promoDlg [data-close]').click();
  await expect(page.locator('#promoDlg')).toBeHidden();
  await expect(sq(page, 'a7')).toHaveAttribute('aria-label', 'a7, weißer Bauer');
  await move(page, 'a7', 'b8');
  await page.locator('#promoTiles [data-p="n"]').click();
  await expect(sq(page, 'b8')).toHaveAttribute('aria-label', 'b8, weißer Springer');
  await expect(page.locator('#moves')).toHaveText('1.axb8=S');
  await expect(page.locator('#barBottom .caps svg')).toHaveCount(1);
  await expect(page.locator('#barBottom .caps')).toHaveAttribute('aria-label', 'Geschlagen: Springer');
  await expect(page.locator('#barBottom .lead')).toHaveText('+2');
  await expect(page.locator('#barTop .lead')).toHaveText('');
  // Flip: black at the bottom, h1 top left
  await expect(page.locator('#board .sq').first()).toHaveAttribute('data-sq', 'a8');
  await page.click('#btnFlip');
  await expect(page.locator('#board .sq').first()).toHaveAttribute('data-sq', 'h1');
  await expect(page.locator('#barBottom .pname')).toHaveText('Ben');
  await expect(page.locator('#files')).toHaveText('hgfedcba');
  // Turning after every move (two players sitting opposite)
  await page.click('#btnFlip');
  await openMenu(page);
  await page.locator('#optAutoFlip').check();
  await closeMenu(page);
  await expect(page.locator('#board .sq').first()).toHaveAttribute('data-sq', 'h1'); // black to move at the bottom
  await move(page, 'e8', 'f7');
  await expect(page.locator('#board .sq').first()).toHaveAttribute('data-sq', 'a8');
});

test('two players: resign and agreed draw from the menu, both can be taken back; PGN is copied', async ({ page }) => {
  await seed(page, { opp: 'human', names: { w: 'Anna', b: '' } });
  await page.goto('/chess/');
  await openMenu(page);
  await expect(page.locator('#btnCopy')).toBeDisabled();
  await closeMenu(page);
  await move(page, 'e2', 'e4');
  await move(page, 'e7', 'e5');
  await move(page, 'g1', 'f3');
  await openMenu(page);
  await page.click('#btnResign');
  await expect(page.locator('#status')).toHaveText('Schwarz gibt auf – Anna gewinnt');
  await page.locator('.toast button').click();
  await expect(page.locator('#status')).toHaveText('Schwarz ist am Zug');
  await expect(page.locator('#moves li')).toHaveCount(3);
  await openMenu(page);
  await page.click('#btnDraw');
  await expect(page.locator('#status')).toHaveText('Remis vereinbart');
  await openMenu(page);
  await expect(page.locator('#btnResign')).toBeDisabled();
  await page.click('#btnCopy');
  const pgn = await clipboardText(page);
  expect(pgn).toContain('[White "Anna"]');
  expect(pgn).toContain('[Black "Schwarz"]');
  expect(pgn).toContain('[Result "1/2-1/2"]');
  expect(pgn).toContain('1. e4 e5 2. Nf3 1/2-1/2');
  await closeMenu(page);
  await page.click('#btnUndo');
  await expect(page.locator('#status')).toHaveText('Schwarz ist am Zug');
  await expect(page.locator('#moves li')).toHaveCount(3);
});

test('against the computer: it answers from the worker, undo takes back both moves, new game with undo', async ({ page }) => {
  await seed(page, { opp: 'cpu', color: 'w', level: 'easy' });
  await page.goto('/chess/');
  await expect(page.locator('#status')).toHaveText('Du bist am Zug');
  await expect(page.locator('#barTop .pname')).toHaveText('Computer (Leicht)');
  await expect(page.locator('#btnUndo')).toBeDisabled();
  await move(page, 'e2', 'e4');
  await expect(page.locator('#moves li')).toHaveCount(2);
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'turn');
  // Black pieces cannot be moved by the player
  await page.locator('#board .sq[aria-label*="schwarzer Bauer"]').first().click();
  await expect(page.locator('#board .sq.sel')).toHaveCount(0);
  await page.click('#btnUndo');
  await expect(page.locator('#moves li')).toHaveCount(0);
  await expect(sq(page, 'e2')).toHaveAttribute('aria-label', 'e2, weißer Bauer');
  await move(page, 'd2', 'd4');
  await expect(page.locator('#moves li')).toHaveCount(2);
  // The hint marks two squares of a legal move
  await page.click('#btnHint');
  await expect(page.locator('#board .sq.hint')).toHaveCount(2);
  // Playing black: a new game, the computer opens and the board is turned; undo restores the old game
  await openMenu(page);
  await page.click('#colors [data-c="b"]');
  await expect(page.locator('#moves li')).toHaveCount(1);
  await expect(page.locator('#board .sq').first()).toHaveAttribute('data-sq', 'h1');
  await expect(page.locator('#barBottom .pc.side')).toHaveClass(/\bb\b/);
  await expect(page.locator('#btnUndo')).toBeDisabled(); // only the computer's move: nothing of the player's to take back
  // The notice shows in the open menu and brings the old game back
  await expect(page.locator('.toast')).toContainText('Neue Partie');
  await page.locator('.toast button').click();
  await expect(page.locator('#moves li')).toHaveCount(2);
  await expect(page.locator('#board .sq').first()).toHaveAttribute('data-sq', 'a8');
  await expect(page.locator('#colors [data-c="w"]')).toHaveAttribute('aria-pressed', 'true');
  // The level applies right away without a new game
  await page.click('#levels [data-l="expert"]');
  await closeMenu(page);
  await expect(page.locator('#moves li')).toHaveCount(2);
  await expect(page.locator('#barTop .pname')).toHaveText('Computer (Profi)');
  const set = JSON.parse(await page.evaluate(k => localStorage.getItem(k), LS_SET));
  expect(set).toMatchObject({ opp: 'cpu', color: 'w', level: 'expert' });
});

test('against the computer: a reload while it is to move lets it answer; checkmate by the player ends the game', async ({ page }) => {
  // Black to move, the computer: it must answer after loading
  await seed(page, { opp: 'cpu', color: 'w', level: 'medium' }, { opp: 'cpu', human: 'w', moves: ['e2e4'] });
  await page.goto('/chess/');
  await expect(page.locator('#moves li')).toHaveCount(2);
  // A position where the player mates at once
  await page.evaluate(([k]) => localStorage.setItem(k, JSON.stringify({ opp: 'cpu', human: 'w', start: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', moves: [] })), [LS_GAME]);
  await page.reload();
  await move(page, 'a1', 'a8');
  await expect(page.locator('#status')).toHaveText('Schachmatt – du gewinnst');
  await expect(page.locator('#btnHint')).toBeDisabled();
  await page.click('#btnUndo');
  await expect(page.locator('#moves li')).toHaveCount(0);
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts and English piece letters', async ({ page }) => {
    await seed(page, { opp: 'human' });
    await page.goto('/chess/');
    await expect(page.locator('#status')).toHaveText('White to move');
    await move(page, 'g1', 'f3');
    await expect(page.locator('#moves')).toHaveText('1.Nf3');
    await expect(sq(page, 'f3')).toHaveAttribute('aria-label', 'f3, white knight');
    await expect(page.locator('#status')).toHaveText('Black to move');
  });
});
