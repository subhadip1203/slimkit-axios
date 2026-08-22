import axios, { CircuitBreakerConfig, AxiosError } from '@slimkit/axios';

// TypeScript example with type-safe circuit breaker configuration
const circuitBreakerConfig: CircuitBreakerConfig = {
  enabled: true,
  failureThreshold: 5,
  recoveryTimeout: 60000,
  timeout: 30000,
  successThreshold: 2,
  onStateChange: (state: 'closed' | 'open' | 'half-open', context: any) => {
    console.log(`Circuit breaker state: ${state}`);
    console.log('Context:', context);
  },
  onFallback: (error: any, context: any) => {
    console.log('Fallback triggered for:', context.url);
    return {
      data: { fallback: true, message: 'Service unavailable' },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: context,
      fromFallback: true
    };
  }
};

interface User {
  id: number;
  name: string;
  email: string;
}

interface Product {
  id: number;
  name: string;
  price: number;
}

// Typed API with circuit breaker
const api = axios.create({
  baseURL: 'https://api.example.com',
  circuitBreaker: circuitBreakerConfig
});

// Typed request with circuit breaker protection
const response = await api.get<User[]>('/users', {
  circuitBreaker: {
    enabled: true,
    failureThreshold: 3,
    timeout: 15000
  }
});

console.log('Users:', response.data);
console.log('From fallback:', response.fromFallback);

// Advanced circuit breaker with TypeScript
class ResilientService {
  private api: ReturnType<typeof axios.create>;
  private circuitBreaker: ReturnType<typeof axios.CircuitBreaker>;

  constructor(baseURL: string) {
    this.api = axios.create({
      baseURL,
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        recoveryTimeout: 60000,
        timeout: 30000,
        successThreshold: 3,
        rollingCountTimeout: 10000,
        rollingCountBuckets: 10,
        onStateChange: (state: 'closed' | 'open' | 'half-open', context: any) => {
          this.handleStateChange(state, context);
        },
        onFallback: (error: any, context: any) => {
          return this.getFallbackResponse(context);
        }
      }
    });
    this.circuitBreaker = this.api.getCircuitBreaker();
  }

  private handleStateChange(state: 'closed' | 'open' | 'half-open', context: any): void {
    console.log(`[${new Date().toISOString()}] Circuit breaker: ${state}`);
    console.log(`Failure count: ${context.failureCount}`);
    
    // Service-specific monitoring
    this.emitMonitoringEvent('circuit_breaker_state_change', {
      state,
      failureCount: context.failureCount,
      timestamp: new Date().toISOString()
    });
  }

  private getFallbackResponse(context: any): any {
    console.log('Using fallback for:', context.url);
    
    // Type-safe fallback response
    return {
      data: { 
        fallback: true, 
        message: 'Service temporarily unavailable',
        timestamp: new Date().toISOString()
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: context,
      fromFallback: true
    };
  }

  private emitMonitoringEvent(event: string, data: any): void {
    // Send to monitoring service
    console.log(`Monitoring: ${event}`, data);
  }

  async getUsers(): Promise<User[]> {
    try {
      const response = await this.api.get<User[]>('/users');
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Axios error:', error.message);
        throw error;
      }
      throw error;
    }
  }

  async getUserById(id: number): Promise<User> {
    try {
      const response = await this.api.get<User>(`/users/${id}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Axios error:', error.message);
        throw error;
      }
      throw error;
    }
  }

  async getProducts(): Promise<Product[]> {
    try {
      const response = await this.api.get<Product[]>('/products');
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Axios error:', error.message);
        throw error;
      }
      throw error;
    }
  }

  getCircuitBreakerHealth() {
    return this.circuitBreaker.getStats();
  }

  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }

  updateCircuitBreakerConfig(config: Partial<CircuitBreakerConfig>): void {
    this.circuitBreaker.setConfig(config);
  }
}

// Usage example
const service = new ResilientService('https://api.example.com');

try {
  const users = await service.getUsers();
  console.log('Users:', users);
} catch (error) {
  console.error('Failed to get users:', error);
}

// Check circuit breaker health
const health = service.getCircuitBreakerHealth();
console.log('Circuit breaker health:', health);

// Update configuration
service.updateCircuitBreakerConfig({
  failureThreshold: 10,
  recoveryTimeout: 120000
});

// Reset if needed
service.resetCircuitBreaker();

// Circuit breaker with dynamic configuration
const dynamicApi = axios.create({
  baseURL: 'https://api.example.com',
  circuitBreaker: {
    enabled: true,
    failureThreshold: (config: any) => {
      // Dynamic threshold based on endpoint
      if (config.url.includes('/v1/')) return 3;
      if (config.url.includes('/v2/')) return 5;
      return 4;
    },
    recoveryTimeout: (config: any) => {
      // Dynamic recovery timeout based on endpoint
      if (config.url.includes('/admin/')) return 30000;
      return 60000;
    },
    onStateChange: (state: 'closed' | 'open' | 'half-open', context: any) => {
      console.log(`Dynamic circuit breaker: ${state} for ${context.url}`);
    }
  }
});

// Circuit breaker with service-specific policies
interface ServicePolicy {
  critical: CircuitBreakerConfig;
  standard: CircuitBreakerConfig;
  background: CircuitBreakerConfig;
}

const servicePolicies: ServicePolicy = {
  critical: {
    enabled: true,
    failureThreshold: 2,
    recoveryTimeout: 30000,
    timeout: 10000,
    successThreshold: 3
  },
  standard: {
    enabled: true,
    failureThreshold: 5,
    recoveryTimeout: 60000,
    timeout: 30000,
    successThreshold: 2
  },
  background: {
    enabled: true,
    failureThreshold: 10,
    recoveryTimeout: 120000,
    timeout: 60000,
    successThreshold: 1
  }
};

class PolicyBasedService {
  private api: ReturnType<typeof axios.create>;

  constructor(baseURL: string) {
    this.api = axios.create({
      baseURL,
      circuitBreaker: {
        enabled: true,
        failureThreshold: (config: any) => {
          if (config.url.includes('/critical/')) return servicePolicies.critical.failureThreshold;
          if (config.url.includes('/background/')) return servicePolicies.background.failureThreshold;
          return servicePolicies.standard.failureThreshold;
        },
        recoveryTimeout: (config: any) => {
          if (config.url.includes('/critical/')) return servicePolicies.critical.recoveryTimeout;
          if (config.url.includes('/background/')) return servicePolicies.background.recoveryTimeout;
          return servicePolicies.standard.recoveryTimeout;
        }
      }
    });
  }

  async getCriticalData() {
    return await this.api.get('/critical/data');
  }

  async getStandardData() {
    return await this.api.get('/standard/data');
  }

  async getBackgroundData() {
    return await this.api.get('/background/data');
  }
}

// Usage
const policyService = new PolicyBasedService('https://api.example.com');
const criticalData = await policyService.getCriticalData();
const standardData = await policyService.getStandardData();
const backgroundData = await policyService.getBackgroundData();