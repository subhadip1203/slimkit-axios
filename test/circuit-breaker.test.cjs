const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('../src/index.cjs');

test('CircuitBreaker - basic state transitions', async () => {
  const circuitBreaker = new axios.CircuitBreaker({
    enabled: true,
    failureThreshold: 3,
    recoveryTimeout: 100,
    successThreshold: 1
  });
  
  assert.equal(circuitBreaker.getState(), 'closed');
  
  for (let i = 0; i < 3; i++) {
    try {
      await circuitBreaker.execute(async () => {
        throw new Error('Failure');
      });
    } catch (error) {
      // Expected
    }
  }
  
  assert.equal(circuitBreaker.getState(), 'open');
  circuitBreaker.reset();
  circuitBreaker.destroy();
});

test('CircuitBreaker - prevents requests when open', async () => {
  const circuitBreaker = new axios.CircuitBreaker({
    enabled: true,
    failureThreshold: 2,
    recoveryTimeout: 5000
  });
  
  for (let i = 0; i < 2; i++) {
    try {
      await circuitBreaker.execute(async () => {
        throw new Error('Failure');
      });
    } catch (error) {
      // Expected
    }
  }
  
  assert.equal(circuitBreaker.getState(), 'open');
  
  try {
    await circuitBreaker.execute(async () => {
      return { success: true };
    });
    assert.fail('Should have thrown circuit breaker error');
  } catch (error) {
    assert.equal(error.isCircuitBreakerError, true);
  }
  
  circuitBreaker.destroy();
});

test('CircuitBreaker - fallback mechanism', async () => {
  let fallbackCalled = false;
  const circuitBreaker = new axios.CircuitBreaker({
    enabled: true,
    failureThreshold: 2,
    recoveryTimeout: 5000,
    onFallback: (error, context) => {
      fallbackCalled = true;
      return { data: { fallback: true }, status: 200 };
    }
  });
  
  for (let i = 0; i < 2; i++) {
    try {
      await circuitBreaker.execute(async () => {
        throw new Error('Failure');
      });
    } catch (error) {
      // Expected
    }
  }
  
  assert.equal(circuitBreaker.getState(), 'open');
  
  const result = await circuitBreaker.execute(async () => {
    return { success: true };
  });
  
  assert.equal(fallbackCalled, true);
  assert.equal(result.data.fallback, true);
  
  circuitBreaker.destroy();
});

test('CircuitBreaker - timeout handling', async () => {
  const circuitBreaker = new axios.CircuitBreaker({
    enabled: true,
    timeout: 100,
    failureThreshold: 3
  });
  
  try {
    await circuitBreaker.execute(async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
      return { success: true };
    });
    assert.fail('Should have timed out');
  } catch (error) {
    assert.equal(error.message, 'Request timeout');
  }
  
  const stats = circuitBreaker.getStats();
  assert.equal(stats.failureCount, 1);
  
  circuitBreaker.destroy();
});

test('CircuitBreaker - reset functionality', async () => {
  const circuitBreaker = new axios.CircuitBreaker({
    enabled: true,
    failureThreshold: 3,
    recoveryTimeout: 5000
  });
  
  for (let i = 0; i < 3; i++) {
    try {
      await circuitBreaker.execute(async () => {
        throw new Error('Failure');
      });
    } catch (error) {
      // Expected
    }
  }
  
  assert.equal(circuitBreaker.getState(), 'open');
  
  circuitBreaker.reset();
  
  assert.equal(circuitBreaker.getState(), 'closed');
  assert.equal(circuitBreaker.getStats().failureCount, 0);
  
  circuitBreaker.destroy();
});

test('CircuitBreaker - disabled state', async () => {
  const circuitBreaker = new axios.CircuitBreaker({
    enabled: false
  });
  
  let executionCount = 0;
  for (let i = 0; i < 5; i++) {
    try {
      await circuitBreaker.execute(async () => {
        executionCount++;
        throw new Error('Failure');
      });
    } catch (error) {
      // Expected
    }
  }
  
  assert.equal(executionCount, 5);
  assert.equal(circuitBreaker.getState(), 'closed');
  
  circuitBreaker.destroy();
});

