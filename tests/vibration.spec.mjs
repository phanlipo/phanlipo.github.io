// Help section "Vibration" (scripts/partials/help-vibrate.html, written by build.mjs): every app whose own scripts
// vibrate explains that Android drops vibrations up to 1 second while "Haptic feedback" is off; the link opens
// the vibration test of the sensors app. Tools.vibrate itself is tested in tools.spec.mjs.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, apps, switchLang } from './helpers.mjs';
import { ROOT } from '../scripts/lib.mjs';

const ownScripts = folder => readdirSync(join(ROOT, folder)).filter(f => /\.(m?js|html)$/.test(f) && f !== 'sw.js')
  .map(f => readFileSync(join(ROOT, folder, f), 'utf8'));
const vibrating = apps().filter(a => ownScripts(a.folder).some(t => /\b(Tools|navigator)\.vibrate\(/.test(t))).map(a => a.folder);

test('apps that vibrate are found', () => {
  expect(vibrating).toEqual(expect.arrayContaining(['pinball', 'sensors', 'dice-coin', 'whip']));
});

test('every app that vibrates explains the Android setting, the others do not', () => {
  for (const a of apps()) {
    const html = readFileSync(join(ROOT, a.folder, 'index.html'), 'utf8');
    const block = html.match(/<!-- vibrate:start -->([\s\S]*?)<!-- vibrate:end -->/);
    if (vibrating.includes(a.folder)) {
      expect(block, a.folder).not.toBeNull();
      expect(block[1], a.folder).toContain('Haptisches Feedback');
      expect(block[1], a.folder).toContain('Haptic feedback');
      // In the help, before "Fehlersuche"
      expect(html.indexOf('<!-- vibrate:start -->'), a.folder).toBeLessThan(html.indexOf('data-i18n="diag.h"'));
    } else expect(block ? block[1].trim() : '', a.folder).toBe('');
  }
});

for (const folder of ['pinball', 'dice-coin']) {
  test(`${folder}: the help section on vibration in both languages; its link opens the vibration test`, async ({ page }) => {
    await page.goto(`/${folder}/`);
    const de = page.locator('details.help [data-lang="de"]', { has: page.locator('h3', { hasText: /^Vibration$/ }) });
    await expect(de).toContainText('Haptisches Feedback');
    await expect(de).toContainText('Vibration & haptisches Feedback');
    await switchLang(page, 'en');
    await expect(page.locator('details.help [data-lang="en"]', { has: page.locator('h3', { hasText: /^Vibration$/ }) })).toContainText('Haptic feedback');
    await expect(de.locator('a')).toHaveText('Handy-Sensoren → Vibration testen');
    const href = await de.locator('a').getAttribute('href');
    await page.goto(new URL(href, page.url()).href);
    await expect(page).toHaveURL(/\/sensors\/$/);
    await expect(page.locator('#p-vibe')).toBeVisible();
  });
}
