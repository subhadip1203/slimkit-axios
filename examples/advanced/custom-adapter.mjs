import axios from '@slimkit/axios';

const memoryAdapter = async config => ({
  data: { method: config.method, url: config.url, body: config.data },
  status: 200,
  statusText: 'OK',
  headers: new axios.AxiosHeaders({ 'Content-Type': 'application/json' }),
  config,
  request: { type: 'memory' }
});

const client = axios.create({ adapter: memoryAdapter });
const response = await client.post('/users', { name: 'Ada' });

console.log(response.data);
