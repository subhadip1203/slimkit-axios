const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const axios = require('../src/index.cjs');

test('toFormData enforces maxDepth and matches the upstream error shape', () => {
  assert.throws(
    () => axios.toFormData({ a: { b: { c: 1 } } }, undefined, { maxDepth: 1 }),
    error => error.code === axios.AxiosError.ERR_FORM_DATA_DEPTH_EXCEEDED
      && error.message === 'Object is too deeply nested (2 levels). Max depth: 1'
  );
  assert.doesNotThrow(() => axios.toFormData({ a: { b: { c: 1 } } }));
  const shallow = axios.toFormData({ a: 1, b: { c: 2 } }, undefined, { maxDepth: 1 });
  assert.equal(shallow.get('a'), '1');
  assert.equal(shallow.get('b[c]'), '2');
});

test('exposes the ECONNREFUSED error code', () => {
  assert.equal(typeof axios.AxiosError.ECONNREFUSED, 'string');
  assert.equal(axios.AxiosError.ECONNREFUSED, 'ECONNREFUSED');
});

test('falls back to a plain upload body when the environment cannot stream fetch request bodies', async () => {
  // Real Firefox silently stringifies a ReadableStream Request body to
  // "[object ReadableStream]" instead of transmitting it (discovered via the
  // Playwright cross-browser suite). This simulates that failure mode
  // deterministically so the fallback stays covered without a real browser.
  const OriginalRequest = global.Request;
  class BrokenRequest extends OriginalRequest {
    constructor(input, init) {
      if (init && init.body && typeof init.body.getReader === 'function') super(input, { ...init, body: String(init.body) });
      else super(input, init);
    }
  }
  global.Request = BrokenRequest;
  delete require.cache[require.resolve('../src/index.cjs')];
  const freshAxios = require('../src/index.cjs');
  try {
    const events = [];
    let receivedBody = null;
    const response = await freshAxios.post('https://example.test/x', 'hello world', {
      onUploadProgress: e => events.push(e.loaded),
      env: { fetch: async request => { receivedBody = await request.text(); return new Response('ok'); } }
    });
    assert.equal(response.status, 200);
    assert.equal(receivedBody, 'hello world');
    assert.equal(events.length, 0);
  } finally {
    global.Request = OriginalRequest;
    delete require.cache[require.resolve('../src/index.cjs')];
  }
});

test('exports the Axios-compatible instance shape', () => {
  assert.equal(typeof axios, 'function'); assert.equal(typeof axios.create, 'function');
  assert.equal(typeof axios.get, 'function'); assert.equal(typeof axios.AxiosError, 'function');
  assert.equal(axios.Cancel, axios.CanceledError);
  assert.equal(axios.HttpStatusCode.NotFound, 404);
  assert.equal(axios.getAdapter('fetch'), axios.getAdapter(['http', 'fetch']));
});

test('applies a custom JSON.parse reviver via parseReviver', async () => {
  const response = await axios.get('https://example.test/x', {
    parseReviver: (key, value) => typeof value === 'number' ? value * 2 : value,
    env: { fetch: async () => new Response(JSON.stringify({ a: 5, b: 'x' }), { headers: { 'Content-Type': 'application/json' } }) }
  });
  assert.deepEqual(response.data, { a: 10, b: 'x' });
});

test('progress events report lengthComputable based on a known total', async () => {
  const events = [];
  await axios.get('https://example.test/x', {
    onDownloadProgress: e => events.push(e.lengthComputable),
    env: { fetch: async () => new Response('hello world', { headers: { 'Content-Length': '11' } }) }
  });
  assert.ok(events.length > 0);
  assert.ok(events.every(v => v === true));

  const eventsNoLength = [];
  await axios.get('https://example.test/x', {
    onDownloadProgress: e => eventsNoLength.push(e.lengthComputable),
    env: { fetch: async () => new Response('hello world') }
  });
  assert.ok(eventsNoLength.length > 0);
  assert.ok(eventsNoLength.every(v => v === false));
});

test('supports the query() method alias and omits queryForm', async () => {
  assert.equal(typeof axios.query, 'function');
  assert.equal(typeof axios.queryForm, 'undefined');
  const response = await axios.query('https://example.test/search', { term: 'x' }, {
    env: { fetch: async request => { assert.equal(request.method, 'QUERY'); assert.equal(await request.text(), '{"term":"x"}'); return new Response('ok'); } }
  });
  assert.equal(response.status, 200);
});

