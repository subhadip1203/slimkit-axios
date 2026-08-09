const test = require('node:test');
const assert = require('node:assert/strict');
const upstream = require('axios');
const lite = require('../src/index.cjs');

const clients = [['axios', upstream], ['lite-axios', lite]];

function response(config, data = config.data) {
  return Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config, request: {} });
}

function plainHeaders(headers) {
  return Object.fromEntries(Object.entries(headers.toJSON()).map(([key, value]) => [key.toLowerCase(), value]));
}

test('matches upstream URL construction cases', () => {
  const cases = [
    { url: '/users' },
    { baseURL: 'https://example.test/api/', url: '/users' },
    { baseURL: 'https://example.test/api', url: 'https://other.test/users' },
    { url: '/users#fragment', params: { page: 2, query: 'hello world' } },
    { url: '/users', params: { tags: ['a', 'b'] } },
    { url: '/users', params: { tags: ['a', 'b'] }, paramsSerializer: { indexes: true } },
    { url: '/users', params: { tags: ['a', 'b'] }, paramsSerializer: { indexes: null } },
    { url: '/users', params: { at: new Date('2024-01-02T03:04:05Z'), ignored: null } },
    { url: '/users', params: { value: ':$, []' } },
    { url: '/users', params: { value: 'x' }, paramsSerializer: { encode: encodeURIComponent } }
  ];
  for (const config of cases) assert.equal(lite.getUri(config), upstream.getUri(config), JSON.stringify(config));
});

test('matches upstream header operations', () => {
  for (const [, client] of clients) {
    const headers = new client.AxiosHeaders({ 'Content-Type': 'application/json', Foo: 'one' });
    assert.equal(headers.get('content-type'), 'application/json');
    assert.equal(headers.has('FOO'), true);
    headers.set('foo', 'two');
    assert.equal(headers.get('Foo'), 'two');
    headers.set('Keep', 'first');
    headers.set('keep', 'second', false);
    assert.equal(headers.get('keep'), 'first');
    assert.equal(headers.delete('foo'), true);
    assert.equal(headers.has('foo'), false);
    assert.equal(headers.concat({ Accept: 'text/plain' }).get('accept'), 'text/plain');
    assert.match(headers.toString(), /Content-Type: application\/json/i);
  }
});

test('matches upstream parsed header values', () => {
  const value = 'multipart/form-data; boundary=example';
  assert.deepEqual({ ...lite.AxiosHeaders.from({ 'Content-Type': value }).get('Content-Type', true) }, { ...upstream.AxiosHeaders.from({ 'Content-Type': value }).get('Content-Type', true) });
  assert.deepEqual(lite.AxiosHeaders.from({ Test: 'abc123' }).get('test', /(\d+)/), upstream.AxiosHeaders.from({ Test: 'abc123' }).get('test', /(\d+)/));
});

test('matches upstream raw header parsing and status reverse lookup', () => {
  const raw = 'Host: example.test\r\nContent-Type: application/json\r\nX-Test: yes';
  assert.deepEqual(plainHeaders(new lite.AxiosHeaders(raw)), plainHeaders(new upstream.AxiosHeaders(raw)));
  assert.equal(lite.HttpStatusCode[404], upstream.HttpStatusCode[404]);
});

test('matches upstream request aliases and transformed bodies', async () => {
  for (const [, client] of clients) {
    const seen = [];
    const instance = client.create({ adapter: config => { seen.push(config); return response(config); } });
    await instance({ url: '/callable' });
    await instance('/url');
    for (const method of ['get', 'delete', 'head', 'options']) await instance[method](`/${method}`);
    for (const method of ['post', 'put', 'patch']) await instance[method](`/${method}`, { value: method });
    assert.deepEqual(seen.map(config => config.method), ['get', 'get', 'get', 'delete', 'head', 'options', 'post', 'put', 'patch']);
    assert.equal(seen[6].data, '{"value":"post"}');
    assert.equal(seen[6].headers.get('content-type'), 'application/json');
  }
});

test('matches upstream default and request header precedence', async () => {
  async function capture(client) {
    const instance = client.create({ headers: { common: { Shared: 'common', Override: 'common' }, post: { Method: 'post', Override: 'method' } } });
    const result = await instance.post('/headers', null, { headers: { Override: 'request', Direct: 'yes' }, adapter: config => response(config, plainHeaders(config.headers)) });
    return result.data;
  }
  const actual = await capture(lite);
  const expected = await capture(upstream);
  for (const name of ['shared', 'method', 'override', 'direct']) assert.equal(actual[name], expected[name], name);
});

test('matches upstream request LIFO and response FIFO interceptor ordering', async () => {
  async function order(client) {
    const events = [];
    const instance = client.create({ adapter: config => { events.push('adapter'); return response(config, 'ok'); } });
    instance.interceptors.request.use(config => { events.push('request-1'); return config; });
    instance.interceptors.request.use(config => { events.push('request-2'); return config; });
    instance.interceptors.response.use(value => { events.push('response-1'); return value; });
    instance.interceptors.response.use(value => { events.push('response-2'); return value; });
    await instance.get('/order');
    return events;
  }
  assert.deepEqual(await order(lite), await order(upstream));
});

test('matches upstream runWhen, eject and clear behavior', async () => {
  for (const [, client] of clients) {
    const events = [];
    const instance = client.create({ adapter: config => response(config) });
    const removed = instance.interceptors.request.use(config => { events.push('removed'); return config; });
    instance.interceptors.request.eject(removed);
    instance.interceptors.request.use(config => { events.push('get-only'); return config; }, undefined, { runWhen: config => config.method === 'get' });
    await instance.get('/yes');
    await instance.post('/no');
    assert.deepEqual(events, ['get-only']);
    instance.interceptors.request.clear();
    assert.equal(instance.interceptors.request.handlers.length, 0);
  }
});

