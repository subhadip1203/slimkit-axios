const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, firefox, webkit } = require('playwright');

const repoRoot = path.join(__dirname, '..');
const CONTENT_TYPES = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.cjs': 'text/javascript', '.html': 'text/html' };

function startServer() {
  const server = http.createServer((req, res) => {
    const filePath = path.join(repoRoot, decodeURIComponent(req.url.split('?')[0]));
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(filePath)] || 'text/plain' });
      res.end(data);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

// Runs entirely inside the browser page - no Node APIs available here.
async function runBrowserChecks() {
  const results = [];
  const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail });

  const mod = await import('/src/index.mjs');
  const axios = mod.default;
  check('native ESM import resolves a default export', typeof axios === 'function');
  check('named exports are present', typeof mod.AxiosError === 'function' && typeof mod.AxiosHeaders === 'function' && mod.Cancel === mod.CanceledError);

  const getResponse = await axios.get('https://example.test/users', {
    params: { active: true, roles: ['admin', 'editor'] },
    env: { fetch: async request => {
      check('query params serialized onto the URL', request.url.includes('active=true') && request.url.includes('roles%5B%5D=admin'));
      return new Response(JSON.stringify([{ id: 1, name: 'Ada' }]), { headers: { 'Content-Type': 'application/json' } });
    } }
  });
  check('GET request parses JSON and returns AxiosHeaders', getResponse.status === 200 && getResponse.data[0].name === 'Ada' && getResponse.headers.constructor.name === 'AxiosHeaders');

  const postResponse = await axios.post('https://example.test/users', { name: 'Grace' }, {
    env: { fetch: async request => {
      const body = await request.text();
      check('POST body auto-serialized to JSON with correct Content-Type', body === '{"name":"Grace"}' && request.headers.get('content-type').includes('application/json'));
      return new Response('created', { status: 201 });
    } }
  });
  check('POST resolves with the adapter status', postResponse.status === 201);

  const instance = axios.create({ headers: { common: { 'X-Common': 'base' } } });
  instance.interceptors.request.use(config => { config.headers.set('X-Intercepted', 'yes'); return config; });
  const interceptorResponse = await instance.get('https://example.test/x', {
    env: { fetch: async request => {
      check('request interceptor and instance default headers both applied', request.headers.get('x-intercepted') === 'yes' && request.headers.get('x-common') === 'base');
      return new Response('ok');
    } }
  });
  check('instance request completes', interceptorResponse.status === 200);

  const formData = new FormData();
  formData.append('field', 'value1');
  const formResponse = await axios.post('https://example.test/upload', formData, {
    env: { fetch: async request => {
      const received = await request.formData();
      check('real browser FormData body transmitted correctly', received.get('field') === 'value1');
      return new Response('ok');
    } }
  });
  check('multipart request completes', formResponse.status === 200);

  const controller = new AbortController();
  const abortPromise = axios.get('https://example.test/slow', {
    signal: controller.signal,
    env: { fetch: request => new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason))) }
  });
  controller.abort();
  try {
    await abortPromise;
    check('AbortController cancellation rejects the request', false, 'promise resolved instead of rejecting');
  } catch (error) {
    check('AbortController cancellation rejects the request', mod.isCancel(error));
  }

  // Firefox does not support streaming (ReadableStream) fetch request bodies:
  // a Request built with one silently stringifies to "[object ReadableStream]"
  // instead of transmitting real content. The library feature-detects this and
  // falls back to a plain (unstreamed, unprogressed) body rather than corrupt
  // the request, so behavior differs per engine by design - check both halves.
  const uploadBody = 'x'.repeat(200000);
  const uploadEvents = [];
  let receivedBody = null;
  await axios.post('https://example.test/stream', uploadBody, {
    onUploadProgress: e => uploadEvents.push(e.loaded),
    env: { fetch: async request => { receivedBody = await request.text(); return new Response('ok'); } }
  });
  check('upload body content is transmitted correctly regardless of streaming support', receivedBody === uploadBody, `received ${receivedBody ? receivedBody.length : 'null'} bytes`);

  let streamingSupported;
  try {
    const probe = new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1, 2, 3])); c.close(); } });
    const probeRequest = new Request('https://example.invalid/', { method: 'POST', body: probe, duplex: 'half' });
    const bytes = new Uint8Array(await probeRequest.arrayBuffer());
    streamingSupported = bytes.length === 3 && bytes[0] === 1 && bytes[1] === 2 && bytes[2] === 3;
  } catch { streamingSupported = false; }
  if (streamingSupported) {
    check('upload progress fires incrementally on engines with streaming request body support', uploadEvents.length > 0 && uploadEvents[uploadEvents.length - 1] === 200000);
  } else {
    check('upload progress correctly stays silent on engines without streaming request body support', uploadEvents.length === 0);
  }

  return results;
}

test('the library works via native ESM import in real browser engines', async t => {
  const { server, port } = await startServer();
  try {
    for (const [name, launcher] of [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]]) {
      await t.test(name, async () => {
        const browser = await launcher.launch();
        try {
          const page = await browser.newPage();
          const pageErrors = [];
          page.on('pageerror', err => pageErrors.push(err.message));
          await page.goto(`http://127.0.0.1:${port}/examples/browser/index.html`);
          const results = await page.evaluate(runBrowserChecks);
          assert.deepEqual(pageErrors, [], `unexpected page errors in ${name}: ${pageErrors.join('; ')}`);
          for (const { name: checkName, pass, detail } of results) {
            assert.ok(pass, `[${name}] ${checkName}${detail ? ` (${detail})` : ''}`);
          }
        } finally {
          await browser.close();
        }
      });
    }
  } finally {
    server.close();
  }
});