test('exposes _request as the underlying implementation of request', async () => {
  assert.equal(typeof axios._request, 'function');
  const response = await axios._request('https://example.test/x', { env: { fetch: async () => new Response('ok') } });
  assert.equal(response.status, 200);
});

test('responseType formdata parses correctly when download progress or size limits are active', async () => {
  const boundary = 'test-boundary';
  const body = ['--' + boundary, 'Content-Disposition: form-data; name="field"', '', 'value1', '--' + boundary + '--', ''].join('\r\n');
  const makeFetch = () => async () => new Response(body, { headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary } });
  const withProgress = await axios.get('https://example.test/x', {
    responseType: 'formdata', onDownloadProgress: () => {}, env: { fetch: makeFetch() }
  });
  assert.equal(withProgress.data.constructor.name, 'FormData');
  assert.equal(withProgress.data.get('field'), 'value1');
  const withLimit = await axios.get('https://example.test/x', {
    responseType: 'formdata', maxContentLength: 1_000_000, env: { fetch: makeFetch() }
  });
  assert.equal(withLimit.data.constructor.name, 'FormData');
  assert.equal(withLimit.data.get('field'), 'value1');
});

test('mergeConfig does not inherit url, method or data from config1', () => {
  const merged = axios.mergeConfig({ url: '/a', method: 'post', data: { x: 1 } }, {});
  assert.equal(merged.url, undefined);
  assert.equal(merged.method, undefined);
  assert.equal(merged.data, undefined);
  assert.deepEqual(merged, {});
});

test('mergeConfig treats an explicitly undefined validateStatus as own-property-aware', () => {
  const fn = () => true;
  const clearedByConfig1 = axios.mergeConfig({ validateStatus: undefined }, {});
  assert.equal('validateStatus' in clearedByConfig1, true);
  assert.equal(clearedByConfig1.validateStatus, undefined);

  const clearedByConfig2 = axios.mergeConfig({ validateStatus: fn }, { validateStatus: undefined });
  assert.equal('validateStatus' in clearedByConfig2, true);
  assert.equal(clearedByConfig2.validateStatus, undefined);

  const inheritedFromConfig1 = axios.mergeConfig({ validateStatus: fn }, {});
  assert.equal(inheritedFromConfig1.validateStatus, fn);
});

test('encodes non-ASCII basic-auth credentials without throwing', async () => {
  const response = await axios.get('https://example.test/secure', {
    auth: { username: 'ü', password: '密' },
    env: { fetch: async request => { assert.equal(request.headers.get('Authorization'), 'Basic w7w65a+G'); return new Response('ok'); } }
  });
  assert.equal(response.status, 200);
});

test('normalizes plain-object headers returned by a custom adapter', async () => {
  const response = await axios.get('https://example.test/custom', {
    adapter: async config => ({ data: 'ok', status: 200, statusText: 'OK', headers: { 'x-custom': '1' }, config })
  });
  assert.ok(response.headers instanceof axios.AxiosHeaders);
  assert.equal(response.headers.get('x-custom'), '1');
});

test('rejects unknown transitional options with ERR_BAD_OPTION', async () => {
  await assert.rejects(
    axios.get('https://example.test/x', { transitional: { bogusOption: true } }),
    error => error.code === axios.AxiosError.ERR_BAD_OPTION
  );
});

test('rejects wrong-typed known transitional options with ERR_BAD_OPTION_VALUE', async () => {
  await assert.rejects(
    axios.get('https://example.test/x', { transitional: { silentJSONParsing: 'nope' } }),
    error => error.code === axios.AxiosError.ERR_BAD_OPTION_VALUE
  );
});

test('accepts axios-recognized transitional options this library does not act on', async () => {
  const response = await axios.get('https://example.test/x', {
    transitional: { legacyInterceptorReqResOrdering: true },
    env: { fetch: async () => new Response('ok') }
  });
  assert.equal(response.status, 200);
});

test('serializes params, transforms JSON and runs interceptors', async t => {
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ url: req.url, body, marker: req.headers['x-marker'] }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const client = axios.create({ baseURL: `http://127.0.0.1:${server.address().port}` });
  client.interceptors.request.use(config => { config.headers.set('X-Marker', 'yes'); return config; });
  client.interceptors.response.use(response => { response.data.intercepted = true; return response; });
  const response = await client.post('/items', { ok: true }, { params: { page: 2, tag: ['a', 'b'] } });
  assert.deepEqual(response.data, { url: '/items?page=2&tag%5B%5D=a&tag%5B%5D=b', body: '{"ok":true}', marker: 'yes', intercepted: true });
});

