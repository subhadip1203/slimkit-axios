const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const upstream = require('axios');
const lite = require('../src/index.cjs');

async function withServer(t, handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}

const fetchClients = [['axios', upstream.create({ adapter: 'fetch' })], ['lite-axios', lite.create({ adapter: 'fetch' })]];

test('fetch adapters send equivalent methods, params, JSON and authentication', async t => {
  const baseURL = await withServer(t, (request, response) => {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ method: request.method, url: request.url, body, type: request.headers['content-type'], authorization: request.headers.authorization }));
    });
  });
  const results = [];
  for (const [, client] of fetchClients) {
    results.push((await client.post(`${baseURL}/items`, { ok: true }, { params: { tags: ['a', 'b'] }, auth: { username: 'user', password: 'pass' } })).data);
  }
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[1].authorization, `Basic ${Buffer.from('user:pass').toString('base64')}`);
});

test('fetch adapters expose equivalent response and HTTP error fields', async t => {
  const baseURL = await withServer(t, (request, response) => {
    response.statusCode = request.url === '/missing' ? 404 : 201;
    response.setHeader('x-test', 'yes');
    response.end(request.url === '/missing' ? '{"error":"missing"}' : '{"created":true}');
  });
  for (const [, client] of fetchClients) {
    const response = await client.get(`${baseURL}/created`);
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('x-test'), 'yes');
    assert.deepEqual(response.data, { created: true });
    assert.equal(response.config.method, 'get');
    assert.ok(response.request);
    await assert.rejects(client.get(`${baseURL}/missing`), error => error.response.status === 404 && error.response.data.error === 'missing' && error.code === 'ERR_BAD_REQUEST');
    assert.equal((await client.get(`${baseURL}/missing`, { validateStatus: status => status === 404 })).status, 404);
  }
});

test('fetch adapters support binary and streaming response types', async t => {
  const baseURL = await withServer(t, (_request, response) => { response.setHeader('content-type', 'application/octet-stream'); response.end(Buffer.from([1, 2, 3, 4])); });
  for (const [, client] of fetchClients) {
    const array = await client.get(baseURL, { responseType: 'arraybuffer' });
    assert.deepEqual([...new Uint8Array(array.data)], [1, 2, 3, 4]);
    const blob = await client.get(baseURL, { responseType: 'blob' });
    assert.equal(blob.data.size, 4);
    const stream = await client.get(baseURL, { responseType: 'stream' });
    assert.equal(typeof stream.data.getReader, 'function');
    await stream.data.cancel();
  }
});

test('fetch adapters report download progress', async t => {
  const baseURL = await withServer(t, (_request, response) => { response.setHeader('content-length', '5'); response.end('hello'); });
  for (const [, client] of fetchClients) {
    const events = [];
    await client.get(baseURL, { onDownloadProgress: event => events.push(event) });
    assert.equal(events.at(-1).loaded, 5);
    assert.equal(events.at(-1).total, 5);
    assert.equal(events.at(-1).download, true);
  }
});

test('fetch adapters cancel timeout and AbortController requests', async t => {
  const baseURL = await withServer(t, (_request, response) => setTimeout(() => response.end('late'), 100));
  for (const [name, client] of fetchClients) {
    await assert.rejects(client.get(baseURL, { timeout: 5 }), error => ['ECONNABORTED', 'ETIMEDOUT'].includes(error.code));
    const controller = new AbortController();
    const promise = client.get(baseURL, { signal: controller.signal });
    controller.abort();
    const root = name === 'axios' ? upstream : lite;
    await assert.rejects(promise, error => root.isCancel(error));
  }
});

test('unsupported built-in adapter names fail explicitly', () => {
  for (const adapter of ['xhr', 'http']) assert.throws(() => lite.getAdapter(adapter), error => error.code === lite.AxiosError.ERR_NOT_SUPPORT);
});
