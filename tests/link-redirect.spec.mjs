// Link-Weiterleitung: Weiterleitungen einrichten (Präfix/Suffix, Kodieren, https:// entfernen), geteilte Links sofort
// weiterleiten, Schutz gegen offene Weiterleitung, Verwalten im Menü.
import { test, expect, openMenu, closeMenu, switchLang, clipboardText } from './helpers.mjs';

const TARGET = 'https://target.example';
const RULES = 'link-redirect.rules.v1';
const SET = 'link-redirect.settings.v1';

/** Stores redirects before the page loads */
async function seed(page, rules, settings) {
  await page.addInitScript(([RULES, SET, rules, settings]) => {
    if (!location.pathname.startsWith('/link-redirect/')) return; // also runs on about:blank and the target page
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(RULES, JSON.stringify(rules));
    if (settings) localStorage.setItem(SET, JSON.stringify(settings));
  }, [RULES, SET, rules, settings]);
}
const rule = (o = {}) => ({ id: 'a', name: '', prefix: `${TARGET}/?url=`, suffix: '', encode: true, strip: false, ...o });

test('first start shows only the setup form; adding a redirect shows the address field with the target link', async ({ page }) => {
  await page.goto('/link-redirect/');
  await expect(page.locator('#setupCard')).toBeVisible();
  await expect(page.locator('#mainCard')).toBeHidden();
  await page.fill('#prefix', 'https://test.de/?url=');
  await page.fill('#suffix', '&lang=de');
  await expect(page.locator('#rulePreview')).toHaveText('https://test.de/?url=https%3A%2F%2Fwww.example.com%2Fa%3Fb%3D1&lang=de');
  await page.click('#btnSave');
  await expect(page.locator('#setupCard')).toBeHidden();
  await expect(page.locator('#mainCard')).toBeVisible();
  await page.fill('#url', 'www.example.com');
  await expect(page.locator('#target')).toHaveText('https://test.de/?url=www.example.com&lang=de');
  await expect(page.locator('#targetLabel')).toHaveText('Ziel-Link (test.de):');
  const stored = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), RULES);
  expect(stored).toEqual([expect.objectContaining({ prefix: 'https://test.de/?url=', suffix: '&lang=de', encode: true, strip: false, name: '' })]);
});

test('without encoding and without https:// the address goes into the path as typed', async ({ page }) => {
  await seed(page, [rule({ prefix: 'https://test.de/', encode: false, strip: true })]);
  await page.goto('/link-redirect/');
  await page.fill('#url', 'Schau mal: https://www.example.com/a?b=1 toll');
  await expect(page.locator('#target')).toHaveText('https://test.de/www.example.com/a?b=1');
});

test('a prefix that would let the address change the domain is rejected (no open redirect)', async ({ page }) => {
  await page.goto('/link-redirect/');
  await page.fill('#prefix', 'https://test.de');
  await page.click('#btnSave');
  await expect(page.locator('#ruleError')).toContainText('nicht sicher auf test.de');
  await page.fill('#prefix', 'javascript:alert(1)//');
  await page.click('#btnSave');
  await expect(page.locator('#ruleError')).toContainText('https://');
  await expect(page.locator('#setupCard')).toBeVisible();
  expect(await page.evaluate(k => localStorage.getItem(k), RULES)).toBeNull();
});

