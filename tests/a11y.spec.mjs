// Accessibility (WCAG 2.1 A/AA) with axe-core – every page, light and dark, with help and data sections open.
import AxeBuilder from '@axe-core/playwright';
import { test, expect, apps, translatedApps } from './helpers.mjs';

const pages = [{ folder: '', title: 'Startseite' }, ...apps()];
// English too where a page is translated (texts of other length, lang attributes)
const english = new Set(['', ...translatedApps().map(a => a.folder)]);

for (const p of pages) {
  for (const [scheme, lang] of [['light', 'de'], ['dark', 'de'], ...(english.has(p.folder) ? [['light', 'en'], ['dark', 'en']] : [])]) {
    test(`${p.folder || 'start page'} has no accessibility violations (${scheme}${lang === 'en' ? ', English' : ''})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`/${p.folder ? p.folder + '/' : ''}?lang=${lang}`);
      // Check the content of collapsible sections too
      await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const summary = violations.map(v => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`);
      expect(summary).toEqual([]);
    });
  }
}
