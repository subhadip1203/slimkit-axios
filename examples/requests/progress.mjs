import axios from '@barekit/lite-axios';

await axios.post('https://api.example.com/upload', 'payload', {
  onUploadProgress({ loaded, total, progress, rate, estimated }) {
    console.log('upload', { loaded, total, progress, rate, estimated });
  },
  onDownloadProgress({ loaded, total, progress, rate, estimated }) {
    console.log('download', { loaded, total, progress, rate, estimated });
  }
});
