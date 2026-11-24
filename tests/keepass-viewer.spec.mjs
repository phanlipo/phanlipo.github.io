// KeePass-Betrachter: read-only KDBX viewer. The databases in fixtures/keepass/ were written by KeePassXC 2.7
// (KDBX 3.1) and pykeepass (KDBX 4 variants) and checked with keepassxc-cli – see fixtures/keepass/README.md.
// Stream cipher and AES-KDF vectors were computed independently with PyCryptodome, TOTP with node:crypto
// and the RFC 6238 table.
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { test, expect, openMenu, closeMenu, switchLang, clipboardText, mockLaunchQueue, axe, expectNoHorizontalScroll } from './helpers.mjs';

const URL_ = '/keepass-viewer/';
const fx = name => readFileSync(new URL(`./fixtures/keepass/${name}`, import.meta.url));
const F = name => ({ name, mimeType: 'application/octet-stream', buffer: fx(name) });
const PW = 'test-passwort';

async function unlock(page, name = 'kdbx4-argon2d-chacha20.kdbx', { password = PW, key = null } = {}) {
  await page.setInputFiles('#fileIn', F(name));
  await expect(page.locator('#fileName')).toHaveText(name);
  if (key) await page.setInputFiles('#keyIn', F(key));
  if (password != null) await page.fill('#pw', password);
  await page.click('#btnUnlock');
}
const rows = page => page.locator('#list > li');
const names = page => page.locator('#list .name');

// TOTP (RFC 6238, SHA-1) computed here with node:crypto – independent of the page's WebCrypto code
function totp(base32, ms, digits = 6, period = 30) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = '';
  for (const c of base32) bits += A.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2)));
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(ms / 1000 / period)));
  const h = createHmac('sha1', key).update(msg).digest(); const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 10 ** digits).padStart(digits, '0');
}

test.describe('crypto building blocks', () => {
  test.beforeEach(async ({ page }) => { await page.goto(URL_); });

  test('ChaCha20, Salsa20 and AES-KDF match PyCryptodome', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
      const seq = (n, from = 0) => Uint8Array.from({ length: n }, (_, i) => from + i);
      const { chacha20, salsa20, xorStream, aesKdf } = KDBX._test;
      // two calls on one stream = one keystream (as for the protected values of a database)
      const s = xorStream(salsa20(seq(32), seq(8)));
      const salsa = hex(s(new Uint8Array(100))) + hex(s(new Uint8Array(30)));
      const chacha = hex(xorStream(chacha20(seq(32), seq(12)))(new Uint8Array(130)));
      const kdf = hex(await aesKdf(seq(32, 50), seq(32, 100), 1000));
      return { salsa, chacha, kdf };
    });
    expect(r.salsa).toBe('2ead0f5f185729ced672b3a928e454f72fdb44a87b9cd8d219e4ec14aef9c6bc77bf057f5659d7753848f8d3fe769ca5fdd8057d46326990e5f136e2fcb7bb7ca13a2b59d9047b8dbeb93ec4b78ce1a59bc210641318ccce694d30ff81d2afe7bdf5a3d58cb4f9a4ed5247823e14618f06dc61cfe4b8e2ba836783b280efedca8740');
    expect(r.chacha).toBe('103af111c18b549d39248fb07d60c29a95d1db88d892f7b4af709a5fd47a9e4bd5ff9a658dd52c708bef1f0f622b3747040fa3551300b1f293150a88620d5fed89fb08002917a540b7833ff3981d0e63c970b2e75174adb9e6972fc575c0a63cec802cf3e61eb198373276d865948f237e84a974fd28b89b12b8d907904f9ed67978');
    expect(r.kdf).toBe('de0d8d592a482c0372d9c7dab7161f9cd1a420600515ece7a1f42638ee337050');
  });

  test('TOTP: RFC 6238 vectors, KeePass 2 and KeePassXC field formats', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const at = (fields, ms) => { const s = TOTP.fromEntry({ fields: Object.entries(fields).map(([key, value]) => ({ key, value })) }); return s ? TOTP.code(s, ms) : null; };
      const k20 = '12345678901234567890', k32 = '12345678901234567890123456789012';
      return [
        await at({ 'TimeOtp-Secret': k20, 'TimeOtp-Length': '8' }, 59000),
        await at({ 'TimeOtp-Secret': k20, 'TimeOtp-Length': '8' }, 1111111109000),
        await at({ 'TimeOtp-Secret': k32, 'TimeOtp-Length': '8', 'TimeOtp-Algorithm': 'HMAC-SHA-256' }, 59000),
        await at({ 'TimeOtp-Secret-Hex': '3132333435363738393031323334353637383930', 'TimeOtp-Length': '8' }, 2000000000000),
        await at({ otp: 'otpauth://totp/x?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&digits=8' }, 1234567890000),
        await at({ 'TOTP Seed': 'GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ', 'TOTP Settings': '30;8' }, 20000000000000),
        await at({ 'TOTP Seed': 'GEZDGNBVGY3TQOJQ', 'TOTP Settings': '30;S' }, 0),
        await at({ otp: 'otpauth://hotp/x?secret=GEZDGNBVGY3TQOJQ&counter=1' }, 0),
      ];
    });
    expect(r).toEqual(['94287082', '07081804', '46119246', '69279037', '89005924', '65353130', null, null]);
  });

  test('key files: XML version 1 and 2 with hash check, 64 hex characters, other files hashed', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
      const enc = s => new TextEncoder().encode(s);
      const { keyFileHash } = KDBX._test;
      const xml = h => enc(`<?xml version="1.0"?><KeyFile><Meta><Version>2.0</Version></Meta><Key><Data Hash="${h}">00010203 04050607</Data></Key></KeyFile>`);
      let bad = null;
      try { await keyFileHash(xml('00000000')); } catch (e) { bad = e.code; }
      const v1 = enc('<?xml version="1.0"?>\n<KeyFile>\n<Meta><Version>1.00</Version></Meta>\n<Key><Data>AAECAwQFBgc=</Data></Key>\n</KeyFile>');
      return { xml: hex(await keyFileHash(xml('8A851FF8'))), v1: hex(await keyFileHash(v1)), bad, hexKey: hex(await keyFileHash(enc('ab'.repeat(32)))),
        other: hex(await keyFileHash(enc('abc'))) };
    });
    expect(r.xml).toBe('0001020304050607');
    expect(r.v1).toBe('0001020304050607');
    expect(r.bad).toBe('keyfile');
    expect(r.hexKey).toBe('ab'.repeat(32));
    expect(r.other).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'); // SHA-256("abc")
  });
});