test.describe('redirecting', () => {
  test.use({ allowedProblems: /external request: https:\/\/target\.example\// });
  test.beforeEach(async ({ page }) => {
    await page.route(`${TARGET}/**`, r => r.fulfill({ contentType: 'text/html', body: '<title>Ziel</title>' }));
  });

  test('a shared link redirects at once with the selected redirect, without staying in the history', async ({ page }) => {
    await seed(page, [rule({ id: 'a', name: 'Eins' }), rule({ id: 'b', name: 'Zwei', prefix: `${TARGET}/go/`, encode: false, strip: true })], { current: 'b', onShare: 'auto' });
    await page.goto('/link-redirect/?title=Seite&text=&url=' + encodeURIComponent('https://www.example.com/x?y=1'));
    await page.waitForURL(`${TARGET}/go/www.example.com/x?y=1`);
    // location.replace: "back" does not land on the redirect page again (which would redirect once more)
    await page.goBack();
    expect(page.url()).not.toContain('/link-redirect/');
  });

  test('a link inside the shared text is found; the button redirects in manual use', async ({ page }) => {
    await seed(page, [rule()]);
    await page.goto('/link-redirect/?text=' + encodeURIComponent('Lies das https://www.example.com/a&b'));
    await page.waitForURL(`${TARGET}/?url=${encodeURIComponent('https://www.example.com/a&b')}`);
    await page.goto('/link-redirect/');
    await page.fill('#url', 'www.example.com');
    await page.click('#btnGo');
    await page.waitForURL(`${TARGET}/?url=www.example.com`);
  });

  test('"show first" fills in the shared link and waits for a tap', async ({ page }) => {
    await seed(page, [rule()], { current: 'a', onShare: 'ask' });
    await page.goto('/link-redirect/?url=' + encodeURIComponent('https://www.example.com'));
    await expect(page.locator('#url')).toHaveValue('https://www.example.com');
    await expect(page.locator('#target')).toHaveText(`${TARGET}/?url=https%3A%2F%2Fwww.example.com`);
    await expect(page).toHaveURL(/\/link-redirect\/$/);
    await page.click('#btnGo');
    await page.waitForURL(`${TARGET}/?url=https%3A%2F%2Fwww.example.com`);
  });
});

test('a stored redirect whose link would leave its domain does not redirect a shared link', async ({ page }) => {
  // e.g. an old or hand-edited backup with a prefix without "/"
  await seed(page, [rule({ prefix: 'https://test.de', encode: false })]);
  await page.goto('/link-redirect/?url=' + encodeURIComponent('.evil.example/'));
  await expect(page).toHaveURL(/\/link-redirect\/$/);
  await expect(page.locator('#urlError')).toContainText('test.de');
  await expect(page.locator('#btnGo')).toBeDisabled();
});

test('copy link copies the target link', async ({ page }) => {
  await seed(page, [rule()]);
  await page.goto('/link-redirect/');
  await expect(page.locator('#btnGo')).toBeDisabled();
  await expect(page.locator('#target')).toHaveText('Adresse eintragen, dann erscheint hier der Ziel-Link.');
  await page.fill('#url', 'https://www.example.com/?a=1&b=2');
  await page.click('#btnCopy');
  expect(await clipboardText(page)).toBe(`${TARGET}/?url=https%3A%2F%2Fwww.example.com%2F%3Fa%3D1%26b%3D2`);
});

test('manage: add a second redirect, pick it, edit it, delete it with undo', async ({ page }) => {
  await seed(page, [rule({ name: 'Archiv' })]);
  await page.goto('/link-redirect/');
  await expect(page.locator('#ruleChips')).toBeHidden();
  await openMenu(page);
  await page.locator('#manageCard > summary').click();
  await page.click('#btnNew');
  await page.fill('#prefix', 'https://lesen.example/p/');
  await page.uncheck('#optEncode');
  await page.click('#btnSave');
  await expect(page.locator('#ruleChips button')).toHaveText(['Archiv', 'lesen.example']);
  await expect(page.locator('#ruleChips button').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.fill('#url', 'www.example.com');
  await expect(page.locator('#target')).toHaveText('https://lesen.example/p/www.example.com');
  await page.locator('#ruleChips button').first().click();
  await expect(page.locator('#target')).toHaveText(`${TARGET}/?url=www.example.com`);

  await openMenu(page);
  await page.locator('#manageCard > summary').click();
  await page.getByRole('button', { name: 'Bearbeiten: lesen.example' }).click();
  await expect(page.locator('#prefix')).toHaveValue('https://lesen.example/p/');
  await page.fill('#ruleName', 'Lesen');
  await page.click('#btnSave');
  await page.getByRole('button', { name: 'Löschen: Lesen' }).click();
  await expect(page.locator('#ruleList li')).toHaveCount(1);
  await page.locator('#toast button').click();
  await expect(page.locator('#ruleList li')).toHaveCount(2);
  await closeMenu(page);
  await page.reload();
  await expect(page.locator('#ruleChips button')).toHaveText(['Archiv', 'Lesen']);
});

test('switching the language re-renders texts written by the script', async ({ page }) => {
  await seed(page, [rule({ name: 'Archiv' })]);
  await page.goto('/link-redirect/');
  await switchLang(page, 'en');
  await expect(page.locator('#target')).toHaveText('Enter an address and the target link shows up here.');
  await expect(page.locator('#targetLabel')).toHaveText('Target link (Archiv):');
  await expect(page.locator('#btnGo')).toHaveText('Redirect');
});