test('matches upstream synchronous interceptor timing', async () => {
  for (const [, client] of clients) {
    const events = [];
    const instance = client.create({ adapter: config => { events.push('adapter'); return response(config); } });
    instance.interceptors.request.use(config => { events.push('interceptor'); return config; }, undefined, { synchronous: true });
    const promise = instance.get('/sync');
    events.push('returned');
    await promise;
    assert.deepEqual(events.slice(0, 2), ['interceptor', 'adapter']);
    assert.equal(events.at(-1), 'returned');
  }
});

test('matches upstream response interceptor recovery chains', async () => {
  async function run(client) {
    const events = [];
    const instance = client.create({ adapter: config => response(config, 1) });
    instance.interceptors.response.use(() => { events.push('throw'); throw new Error('boom'); });
    instance.interceptors.response.use(value => value, error => { events.push(error.message); return { data: 2 }; });
    instance.interceptors.response.use(value => { events.push('recovered'); value.data += 1; return value; });
    const result = await instance.get('/chain');
    return { events, data: result.data };
  }
  assert.deepEqual(await run(lite), await run(upstream));
});

test('matches upstream transform request and response chains', async () => {
  async function run(client) {
    const instance = client.create({
      transformRequest: [function (data, headers) { headers.set('X-Transform', 'yes'); return `request:${data}`; }],
      transformResponse: [data => `response:${data}`],
      adapter: config => response(config, config.data)
    });
    const result = await instance.post('/transform', 'value');
    return { data: result.data, header: result.config.headers.get('x-transform') };
  }
  assert.deepEqual(await run(lite), await run(upstream));
});

test('matches upstream JSON response parsing modes', async () => {
  async function run(client, data, config = {}) {
    return (await client.get('/json', { ...config, adapter: request => response(request, data) })).data;
  }
  assert.deepEqual(await run(lite, '{"ok":true}'), await run(upstream, '{"ok":true}'));
  assert.equal(await run(lite, 'not-json'), await run(upstream, 'not-json'));
  await assert.rejects(run(lite, '{bad', { responseType: 'json', transitional: { silentJSONParsing: false } }), error => error.code === lite.AxiosError.ERR_BAD_RESPONSE);
  await assert.rejects(run(upstream, '{bad', { responseType: 'json', transitional: { silentJSONParsing: false } }), error => error.code === upstream.AxiosError.ERR_BAD_RESPONSE);
});

test('matches upstream cancellation helpers', async () => {
  for (const [, client] of clients) {
    const source = client.CancelToken.source();
    source.cancel('stopped');
    assert.equal(client.isCancel(source.token.reason), true);
    assert.equal(source.token.reason.message, 'stopped');
    assert.throws(() => source.token.throwIfRequested(), error => client.isCancel(error));
    assert.equal(client.Cancel, client.CanceledError);
  }
});

test('matches upstream AxiosError shape and serialization', () => {
  for (const [, client] of clients) {
    const config = { url: '/failure' };
    const error = new client.AxiosError('failed', client.AxiosError.ERR_BAD_REQUEST, config, {}, { status: 400 });
    assert.equal(client.isAxiosError(error), true);
    assert.equal(error.name, 'AxiosError');
    assert.equal(error.message, 'failed');
    assert.equal(error.code, 'ERR_BAD_REQUEST');
    assert.equal(error.status, 400);
    assert.equal(error.config, config);
    assert.equal(error.toJSON().status, 400);
  }
});

test('matches upstream helper behavior', async () => {
  assert.deepEqual(await lite.all([1, Promise.resolve(2)]), await upstream.all([1, Promise.resolve(2)]));
  assert.equal(lite.spread((a, b) => a + b)([2, 3]), upstream.spread((a, b) => a + b)([2, 3]));
  assert.equal(lite.mergeConfig({ timeout: 1, nested: { a: 1 } }, { timeout: 2, nested: { b: 2 } }).timeout, upstream.mergeConfig({ timeout: 1 }, { timeout: 2 }).timeout);
  assert.equal(lite.HttpStatusCode.NotFound, upstream.HttpStatusCode.NotFound);
  assert.equal(typeof lite.VERSION, typeof upstream.VERSION);
  assert.equal(typeof lite.getAdapter('fetch'), typeof upstream.getAdapter('fetch'));
});

test('matches upstream URL-encoded form serialization', async () => {
  async function serialize(client, options) {
    const result = await client.post('/form', { users: [{ name: 'Ada' }], tags: ['a', 'b'] }, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      formSerializer: options,
      adapter: config => response(config, config.data)
    });
    return result.data;
  }
  assert.equal(await serialize(lite), await serialize(upstream));
  assert.equal(await serialize(lite, { dots: true, indexes: true }), await serialize(upstream, { dots: true, indexes: true }));
});

test('matches upstream FormData serialization entries', () => {
  const input = { user: { name: 'Ada' }, tags: ['a', 'b'], created: new Date('2024-01-01T00:00:00Z') };
  const normalize = form => [...form.entries()].map(([key, value]) => [key, String(value)]);
  assert.deepEqual(normalize(lite.toFormData(input, new FormData())), normalize(upstream.toFormData(input, new FormData())));
});

test('keeps created instance defaults isolated', () => {
  for (const [, client] of clients) {
    const first = client.create({ timeout: 10 });
    const second = client.create({ timeout: 20 });
    first.defaults.timeout = 30;
    assert.equal(second.defaults.timeout, 20);
    assert.notEqual(first.interceptors, second.interceptors);
  }
});