for (const [file, opts] of [
  ['kdbx3-aeskdf-salsa20.kdbx', {}],
  ['kdbx4-aeskdf-aes.kdbx', {}],
  ['kdbx4-argon2d-chacha20.kdbx', {}],
  ['kdbx4-argon2id-keyfile.kdbx', { key: 'test.keyx' }],
  ['kdbx4-keyfile-only.kdbx', { password: null, key: 'test-binary.key' }],
]) {
  test(`opens ${file} and reads protected values`, async ({ page }) => {
    await page.goto(URL_);
    await unlock(page, file, opts);
    await expect(page.locator('#vaultCard')).toBeVisible();
    await expect(page.locator('#lockCard')).toBeHidden();
    await expect(page.locator('#h-group')).toHaveText('Testtresor');
    // groups first, then entries; the recycle bin is not shown
    await expect(names(page)).toHaveText(['Bank', 'Mail']);
    await expect(page.locator('#list .meta')).toHaveText(['1 Eintrag', 'anna@example.org']);
    await page.locator('#list .open', { hasText: 'Bank' }).click();
    await expect(names(page)).toHaveText(['Girokonto']);
    await page.getByRole('button', { name: 'Passwort kopieren: Girokonto' }).click();
    // the protected value after one in an entry's history: the inner stream is used in document order
    expect(await clipboardText(page)).toBe('Bank-Pässwört€');
  });
}

