// Shared UI rules of every app (UI-KONZEPT.md): Tabler icons from the shared sprite instead of emoji,
// header quick actions that leave the title readable, icon-only buttons with a name and the icon of the lexicon,
// toolbars that show their words only while there is room.
import { test, expect, apps, VIEWPORTS, openMenu, switchLang } from './helpers.mjs';

// Emoji: characters shown as emoji by default, or any pictograph turned into an emoji with U+FE0F
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/u;

// Lexicon (UI-KONZEPT.md, section 3): a button without visible text that says this must show that icon
export const LEXICON = [
  [/rückgängig|zurücknehmen|^undo/i, ['arrow-back-up']],
  [/^(wiederholen|redo)$/i, ['arrow-forward-up']],
  [/(teilen|^share.*)$/i, ['share']],
  [/(kopieren|^copy.*)$/i, ['copy']],
  [/^(einfügen|paste)$/i, ['clipboard']],
  [/(speichern|herunterladen|^save.*|^download.*)$/i, ['download']],
  [/^(vollbild|full ?screen)/i, ['maximize', 'minimize']],
  [/(bearbeiten|^edit.*)$/i, ['pencil']],
  [/(löschen|^delete.*)$/i, ['trash']],
  [/(schließen|^close.*)$/i, ['x']],
  [/(öffnen|^open.*)$/i, ['folder-open']],
  [/^(menü|menu)$/i, ['menu-2']],
];

// Texts and labels of the page that contain emoji (user input and marked data sets excepted)
const findEmoji = page => page.evaluate(src => {
  const re = new RegExp(src, 'u');
  const skip = 'script,style,noscript,textarea,input,[data-emoji-content]';
  const out = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (n.parentElement.closest(skip)) continue;
    if (re.test(n.data)) out.push(`${n.parentElement.tagName.toLowerCase()}: ${n.data.trim().slice(0, 60)}`);
  }
  for (const el of document.body.querySelectorAll('[aria-label],[title],[placeholder],[alt]')) {
    if (el.closest('[data-emoji-content]')) continue;
    for (const a of ['aria-label', 'title', 'placeholder', 'alt']) {
      const v = el.getAttribute(a);
      if (v && re.test(v)) out.push(`${el.tagName.toLowerCase()}[${a}]: ${v.slice(0, 60)}`);
    }
  }
  return out;
}, EMOJI.source);

