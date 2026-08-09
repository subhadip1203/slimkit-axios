import axios from '@slimkit/axios';

const tracedFetch = async request => {
  const started = performance.now();
  try {
    return await fetch(request);
  } finally {
    console.log(request.method, request.url, `${performance.now() - started}ms`);
  }
};

const api = axios.create({
  env: { fetch: tracedFetch },
  fetchOptions: { cache: 'no-store' }
});

console.log((await api.get('https://api.example.com/health')).data);
