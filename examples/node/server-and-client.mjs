import http from 'node:http';
import axios from '@slimkit/axios';

const server = http.createServer((request, response) => {
  let body = '';
  request.on('data', chunk => { body += chunk; });
  request.on('end', () => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ method: request.method, url: request.url, body }));
  });
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const api = axios.create({
  baseURL: `http://127.0.0.1:${server.address().port}`,
  timeout: 2000
});

try {
  const getResponse = await api.get('/users', { params: { page: 1 } });
  const postResponse = await api.post('/users', { name: 'Ada' });
  console.log(getResponse.data);
  console.log(postResponse.data);
} finally {
  server.close();
}
