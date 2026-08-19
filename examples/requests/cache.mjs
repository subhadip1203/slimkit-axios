import axios from '@slimkit/axios';

// Basic caching configuration
const response1 = await axios.get('https://api.example.com/users', {
  cache: {
    enabled: true,
    ttl: 5 * 60 * 1000, // 5 minutes
    maxSize: 100,
    cacheByDefault: true
  }
});

console.log('First request (from server):', response1.data);

// Second request will be served from cache
const response2 = await axios.get('https://api.example.com/users', {
  cache: {
    enabled: true,
    ttl: 5 * 60 * 1000,
    maxSize: 100,
    cacheByDefault: true
  }
});

console.log('Second request (from cache):', response2.data);
console.log('Was from cache:', response2.fromCache);

// Instance-level caching configuration
const api = axios.create({
  baseURL: 'https://api.example.com',
  cache: {
    enabled: true,
    ttl: 10 * 60 * 1000, // 10 minutes
    maxSize: 50,
    cacheByDefault: true,
    cachePredicate: (config) => {
      // Only cache GET requests
      return config.method === 'get';
    },
    onCacheHit: (config, cachedResponse) => {
      console.log('Cache hit for:', config.url);
    },
    onCacheMiss: (config) => {
      console.log('Cache miss for:', config.url);
    },
    onCacheWrite: (config, response) => {
      console.log('Cached response for:', config.url);
    }
  }
});

// These requests will be cached
const users = await api.get('/users');
const products = await api.get('/products');

// POST requests won't be cached
const newProduct = await api.post('/products', { name: 'New Product' });

// Cache management
const cacheManager = api.getCache();

// Clear all cache
api.clearCache();

// Get cache size
console.log('Cache size:', cacheManager.size());

// Clean up expired entries
api.cleanupCache();

// Manual cache inspection
const keys = cacheManager.keys();
console.log('Cached keys:', keys);

// Check if specific request is cached
const hasUsers = cacheManager.has('get:/users:');
console.log('Users cached:', hasUsers);

// Disable caching for specific request
const freshData = await api.get('/users', {
  cache: {
    enabled: false
  }
});

console.log('Fresh data (not cached):', freshData.data);