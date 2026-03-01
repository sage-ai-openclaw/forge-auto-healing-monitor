import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServiceMonitor, type MonitoredService } from '../src/services/ServiceMonitor';

// Mock the entire child_process module
vi.mock('child_process', async () => {
  const mockExec = vi.fn();
  return {
    exec: mockExec,
  };
});

// Import exec after mocking
import { exec } from 'child_process';
const mockExec = exec as unknown as ReturnType<typeof vi.fn>;

describe('ServiceMonitor (US2)', () => {
  let monitor: ServiceMonitor;

  beforeEach(() => {
    monitor = new ServiceMonitor();
    vi.clearAllMocks();
  });

  afterEach(() => {
    monitor.stopAllMonitoring();
    vi.restoreAllMocks();
  });

  describe('addService', () => {
    it('should add a systemd service', () => {
      const service: MonitoredService = {
        name: 'nginx',
        type: 'systemd',
        autoRestart: true,
        maxRestarts: 3,
        restartWindow: 300,
        checkInterval: 30,
      };

      monitor.addService(service);
      const state = monitor.getService('nginx');

      expect(state).toBeDefined();
      expect(state?.service.name).toBe('nginx');
      expect(state?.service.type).toBe('systemd');
      expect(state?.restartHistory).toEqual([]);
    });

    it('should add a docker container', () => {
      const service: MonitoredService = {
        name: 'my-container',
        type: 'docker',
        autoRestart: false,
        maxRestarts: 5,
        restartWindow: 600,
        checkInterval: 60,
      };

      monitor.addService(service);
      const state = monitor.getService('my-container');

      expect(state).toBeDefined();
      expect(state?.service.type).toBe('docker');
    });
  });

  describe('removeService', () => {
    it('should remove a service', () => {
      const service: MonitoredService = {
        name: 'test-service',
        type: 'systemd',
        autoRestart: true,
        maxRestarts: 3,
        restartWindow: 300,
        checkInterval: 30,
      };

      monitor.addService(service);
      expect(monitor.getService('test-service')).toBeDefined();

      const removed = monitor.removeService('test-service');
      expect(removed).toBe(true);
      expect(monitor.getService('test-service')).toBeUndefined();
    });

    it('should return false for non-existent service', () => {
      const removed = monitor.removeService('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('getAllServices', () => {
    it('should return all services', () => {
      monitor.addService({
        name: 'service1',
        type: 'systemd',
        autoRestart: true,
        maxRestarts: 3,
        restartWindow: 300,
        checkInterval: 30,
      });
      monitor.addService({
        name: 'service2',
        type: 'docker',
        autoRestart: false,
        maxRestarts: 5,
        restartWindow: 600,
        checkInterval: 60,
      });

      const services = monitor.getAllServices();
      expect(services).toHaveLength(2);
    });

    it('should return empty array when no services', () => {
      const services = monitor.getAllServices();
      expect(services).toEqual([]);
    });
  });

  describe('checkService (systemd)', () => {
    it('should return running status for active systemd service', async () => {
      // Mock successful systemctl responses - promisified exec calls callback with (error, {stdout, stderr})
      mockExec.mockImplementation((cmd: string, opts: any, callback: any) => {
        // Handle both 2-arg and 3-arg forms
        const cb = typeof opts === 'function' ? opts : callback;
        
        if (cmd.includes('ActiveState')) {
          cb(null, { stdout: 'active\n', stderr: '' });
        } else if (cmd.includes('SubState')) {
          cb(null, { stdout: 'running\n', stderr: '' });
        } else if (cmd.includes('MainPID')) {
          cb(null, { stdout: '1234\n', stderr: '' });
        } else {
          cb(null, { stdout: '', stderr: '' });
        }
        return undefined as any;
      });

      monitor.addService({
        name: 'nginx',
        type: 'systemd',
        autoRestart: true,
        maxRestarts: 3,
        restartWindow: 300,
        checkInterval: 30,
      });

      const status = await monitor.checkService('nginx');

      expect(status.isRunning).toBe(true);
      expect(status.state).toBe('running');
      expect(status.pid).toBe(1234);
      expect(status.type).toBe('systemd');
    });

    it('should return not running for inactive systemd service', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, callback: any) => {
        const cb = typeof opts === 'function' ? opts : callback;
        
        if (cmd.includes('ActiveState')) {
          cb(null, { stdout: 'inactive\n', stderr: '' });
        } else if (cmd.includes('SubState')) {
          cb(null, { stdout: 'dead\n', stderr: '' });
        } else {
          cb(null, { stdout: '0\n', stderr: '' });
        }
        return undefined as any;
      });

      monitor.addService({
        name: 'nginx',
        type: 'systemd',
        autoRestart: true,
        maxRestarts: 3,
        restartWindow: 300,
        checkInterval: 30,
      });

      const status = await monitor.checkService('nginx');

      expect(status.isRunning).toBe(false);
      expect(status.state).toBe('dead');
    });

    it('should handle not-found systemd service', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, callback: any) => {
        const cb = typeof opts === 'function' ? opts : callback;
        cb(new Error('Failed to get properties'), { stdout: '', stderr: 'Failed' });
        return undefined as any;
      });

      monitor.addService({
        name: 'nonexistent',
        type: 'systemd',
        autoRestart: true,
        maxRestarts: 3,
        restartWindow: 300,
        checkInterval: 30,
      });

      const status = await monitor.checkService('nonexistent');

      expect(status.isRunning).toBe(false);
      expect(status.state).toBe('not-found');
    });
  });

  describe('checkService (docker)', () => {
    it('should return running status for running docker container', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, callback: any) => {
        const cb = typeof opts === 'function' ? opts : callback;
        cb(null, { stdout: 'running|1234|true', stderr: '' });
        return undefined as any;
      });

      monitor.addService({
        name: 'my-container',
        type: 'docker',
        autoRestart: true,
        maxRestarts: 3,
        restartWindow: 300,
        checkInterval: 30,
      });

      const status = await monitor.checkService('my-container');

      expect(status.isRunning).toBe(true);
      expect(status.state).toBe('running');
      expect(status.pid).toBe(1234);
      expect(status.type).toBe('docker');
    });

    it('should return not running for stopped docker container', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, callback: any) => {
        const cb = typeof opts === 'function' ? opts : callback;
        cb(null, { stdout: 'exited|0|false', stderr: '' });
        return undefined as any;
      });

      monitor.addService({
        name: 'my-container',
        type: 'docker',
        autoRestart: true,
        maxRestarts: 3,
        restartWindow: 300,
        checkInterval: 30,
      });

      const status = await monitor.checkService('my-container');

      expect(status.isRunning).toBe(false);
      expect(status.state).toBe('exited');
    });

    it('should handle not-found docker container', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, callback: any) => {
        const cb = typeof opts === 'function' ? opts : callback;
        cb(null, { stdout: 'not-found|0|false', stderr: '' });
        return undefined as any;
      });

      monitor.addService({
        name: 'nonexistent',
        type: 'docker',
        autoRestart: true,
        maxRestarts: 3,
        restartWindow: 300,
        checkInterval: 30,
      });

      const status = await monitor.checkService('nonexistent');

      expect(status.isRunning).toBe(false);
      expect(status.state).toBe('not-found');
    });
  });

  describe('checkAllServices', () => {
    it('should check all services', async () => {
      let callCount = 0;
      mockExec.mockImplementation((cmd: string, opts: any, callback: any) => {
        const cb = typeof opts === 'function' ? opts : callback;
        callCount++;
        if (callCount <= 3) { // nginx: ActiveState, SubState, MainPID
          const output = callCount === 1 ? 'active\n' : callCount === 2 ? 'running\n' : '1234\n';
          cb(null, { stdout: output, stderr: '' });
        } else {
          // docker container
          cb(null, { stdout: 'running|5678|true', stderr: '' });
        }
        return undefined as any;
      });

      monitor.addService({
        name: 'nginx',
        type: 'systemd',
        autoRestart: false,
        maxRestarts: 3,
        restartWindow: 300,
        checkInterval: 30,
      });
      monitor.addService({
        name: 'redis',
        type: 'docker',
        autoRestart: false,
        maxRestarts: 3,
        restartWindow: 300,
        checkInterval: 30,
      });

      const results = await monitor.checkAllServices();

      expect(results).toHaveLength(2);
    });
  });

  describe('restart tracking', () => {
    it('should track restart history', () => {
      const service: MonitoredService = {
        name: 'test-service',
        type: 'systemd',
        autoRestart: true,
        maxRestarts: 3,
        restartWindow: 300,
        checkInterval: 30,
      };

      monitor.addService(service);
      
      const history = monitor.getRestartHistory('test-service');
      expect(history).toEqual([]);
    });

    it('should return undefined for non-existent service history', () => {
      const history = monitor.getRestartHistory('non-existent');
      expect(history).toBeUndefined();
    });

    it('should clear restart history', () => {
      monitor.addService({
        name: 'test-service',
        type: 'systemd',
        autoRestart: true,
        maxRestarts: 3,
        restartWindow: 300,
        checkInterval: 30,
      });

      const cleared = monitor.clearRestartHistory('test-service');
      expect(cleared).toBe(true);
    });
  });

  describe('monitoring lifecycle', () => {
    it('should start monitoring a service', () => {
      monitor.addService({
        name: 'test-service',
        type: 'systemd',
        autoRestart: true,
        maxRestarts: 3,
        restartWindow: 300,
        checkInterval: 1, // 1 second for testing
      });

      const started = monitor.startMonitoring('test-service');
      expect(started).toBe(true);

      const stopped = monitor.stopMonitoring('test-service');
      expect(stopped).toBe(true);
    });

    it('should return false when starting monitoring for non-existent service', () => {
      const started = monitor.startMonitoring('non-existent');
      expect(started).toBe(false);
    });

    it('should return false when stopping monitoring for non-monitored service', () => {
      const stopped = monitor.stopMonitoring('non-existent');
      expect(stopped).toBe(false);
    });

    it('should start monitoring all services', () => {
      monitor.addService({
        name: 'service1',
        type: 'systemd',
        autoRestart: true,
        maxRestarts: 3,
        restartWindow: 300,
        checkInterval: 60,
      });
      monitor.addService({
        name: 'service2',
        type: 'docker',
        autoRestart: true,
        maxRestarts: 3,
        restartWindow: 300,
        checkInterval: 60,
      });

      // Should not throw
      monitor.startAllMonitoring();
      monitor.stopAllMonitoring();
    });
  });

  describe('error handling', () => {
    it('should throw when checking non-existent service', async () => {
      await expect(monitor.checkService('non-existent')).rejects.toThrow('not found');
    });
  });
});
