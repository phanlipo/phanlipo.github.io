// Stand-in API for the API Check tests: specs and endpoints on https://api.example.test, answered by
// Playwright routes (nothing leaves the machine). Every request the page sends is recorded.

export const ORIGIN = 'https://api.example.test';
/** For test.use({ allowedProblems }) – the page talks to the stand-in API on purpose */
export const API_PROBLEMS = /api\.example\.test|Failed to load resource/;

// OpenAPI 3 in YAML: tags, path-level parameter, enum and array query parameters, header parameter,
// request body with $ref/allOf/readOnly, server variable, API key security scheme
export const OPENAPI_YAML = `openapi: 3.0.3
info:
  title: Test API
  version: "1.2"
servers:
  - url: ${ORIGIN}/{version}
    variables:
      version:
        default: v1
security:
  - key: []
paths:
  /pets:
    get:
      tags: [pets]
      operationId: listPets
      summary: List pets
      parameters:
        - name: status
          in: query
          schema: { type: string, enum: [available, sold] }
        - name: tags
          in: query
          schema: { type: array, items: { type: string } }
        - name: limit
          in: query
          schema: { type: integer, default: 20 }
    post:
      tags: [pets]
      operationId: addPet
      summary: Add a pet
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/Pet' }
          application/x-www-form-urlencoded:
            schema: { $ref: '#/components/schemas/Pet' }
  /pets/{petId}:
    parameters:
      - name: petId
        in: path
        required: true
        schema: { type: integer }
    get:
      tags: [pets]
      operationId: getPet
      summary: Find pet by ID
      description: Returns a single pet.
      parameters:
        - name: X-Trace
          in: header
          schema: { type: string }
    delete:
      tags: [pets]
      operationId: deletePet
      deprecated: true
  /health:
    get:
      operationId: health
      summary: Health check
components:
  securitySchemes:
    key:
      type: apiKey
      in: header
      name: X-API-Key
  schemas:
    Base:
      type: object
      properties:
        id: { type: integer, readOnly: true }
        name: { type: string, example: Rex }
    Pet:
      allOf:
        - $ref: '#/components/schemas/Base'
        - type: object
          required: [name]
          properties:
            status: { type: string, enum: [available, sold] }
            born: { type: string, format: date }
            vaccinated: { type: boolean }
            tags:
              type: array
              items: { type: string }
`;
/** Example body the app should build for POST /pets (independently written down from the schema above) */
export const PET_EXAMPLE = { name: 'Rex', status: 'available', born: 'DATE', vaccinated: false, tags: ['string'] };

// Swagger 2.0 in JSON: host/basePath/schemes, body parameter, formData parameters, basic auth
export const SWAGGER_JSON = JSON.stringify({
  swagger: '2.0',
  info: { title: 'Old API', version: '0.9' },
  host: 'api.example.test',
  basePath: '/old',
  schemes: ['https'],
  securityDefinitions: { basic: { type: 'basic' } },
  paths: {
    '/login': {
      post: {
        operationId: 'login',
        consumes: ['application/x-www-form-urlencoded'],
        parameters: [
          { name: 'user', in: 'formData', type: 'string', required: true },
          { name: 'remember', in: 'formData', type: 'boolean' },
        ],
      },
    },
    '/items': {
      put: {
        operationId: 'putItems',
        parameters: [{ name: 'body', in: 'body', required: true, schema: { $ref: '#/definitions/Item' } }],
      },
    },
  },
  definitions: { Item: { type: 'object', properties: { sku: { type: 'string', example: 'A-1' }, qty: { type: 'integer', minimum: 1 } } } },
});

/**
 * Installs the stand-in API on the page's context. Answers CORS preflights like a well-behaved server.
 * handler(req) may return { status, headers, body } to override the default echo response.
 * Returns the list of recorded (non-preflight) requests.
 */
export async function mockApi(page, { handler } = {}) {
  const seen = [];
  await page.context().route(`${ORIGIN}/**`, async route => {
    const r = route.request();
    const corsHeaders = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
      'access-control-allow-headers': (await r.headerValue('access-control-request-headers')) || '*',
      'access-control-expose-headers': 'x-request-id',
    };
    if (r.method() === 'OPTIONS' && (await r.headerValue('access-control-request-method')))
      return route.fulfill({ status: 204, headers: corsHeaders });
    const url = new URL(r.url());
    if (url.pathname === '/openapi.yaml') return route.fulfill({ status: 200, headers: { ...corsHeaders, 'content-type': 'application/yaml' }, body: OPENAPI_YAML });
    if (url.pathname === '/swagger.json') return route.fulfill({ status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' }, body: SWAGGER_JSON });
    const req = { method: r.method(), url: r.url(), path: url.pathname, query: [...url.searchParams], headers: await r.allHeaders(), body: r.postData() };
    seen.push(req);
    const custom = handler ? await handler(req) : null;
    const res = custom || { status: 200, headers: { 'content-type': 'application/json', 'x-request-id': 'abc' }, body: JSON.stringify({ ok: true, method: req.method, path: req.path }) };
    return route.fulfill({ status: res.status, headers: { ...corsHeaders, ...res.headers }, body: res.body });
  });
  return seen;
}

/** Creates a configuration from the YAML spec URL (no base URL – the spec's server is used) */
export async function addYamlConfig(page, name = 'Test') {
  await page.locator('#cfgSel').selectOption('');
  await page.fill('#cfgName', name);
  await page.fill('#specUrl', `${ORIGIN}/openapi.yaml`);
  await page.click('#btnSave');
  await page.locator('#specInfo').filter({ hasText: 'Test API' }).waitFor();
}
