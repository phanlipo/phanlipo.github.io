// API Check: OpenAPI 3 (YAML) and Swagger 2 (JSON) become request forms; requests go to a stand-in API
// (tests/api-mock.mjs, Playwright routes) and are checked as the server receives them.
import { test, expect, clipboardText, openMenu, switchLang } from './helpers.mjs';
import { ORIGIN, API_PROBLEMS, OPENAPI_YAML, PET_EXAMPLE, SWAGGER_JSON, mockApi, addYamlConfig } from './api-mock.mjs';

const URL_ = '/api-check/';
const op = (page, key) => page.locator(`#ops button[data-key="${key}"]`);
const param = (page, name) => page.locator('#params .field').filter({ has: page.locator('.mono', { hasText: new RegExp(`^${name}$`) }) }).locator('input, select');

test.use({ allowedProblems: API_PROBLEMS });

test.describe('API Check', () => {
  test('YAML spec from a URL: summary, grouped endpoints, sign-in from the spec, saved', async ({ page }) => {
    await mockApi(page);
    await page.goto(URL_);
    await expect(page.locator('#specInfo')).toContainText('Noch keine Konfiguration');
    await expect(page.locator('#cfgEdit')).toHaveJSProperty('open', true);
    await addYamlConfig(page, 'Meine API');
    await expect(page.locator('#specInfo')).toHaveText('OpenAPI 3.0.3 · Test API 1.2 · 5 Endpunkte');
    await expect(page.locator('#cfgSel option:checked')).toHaveText('Meine API');
    await expect(page.locator('#opsCount')).toHaveText('5');
    // Free request first, then the tag group, then untagged
    await expect(page.locator('#ops h3')).toHaveText(['pets', 'Weitere']);
    await expect(page.locator('#ops button .path')).toHaveText(['Freie Anfrage', '/pets', '/pets', '/pets/{petId}', '/pets/{petId}', '/health']);
    await expect(op(page, 'DELETE /pets/{petId}')).toHaveClass(/dep/);
    // API key scheme from the spec is preselected (header X-API-Key)
    await expect(page.locator('#authBox')).toBeVisible();
    await expect(page.locator('#authType')).toHaveValue('apikey');
    await expect(page.locator('#authKeyName')).toHaveValue('X-API-Key');
    await expect(page.locator('#authKeyIn')).toHaveValue('header');
    // Filter
    await page.fill('#opFilter', 'health');
    await expect(page.locator('#ops button .path')).toHaveText(['/health']);
    await page.fill('#opFilter', 'zzz');
    await expect(page.locator('#ops')).toContainText('Kein Endpunkt passt.');
    // Saved: after a reload the configuration and spec are still there
    await page.reload();
    await expect(page.locator('#specInfo')).toHaveText('OpenAPI 3.0.3 · Test API 1.2 · 5 Endpunkte');
    await expect(page.locator('#cfgEdit')).toHaveJSProperty('open', false);
  });

  test('GET with path, query (enum, array, default), header parameter and API key – as the server receives it', async ({ page }) => {
    const seen = await mockApi(page, { handler: req => req.path === '/v1/pets/7' ? { status: 200, headers: { 'content-type': 'application/json', 'x-request-id': 'r-1' }, body: '{"id":7,"name":"Rex"}' } : null });
    await page.goto(URL_);
    await addYamlConfig(page);
    await page.locator('#authBox summary').click();
    await page.fill('#authKeyValue', 'geheim-123');

    await op(page, 'GET /pets/{petId}').click();
    await expect(page.locator('#h-req')).toHaveText('GET/pets/{petId}');
    await expect(page.locator('#reqDesc')).toHaveText('Find pet by ID\n\nReturns a single pet.');
    // Server from the spec with its variable filled in
    await expect(page.locator('#server')).toHaveValue(`${ORIGIN}/v1`);
    await param(page, 'petId').fill('7');
    await param(page, 'X-Trace').fill('t-9');
    // Preview never shows the key
    await expect(page.locator('#preview')).toHaveText(`GET ${ORIGIN}/v1/pets/7`);
    await page.click('#btnSend');
    await expect(page.locator('#resHead .badge')).toHaveText(/^200\b/);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: 'GET', path: '/v1/pets/7', query: [] });
    expect(seen[0].headers['x-api-key']).toBe('geheim-123');
    expect(seen[0].headers['x-trace']).toBe('t-9');
    // Pretty-printed JSON, readable header exposed by the server
    await expect(page.locator('#resBody pre')).toHaveText('{\n  "id": 7,\n  "name": "Rex"\n}');
    await expect(page.locator('#resHead')).toContainText('application/json');
    await page.locator('#resHdrs summary').click();
    await expect(page.locator('#hdrList')).toContainText('x-request-id: r-1');

    await op(page, 'GET /pets').click();
    await expect(param(page, 'limit')).toHaveValue('20'); // default from the spec
    await param(page, 'status').selectOption('sold');
    await param(page, 'tags').fill('a, b');
    await page.click('#btnSend');
    await expect(page.locator('#resHead .badge')).toHaveText(/^200\b/);
    expect(seen[1].path).toBe('/v1/pets');
    expect(seen[1].query).toEqual([['status', 'sold'], ['tags', 'a'], ['tags', 'b'], ['limit', '20']]);
  });

  test('POST: example body from the schema ($ref, allOf, readOnly left out), JSON and form', async ({ page }) => {
    const seen = await mockApi(page, { handler: () => ({ status: 201, headers: { 'content-type': 'application/json' }, body: '{"id":1}' }) });
    await page.goto(URL_);
    await addYamlConfig(page);
    await op(page, 'POST /pets').click();
    await expect(page.locator('#bodyStar')).toBeVisible();
    await expect(page.locator('#bodyType option')).toHaveText(['application/json', 'application/x-www-form-urlencoded']);
    const today = new Date().toISOString().slice(0, 10);
    const expected = { ...PET_EXAMPLE, born: today };
    expect(JSON.parse(await page.inputValue('#body'))).toEqual(expected);
    // Keys in schema order (allOf: Base first), nicely indented
    expect(await page.inputValue('#body')).toBe(JSON.stringify(expected, null, 2));
    await page.click('#btnSend');
    await expect(page.locator('#resHead .badge')).toHaveText(/^201\b/);
    expect(seen[0].headers['content-type']).toBe('application/json');
    expect(JSON.parse(seen[0].body)).toEqual(expected);

    // Same body as a form
    await page.locator('#bodyType').selectOption('application/x-www-form-urlencoded');
    await expect(page.locator('#bodyHint')).toBeVisible();
    await page.fill('#body', '{"name":"Bello & Co","tags":["x","y"],"vaccinated":true}');
    await page.click('#btnSend');
    await expect.poll(() => seen.length).toBe(2);
    expect(seen[1].headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect([...new URLSearchParams(seen[1].body)]).toEqual([['name', 'Bello & Co'], ['tags', 'x'], ['tags', 'y'], ['vaccinated', 'true']]);
  });

  test('wrong input is caught before sending: required field, invalid JSON, form without object', async ({ page }) => {
    const seen = await mockApi(page);
    await page.goto(URL_);
    await addYamlConfig(page);
    await op(page, 'GET /pets/{petId}').click();
    await page.click('#btnSend');
    await expect(page.locator('#reqErr')).toHaveText('Pflichtfeld fehlt: petId');
    await expect(param(page, 'petId')).toHaveAttribute('aria-invalid', 'true');
    await param(page, 'petId').fill('1');
    await expect(param(page, 'petId')).not.toHaveClass(/invalid/);

    await op(page, 'POST /pets').click();
    await page.fill('#body', '{"name":');
    await page.click('#btnSend');
    await expect(page.locator('#reqErr')).toContainText('Inhalt ist kein gültiges JSON');
    await page.fill('#body', '');
    await page.click('#btnSend');
    await expect(page.locator('#reqErr')).toHaveText('Pflichtfeld fehlt: Inhalt (Body)');
    await page.locator('#bodyType').selectOption('application/x-www-form-urlencoded');
    await page.fill('#body', '[1,2]');
    await page.click('#btnSend');
    await expect(page.locator('#reqErr')).toHaveText('Für dieses Format den Inhalt als JSON-Objekt eingeben.');
    expect(seen).toHaveLength(0);
  });

  test('Swagger 2 pasted as text: server from host/basePath, form parameters, body parameter, basic sign-in', async ({ page }) => {
    const seen = await mockApi(page);
    await page.goto(URL_);
    await page.fill('#cfgName', 'Alt');
    await page.click('[data-src=text]');
    await page.fill('#specText', SWAGGER_JSON);
    await page.click('#btnSave');
    await expect(page.locator('#specInfo')).toHaveText('Swagger 2.0 · Old API 0.9 · 2 Endpunkte');
    await expect(page.locator('#authType')).toHaveValue('basic');
    await page.locator('#authBox summary').click();
    await page.fill('#authUser', 'anna');
    await page.fill('#authPass', 'pässwort');

    await op(page, 'POST /login').click();
    await expect(page.locator('#server')).toHaveValue(`${ORIGIN}/old`);
    expect(JSON.parse(await page.inputValue('#body'))).toEqual({ user: 'string', remember: false });
    await page.fill('#body', '{"user":"anna","remember":true}');
    await page.click('#btnSend');
    await expect(page.locator('#resHead .badge')).toHaveText(/^200\b/);
    expect(seen[0].path).toBe('/old/login');
    expect(seen[0].body).toBe('user=anna&remember=true');
    // Basic = base64 of UTF-8 "user:password"
    expect(seen[0].headers.authorization).toBe('Basic ' + Buffer.from('anna:pässwort', 'utf8').toString('base64'));

    await op(page, 'PUT /items').click();
    expect(JSON.parse(await page.inputValue('#body'))).toEqual({ sku: 'A-1', qty: 1 });
    await page.click('#btnSend');
    await expect.poll(() => seen.length).toBe(2);
    expect(seen[1]).toMatchObject({ method: 'PUT', path: '/old/items' });
    expect(JSON.parse(seen[1].body)).toEqual({ sku: 'A-1', qty: 1 });
  });

  test('spec from a file (YAML) and a base URL that overrides the spec servers', async ({ page }) => {
    const seen = await mockApi(page);
    await page.goto(URL_);
    await page.fill('#baseUrl', `${ORIGIN}/staging/`);
    await page.click('[data-src=file]');
    await page.locator('#specFile').setInputFiles({ name: 'openapi.yaml', mimeType: 'application/yaml', buffer: Buffer.from(OPENAPI_YAML) });
    await expect(page.locator('#fileName')).toContainText('openapi.yaml');
    await page.click('#btnSave');
    // Name from the spec title when left empty
    await expect(page.locator('#cfgSel option:checked')).toHaveText('Test API');
    await op(page, 'GET /health').click();
    await expect(page.locator('#server option')).toHaveText([`${ORIGIN}/staging`, `${ORIGIN}/v1`]);
    await page.click('#btnSend');
    await expect(page.locator('#resHead .badge')).toHaveText(/^200\b/);
    expect(seen[0].path).toBe('/staging/health');
  });

  test('free request without a spec; text and images in the response', async ({ page }) => {
    const seen = await mockApi(page, {
      handler: req => req.path === '/logo' ? { status: 200, headers: { 'content-type': 'image/png' }, body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') }
        : { status: 404, headers: { 'content-type': 'text/plain' }, body: 'nicht da' },
    });
    await page.goto(URL_);
    await page.fill('#cfgName', 'Ohne Spec');
    await page.fill('#baseUrl', ORIGIN);
    await page.click('#btnSave');
    await expect(page.locator('#specInfo')).toHaveText('Ohne Spezifikation – nur freie Anfragen.');
    await expect(page.locator('#ops button')).toHaveCount(1);
    await op(page, 'free').click();
    await page.locator('#freeMethod').selectOption('DELETE');
    await page.fill('#freePath', '/things/5?force=1');
    await expect(page.locator('#preview')).toHaveText(`DELETE ${ORIGIN}/things/5?force=1`);
    await page.click('#btnSend');
    await expect(page.locator('#resHead .badge')).toHaveText(/^404\b/);
    await expect(page.locator('#resHead .badge')).toHaveClass(/err/);
    await expect(page.locator('#resBody pre')).toHaveText('nicht da');
    expect(seen[0]).toMatchObject({ method: 'DELETE', path: '/things/5', query: [['force', '1']] });
    // Full URL in the path field, image response
    await page.locator('#freeMethod').selectOption('GET');
    await page.fill('#freePath', `${ORIGIN}/logo`);
    await page.click('#btnSend');
    await expect(page.locator('#resBody img')).toBeVisible();
    expect(await page.locator('#resBody img').evaluate(i => i.naturalWidth)).toBe(1);
    expect(seen).toHaveLength(2);
  });

  test('no response (server down or no CORS): clear message mentioning CORS, cancel works', async ({ page }) => {
    await mockApi(page);
    await page.goto(URL_);
    await addYamlConfig(page);
    // The browser only says "failed to fetch" – same for a server that is down and a missing CORS header
    await page.context().route(`${ORIGIN}/v1/health`, r => r.abort('failed'));
    await op(page, 'GET /health').click();
    await page.click('#btnSend');
    await expect(page.locator('#resErr')).toContainText('CORS');
    await expect(page.locator('#btnSend')).toBeEnabled();

    // Cancel a hanging request
    await page.context().unroute(`${ORIGIN}/**`);
    await page.context().route(`${ORIGIN}/**`, () => {}); // never answers
    await page.click('#btnSend');
    await expect(page.locator('#resHead')).toHaveText('Wird gesendet …');
    await page.click('#btnAbort');
    await expect(page.locator('#resErr')).toHaveText('Abgebrochen.');
  });

  test('a spec that cannot be fetched or is not OpenAPI is reported and nothing is saved', async ({ page }) => {
    await mockApi(page, { handler: req => req.path === '/missing.json' ? { status: 404, headers: {}, body: '' } : null });
    await page.goto(URL_);
    await page.fill('#specUrl', `${ORIGIN}/missing.json`);
    await page.click('#btnSave');
    await expect(page.locator('#cfgErr')).toContainText('Spezifikation nicht ladbar (HTTP 404)');
    await page.click('[data-src=text]');
    await page.fill('#specText', 'title: kein openapi');
    await page.click('#btnSave');
    await expect(page.locator('#cfgErr')).toHaveText('Keine OpenAPI- oder Swagger-Spezifikation (Feld „openapi“ bzw. „swagger: 2.0“ fehlt).');
    await page.fill('#specText', 'openapi: [3');
    await page.click('#btnSave');
    await expect(page.locator('#cfgErr')).toContainText('YAML fehlerhaft');
    await page.fill('#specText', '{"openapi": ');
    await page.click('#btnSave');
    await expect(page.locator('#cfgErr')).toContainText('JSON fehlerhaft');
    await page.click('[data-src=url]');
    await page.fill('#specUrl', 'ftp://x');
    await page.click('#btnSave');
    await expect(page.locator('#cfgErr')).toHaveText('Bitte eine gültige Adresse mit https:// angeben.');
    expect(await page.evaluate(() => localStorage.getItem('api-check.configs.v1'))).toBeNull();
  });

  test('credentials are only stored with the tick; never in the diagnostics', async ({ page }) => {
    await mockApi(page);
    await page.goto(URL_);
    await addYamlConfig(page);
    await page.locator('#authBox summary').click();
    await page.fill('#authKeyValue', 'TOPSECRET');
    expect(await page.evaluate(() => localStorage.getItem('api-check.configs.v1'))).not.toContain('TOPSECRET');
    await page.reload();
    await expect(page.locator('#authKeyValue')).toHaveValue('');
    await expect(page.locator('#authKeyName')).toHaveValue(''); // nothing of the sign-in kept without the tick
    await page.locator('#authBox summary').click();
    await page.locator('#authType').selectOption('bearer');
    await page.fill('#authToken', 'TOPSECRET');
    await page.check('#authSave');
    expect(await page.evaluate(() => localStorage.getItem('api-check.configs.v1'))).toContain('TOPSECRET');
    await page.reload();
    await expect(page.locator('#authType')).toHaveValue('bearer');
    await expect(page.locator('#authToken')).toHaveValue('TOPSECRET');
    await op(page, 'GET /health').click();
    await page.click('#btnSend');
    await expect(page.locator('#resHead .badge')).toHaveText(/^200\b/);
    await openMenu(page);
    await page.locator('details.help summary').click();
    await page.click('[data-diag=copy]');
    const report = await clipboardText(page);
    expect(report).toContain('app: api-check');
    expect(report).toContain('auth: bearer');
    expect(report).toMatch(/response 200/);
    expect(report).not.toContain('TOPSECRET');
    expect(report).not.toContain('example.test');
  });

  test('copy as curl and copy the response', async ({ page }) => {
    await mockApi(page);
    await page.goto(URL_);
    await addYamlConfig(page);
    await page.locator('#authBox summary').click();
    await page.fill('#authKeyValue', "k'1");
    await op(page, 'POST /pets').click();
    await page.fill('#body', '{"name":"O\'Neil"}');
    await page.click('#btnCurl');
    await expect(page.locator('#toast')).toHaveText('curl-Befehl kopiert');
    expect(await clipboardText(page)).toBe(
      `curl -X POST '${ORIGIN}/v1/pets' -H 'X-API-Key: k'\\''1' -H 'Content-Type: application/json' --data-raw '{"name":"O'\\''Neil"}'`);
    await page.click('#btnSend');
    await expect(page.locator('#resHead .badge')).toHaveText(/^200\b/);
    await page.click('#btnCopyRes');
    expect(JSON.parse(await clipboardText(page))).toEqual({ ok: true, method: 'POST', path: '/v1/pets' });
  });

  test('history in the menu fills the form again, across configurations', async ({ page }) => {
    const seen = await mockApi(page);
    await page.goto(URL_);
    await addYamlConfig(page, 'Eins');
    await op(page, 'GET /pets/{petId}').click();
    await param(page, 'petId').fill('42');
    await page.click('#btnSend');
    await expect(page.locator('#resHead .badge')).toHaveText(/^200\b/);
    await addYamlConfig(page, 'Zwei');
    await expect(page.locator('#cfgSel option')).toHaveText(['Eins', 'Zwei', '+ Neue Konfiguration']);
    await expect(page.locator('#reqCard')).toBeHidden();

    await openMenu(page);
    await expect(page.locator('#histCount')).toHaveText('1');
    await expect(page.locator('#hist .path')).toHaveText(['/pets/{petId}']);
    await expect(page.locator('#hist .meta')).toContainText(/200 · \d+ ms · .* · Eins/);
    await page.locator('#hist button').click();
    await expect(page.locator('dialog.menu-sheet')).toBeHidden();
    await expect(page.locator('#cfgSel option:checked')).toHaveText('Eins');
    await expect(param(page, 'petId')).toHaveValue('42');
    await page.click('#btnSend');
    await expect.poll(() => seen.length).toBe(2);
    expect(seen[1].path).toBe('/v1/pets/42');

    // Clear (asks first)
    await openMenu(page);
    page.once('dialog', d => d.accept());
    await page.click('#btnClearHist');
    await expect(page.locator('#histCount')).toHaveText('0');
    await expect(page.locator('#histEmpty')).toBeVisible();
  });

  test('reload spec from its URL, delete a configuration (asks first)', async ({ page }) => {
    let title = 'Test API';
    await mockApi(page);
    await page.context().route(`${ORIGIN}/openapi.yaml`, r => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: OPENAPI_YAML.replace('title: Test API', `title: ${title}`) }));
    await page.goto(URL_);
    await addYamlConfig(page, 'Eins');
    title = 'Test API Neu';
    await page.locator('#cfgEdit summary').click();
    await page.click('#btnReload');
    await expect(page.locator('#specInfo')).toHaveText('OpenAPI 3.0.3 · Test API Neu 1.2 · 5 Endpunkte');
    await page.locator('#cfgEdit summary').click();
    page.once('dialog', d => d.dismiss());
    await page.click('#btnDelete');
    await expect(page.locator('#cfgSel option')).toHaveCount(2);
    page.once('dialog', d => d.accept());
    await page.click('#btnDelete');
    await expect(page.locator('#cfgSel option')).toHaveText(['+ Neue Konfiguration']);
    await expect(page.locator('#opsCard')).toBeHidden();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('api-check.configs.v1')))).toEqual([]);
  });

  test('works offline: saved spec, form and history without network (only the API call needs it)', async ({ page, context }) => {
    await mockApi(page);
    await page.goto(URL_);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await addYamlConfig(page);
    await page.reload(); // controlled by the service worker
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#specInfo')).toHaveText('OpenAPI 3.0.3 · Test API 1.2 · 5 Endpunkte');
    await op(page, 'POST /pets').click();
    expect(JSON.parse(await page.inputValue('#body')).name).toBe('Rex');
    // YAML library is cached too
    expect(await page.evaluate(() => window.jsyaml.load('a: [1, 2]'))).toEqual({ a: [1, 2] });
    await context.setOffline(false);
  });

  test.describe('English', () => {
    test.use({ locale: 'en-US' });
    test('texts, messages and endpoint list in English', async ({ page }) => {
      await mockApi(page);
      await page.goto(URL_);
      await expect(page.locator('#specInfo')).toHaveText('No configuration yet – enter API URL and spec under “Edit”.');
      await page.fill('#specUrl', `${ORIGIN}/openapi.yaml`);
      await page.click('#btnSave');
      await expect(page.locator('#specInfo')).toHaveText('OpenAPI 3.0.3 · Test API 1.2 · 5 endpoints');
      await expect(page.locator('#ops h3')).toHaveText(['pets', 'Other']);
      await op(page, 'GET /pets/{petId}').click();
      await expect(page.locator('#params .in').first()).toHaveText('(path, integer)');
      await page.click('#btnSend');
      await expect(page.locator('#reqErr')).toHaveText('Required field missing: petId');
      await switchLang(page, 'de');
      await expect(page.locator('#specInfo')).toHaveText('OpenAPI 3.0.3 · Test API 1.2 · 5 Endpunkte');
      await expect(page.locator('#params .in').first()).toHaveText('(Pfad, integer)');
    });
  });
});
