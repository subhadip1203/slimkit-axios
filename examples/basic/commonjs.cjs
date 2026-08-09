const axios = require('@slimkit/axios');

async function main() {
  const { data } = await axios({
    url: 'https://api.example.com/health',
    method: 'get',
    timeout: 5000
  });

  console.log(data);
}

main().catch(console.error);