test('wrong password or missing key file: message, nothing shown, retry works', async ({ page }) => {
  await page.goto(URL_);
  await unlock(page, 'kdbx4-argon2d-chacha20.kdbx', { password: 'falsch' });
  await expect(page.locator('#err')).toHaveText('Passwort oder Schlüsseldatei falsch.');
  await expect(page.locator('#vaultCard')).toBeHidden();
  await unlock(page, 'kdbx3-aeskdf-salsa20.kdbx', { password: 'falsch' });
  await expect(page.locator('#err')).toHaveText('Passwort oder Schlüsseldatei falsch.');
  await unlock(page, 'kdbx4-argon2id-keyfile.kdbx');
  await expect(page.locator('#err')).toHaveText('Passwort oder Schlüsseldatei falsch.');
  await page.setInputFiles('#keyIn', F('test.keyx'));
  await expect(page.locator('#keyName')).toHaveText('test.keyx');
  await page.fill('#pw', PW);
  await page.click('#btnUnlock');
  await expect(page.locator('#vaultCard')).toBeVisible();
  await expect(page.locator('#err')).toHaveText('');
  // nothing entered at all
  await page.click('#btnLock');
  await page.click('#btnKeyX');
  await page.click('#btnUnlock');
  await expect(page.locator('#err')).toHaveText('Bitte Passwort eingeben oder Schlüsseldatei wählen.');
});