test('rejects non-2xx responses with AxiosError', async t => {
  const server = http.createServer((_req, res) => { res.statusCode = 404; res.end('missing'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  await assert.rejects(axios.get(`http://127.0.0.1:${server.address().port}`), error => axios.isAxiosError(error) && error.response.status === 404);
});

test('supports CancelToken', async () => {
  const source = axios.CancelToken.source(); source.cancel('stop');
  await assert.rejects(axios.get('http://127.0.0.1:1', { cancelToken: source.token }), error => axios.isCancel(error) && error.message === 'stop');
});

test('CancelToken cancellations carry config and request context', async () => {
  const source = axios.CancelToken.source(); source.cancel('stop');
  await assert.rejects(
    axios.get('https://example.test/resource', {
      cancelToken: source.token,
      env: { fetch: request => new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason))) }
    }),
    error => axios.isCancel(error)
      && error.message === 'stop'
      && error.config !== undefined
      && error.config.url === 'https://example.test/resource'
  );
});

test('in-flight CancelToken cancellations also carry request context', async () => {
  const source = axios.CancelToken.source();
  const promise = axios.get('https://example.test/resource', {
    cancelToken: source.token,
    env: { fetch: request => new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason))) }
  });
  source.cancel('stop');
  await assert.rejects(
    promise,
    error => axios.isCancel(error)
      && error.message === 'stop'
      && error.config !== undefined
      && error.config.url === 'https://example.test/resource'
      && error.request !== undefined
  );
});

test('merges common, method and request headers case-insensitively', async () => {
  const client = axios.create({ headers: { common: { 'X-Common': 'base' }, post: { 'X-Method': 'post' } } });
  const response = await client.post('/headers', 'body', {
    headers: { 'x-common': 'request' },
    adapter: async config => ({ data: config.headers.toJSON(), status: 200, statusText: 'OK', headers: new axios.AxiosHeaders(), config })
  });
  assert.equal(response.data['x-common'], 'request');
  assert.equal(response.data['X-Method'], 'post');
});

test('runs synchronous request interceptors before returning', async () => {
  const events = [];
  const client = axios.create();
  client.interceptors.request.use(config => { events.push('interceptor'); return config; }, undefined, { synchronous: true });
  const promise = client.get('/sync', { adapter: async config => ({ data: 'ok', status: 200, statusText: 'OK', headers: new axios.AxiosHeaders(), config }) });
  events.push('returned');
  await promise;
  assert.deepEqual(events, ['interceptor', 'returned']);
});

test('supports custom fetch, response formats and progress metadata', async () => {
  const progress = [];
  const response = await axios.get('https://example.test/data', {
    responseType: 'arraybuffer',
    onDownloadProgress: event => progress.push(event),
    env: { fetch: async request => {
      assert.equal(request.url, 'https://example.test/data');
      return new Response('hello', { status: 200, headers: { 'content-length': '5' } });
    } }
  });
  assert.equal(new TextDecoder().decode(response.data), 'hello');
  assert.equal(progress.at(-1).loaded, 5);
  assert.equal(progress.at(-1).download, true);
  assert.equal(typeof progress.at(-1).rate, 'number');
  assert.equal(typeof progress.at(-1).estimated, 'number');
});

test('enforces request and response size limits', async () => {
  await assert.rejects(axios.post('https://example.test', 'large', {
    maxBodyLength: 2,
    env: { fetch: async () => new Response('ok') }
  }), error => error.code === axios.AxiosError.ERR_BAD_REQUEST);
  await assert.rejects(axios.get('https://example.test', {
    maxContentLength: 2,
    env: { fetch: async () => new Response('large') }
  }), error => error.code === axios.AxiosError.ERR_BAD_RESPONSE);
});

test('serializers and header helpers match the public API', () => {
  assert.equal(axios.getUri({ url: '/items#old', params: { tags: ['a', 'b'], date: new Date('2020-01-01T00:00:00Z'), empty: null } }), '/items?tags%5B%5D=a&tags%5B%5D=b&date=2020-01-01T00:00:00.000Z');
  const headers = new axios.AxiosHeaders({ 'Content-Type': 'text/plain', 'Set-Cookie': ['a=1', 'b=2'] });
  assert.equal(headers.get('content-type'), 'text/plain');
  assert.deepEqual(headers.getSetCookie(), ['a=1', 'b=2']);
  assert.equal(axios.formToJSON(null), null);
});

