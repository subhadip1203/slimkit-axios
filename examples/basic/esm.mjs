import axios from '@barekit/lite-axios';

const response = await axios.get('https://api.example.com/users', {
  params: { active: true, roles: ['admin', 'editor'] }
});

console.log(response.status, response.data);

await axios.post('https://api.example.com/users', {
  name: 'Ada Lovelace',
  email: 'ada@example.com'
});
