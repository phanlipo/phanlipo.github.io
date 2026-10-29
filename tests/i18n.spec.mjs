// German/English: language choice (shared by all apps), start page, translated apps, manifests.
// German is the default and is covered by all other tests; here the English side.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, tools, apps, translatedApps, VIEWPORTS, expectNoHorizontalScroll } from './helpers.mjs';
import { ROOT, meta } from '../scripts/lib.mjs';

const translated = translatedApps().map(a => a.folder);
const untranslated = apps().filter(a => !translated.includes(a.folder));
const html = folder => readFileSync(join(ROOT, folder, 'index.html'), 'utf8');
const storedLang = page => page.evaluate(() => localStorage.getItem('tools.lang.v1'));

test.describe('browser language English', () => {
  test.use({ locale: 'en-US' });

  test('start page is English: texts, cards, filter', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle('phanlipo – App Shelf');
    await expect(page.locator('h1')).toHaveText('App Shelf');
    await expect(page.locator('footer .footer-common')).toContainText('AI-generated');
    await expect(page.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    // Nothing chosen yet: the browser language is used, nothing is stored
    expect(await storedLang(page)).toBeNull();

    const list = tools();
    for (const t of list) {
      const card = page.locator('.tool', { has: page.locator('h2', { hasText: t.titleEn }) });
      await expect(card.locator('p')).toHaveText(t.descriptionEn);
      await expect(card.getByRole('link', { name: t.titleEn, exact: true })).toHaveAttribute('href', `${t.folder}/`);
    }
    // Filter by an English category; the German tag value behind it stays the same
    await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Games', exact: true }).click();
    for (const t of list) {
      const card = page.locator('.tool', { has: page.locator('h2', { hasText: t.titleEn }) });
      await expect(card).toBeVisible({ visible: t.tags.includes('Spiele') });
    }
    await expect(page.locator('.tool:visible .tag.match').first()).toHaveText('Games');
    await expect(page.locator('.filter-status')).toHaveText(`${list.filter(t => t.tags.includes('Spiele')).length} of ${list.length} pages: Games`);
    await expectNoHorizontalScroll(page);
  });

  test('?lang=de in the address wins over the browser language', async ({ page }) => {
    await page.goto('/?lang=de');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.locator('h1')).toHaveText('App-Regal');
  });

  for (const folder of translated) {
    test(`${folder}: every text has an English version`, async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobile);
      await page.goto(`/${folder}/`);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page).toHaveTitle(meta(html(folder), 'tool:title-en'));
      await expect(page.locator('meta[name="apple-mobile-web-app-title"]'))
        .toHaveAttribute('content', meta(html(folder), 'tool:short-name-en'));
      expect(await page.evaluate(() => Tools.i18nMissing()), 'texts without English translation').toEqual([]);
      // Help: only the English block, German summary translated
      const help = page.locator('details.help');
      await expect(help.locator('summary')).toHaveText('Instructions & notes');
      await help.locator('summary').click();
      await expect(help.locator('[data-lang="en"]')).toBeVisible();
      await expect(help.locator('[data-lang="de"]')).toBeHidden();
      await expect(page.locator('details.data summary')).toHaveText('Back up & transfer data');
      await expectNoHorizontalScroll(page);
    });
  }

  for (const app of untranslated) {
    test(`${app.folder}: not translated yet – stays German, no language switch`, async ({ page }) => {
      await page.goto(`/${app.folder}/`);
      await expect(page.locator('html')).toHaveAttribute('lang', 'de');
      await expect(page.locator('.footer-lang')).toBeHidden();
      await expect(page.locator('footer .footer-common')).toContainText('KI-generiert');
    });
  }
});

test.describe('language switch', () => {
  test('choice is shared by all apps and survives a reload', async ({ page }) => {
    const app = translated[0];
    expect(app, 'at least one translated app').toBeTruthy();
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator('h1')).toHaveText('App Shelf');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(await storedLang(page)).toBe('"en"');
    await page.reload();
    await expect(page.locator('h1')).toHaveText('App Shelf');

    await page.goto(`/${app}/`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.getByRole('button', { name: 'Deutsch' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.locator('details.help summary')).toHaveText('Anleitung & Hinweise');
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('App-Regal');
  });

  test('an explicit choice replaces ?lang= in the address', async ({ page }) => {
    await page.goto('/?lang=en');
    await expect(page.locator('h1')).toHaveText('App Shelf');
    await page.getByRole('button', { name: 'Deutsch' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.reload();
    await expect(page.locator('h1')).toHaveText('App-Regal');
  });

  test('the switch meets the touch-target size', async ({ page }) => {
    await page.goto('/');
    for (const name of ['Deutsch', 'English']) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

  for (const folder of translated) {
    test(`${folder}: language is not part of the app backup and survives deleting the app data`, async ({ page }) => {
      await page.goto(`/${folder}/`);
      await page.getByRole('button', { name: 'English' }).click();
      const exported = await page.evaluate(() => Tools.data.exportData());
      expect(Object.keys(exported.data)).not.toContain('tools.lang.v1');
      await page.evaluate(() => Tools.data.clearData());
      expect(await storedLang(page)).toBe('"en"');
    });
  }
});

test('manifests carry the English names', async ({ request }) => {
  for (const app of apps()) {
    const m = await (await request.get(`/${app.folder}/manifest.webmanifest`)).json();
    const page = html(app.folder);
    expect(m.lang).toBe('de');
    expect(m.name_localized, app.folder).toEqual({ en: meta(page, 'tool:title-en') });
    expect(m.description_localized, app.folder).toEqual({ en: meta(page, 'tool:description-en') });
    expect(m.short_name_localized.en.length, `${app.folder} English short name`).toBeLessThanOrEqual(12);
  }
});

test('every listed tool has an English title and description', async () => {
  // Needed by the start page and the manifest (build.mjs stops without them)
  for (const t of tools()) {
    expect(t.titleEn, t.folder).toBeTruthy();
    expect(t.descriptionEn, t.folder).toBeTruthy();
  }
});