test('times out using Axios error codes', async () => {
  await assert.rejects(axios.get('https://example.test', {
    timeout: 5,
    env: { fetch: request => new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason))) }
  }), error => error.code === axios.AxiosError.ECONNABORTED);
});

test('supports callable signatures, method aliases and isolated instances', async () => {
  const seen = [];
  const adapter = async config => { seen.push([config.method, config.url, config.data]); return { data: config.data, status: 200, statusText: 'OK', headers: new axios.AxiosHeaders(), config, request: {} }; };
  const client = axios.create({ adapter, headers: { common: { 'X-Instance': 'one' } } });
  await client({ url: '/config' });
  await client('/url-config');
  for (const method of ['get', 'delete', 'head', 'options']) await client[method](`/${method}`);
  for (const method of ['post', 'put', 'patch']) await client[method](`/${method}`, 'data');
  for (const method of ['postForm', 'putForm', 'patchForm']) await client[method](`/${method}`, { value: 'data' });
  assert.equal(seen.length, 12);
  assert.notEqual(client.defaults, axios.defaults);
  assert.notEqual(client.interceptors, axios.interceptors);
});

test('manages interceptor lifecycle and helper functions', async () => {
  const client = axios.create();
  const first = client.interceptors.request.use(config => config);
  const second = client.interceptors.request.use(config => config, undefined, { runWhen: () => false });
  client.interceptors.request.eject(first);
  assert.equal(client.interceptors.request.handlers[first], null);
  assert.notEqual(client.interceptors.request.handlers[second], null);
  client.interceptors.request.clear();
  assert.equal(client.interceptors.request.handlers.length, 0);
  assert.deepEqual(await axios.all([Promise.resolve(1), 2]), [1, 2]);
  assert.equal(axios.spread((a, b) => a + b)([2, 3]), 5);
  assert.equal(axios.isAxiosError(new axios.AxiosError('test')), true);
  assert.equal(axios.mergeConfig({ timeout: 1 }, { timeout: 2 }).timeout, 2);
});

test('supports JSON, text, blob and stream response modes', async () => {
  const fetch = async () => new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
  assert.deepEqual((await axios.get('https://example.test', { env: { fetch } })).data, { ok: true });
  assert.equal((await axios.get('https://example.test', { responseType: 'text', env: { fetch } })).data, '{"ok":true}');
  assert.equal((await axios.get('https://example.test', { responseType: 'blob', env: { fetch } })).data instanceof Blob, true);
  assert.equal(typeof (await axios.get('https://example.test', { responseType: 'stream', env: { fetch } })).data.getReader, 'function');
});

test('serializes object bodies from their requested content type', async () => {
  const adapter = async config => ({ data: config.data, status: 200, statusText: 'OK', headers: new axios.AxiosHeaders(), config });
  const encoded = await axios.post('/form', { tags: ['a', 'b'] }, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, adapter });
  assert.equal(encoded.data, 'tags%5B%5D=a&tags%5B%5D=b');
  const multipart = await axios.post('/form', { name: 'Ada' }, { headers: { 'Content-Type': 'multipart/form-data' }, adapter });
  assert.equal(multipart.data instanceof FormData, true);
  assert.equal(multipart.data.get('name'), 'Ada');
});

test('applies credentials, XSRF and upload progress through fetch', async () => {
  const oldWindow = global.window;
  const oldDocument = global.document;
  global.window = { location: { href: 'https://example.test/page', origin: 'https://example.test' } };
  global.document = { cookie: 'XSRF-TOKEN=secret' };
  try {
    let upload;
    const response = await axios.post('https://example.test/upload', 'hello', {
      withCredentials: true,
      onUploadProgress: event => { upload = event; },
      env: { fetch: async request => {
        assert.equal(request.credentials, 'include');
        assert.equal(request.headers.get('X-XSRF-TOKEN'), 'secret');
        assert.equal(await request.text(), 'hello');
        return new Response('ok');
      } }
    });
    assert.equal(response.data, 'ok');
    assert.equal(upload.upload, true);
    assert.equal(upload.loaded, 5);
  } finally {
    if (oldWindow === undefined) delete global.window; else global.window = oldWindow;
    if (oldDocument === undefined) delete global.document; else global.document = oldDocument;
  }
});

test('supports AbortController cancellation', async () => {
  const controller = new AbortController();
  const promise = axios.get('https://example.test', {
    signal: controller.signal,
    env: { fetch: request => new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason))) }
  });
  controller.abort('stop');
  await assert.rejects(promise, error => axios.isCancel(error));
});