test('CircuitBreaker - state change callbacks', async () => {
  const stateChanges = [];
  const circuitBreaker = new axios.CircuitBreaker({
    enabled: true,
    failureThreshold: 2,
    recoveryTimeout: 100,
    successThreshold: 1,
    onStateChange: (state, context) => {
      stateChanges.push({ state, context });
    }
  });
  
  for (let i = 0; i < 2; i++) {
    try {
      await circuitBreaker.execute(async () => {
        throw new Error('Failure');
      });
    } catch (error) {
      // Expected
    }
  }
  
  assert.equal(stateChanges[stateChanges.length - 1].state, 'open');
  
  await new Promise(resolve => setTimeout(resolve, 150));
  
  assert.equal(circuitBreaker.getState(), 'half-open');
  
  circuitBreaker.reset();
  
  circuitBreaker.destroy();
});

test('Axios - circuit breaker integration', async () => {
  let requestCount = 0;
  const mockAdapter = async (config) => {
    requestCount++;
    if (requestCount <= 3) {
      const error = new axios.AxiosError('Service unavailable', 'ERR_BAD_RESPONSE', config);
      error.response = { status: 503, statusText: 'Service Unavailable', headers: new axios.AxiosHeaders(), data: { error: 'Service unavailable' }, config };
      throw error;
    }
    return {
      data: { users: [{ id: 1, name: 'John' }] },
      status: 200,
      statusText: 'OK',
      headers: new axios.AxiosHeaders(),
      config
    };
  };
  
  const api = axios.create({
    adapter: mockAdapter,
    circuitBreaker: {
      enabled: true,
      failureThreshold: 3,
      recoveryTimeout: 1000,
      timeout: 5000
    }
  });
  
  for (let i = 0; i < 3; i++) {
    try {
      await api.get('/users');
    } catch (error) {
      // Expected failures
    }
  }
  
  const stats = api.getCircuitBreaker().getStats();
  assert.equal(stats.state, 'open');
  
  try {
    await api.get('/users');
    assert.fail('Should have thrown circuit breaker error');
  } catch (error) {
    assert.equal(error.isCircuitBreakerError, true);
  }
  
  api.resetCircuitBreaker();
  
  const response = await api.get('/users');
  assert.equal(response.data.users[0].name, 'John');
});

test('Axios - circuit breaker with fallback response', async () => {
  let requestCount = 0;
  const mockAdapter = async (config) => {
    requestCount++;
    const error = new axios.AxiosError('Service unavailable', 'ERR_BAD_RESPONSE', config);
    error.response = { status: 503, statusText: 'Service Unavailable', headers: new axios.AxiosHeaders(), data: { error: 'Service unavailable' }, config };
    throw error;
  };
  
  const api = axios.create({
    adapter: mockAdapter,
    circuitBreaker: {
      enabled: true,
      failureThreshold: 2,
      recoveryTimeout: 5000,
      onFallback: (error, context) => {
        return {
          data: { cached: true, users: [{ id: 1, name: 'Cached User' }] },
          status: 200,
          statusText: 'OK',
          headers: new axios.AxiosHeaders(),
          config: context,
          fromFallback: true
        };
      }
    }
  });
  
  for (let i = 0; i < 2; i++) {
    try {
      await api.get('/users');
    } catch (error) {
      // Expected
    }
  }
  
  const response = await api.get('/users');
  assert.equal(response.data.cached, true);
  assert.equal(response.fromFallback, true);
  assert.equal(response.data.users[0].name, 'Cached User');
});

test('Axios - circuit breaker management methods', async () => {
  const mockAdapter = async (config) => {
    return {
      data: { test: 'data' },
      status: 200,
      statusText: 'OK',
      headers: new axios.AxiosHeaders(),
      config
    };
  };
  
  const api = axios.create({
    adapter: mockAdapter,
    circuitBreaker: {
      enabled: true,
      failureThreshold: 5,
      recoveryTimeout: 60000
    }
  });
  
  const circuitBreaker = api.getCircuitBreaker();
  assert.equal(circuitBreaker.getState(), 'closed');
  
  api.setCircuitBreakerConfig({
    failureThreshold: 10,
    recoveryTimeout: 120000
  });
  
  const newConfig = api.getCircuitBreakerConfig();
  assert.equal(newConfig.failureThreshold, 10);
  assert.equal(newConfig.recoveryTimeout, 120000);
  
  api.resetCircuitBreaker();
  assert.equal(circuitBreaker.getState(), 'closed');
  
  const response = await api.get('/test');
  assert.equal(response.data.test, 'data');
});