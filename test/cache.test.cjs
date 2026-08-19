const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('../src/index.cjs');

test('CacheManager - basic set and get operations', () => {
  const cache = new axios.CacheManager();
  
  const entry = {
    data: { users: [{ id: 1, name: 'John' }] },
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' }
  };
  
  cache.set('test-key', entry);
  assert.equal(cache.size(), 1);
  assert.equal(cache.has('test-key'), true);
  
  const retrieved = cache.get('test-key');
  assert.equal(retrieved.data.users[0].name, 'John');
  assert.equal(retrieved.status, 200);
});

test('CacheManager - TTL expiration', async () => {
  const cache = new axios.CacheManager({ ttl: 100 }); // 100ms TTL
  
  const entry = {
    data: { test: 'data' },
    status: 200,
    statusText: 'OK',
    headers: {}
  };
  
  cache.set('expiring-key', entry);
  assert.equal(cache.has('expiring-key'), true);
  
  // Wait for expiration
  await new Promise(resolve => setTimeout(resolve, 150));
  
  assert.equal(cache.has('expiring-key'), false);
  assert.equal(cache.get('expiring-key'), null);
});

test('CacheManager - LRU eviction', () => {
  const cache = new axios.CacheManager({ maxSize: 3 });
  
  const entry = {
    data: { test: 'data' },
    status: 200,
    statusText: 'OK',
    headers: {}
  };
  
  // Fill cache to max size
  cache.set('key1', entry);
  cache.set('key2', entry);
  cache.set('key3', entry);
  assert.equal(cache.size(), 3);
  
  // Access key1 to make it recently used
  cache.get('key1');
  
  // Add new entry - should evict key2 (least recently used)
  cache.set('key4', entry);
  assert.equal(cache.size(), 3);
  assert.equal(cache.has('key1'), true); // Still there (recently used)
  assert.equal(cache.has('key2'), false); // Evicted
  assert.equal(cache.has('key3'), true); // Still there
  assert.equal(cache.has('key4'), true); // New entry
});

test('CacheManager - cleanup expired entries', async () => {
  const cache = new axios.CacheManager({ ttl: 50 });
  
  const entry = {
    data: { test: 'data' },
    status: 200,
    statusText: 'OK',
    headers: {}
  };
  
  cache.set('key1', entry);
  cache.set('key2', entry);
  assert.equal(cache.size(), 2);
  
  // Wait for expiration
  await new Promise(resolve => setTimeout(resolve, 100));
  
  cache.cleanup();
  assert.equal(cache.size(), 0);
});

test('Axios - basic request caching', async () => {
  let requestCount = 0;
  const mockAdapter = async (config) => {
    requestCount++;
    return {
      data: { users: [{ id: 1, name: 'John' }] },
      status: 200,
      statusText: 'OK',
      headers: new axios.AxiosHeaders(),
      config
    };
  };
  
  const api = axios.create({
    adapter: mockAdapter,
    cache: {
      enabled: true,
      ttl: 5000,
      cacheByDefault: true
    }
  });
  
  // First request - should hit server
  const response1 = await api.get('/users');
  assert.equal(requestCount, 1);
  assert.equal(response1.fromCache, undefined);
  
  // Second request - should hit cache
  const response2 = await api.get('/users');
  assert.equal(requestCount, 1); // No additional request
  assert.equal(response2.fromCache, true);
});

test('Axios - cache with custom predicate', async () => {
  let getRequestCount = 0;
  let postRequestCount = 0;
  
  const mockAdapter = async (config) => {
    if (config.method === 'get') getRequestCount++;
    if (config.method === 'post') postRequestCount++;
    
    return {
      data: { success: true },
      status: config.method === 'post' ? 201 : 200,
      statusText: config.method === 'post' ? 'Created' : 'OK',
      headers: new axios.AxiosHeaders(),
      config
    };
  };
  
  const api = axios.create({
    adapter: mockAdapter,
    cache: {
      enabled: true,
      ttl: 5000,
      cachePredicate: (config) => config.method === 'get'
    }
  });
  
  // GET request should be cached
  await api.get('/data');
  await api.get('/data');
  assert.equal(getRequestCount, 1); // Only one actual request
  
  // POST request should not be cached
  await api.post('/data', { name: 'test' });
  await api.post('/data', { name: 'test2' });
  assert.equal(postRequestCount, 2); // Both requests made
});

test('Axios - cache disabled for specific request', async () => {
  let requestCount = 0;
  const mockAdapter = async (config) => {
    requestCount++;
    return {
      data: { test: 'data' },
      status: 200,
      statusText: 'OK',
      headers: new axios.AxiosHeaders(),
      config
    };
  };
  
  const api = axios.create({
    adapter: mockAdapter,
    cache: {
      enabled: true,
      ttl: 5000,
      cacheByDefault: true
    }
  });
  
  // First request with caching
  await api.get('/data');
  assert.equal(requestCount, 1);
  
  // Second request with caching disabled
  await api.get('/data', { cache: { enabled: false } });
  assert.equal(requestCount, 2); // Should make new request
});

test('Axios - cache management methods', async () => {
  const mockAdapter = async (config) => {
    return {
      data: { test: 'data' },
      status: 200,
      statusText: 'OK',
      headers: new axios.AxiosHeaders(),
      config
    };
  };
  
  const api = axios.create({
    adapter: mockAdapter,
    cache: {
      enabled: true,
      ttl: 5000,
      cacheByDefault: true
    }
  });
  
  // Make some cached requests
  await api.get('/users');
  await api.get('/products');
  
  const cacheManager = api.getCache();
  assert.equal(cacheManager.size(), 2);
  
  // Clear cache
  api.clearCache();
  assert.equal(cacheManager.size(), 0);
  
  // Make new request after clear
  await api.get('/users');
  assert.equal(cacheManager.size(), 1);
});