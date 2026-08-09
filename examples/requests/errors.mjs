import axios from '@slimkit/axios';

try {
  await axios.get('https://api.example.com/users/missing');
} catch (error) {
  if (axios.isAxiosError(error)) {
    console.error({
      message: error.message,
      code: error.code,
      status: error.status,
      response: error.response?.data,
      requestUrl: error.config?.url
    });
    console.error(error.toJSON());
  }
}

const response = await axios.get('https://api.example.com/status/404', {
  validateStatus: status => status < 500
});
console.log(response.status === axios.HttpStatusCode.NotFound);