// Icon-only buttons: header, toolbars, square .btn.icon – visible ones with their name and sprite icon
const iconButtons = page => page.evaluate(() => {
  const name = el => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
  return [...document.querySelectorAll('.head-btn, .toolbar > :is(button,label,a), .btn.icon')]
    .filter(el => el.checkVisibility && el.checkVisibility())
    .map(el => {
      const r = el.getBoundingClientRect();
      const use = el.querySelector('svg use');
      return { cls: el.className, name: name(el), title: el.getAttribute('title') || '', w: r.width, h: r.height,
        icon: use ? (use.getAttribute('href') || '').replace(/^.*icons\.svg#/, '') : null,
        sprite: !!use && /icons\.svg#/.test(use.getAttribute('href') || '') };
    });
});

for (const app of apps()) {
  test.describe(`${app.folder} · ui`, () => {
    const url = `/${app.folder}/`;

    test('no emoji in the interface (German and English)', async ({ page }) => {
      await page.goto(url);
      expect(await findEmoji(page), 'emoji in texts or labels').toEqual([]);
      await openMenu(page);
      expect(await findEmoji(page), 'emoji in the menu').toEqual([]);
      if (await page.locator('[data-set-lang="en"]').count()) {
        await switchLang(page, 'en');
        expect(await findEmoji(page), 'emoji in English').toEqual([]);
      }
    });

    test('icons come from the shared sprite and exist there', async ({ page, request }) => {
      await page.goto(url);
      const sprite = await (await request.get('/assets/icons.svg')).text();
      const ids = new Set([...sprite.matchAll(/<symbol id="([a-z0-9-]+)"/g)].map(m => m[1]));
      const refs = await page.evaluate(() => [...document.querySelectorAll('use')].map(u => u.getAttribute('href') || ''));
      const missing = refs.filter(h => /icons\.svg#/.test(h)).map(h => h.replace(/^.*#/, '')).filter(n => !ids.has(n));
      expect(missing, 'icons missing in assets/icons.svg').toEqual([]);
    });

    test('header: quick actions leave the title readable at 375 px, also with the update button', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobile);
      await page.goto(url);
      await page.evaluate(() => {
        const u = document.querySelector('.update-btn');
        if (u) { u.hidden = false; document.body.classList.add('update-ready'); }
      });
      // The page fits its title to the room left (common.js) – give it a frame to react
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const m = await page.evaluate(() => {
        const h1 = document.querySelector('body > header h1');
        const span = h1.querySelector('span') || h1;
        const r = span.getBoundingClientRect();
        const btns = [...document.querySelectorAll('body > header .head-btn')].filter(b => b.checkVisibility()).map(b => b.getBoundingClientRect());
        return {
          truncated: span.scrollWidth > span.clientWidth + 1, width: r.width, natural: span.scrollWidth,
          font: parseFloat(getComputedStyle(span).fontSize),
          overlap: btns.some(b => b.left < r.right - 1 && b.right > r.left + 1 && b.top < r.bottom - 1 && b.bottom > r.top + 1),
          outside: btns.some(b => b.right > innerWidth + 0.5 || b.left < -0.5),
          headerOverflow: document.querySelector('body > header').scrollWidth > document.querySelector('body > header').clientWidth + 1,
        };
      });
      expect(m.truncated, 'title cut off – move a quick action into the menu').toBe(false);
      expect(m.font, 'title shrunk below 14 px – move a quick action into the menu').toBeGreaterThanOrEqual(14);
      expect(m.width, 'title narrower than 96 px').toBeGreaterThanOrEqual(Math.min(96, m.natural) - 1);
      expect(m.overlap, 'buttons over the title').toBe(false);
      expect(m.outside, 'buttons outside the screen').toBe(false);
      expect(m.headerOverflow, 'header overflows').toBe(false);
    });

    test('multi-line text fields follow the standard (16 px text on phones, padding, 44 px, inside the screen)', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobile);
      await page.goto(url);
      const fields = await page.evaluate(() => [...document.querySelectorAll('textarea')].filter(el => el.checkVisibility()).map(el => {
        const cs = getComputedStyle(el), r = el.getBoundingClientRect();
        return { id: el.id || el.className, font: parseFloat(cs.fontSize), pad: parseFloat(cs.paddingInlineStart), h: r.height, right: r.right };
      }));
      for (const f of fields) {
        expect(f.font, `${f.id}: font size (iOS zooms below 16 px)`).toBeGreaterThanOrEqual(16);
        expect(f.pad, `${f.id}: padding`).toBeGreaterThanOrEqual(8);
        expect(f.h, `${f.id}: height`).toBeGreaterThanOrEqual(43.5);
        expect(f.right, `${f.id}: inside the screen`).toBeLessThanOrEqual(375.5);
      }
    });

    test('icon-only buttons: name, sprite icon of the lexicon, 44 px', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobile);
      await page.goto(url);
      for (const b of await iconButtons(page)) {
        expect(b.name, `${b.cls}: accessible name`).not.toBe('');
        expect(b.sprite, `${b.name}: icon from assets/icons.svg`).toBe(true);
        expect(b.w, `${b.name}: width`).toBeGreaterThanOrEqual(43.5);
        expect(b.h, `${b.name}: height`).toBeGreaterThanOrEqual(43.5);
        if (/\bhead-btn\b|\bicon\b/.test(b.cls)) {
          const rule = LEXICON.find(([re]) => re.test(b.name));
          if (rule) expect(rule[1], `${b.name}: icon of the lexicon (UI-KONZEPT.md)`).toContain(b.icon);
        }
      }
    });
  });
}

test.describe('toolbar', () => {
  // A toolbar shows its words while every item gets ≥ 64 px, otherwise only the icons (the word stays its name)
  const bar = n => `<div class="toolbar" id="tb" style="width:340px">${Array.from({ length: n }, (_, i) =>
    `<button type="button"${i ? '' : ' aria-pressed="true"'}><svg class="ic" aria-hidden="true"><use href="../assets/icons.svg#pencil"/></svg><span class="tb-label">Wort ${i + 1}</span></button>`).join('')}</div>`;
  for (const [n, shown] of [[4, true], [5, true], [6, false], [7, false]]) {
    test(`${n} items in 340 px: words ${shown ? 'shown' : 'hidden'}`, async ({ page }) => {
      await page.goto('/template/');
      await page.evaluate(html => document.querySelector('main').insertAdjacentHTML('afterbegin', html), bar(n));
      const items = page.locator('#tb > button');
      const label = items.first().locator('.tb-label');
      const box = await label.boundingBox();
      expect(box.width > 2, 'word visible').toBe(shown);
      for (const it of await items.all()) {
        const b = await it.boundingBox();
        expect(b.width).toBeGreaterThanOrEqual(40);
        expect(b.height).toBeGreaterThanOrEqual(44);
      }
      await expect(items.nth(1)).toHaveAccessibleName('Wort 2');
    });
  }
});