test('honors form serializer options and lets fetch set multipart boundaries', async () => {
  const response = await axios.post('https://example.test/form', { tags: ['a', 'b'] }, {
    headers: { 'Content-Type': 'multipart/form-data' },
    formSerializer: { indexes: true },
    env: { fetch: async request => {
      assert.match(request.headers.get('content-type'), /^multipart\/form-data; boundary=/);
      const form = await request.formData();
      assert.equal(form.get('tags[0]'), 'a');
      assert.equal(form.get('tags[1]'), 'b');
      return new Response('ok');
    } }
  });
  assert.equal(response.data, 'ok');
});

test('passes Blob bodies and follows redirects unless disabled', async t => {
  const server = http.createServer((req, res) => {
    if (req.url === '/redirect') { res.statusCode = 302; res.setHeader('location', '/target'); res.end(); return; }
    if (req.url === '/target') { res.end('redirected'); return; }
    let body = ''; req.on('data', chunk => { body += chunk; }); req.on('end', () => res.end(body));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await axios.post(`${baseURL}/blob`, new Blob(['blob-body']))).data, 'blob-body');
  assert.equal((await axios.get(`${baseURL}/redirect`)).data, 'redirected');
  const manual = await axios.get(`${baseURL}/redirect`, { maxRedirects: 0, validateStatus: null });
  assert.equal(manual.status, 302);
  assert.equal(manual.headers.get('location'), '/target');
});

test('normalizes duplicate headers and preserves Set-Cookie arrays', () => {
  const headers = new axios.AxiosHeaders({ Accept: 'text/plain', accept: 'application/json', 'Set-Cookie': ['a=1', 'b=2'] });
  assert.equal(headers.get('ACCEPT'), 'application/json');
  assert.deepEqual(headers.getSetCookie(), ['a=1', 'b=2']);
  assert.equal([...headers].filter(([name]) => name.toLowerCase() === 'accept').length, 1);
});

test('measures upload progress while fetch consumes incremental chunks', async () => {
  const events = [];
  const payload = 'x'.repeat(150 * 1024);
  await axios.post('https://example.test/upload', payload, {
    onUploadProgress: event => events.push(event),
    env: { fetch: async request => {
      assert.equal(events.length, 0);
      assert.equal((await request.arrayBuffer()).byteLength, payload.length);
      return new Response('ok');
    } }
  });
  assert.ok(events.length >= 3);
  assert.equal(events.at(-1).loaded, payload.length);
  assert.equal(events.at(-1).total, payload.length);
  assert.ok(events.every((event, index) => index === 0 || event.loaded > events[index - 1].loaded));
});

test('enforces maxContentLength while a stream response is consumed', async () => {
  const response = await axios.get('https://example.test/stream', {
    responseType: 'stream',
    maxContentLength: 2,
    env: { fetch: async () => new Response('too large') }
  });
  const reader = response.data.getReader();
  await assert.rejects(reader.read(), error => error.code === axios.AxiosError.ERR_BAD_RESPONSE);
});

test('executes formSerializer visitors', async () => {
  const visited = [];
  const form = axios.toFormData({ first: 'Ada', last: 'Lovelace' }, new FormData(), {
    visitor(value, key, path, helpers) {
      visited.push([key, path]);
      this.append(key.toUpperCase(), helpers.convertValue(value));
      return false;
    }
  });
  assert.deepEqual(visited, [['first', undefined], ['last', undefined]]);
  assert.equal(form.get('FIRST'), 'Ada');
  assert.equal(form.get('LAST'), 'Lovelace');
});

test('form aliases apply merged formSerializer options', async () => {
  const client = axios.create({ formSerializer: { dots: true, indexes: true } });
  const result = await client.postForm('/form', { users: [{ name: 'Ada' }] }, {
    adapter: config => Promise.resolve({ data: [...config.data.entries()], status: 200, statusText: 'OK', headers: new axios.AxiosHeaders(), config })
  });
  assert.deepEqual(result.data, [['users.0.name', 'Ada']]);
});

test('preserves external abort reasons as cancellation causes', async () => {
  const controller = new AbortController();
  const reason = Object.assign(new Error('navigation'), { requestId: 'request-1' });
  const promise = axios.get('https://example.test/slow', {
    signal: controller.signal,
    env: { fetch: request => new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason))) }
  });
  controller.abort(reason);
  await assert.rejects(promise, error => axios.isCancel(error) && error.cause === reason && error.cause.requestId === 'request-1');
});
