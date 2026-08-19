import axios, { RetryConfig, AxiosError } from '@slimkit/axios';

// TypeScript example with type-safe retry configuration
const retryConfig: RetryConfig = {
  retries: 3,
  retryDelay: 1000,
  retryCondition: (error: AxiosError) => {
    // Type-safe error checking
    return !error.response || error.response.status >= 500;
  },
  onRetry: (error: AxiosError, attempt: number, delay: number) => {
    console.log(`Retry attempt ${attempt + 1} after ${delay}ms delay`);
    console.log(`Error: ${error.message}`);
  }
};

interface User {
  id: number;
  name: string;
  email: string;
}

// Typed request with retry
const response = await axios.get<User[]>('https://api.example.com/users', {
  retry: retryConfig
});

console.log('Users:', response.data);

// Instance with default retry configuration
const api = axios.create({
  baseURL: 'https://api.example.com',
  retry: {
    retries: 5,
    retryDelay: 500,
    retryCondition: (error: AxiosError) => {
      const retryableCodes = ['ECONNABORTED', 'ETIMEDOUT', 'ECONNREFUSED', 'ERR_NETWORK'];
      return retryableCodes.includes(error.code || '') || 
             (error.response !== undefined && error.response.status >= 500);
    }
  }
});

const users = await api.get<User[]>('/users');
console.log(users.data);