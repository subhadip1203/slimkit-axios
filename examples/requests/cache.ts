import axios, { CacheConfig, CacheEntry, AxiosError } from '@slimkit/axios';

// TypeScript example with type-safe cache configuration
const cacheConfig: CacheConfig = {
  enabled: true,
  ttl: 5 * 60 * 1000, // 5 minutes
  maxSize: 100,
  cacheByDefault: true,
  cachePredicate: (config: any) => {
    return config.method === 'get';
  },
  keyGenerator: (config: any) => {
    const { url, method, params } = config;
    return `${method}:${url}:${JSON.stringify(params)}`;
  },
  onCacheHit: (config: any, cachedResponse: CacheEntry) => {
    console.log('Cache hit for:', config.url);
    console.log('Cache age:', Date.now() - cachedResponse.timestamp, 'ms');
  },
  onCacheMiss: (config: any) => {
    console.log('Cache miss for:', config.url);
  }
};

interface User {
  id: number;
  name: string;
  email: string;
}

interface Product {
  id: number;
  name: string;
  price: number;
}

// Typed request with caching
const response = await axios.get<User[]>('https://api.example.com/users', {
  cache: cacheConfig
});

console.log('Users:', response.data);
console.log('From cache:', response.fromCache);

// Instance with type-safe cache configuration
const api = axios.create({
  baseURL: 'https://api.example.com',
  cache: {
    enabled: true,
    ttl: 10 * 60 * 1000,
    maxSize: 50,
    cacheByDefault: true,
    cachePredicate: (config: any) => {
      return config.method === 'get' && !config.url.includes('/admin');
    },
    onCacheWrite: (config: any, response: CacheEntry) => {
      console.log('Cached response:', config.url);
    }
  }
});

// Typed API calls with caching
const users = await api.get<User[]>('/users');
const products = await api.get<Product[]>('/products');