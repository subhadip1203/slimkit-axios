const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('../src/index.cjs');

test('retry mechanism retries failed requests', async () => {
  let attemptCount = 0;
  const mockAdapter = async (config) => {
    attemptCount++;
    if (attemptCount < 3) {
      const error = new axios.AxiosError('Network error', 'ERR_NETWORK', config);
      throw error;
    }
    return { data: 'success', status: 200, statusText: 'OK', headers: new axios.AxiosHeaders(), config };
  };

  const response = await axios.get('https://example.com', {
    adapter: mockAdapter,
    retry: {
      retries: 3,
      retryDelay: 10,
      retryCondition: (error) => error.code === 'ERR_NETWORK'
    }
  });

  assert.equal(attemptCount, 3);
  assert.equal(response.data, 'success');
});

test('retry mechanism respects retryCondition', async () => {
  let attemptCount = 0;
  const mockAdapter = async (config) => {
    attemptCount++;
    const error = new axios.AxiosError('Bad request', 'ERR_BAD_REQUEST', config);
    error.response = { status: 400 };
    throw error;
  };

  await assert.rejects(
    axios.get('https://example.com', {
      adapter: mockAdapter,
      retry: {
        retries: 3,
        retryDelay: 10,
        retryCondition: (error) => error.response?.status >= 500
      }
    }),
    error => error.code === 'ERR_BAD_REQUEST'
  );

  assert.equal(attemptCount, 1); // Should not retry
});

test('retry mechanism uses exponential backoff', async () => {
  let attemptCount = 0;
  const delays = [];
  const mockAdapter = async (config) => {
    attemptCount++;
    if (attemptCount < 3) {
      const error = new axios.AxiosError('Network error', 'ERR_NETWORK', config);
      throw error;
    }
    return { data: 'success', status: 200, statusText: 'OK', headers: new axios.AxiosHeaders(), config };
  };

  const startTime = Date.now();
  await axios.get('https://example.com', {
    adapter: mockAdapter,
    retry: {
      retries: 3,
      retryDelay: 50,
      retryCondition: (error) => error.code === 'ERR_NETWORK',
      onRetry: (error, attempt, delay) => {
        delays.push(delay);
      }
    }
  });
  const totalTime = Date.now() - startTime;

  assert.equal(attemptCount, 3);
  assert.equal(delays.length, 2);
  assert.equal(delays[0], 50);   // First retry: 50ms
  assert.equal(delays[1], 100);  // Second retry: 50 * 2^1 = 100ms
  assert.ok(totalTime >= 150);   // At least 150ms total delay
});

test('retry mechanism calls onRetry callback', async () => {
  let attemptCount = 0;
  let retryCallbackCount = 0;
  const mockAdapter = async (config) => {
    attemptCount++;
    if (attemptCount < 2) {
      const error = new axios.AxiosError('Network error', 'ERR_NETWORK', config);
      throw error;
    }
    return { data: 'success', status: 200, statusText: 'OK', headers: new axios.AxiosHeaders(), config };
  };

  await axios.get('https://example.com', {
    adapter: mockAdapter,
    retry: {
      retries: 2,
      retryDelay: 10,
      retryCondition: (error) => error.code === 'ERR_NETWORK',
      onRetry: (error, attempt, delay) => {
        retryCallbackCount++;
        assert.equal(error.code, 'ERR_NETWORK');
        assert.ok(typeof attempt === 'number');
        assert.ok(typeof delay === 'number');
      }
    }
  });

  assert.equal(retryCallbackCount, 1);
});

test('retry mechanism does not retry when retries is 0', async () => {
  let attemptCount = 0;
  const mockAdapter = async (config) => {
    attemptCount++;
    const error = new axios.AxiosError('Network error', 'ERR_NETWORK', config);
    throw error;
  };

  await assert.rejects(
    axios.get('https://example.com', {
      adapter: mockAdapter,
      retry: {
        retries: 0,
        retryDelay: 10,
        retryCondition: (error) => error.code === 'ERR_NETWORK'
      }
    }),
    error => error.code === 'ERR_NETWORK'
  );

  assert.equal(attemptCount, 1); // Only initial attempt
});

test('retry mechanism works with successful responses', async () => {
  let attemptCount = 0;
  const mockAdapter = async (config) => {
    attemptCount++;
    return { data: 'success', status: 200, statusText: 'OK', headers: new axios.AxiosHeaders(), config };
  };

  const response = await axios.get('https://example.com', {
    adapter: mockAdapter,
    retry: {
      retries: 3,
      retryDelay: 10
    }
  });

  assert.equal(attemptCount, 1); // No retries needed
  assert.equal(response.data, 'success');
});