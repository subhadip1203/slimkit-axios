import axios from '../../src/index.mjs';

const output = document.querySelector('#output');
let controller;

document.querySelector('#load').addEventListener('click', async () => {
  controller = new AbortController();
  output.textContent = 'Loading...';

  try {
    const { data } = await axios.get('https://jsonplaceholder.typicode.com/users', {
      signal: controller.signal,
      onDownloadProgress: event => {
        output.textContent = `Downloaded ${event.loaded} bytes`;
      }
    });
    output.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    output.textContent = axios.isCancel(error) ? 'Canceled' : error.message;
  }
});

document.querySelector('#cancel').addEventListener('click', () => controller?.abort());
