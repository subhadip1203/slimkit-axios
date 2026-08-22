import axios from '@slimkit/axios';

// Basic circuit breaker configuration
const api = axios.create({
  baseURL: 'https://api.example.com',
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,      // Open after 5 failures
    recoveryTimeout: 60000,   // Try recovery after 1 minute
    timeout: 30000,           // Individual request timeout
    successThreshold: 2,      // Successes required to close circuit
    onStateChange: (state, context) => {
      console.log(`Circuit breaker state changed to: ${state}`);
      console.log('Context:', context);
    }
  }
});

// These requests will be protected by circuit breaker
try {
  const users = await api.get('/users');
  console.log('Users:', users.data);
} catch (error) {
  if (error.isCircuitBreakerError) {
    console.log('Circuit breaker is OPEN, using fallback');
    // Implement fallback logic
    const cachedUsers = localStorage.getItem('cachedUsers');
    if (cachedUsers) {
      console.log('Using cached data:', JSON.parse(cachedUsers));
    }
  }
}

// Advanced circuit breaker with fallback
const resilientApi = axios.create({
  baseURL: 'https://api.example.com',
  circuitBreaker: {
    enabled: true,
    failureThreshold: 3,
    recoveryTimeout: 30000,
    timeout: 15000,
    successThreshold: 2,
    onStateChange: (state, context) => {
      console.log(`[${new Date().toISOString()}] Circuit breaker: ${state}`);
    },
    onFallback: (error, context) => {
      console.log('Circuit breaker fallback triggered');
      // Return cached data or default response
      return {
        data: { users: [], message: 'Service unavailable, using cached data' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: context,
        fromFallback: true
      };
    }
  }
});

const data = await resilientApi.get('/data');
console.log('Response:', data.data);
console.log('From fallback:', data.fromFallback);

// Circuit breaker with monitoring
const monitoredApi = axios.create({
  baseURL: 'https://api.example.com',
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    recoveryTimeout: 60000,
    timeout: 30000,
    successThreshold: 3,
    rollingCountTimeout: 10000,  // 10 second rolling window
    rollingCountBuckets: 10,    // 1 second buckets
    onStateChange: (state, context) => {
      console.log(`🔌 Circuit breaker: ${state}`);
      console.log(`📊 Failure count: ${context.failureCount}`);
      
      // Send monitoring data
      if (typeof window !== 'undefined' && window.navigator.sendBeacon) {
        const monitoringData = {
          event: 'circuit_breaker_state_change',
          state,
          failureCount: context.failureCount,
          timestamp: new Date().toISOString()
        };
        // Send to monitoring service
        // navigator.sendBeacon('/monitoring', JSON.stringify(monitoringData));
      }
    }
  }
});

// Manual circuit breaker management
const managedApi = axios.create({
  baseURL: 'https://api.example.com',
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    recoveryTimeout: 60000
  }
});

// Get circuit breaker stats
const stats = managedApi.getCircuitBreaker().getStats();
console.log('Circuit breaker stats:', stats);

// Manually reset circuit breaker
managedApi.resetCircuitBreaker();

// Update circuit breaker configuration
managedApi.setCircuitBreakerConfig({
  failureThreshold: 10,
  recoveryTimeout: 120000  // 2 minutes
});

// Circuit breaker for different service tiers
const tieredApi = axios.create({
  baseURL: 'https://api.example.com',
  circuitBreaker: {
    enabled: true,
    failureThreshold: (config) => {
      // Different thresholds for different endpoints
      if (config.url.includes('/critical/')) return 2;  // Stricter for critical
      if (config.url.includes('/secondary/')) return 10; // More lenient for secondary
      return 5; // Default
    },
    recoveryTimeout: (config) => {
      // Different recovery times based on endpoint
      if (config.url.includes('/critical/')) return 30000;  // 30 seconds
      if (config.url.includes('/secondary/')) return 120000; // 2 minutes
      return 60000; // Default 1 minute
    },
    onStateChange: (state, context) => {
      console.log(`Circuit breaker for ${context.url}: ${state}`);
    }
  }
});

// Circuit breaker with exponential backoff integration
const apiWithRetryAndCircuitBreaker = axios.create({
  baseURL: 'https://api.example.com',
  circuitBreaker: {
    enabled: true,
    failureThreshold: 3,
    recoveryTimeout: 60000,
    timeout: 10000,
    successThreshold: 2
  },
  retry: {
    retries: 2,
    retryDelay: 1000,
    retryCondition: (error) => {
      // Don't retry if circuit breaker is involved
      if (error.isCircuitBreakerError) return false;
      return error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
    }
  }
});

// Circuit breaker health check
async function checkCircuitBreakerHealth(api) {
  const circuitBreaker = api.getCircuitBreaker();
  const stats = circuitBreaker.getStats();
  
  const health = {
    state: stats.state,
    isHealthy: stats.state === 'closed',
    failureCount: stats.failureCount,
    successCount: stats.successCount,
    lastFailureTime: stats.lastFailureTime,
    nextAttemptTime: stats.nextAttemptTime,
    rollingFailures: stats.rollingFailures
  };
  
  console.log('Circuit breaker health:', health);
  return health;
}

// Usage with health monitoring
await checkCircuitBreakerHealth(managedApi);

// Circuit breaker for specific request only
const specificRequest = await axios.get('/endpoint', {
  circuitBreaker: {
    enabled: true,
    failureThreshold: 2,
    recoveryTimeout: 30000,
    timeout: 5000,
    onFallback: (error, context) => {
      console.log('Fallback for specific request');
      return { data: { fallback: true }, status: 200 };
    }
  }
});

// Circuit breaker with circuit breaker patterns
class ServiceClient {
  constructor(baseURL) {
    this.api = axios.create({
      baseURL,
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        recoveryTimeout: 60000,
        timeout: 30000,
        successThreshold: 3,
        onStateChange: (state, context) => {
          this.handleStateChange(state, context);
        },
        onFallback: (error, context) => {
          return this.getFallbackResponse(context);
        }
      }
    });
  }
  
  handleStateChange(state, context) {
    console.log(`Service ${this.api.defaults.baseURL} circuit breaker: ${state}`);
    
    // Implement service-specific logic
    if (state === 'open') {
      this.notifyServiceDegraded();
    } else if (state === 'closed') {
      this.notifyServiceRecovered();
    }
  }
  
  async getFallbackResponse(context) {
    // Implement service-specific fallback
    console.log('Using fallback for:', context.url);
    return {
      data: { fallback: true, timestamp: Date.now() },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: context,
      fromFallback: true
    };
  }
  
  notifyServiceDegraded() {
    console.log('Service degraded, circuit breaker is OPEN');
  }
  
  notifyServiceRecovered() {
    console.log('Service recovered, circuit breaker is CLOSED');
  }
  
  async get(endpoint) {
    return await this.api.get(endpoint);
  }
  
  async post(endpoint, data) {
    return await this.api.post(endpoint, data);
  }
  
  getHealth() {
    return this.api.getCircuitBreaker().getStats();
  }
}

// Usage
const client = new ServiceClient('https://api.example.com');
const data = await client.get('/users');
console.log('Data:', data.data);