test('other files are refused with a clear message', async ({ page }) => {
  await page.goto(URL_);
  await page.setInputFiles('#fileIn', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hallo welt, das ist kein Tresor') });
  await expect(page.locator('#err')).toHaveText('Das ist keine KeePass-Datei (.kdbx).');
  await expect(page.locator('#pickArea')).toBeVisible();
  const kdb = Buffer.alloc(124); kdb.writeUInt32LE(0x9AA2D903, 0); kdb.writeUInt32LE(0xB54BFB65, 4);
  await page.setInputFiles('#fileIn', { name: 'alt.kdb', mimeType: 'application/octet-stream', buffer: kdb });
  await expect(page.locator('#err')).toContainText('KeePass-1-Dateien (.kdb) werden nicht unterstützt');
  // a truncated database: the header is read, decryption reports damage
  await page.setInputFiles('#fileIn', { name: 'kaputt.kdbx', mimeType: 'application/octet-stream', buffer: fx('kdbx4-aeskdf-aes.kdbx').subarray(0, 400) });
  await page.fill('#pw', PW);
  await page.click('#btnUnlock');
  await expect(page.locator('#err')).toHaveText('Die Datei ist beschädigt oder unvollständig.');
});

test('entry: fields hidden until shown, each copyable, link, notes, one-time code', async ({ page }) => {
  const now = Date.UTC(2026, 10, 24, 12, 0, 10);
  await page.clock.install({ time: now });
  await page.goto(URL_);
  await unlock(page);
  await page.locator('#list .open', { hasText: 'Mail' }).click();
  await expect(page.locator('#entryCard')).toBeVisible();
  await expect(page.locator('#vaultCard')).toBeHidden();
  await expect(page.locator('#h-entry')).toHaveText('Mail');
  const field = label => page.locator('#fields > li', { has: page.locator('.meta', { hasText: new RegExp(`^${label}$`) }) });
  await expect(field('Benutzername').locator('.val')).toHaveText('anna@example.org');
  await expect(field('Passwort').locator('.val')).toHaveText('••••••••');
  await expect(field('PIN').locator('.val')).toHaveText('••••••••');
  await field('Passwort').getByRole('button', { name: 'Passwort zeigen' }).click();
  await expect(field('Passwort').locator('.val')).toHaveText('S3cr3t-Mail!');
  await expect(field('Passwort').getByRole('button', { name: 'Passwort verbergen' })).toHaveAttribute('aria-pressed', 'true');
  await field('PIN').getByRole('button', { name: 'PIN kopieren' }).click();
  expect(await clipboardText(page)).toBe('4711');
  await expect(page.locator('.toast')).toContainText('PIN kopiert – wird in 30 s geleert');
  await field('Benutzername').getByRole('button', { name: 'Benutzername kopieren' }).click();
  expect(await clipboardText(page)).toBe('anna@example.org');
  const link = field('Adresse').locator('a');
  await expect(link).toHaveAttribute('href', 'https://mail.example.org');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(field('Notizen').locator('.val')).toHaveText('Zeile eins\nZeile zwei');
  // the otp field is shown as a code, not as a raw field
  await expect(field('otp')).toHaveCount(0);
  const code = totp('JBSWY3DPEHPK3PXP', now);
  await expect(field('Einmalcode').locator('.otp')).toHaveText(`${code.slice(0, 3)} ${code.slice(3)}`);
  await expect(field('Einmalcode').locator('.otp-left')).toHaveText('noch 20 s');
  await field('Einmalcode').getByRole('button', { name: 'Einmalcode kopieren' }).click();
  expect(await clipboardText(page)).toBe(code);
  await page.clock.runFor(21000);
  const next = totp('JBSWY3DPEHPK3PXP', now + 21000);
  await expect(field('Einmalcode').locator('.otp')).toHaveText(`${next.slice(0, 3)} ${next.slice(3)}`);
  // back to the list, focus on the entry again
  await page.click('#btnBack');
  await expect(page.locator('#vaultCard')).toBeVisible();
  await expect(page.locator('#list .open', { hasText: 'Mail' })).toBeFocused();
});

test('search across groups by title, user name and address; the recycle bin stays out', async ({ page }) => {
  await page.goto(URL_);
  await unlock(page);
  await page.fill('#q', 'giro');
  await expect(page.locator('#h-group')).toHaveText('Treffer: 1');
  await expect(names(page)).toHaveText(['Girokonto']);
  await expect(page.locator('#list .meta')).toHaveText('12345678 · Bank');
  await page.fill('#q', 'example');
  await expect(names(page)).toHaveText(['Girokonto', 'Mail']);
  await page.fill('#q', 'mail anna');
  await expect(names(page)).toHaveText(['Mail']);
  await page.fill('#q', 'Geloescht');
  await expect(rows(page)).toHaveText(['Keine Treffer.']);
  await page.fill('#q', '');
  await expect(names(page)).toHaveText(['Bank', 'Mail']);
});

test('locks by the button, after the idle time and optionally in the background; the clipboard is cleared', async ({ page }) => {
  await page.clock.install();
  await page.goto(URL_);
  await unlock(page);
  await expect(page.locator('#btnLock')).toBeVisible();
  await page.click('#btnLock');
  await expect(page.locator('#vaultCard')).toBeHidden();
  await expect(page.locator('#list > li')).toHaveCount(0);
  await expect(page.locator('#fileName')).toHaveText('kdbx4-argon2d-chacha20.kdbx');
  await expect(page.locator('#pw')).toHaveValue('');
  await expect(page.locator('#btnLock')).toBeHidden();
  // idle: 5 minutes by default
  await page.fill('#pw', PW); await page.click('#btnUnlock');
  await expect(page.locator('#vaultCard')).toBeVisible();
  await page.getByRole('button', { name: 'Passwort kopieren: Mail' }).click();
  expect(await clipboardText(page)).toBe('S3cr3t-Mail!');
  await page.clock.runFor(31000);
  expect(await clipboardText(page)).toBe('');
  await page.clock.runFor(4 * 60000);
  await expect(page.locator('#vaultCard')).toBeVisible();
  await page.clock.runFor(30000);
  await expect(page.locator('#vaultCard')).toBeHidden();
  await expect(page.locator('.toast')).toContainText('Automatisch gesperrt');
  // setting: lock when the app goes to the background
  await openMenu(page);
  await page.locator('#appMenu summary', { hasText: 'Einstellungen' }).click();
  await page.locator('#optHidden').check();
  await page.locator('#lockAfter button', { hasText: '1 Min.' }).click();
  await closeMenu(page);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('keepass-viewer.settings.v1')))).toMatchObject({ lockHidden: true, lockMin: 1 });
  await page.fill('#pw', PW); await page.click('#btnUnlock');
  await expect(page.locator('#vaultCard')).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#vaultCard')).toBeHidden();
});

