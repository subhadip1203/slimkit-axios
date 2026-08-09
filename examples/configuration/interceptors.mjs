import axios from '@barekit/lite-axios';

const api = axios.create({ baseURL: 'https://api.example.com' });

const requestId = api.interceptors.request.use(config => {
  config.headers.set('Authorization', `Bearer ${process.env.API_TOKEN}`);
  config.headers.set('X-Request-Time', new Date().toISOString());
  return config;
}, error => Promise.reject(error), {
  synchronous: true,
  runWhen: config => !config.url.endsWith('/health')
});

api.interceptors.response.use(response => response.data, error => {
  if (error.response?.status === 401) console.error('Authentication failed');
  return Promise.reject(error);
});

const users = await api.get('/users');
console.log(users);

api.interceptors.request.eject(requestId);
api.interceptors.response.clear();
