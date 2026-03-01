import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  ConfigManager,
  DEFAULT_CONFIG,
  type MonitorConfig,
  type ValidationResult,
} from '../src/config/ConfigManager';

describe('ConfigManager', () => {
  let tempDir: string;
  let configManager: ConfigManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aheal-test-'));
    configManager = new ConfigManager(path.join(tempDir, 'config.json'));
  });

  afterEach(async () => {
    configManager.disableHotReload();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('load()', () => {
    it('should return default config when file does not exist', async () => {
      const config = await configManager.load();
      expect(config.healthCheckInterval).toBe(DEFAULT_CONFIG.healthCheckInterval);
      expect(config.thresholds).toEqual(DEFAULT_CONFIG.thresholds);
      expect(config.services).toEqual([]);
    });

    it('should load config from file', async () => {
      const customConfig = {
        healthCheckInterval: 120,
        thresholds: {
          diskWarning: 75,
          diskCritical: 90,
          memoryWarning: 80,
          memoryCritical: 95,
          cpuWarning: 70,
          cpuCritical: 85,
        },
      };

      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'config.json'),
        JSON.stringify(customConfig)
      );

      const config = await configManager.load();
      expect(config.healthCheckInterval).toBe(120);
      expect(config.thresholds.diskWarning).toBe(75);
    });

    it('should merge partial config with defaults', async () => {
      const partialConfig = {
        healthCheckInterval: 90,
      };

      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'config.json'),
        JSON.stringify(partialConfig)
      );

      const config = await configManager.load();
      expect(config.healthCheckInterval).toBe(90);
      expect(config.thresholds.diskWarning).toBe(DEFAULT_CONFIG.thresholds.diskWarning);
    });
  });

  describe('save()', () => {
    it('should save config to file', async () => {
      const config: MonitorConfig = {
        ...DEFAULT_CONFIG,
        healthCheckInterval: 120,
      };

      await configManager.save(config);

      const data = await fs.readFile(path.join(tempDir, 'config.json'), 'utf-8');
      const saved = JSON.parse(data);
      expect(saved.healthCheckInterval).toBe(120);
    });

    it('should create directory if it does not exist', async () => {
      const nestedPath = path.join(tempDir, 'nested', 'deep', 'config.json');
      const manager = new ConfigManager(nestedPath);

      await manager.save(DEFAULT_CONFIG);

      const stats = await fs.stat(path.dirname(nestedPath));
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('validate()', () => {
    it('should validate valid config', () => {
      const result = configManager.validate(DEFAULT_CONFIG);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid healthCheckInterval', () => {
      const config = {
        ...DEFAULT_CONFIG,
        healthCheckInterval: -1,
      };

      const result = configManager.validate(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'healthCheckInterval')).toBe(true);
    });

    it('should detect invalid threshold values', () => {
      const config = {
        ...DEFAULT_CONFIG,
        thresholds: {
          ...DEFAULT_CONFIG.thresholds,
          diskWarning: 150,
        },
      };

      const result = configManager.validate(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'thresholds.diskWarning')).toBe(true);
    });

    it('should detect negative threshold values', () => {
      const config = {
        ...DEFAULT_CONFIG,
        thresholds: {
          ...DEFAULT_CONFIG.thresholds,
          memoryWarning: -10,
        },
      };

      const result = configManager.validate(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'thresholds.memoryWarning')).toBe(true);
    });

    it('should detect warning >= critical for disk', () => {
      const config = {
        ...DEFAULT_CONFIG,
        thresholds: {
          ...DEFAULT_CONFIG.thresholds,
          diskWarning: 95,
          diskCritical: 90,
        },
      };

      const result = configManager.validate(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'thresholds.diskWarning')).toBe(true);
    });

    it('should detect warning >= critical for memory', () => {
      const config = {
        ...DEFAULT_CONFIG,
        thresholds: {
          ...DEFAULT_CONFIG.thresholds,
          memoryWarning: 95,
          memoryCritical: 90,
        },
      };

      const result = configManager.validate(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'thresholds.memoryWarning')).toBe(true);
    });

    it('should detect warning >= critical for CPU', () => {
      const config = {
        ...DEFAULT_CONFIG,
        thresholds: {
          ...DEFAULT_CONFIG.thresholds,
          cpuWarning: 90,
          cpuCritical: 85,
        },
      };

      const result = configManager.validate(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'thresholds.cpuWarning')).toBe(true);
    });

    it('should validate services array', () => {
      const config = {
        ...DEFAULT_CONFIG,
        services: 'invalid' as unknown as MonitorConfig['services'],
      };

      const result = configManager.validate(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'services')).toBe(true);
    });

    it('should validate service config with missing name', () => {
      const config = {
        ...DEFAULT_CONFIG,
        services: [
          {
            type: 'systemd',
            autoRestart: true,
            maxRestarts: 3,
            restartWindow: 300,
            checkInterval: 30,
          } as MonitorConfig['services'][0],
        ],
      };

      const result = configManager.validate(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'services[0].name')).toBe(true);
    });

    it('should validate service config with invalid type', () => {
      const config = {
        ...DEFAULT_CONFIG,
        services: [
          {
            name: 'test',
            type: 'invalid',
            autoRestart: true,
            maxRestarts: 3,
            restartWindow: 300,
            checkInterval: 30,
          } as unknown as MonitorConfig['services'][0],
        ],
      };

      const result = configManager.validate(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'services[0].type')).toBe(true);
    });

    it('should validate service config with negative maxRestarts', () => {
      const config = {
        ...DEFAULT_CONFIG,
        services: [
          {
            name: 'test',
            type: 'systemd',
            autoRestart: true,
            maxRestarts: -1,
            restartWindow: 300,
            checkInterval: 30,
          },
        ],
      };

      const result = configManager.validate(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'services[0].maxRestarts')).toBe(true);
    });

    it('should validate service config with invalid restartWindow', () => {
      const config = {
        ...DEFAULT_CONFIG,
        services: [
          {
            name: 'test',
            type: 'systemd',
            autoRestart: true,
            maxRestarts: 3,
            restartWindow: 0,
            checkInterval: 30,
          },
        ],
      };

      const result = configManager.validate(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'services[0].restartWindow')).toBe(true);
    });

    it('should validate service config with invalid checkInterval', () => {
      const config = {
        ...DEFAULT_CONFIG,
        services: [
          {
            name: 'test',
            type: 'systemd',
            autoRestart: true,
            maxRestarts: 3,
            restartWindow: 300,
            checkInterval: -5,
          },
        ],
      };

      const result = configManager.validate(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'services[0].checkInterval')).toBe(true);
    });
  });

  describe('getValue()', () => {
    it('should get value by simple path', () => {
      configManager.load();
      const value = configManager.getValue('healthCheckInterval', DEFAULT_CONFIG);
      expect(value).toBe(DEFAULT_CONFIG.healthCheckInterval);
    });

    it('should get value by nested path', () => {
      const value = configManager.getValue('thresholds.diskWarning', DEFAULT_CONFIG);
      expect(value).toBe(DEFAULT_CONFIG.thresholds.diskWarning);
    });

    it('should return undefined for non-existent path', () => {
      const value = configManager.getValue('nonexistent.path', DEFAULT_CONFIG);
      expect(value).toBeUndefined();
    });

    it('should get services array', () => {
      const config = {
        ...DEFAULT_CONFIG,
        services: [{ name: 'test', type: 'systemd' as const, autoRestart: true, maxRestarts: 3, restartWindow: 300, checkInterval: 30 }],
      };
      const value = configManager.getValue('services', config);
      expect(value).toEqual(config.services);
    });
  });

  describe('setValue()', () => {
    it('should set value by simple path', () => {
      const newConfig = configManager.setValue('healthCheckInterval', 120, DEFAULT_CONFIG);
      expect(newConfig.healthCheckInterval).toBe(120);
    });

    it('should set value by nested path', () => {
      const newConfig = configManager.setValue('thresholds.diskWarning', 75, DEFAULT_CONFIG);
      expect(newConfig.thresholds.diskWarning).toBe(75);
    });

    it('should not mutate original config', () => {
      const original = { ...DEFAULT_CONFIG };
      configManager.setValue('healthCheckInterval', 120, DEFAULT_CONFIG);
      expect(DEFAULT_CONFIG.healthCheckInterval).toBe(original.healthCheckInterval);
    });

    it('should throw error for invalid path', () => {
      expect(() => {
        configManager.setValue('nonexistent.newValue', 123, DEFAULT_CONFIG);
      }).toThrow();
    });
  });

  describe('reset()', () => {
    it('should reset to default config', async () => {
      const modifiedConfig = {
        ...DEFAULT_CONFIG,
        healthCheckInterval: 999,
      };
      await configManager.save(modifiedConfig);

      const resetConfig = await configManager.reset();
      expect(resetConfig.healthCheckInterval).toBe(DEFAULT_CONFIG.healthCheckInterval);

      const data = await fs.readFile(path.join(tempDir, 'config.json'), 'utf-8');
      const saved = JSON.parse(data);
      expect(saved.healthCheckInterval).toBe(DEFAULT_CONFIG.healthCheckInterval);
    });
  });

  describe('exists()', () => {
    it('should return false when file does not exist', async () => {
      const exists = await configManager.exists();
      expect(exists).toBe(false);
    });

    it('should return true when file exists', async () => {
      await configManager.save(DEFAULT_CONFIG);
      const exists = await configManager.exists();
      expect(exists).toBe(true);
    });
  });

  describe('getFlatConfig()', () => {
    it('should return flat key-value pairs', () => {
      const flat = configManager.getFlatConfig(DEFAULT_CONFIG);
      expect(flat['healthCheckInterval']).toBe(DEFAULT_CONFIG.healthCheckInterval);
      expect(flat['thresholds.diskWarning']).toBe(DEFAULT_CONFIG.thresholds.diskWarning);
      expect(flat['thresholds.diskCritical']).toBe(DEFAULT_CONFIG.thresholds.diskCritical);
    });

    it('should flatten nested objects', () => {
      const flat = configManager.getFlatConfig(DEFAULT_CONFIG);
      const keys = Object.keys(flat);
      expect(keys.some(k => k.startsWith('thresholds.'))).toBe(true);
    });
  });

  describe('getConfigPath()', () => {
    it('should return configured path', () => {
      const expectedPath = path.join(tempDir, 'config.json');
      expect(configManager.getConfigPath()).toBe(expectedPath);
    });

    it('should return default path when not specified', () => {
      const defaultManager = new ConfigManager();
      expect(defaultManager.getConfigPath()).toContain('.aheal/config.json');
    });
  });

  describe('hot reload', () => {
    it('should enable hot reload', () => {
      configManager.enableHotReload();
      // Should not throw
    });

    it('should disable hot reload', () => {
      configManager.enableHotReload();
      configManager.disableHotReload();
      // Should not throw
    });

    it('should call callback on config change', async () => {
      await configManager.save(DEFAULT_CONFIG);
      await configManager.load();

      const callback = vi.fn();
      configManager.onChange(callback);
      configManager.enableHotReload();

      // Wait for initial watch setup
      await new Promise(resolve => setTimeout(resolve, 100));

      // Modify the config
      const newConfig = {
        ...DEFAULT_CONFIG,
        healthCheckInterval: 200,
      };
      await configManager.save(newConfig);

      // Wait for file watcher to detect change
      await new Promise(resolve => setTimeout(resolve, 2500));

      expect(callback).toHaveBeenCalled();
    }, 10000);

    it('should allow unregistering callback', () => {
      const callback = vi.fn();
      const unregister = configManager.onChange(callback);
      unregister();
      // Should not throw
    });
  });
});