test('the encrypted file survives a reload, never the password; it can be forgotten', async ({ page }) => {
  await page.goto(URL_);
  await unlock(page, 'kdbx4-argon2id-keyfile.kdbx', { key: 'test.keyx' });
  await expect(page.locator('#vaultCard')).toBeVisible();
  await page.reload();
  await expect(page.locator('#fileName')).toHaveText('kdbx4-argon2id-keyfile.kdbx');
  await expect(page.locator('#vaultCard')).toBeHidden();
  // the key file is not kept
  await expect(page.locator('#keyName')).toHaveText('');
  const stored = await page.evaluate(async () => {
    const c = await caches.open('file:keepass-viewer');
    const keys = await c.keys();
    const all = { ls: JSON.stringify(localStorage), keys: keys.map(k => k.url) };
    all.size = (await (await c.match(keys[0])).arrayBuffer()).byteLength;
    return all;
  });
  expect(stored.keys).toHaveLength(1);
  expect(stored.size).toBe(fx('kdbx4-argon2id-keyfile.kdbx').length);
  expect(stored.ls).not.toContain(PW);
  await page.setInputFiles('#keyIn', F('test.keyx'));
  await page.fill('#pw', PW); await page.click('#btnUnlock');
  await expect(names(page)).toHaveText(['Bank', 'Mail']);
  await openMenu(page);
  await page.locator('#btnForget').click();
  await expect(page.locator('#pickArea')).toBeVisible();
  await page.reload();
  await expect(page.locator('#pickArea')).toBeVisible();
  expect(await page.evaluate(async () => (await (await caches.open('file:keepass-viewer')).keys()).length)).toBe(0);
});

test('"keep the file" off: nothing is kept', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('keepass-viewer.settings.v1', JSON.stringify({ keep: false })));
  await page.goto(URL_);
  await unlock(page);
  await expect(page.locator('#vaultCard')).toBeVisible();
  await page.reload();
  await expect(page.locator('#pickArea')).toBeVisible();
});

test('opens a file shared to the app ("Open with")', async ({ page }) => {
  await mockLaunchQueue(page, [F('kdbx3-aeskdf-salsa20.kdbx')]);
  await page.goto(URL_ + '?opened=1');
  await expect(page.locator('#fileName')).toHaveText('kdbx3-aeskdf-salsa20.kdbx');
  await expect(page.locator('#pw')).toBeFocused();
});

test('works offline: Argon2 worker and hash-wasm come from the offline cache', async ({ page, context }) => {
  await page.goto(URL_);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await unlock(page, 'kdbx4-argon2id-keyfile.kdbx', { key: 'test.keyx' });
  await expect(names(page)).toHaveText(['Bank', 'Mail']);
  await context.setOffline(false);
});

test('diagnostics describe the file but contain no secrets or entry names', async ({ page }) => {
  await page.goto(URL_);
  await unlock(page);
  await page.locator('#list .open', { hasText: 'Mail' }).click();
  await page.getByRole('button', { name: 'Passwort kopieren' }).click();
  const text = await page.evaluate(() => Tools.diag.text());
  expect(text).toContain('argon2d');
  expect(text).toContain('chacha20');
  expect(text).toContain('unlocked');
  for (const secret of [PW, 'S3cr3t', 'Mail', 'Girokonto', 'anna', 'Testtresor', 'kdbx4-argon2d', 'JBSWY3DP']) expect(text).not.toContain(secret);
});

for (const scheme of ['light', 'dark']) {
  test(`unlocked list and entry: accessible (${scheme}), no horizontal scrolling at 375 px`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(URL_);
    await unlock(page);
    expect((await axe(page).analyze()).violations.map(v => v.id)).toEqual([]);
    await expectNoHorizontalScroll(page);
    await page.locator('#list .open', { hasText: 'Mail' }).click();
    await page.getByRole('button', { name: 'Passwort zeigen' }).click();
    expect((await axe(page).analyze()).violations.map(v => v.id)).toEqual([]);
    await expectNoHorizontalScroll(page);
  });
}

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts, messages and field names in English', async ({ page }) => {
    await page.goto(URL_);
    await expect(page.locator('#pickArea strong')).toHaveText('Choose KeePass file');
    await unlock(page, 'kdbx4-aeskdf-aes.kdbx', { password: 'wrong' });
    await expect(page.locator('#err')).toHaveText('Wrong password or key file.');
    await page.fill('#pw', PW); await page.click('#btnUnlock');
    await page.fill('#q', 'mail');
    await expect(page.locator('#h-group')).toHaveText('Results: 1');
    await page.locator('#list .open').click();
    await expect(page.getByRole('button', { name: 'Show Password' })).toBeVisible();
    await expect(page.locator('#fields .meta', { hasText: 'One-time code' })).toBeVisible();
    await switchLang(page, 'de');
    await expect(page.getByRole('button', { name: 'Passwort zeigen' })).toBeVisible();
  });
});
