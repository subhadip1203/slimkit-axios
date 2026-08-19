import axios from '@slimkit/axios';

// Basic retry configuration
const response = await axios.get('https://api.example.com/unstable-endpoint', {
  retry: {
    retries: 3,                    // Number of retry attempts
    retryDelay: 1000,              // Initial delay in milliseconds
    retryCondition: (error) => {
      // Retry on network errors or 5xx status codes
      return !error.response || error.response.status >= 500;
    },
    onRetry: (error, attempt, delay) => {
      console.log(`Retry attempt ${attempt + 1} after ${delay}ms delay`);
      console.log(`Error: ${error.message}`);
    }
  }
});

console.log('Request succeeded after retries:', response.data);

// Advanced retry with exponential backoff
const api = axios.create({
  baseURL: 'https://api.example.com',
  retry: {
    retries: 5,
    retryDelay: 500,  // Will be: 500ms, 1000ms, 2000ms, 4000ms, 8000ms
    retryCondition: (error) => {
      // Retry on specific error codes
      const retryableCodes = ['ECONNABORTED', 'ETIMEDOUT', 'ECONNREFUSED', 'ERR_NETWORK'];
      return retryableCodes.includes(error.code) || 
             (error.response && error.response.status >= 500);
    },
    onRetry: (error, attempt, delay) => {
      console.warn(`Retrying request (attempt ${attempt + 1}/${5})`);
      console.warn(`Delay: ${delay}ms, Error: ${error.message}`);
    }
  }
});

// All requests from this instance will have retry logic
const users = await api.get('/users');
console.log(users.data);

// Retry only on specific status codes
const data = await axios.post('https://api.example.com/data', payload, {
  retry: {
    retries: 2,
    retryDelay: 2000,
    retryCondition: (error) => {
      // Only retry on 503 Service Unavailable
      return error.response?.status === 503;
    }
  }
});

console.log('Data posted successfully:', data.data);