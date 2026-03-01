import { describe, it, expect } from 'vitest';
import { HealthChecker, DEFAULT_THRESHOLDS } from '../src/health/HealthChecker';
import { ConfigManager } from '../src/config/ConfigManager';

describe('HealthChecker (US1)', () => {
  describe('constructor', () => {
    it('should use default thresholds', () => {
      const checker = new HealthChecker();
      expect(checker).toBeDefined();
    });

    it('should accept custom thresholds', () => {
      const checker = new HealthChecker({
        diskWarning: 70,
        diskCritical: 85,
      });
      expect(checker).toBeDefined();
    });
  });

  describe('checkDisk', () => {
    it('should return disk health check', async () => {
      const checker = new HealthChecker();
      const result = await checker.checkDisk();
      
      expect(result).toHaveProperty('name', 'disk');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('value');
      expect(result).toHaveProperty('message');
      expect(['healthy', 'warning', 'critical']).toContain(result.status);
    });
  });

  describe('checkMemory', () => {
    it('should return memory health check', async () => {
      const checker = new HealthChecker();
      const result = await checker.checkMemory();
      
      expect(result).toHaveProperty('name', 'memory');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('value');
      expect(result).toHaveProperty('message');
      expect(['healthy', 'warning', 'critical']).toContain(result.status);
    });
  });

  describe('checkCpu', () => {
    it('should return CPU health check', async () => {
      const checker = new HealthChecker();
      const result = await checker.checkCpu();
      
      expect(result).toHaveProperty('name', 'cpu');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('value');
      expect(result).toHaveProperty('message');
      expect(['healthy', 'warning', 'critical']).toContain(result.status);
    });
  });

  describe('checkAll', () => {
    it('should return complete system health', async () => {
      const checker = new HealthChecker();
      const health = await checker.checkAll();
      
      expect(health).toHaveProperty('disk');
      expect(health).toHaveProperty('memory');
      expect(health).toHaveProperty('cpu');
      expect(health).toHaveProperty('timestamp');
    });
  });

  describe('hasIssues', () => {
    it('should return false for healthy system', () => {
      const checker = new HealthChecker();
      const health = {
        disk: { status: 'healthy', value: 50, threshold: 80, message: 'OK', timestamp: new Date(), name: 'disk' },
        memory: { status: 'healthy', value: 50, threshold: 80, message: 'OK', timestamp: new Date(), name: 'memory' },
        cpu: { status: 'healthy', value: 50, threshold: 70, message: 'OK', timestamp: new Date(), name: 'cpu' },
        timestamp: new Date(),
      };
      
      expect(checker.hasIssues(health)).toBe(false);
    });

    it('should return true for warning system', () => {
      const checker = new HealthChecker();
      const health = {
        disk: { status: 'warning', value: 85, threshold: 80, message: 'Warning', timestamp: new Date(), name: 'disk' },
        memory: { status: 'healthy', value: 50, threshold: 80, message: 'OK', timestamp: new Date(), name: 'memory' },
        cpu: { status: 'healthy', value: 50, threshold: 70, message: 'OK', timestamp: new Date(), name: 'cpu' },
        timestamp: new Date(),
      };
      
      expect(checker.hasIssues(health)).toBe(true);
    });
  });

  describe('getCriticalIssues', () => {
    it('should return only critical issues', () => {
      const checker = new HealthChecker();
      const health = {
        disk: { status: 'critical', value: 95, threshold: 80, message: 'Critical', timestamp: new Date(), name: 'disk' },
        memory: { status: 'warning', value: 85, threshold: 80, message: 'Warning', timestamp: new Date(), name: 'memory' },
        cpu: { status: 'healthy', value: 50, threshold: 70, message: 'OK', timestamp: new Date(), name: 'cpu' },
        timestamp: new Date(),
      };
      
      const critical = checker.getCriticalIssues(health);
      expect(critical).toHaveLength(1);
      expect(critical[0].name).toBe('disk');
    });
  });
});

describe('ConfigManager', () => {
  it('should load default config when file does not exist', async () => {
    const configManager = new ConfigManager('/tmp/non-existent-config.json');
    const config = await configManager.load();
    
    expect(config).toHaveProperty('healthCheckInterval');
    expect(config).toHaveProperty('thresholds');
    expect(config).toHaveProperty('services');
  });

  it('should save and load config', async () => {
    const configManager = new ConfigManager('/tmp/test-aheal-config.json');
    
    const config = await configManager.load();
    config.healthCheckInterval = 120;
    await configManager.save(config);
    
    const loaded = await configManager.load();
    expect(loaded.healthCheckInterval).toBe(120);
  });
});
