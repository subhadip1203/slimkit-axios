import axios from '@barekit/lite-axios';

const controller = new AbortController();
const request = axios.get('https://api.example.com/slow', {
  signal: controller.signal,
  timeout: 10_000
});

controller.abort();

try {
  await request;
} catch (error) {
  if (axios.isCancel(error)) console.log('Request canceled');
}

// CancelToken is supported for compatibility with older Axios applications.
const source = axios.CancelToken.source();
const legacyRequest = axios.get('https://api.example.com/slow', {
  cancelToken: source.token
});
source.cancel('Navigation changed');
await legacyRequest.catch(error => console.log(error.message));
