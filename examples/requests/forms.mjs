import axios from '@slimkit/axios';

const url = 'https://api.example.com/submissions';

await axios.post(url, { name: 'Ada', skills: ['math', 'programming'] });

await axios.post(url, { name: 'Ada', skills: ['math', 'programming'] }, {
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  formSerializer: { indexes: false }
});

const file = new Blob(['report contents'], { type: 'text/plain' });
await axios.postForm(url, {
  name: 'Ada',
  tags: ['example', 'document'],
  attachment: file
});

const form = axios.toFormData({ user: { name: 'Ada' }, roles: ['admin'] });
console.log(axios.formToJSON(form));
