import axios from '@barekit/lite-axios';

const api = axios.create({
  baseURL: 'https://api.example.com/v1',
  timeout: 10_000,
  headers: {
    common: { Authorization: 'Bearer token' },
    post: { 'Content-Type': 'application/json' }
  }
});

api.defaults.headers.common['X-Application'] = 'dashboard';

const users = await api.get('/users');
const created = await api.post('/users', { name: 'Ada' });

console.log(users.data, created.data);

// Basic authentication overwrites an existing Authorization header.
await api.get('/private', {
  auth: { username: 'user', password: 'secret' }
});
