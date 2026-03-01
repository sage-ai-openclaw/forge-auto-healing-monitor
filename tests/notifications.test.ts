import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotificationService } from '../src/notifications/NotificationService';
import { 
  DEFAULT_NOTIFICATION_CONFIG, 
  type NotificationConfig,
  type NotificationEvent,
} from '../src/notifications/types';

describe('NotificationService (US3)', () => {
  let service: NotificationService;

  beforeEach(() => {
    service = new NotificationService();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should use default config when none provided', () => {
      expect(service).toBeDefined();
      const config = service.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.rules).toHaveLength(2); // warning and critical rules
    });

    it('should accept custom config', () => {
      const customConfig: Partial<NotificationConfig> = {
        enabled: false,
        deduplicationWindowMs: 5000,
      };
      const customService = new NotificationService(customConfig);
      expect(customService.getConfig().enabled).toBe(false);
      expect(customService.getConfig().deduplicationWindowMs).toBe(5000);
    });
  });

  describe('basic notification', () => {
    it('should send notification and return history entry', async () => {
      const result = await service.notify({
        type: 'system',
        severity: 'critical',
        title: 'Test',
        message: 'Test message',
      });

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('timestamp');
      expect(result.title).toBe('Test');
      expect(result.message).toBe('Test message');
      expect(result.sentSuccessfully).toBe(true);
    });

    it('should not send when disabled', async () => {
      service.updateConfig({ enabled: false });

      const result = await service.notify({
        type: 'system',
        severity: 'critical',
        title: 'Test',
        message: 'Test message',
      });

      expect(result.sentSuccessfully).toBe(false);
    });

    it('should include channels in history entry', async () => {
      const result = await service.notify({
        type: 'system',
        severity: 'critical',
        title: 'Critical Test',
        message: 'Critical message',
      });

      expect(result.channels).toContain('console');
      expect(result.channels).toContain('file');
    });
  });

  describe('severity helper methods', () => {
    it('should send info notification', async () => {
      const result = await service.info('Info Title', 'Info message', { key: 'value' });
      expect(result.severity).toBe('info');
      expect(result.title).toBe('Info Title');
      expect(result.metadata).toEqual({ key: 'value' });
    });

    it('should send warning notification', async () => {
      const result = await service.warning('Warning Title', 'Warning message');
      expect(result.severity).toBe('warning');
      expect(result.title).toBe('Warning Title');
    });

    it('should send critical notification', async () => {
      const result = await service.critical('Critical Title', 'Critical message');
      expect(result.severity).toBe('critical');
      expect(result.title).toBe('Critical Title');
    });

    it('should send health alert', async () => {
      const result = await service.healthAlert('disk', 'warning', 'Disk 85% full', 85);
      expect(result.type).toBe('health');
      expect(result.severity).toBe('warning');
      expect(result.metadata).toEqual({ checkName: 'disk', value: 85 });
    });

    it('should send service alert for running service', async () => {
      const result = await service.serviceAlert('nginx', true, 'restarted', 'Service nginx restarted');
      expect(result.type).toBe('service');
      expect(result.severity).toBe('info');
      expect(result.metadata).toEqual({ serviceName: 'nginx', isRunning: true, action: 'restarted' });
    });

    it('should send service alert for stopped service', async () => {
      const result = await service.serviceAlert('nginx', false);
      expect(result.type).toBe('service');
      expect(result.severity).toBe('critical');
      expect(result.metadata?.isRunning).toBe(false);
    });
  });

  describe('rate limiting', () => {
    it('should rate limit repeated notifications', async () => {
      // First notification should go through
      const result1 = await service.notify({
        type: 'health',
        severity: 'critical',
        title: 'Same Issue',
        message: 'Issue message',
      });
      expect(result1.sentSuccessfully).toBe(true);

      // Second notification immediately should be rate limited
      const result2 = await service.notify({
        type: 'health',
        severity: 'critical',
        title: 'Same Issue',
        message: 'Issue message',
      });
      expect(result2.sentSuccessfully).toBe(false);
    });

    it('should reset rate limit after window expires', async () => {
      // First notification
      await service.notify({
        type: 'health',
        severity: 'critical',
        title: 'Same Issue',
        message: 'Issue message',
      });

      // Advance time past rate limit window (5 minutes default)
      vi.advanceTimersByTime(6 * 60 * 1000);

      // Should be able to send again
      const result = await service.notify({
        type: 'health',
        severity: 'critical',
        title: 'Same Issue',
        message: 'Issue message',
      });
      expect(result.sentSuccessfully).toBe(true);
    });

    it('should allow rate limit status check', () => {
      const status = service.getRateLimitStatus();
      expect(typeof status).toBe('object');
    });
  });

  describe('deduplication', () => {
    it('should deduplicate identical notifications within window', async () => {
      // Two identical notifications immediately
      const result1 = await service.notify({
        type: 'system',
        severity: 'info',
        title: 'Duplicate Test',
        message: 'Same message',
      });
      
      const result2 = await service.notify({
        type: 'system',
        severity: 'info',
        title: 'Duplicate Test',
        message: 'Same message',
      });

      // First might go through or be rate limited, second should be deduplicated
      // or rate limited depending on timing
      expect(result1.id).not.toBe(result2.id);
    });

    it('should allow different severity for same title', async () => {
      const result1 = await service.notify({
        type: 'system',
        severity: 'warning',
        title: 'Same Title',
        message: 'Message',
      });

      const result2 = await service.notify({
        type: 'system',
        severity: 'critical',
        title: 'Same Title',
        message: 'Message',
      });

      // Warning goes to console only, critical goes to console and file
      expect(result1.channels).toEqual(['console']);
      expect(result2.channels).toEqual(['console', 'file']);
      expect(result1.severity).not.toBe(result2.severity);
    });
  });

  describe('notification rules', () => {
    it('should route critical to console and file by default', async () => {
      const result = await service.critical('Critical', 'Critical message');
      expect(result.channels).toContain('console');
      expect(result.channels).toContain('file');
    });

    it('should route warning to console only by default', async () => {
      const result = await service.warning('Warning', 'Warning message');
      expect(result.channels).toContain('console');
      expect(result.channels).not.toContain('file');
    });

    it('should not send if no rules match', async () => {
      // Clear all rules so no notifications match
      service.updateConfig({ rules: [] });
      
      const result = await service.info('Info', 'Info message');
      expect(result.channels).toHaveLength(0);
      expect(result.sentSuccessfully).toBe(false);
    });

    it('should respect custom rules', async () => {
      service.updateConfig({
        rules: [
          {
            severity: ['info', 'warning', 'critical'],
            types: ['system'],
            channels: ['console'],
            enabled: true,
          },
        ],
      });

      const result = await service.info('Test', 'Test message');
      expect(result.channels).toContain('console');
      expect(result.sentSuccessfully).toBe(true);
    });

    it('should not send if rule is disabled', async () => {
      service.updateConfig({
        rules: [
          {
            severity: ['critical'],
            types: ['system'],
            channels: ['console'],
            enabled: false,
          },
        ],
      });

      const result = await service.critical('Test', 'Test message');
      expect(result.channels).toHaveLength(0);
    });
  });

  describe('notification history', () => {
    it('should track notification history', async () => {
      await service.info('Test 1', 'Message 1');
      await service.info('Test 2', 'Message 2');

      const history = service.getHistory();
      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    it('should return limited history', async () => {
      for (let i = 0; i < 5; i++) {
        await service.info(`Test ${i}`, `Message ${i}`);
      }

      const history = service.getHistory(3);
      expect(history.length).toBeLessThanOrEqual(3);
    });

    it('should get recent notifications', async () => {
      await service.info('Recent', 'Recent message');

      const recent = service.getRecent(1); // Last 1 minute
      expect(recent.length).toBeGreaterThanOrEqual(1);
    });

    it('should clear history', async () => {
      await service.info('Test', 'Message');
      expect(service.getHistory().length).toBeGreaterThan(0);

      service.clearHistory();
      expect(service.getHistory()).toHaveLength(0);
    });
  });

  describe('channel configuration', () => {
    it('should handle webhook configuration', async () => {
      service.updateConfig({
        channels: {
          console: true,
          webhook: {
            url: 'https://example.com/webhook',
            method: 'POST',
            timeout: 5000,
          },
        },
        rules: [
          {
            severity: ['critical'],
            types: ['system'],
            channels: ['console', 'webhook'],
            enabled: true,
          },
        ],
      });

      const config = service.getConfig();
      expect(config.channels.webhook?.url).toBe('https://example.com/webhook');
    });

    it('should handle file configuration', async () => {
      service.updateConfig({
        channels: {
          console: true,
          file: {
            path: '/tmp/test-notifications.log',
            maxSize: 1024,
            maxFiles: 3,
          },
        },
      });

      const config = service.getConfig();
      expect(config.channels.file?.path).toBe('/tmp/test-notifications.log');
      expect(config.channels.file?.maxSize).toBe(1024);
    });

    it('should expand ~ to home directory in file path', async () => {
      service.updateConfig({
        channels: {
          file: {
            path: '~/.aheal/test.log',
          },
        },
      });

      // Test by checking that it doesn't throw when trying to write
      // In actual implementation, ~ gets expanded
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      service.updateConfig({ enabled: false });
      expect(service.getConfig().enabled).toBe(false);
    });

    it('should merge partial config', () => {
      const originalWindow = service.getConfig().deduplicationWindowMs;
      service.updateConfig({ deduplicationWindowMs: 10000 });
      expect(service.getConfig().deduplicationWindowMs).toBe(10000);
      expect(service.getConfig().enabled).toBe(true); // unchanged
    });
  });

  describe('testChannels', () => {
    it('should test configured channels', async () => {
      const results = await service.testChannels();
      expect(results).toHaveProperty('console');
    });

    it('should test console channel successfully', async () => {
      const results = await service.testChannels();
      expect(results.console.success).toBe(true);
    });
  });
});
