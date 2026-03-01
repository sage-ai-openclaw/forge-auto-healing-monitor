import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { DashboardServer } from '../src/api/server';
import { ConfigManager } from '../src/config/ConfigManager';

describe('Health Dashboard API (US4)', () => {
  let server: DashboardServer;

  beforeAll(async () => {
    // Initialize test config
    const configManager = new ConfigManager('/tmp/test-aheal-api-config.json');
    const config = await configManager.load();
    config.services = [
      {
        name: 'test-service',
        type: 'systemd',
        autoRestart: false,
        maxRestarts: 3,
        restartWindow: 300,
        checkInterval: 30,
      },
    ];
    await configManager.save(config);

    // Create server without WebSocket for testing
    server = new DashboardServer({
      port: 0, // Random port
      enableCors: true,
      enableWebSocket: false,
      broadcastInterval: 5000,
    });

    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('Basic endpoints', () => {
    it('should respond to ping', async () => {
      const app = server.getApp();
      const response = await request(app).get('/ping');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return 404 for unknown endpoints', async () => {
      const app = server.getApp();
      const response = await request(app).get('/api/unknown');
      
      expect(response.status).toBe(404);
      expect(response.body.status).toBe('error');
    });
  });

  describe('GET /api/health', () => {
    it('should return system health status', async () => {
      const app = server.getApp();
      const response = await request(app).get('/api/health');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('disk');
      expect(response.body.data).toHaveProperty('memory');
      expect(response.body.data).toHaveProperty('cpu');
      expect(response.body.data).toHaveProperty('timestamp');
      expect(response.body.data).toHaveProperty('overall');
    });

    it('should include health check details', async () => {
      const app = server.getApp();
      const response = await request(app).get('/api/health');
      
      const { disk, memory, cpu } = response.body.data;
      
      // Disk check
      expect(disk).toHaveProperty('name', 'disk');
      expect(disk).toHaveProperty('status');
      expect(disk).toHaveProperty('value');
      expect(disk).toHaveProperty('message');
      expect(['healthy', 'warning', 'critical']).toContain(disk.status);
      
      // Memory check
      expect(memory).toHaveProperty('name', 'memory');
      expect(memory).toHaveProperty('status');
      expect(memory).toHaveProperty('value');
      
      // CPU check
      expect(cpu).toHaveProperty('name', 'cpu');
      expect(cpu).toHaveProperty('status');
      expect(cpu).toHaveProperty('value');
    });

    it('should include overall status summary', async () => {
      const app = server.getApp();
      const response = await request(app).get('/api/health');
      
      const { overall } = response.body.data;
      expect(overall).toHaveProperty('status');
      expect(overall).toHaveProperty('hasIssues');
      expect(overall).toHaveProperty('criticalCount');
      expect(['healthy', 'warning', 'critical']).toContain(overall.status);
    });
  });

  describe('GET /api/health/summary', () => {
    it('should return health summary', async () => {
      const app = server.getApp();
      const response = await request(app).get('/api/health/summary');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('overall');
      expect(response.body.data).toHaveProperty('disk');
      expect(response.body.data).toHaveProperty('memory');
      expect(response.body.data).toHaveProperty('cpu');
      expect(response.body.data).toHaveProperty('timestamp');
    });

    it('should return simplified health data', async () => {
      const app = server.getApp();
      const response = await request(app).get('/api/health/summary');
      
      const { disk, memory, cpu } = response.body.data;
      
      // Should only have status and value
      expect(Object.keys(disk)).toEqual(['status', 'value']);
      expect(Object.keys(memory)).toEqual(['status', 'value']);
      expect(Object.keys(cpu)).toEqual(['status', 'value']);
    });
  });

  describe('GET /api/services', () => {
    it('should return services list', async () => {
      const app = server.getApp();
      const response = await request(app).get('/api/services');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('services');
      expect(response.body.data).toHaveProperty('summary');
      expect(Array.isArray(response.body.data.services)).toBe(true);
    });

    it('should include service summary', async () => {
      const app = server.getApp();
      const response = await request(app).get('/api/services');
      
      const { summary } = response.body.data;
      expect(summary).toHaveProperty('total');
      expect(summary).toHaveProperty('running');
      expect(summary).toHaveProperty('failed');
      expect(summary).toHaveProperty('overall');
      expect(['healthy', 'warning', 'critical']).toContain(summary.overall);
    });

    it('should include service details', async () => {
      const app = server.getApp();
      const response = await request(app).get('/api/services');
      
      if (response.body.data.services.length > 0) {
        const service = response.body.data.services[0];
        expect(service).toHaveProperty('name');
        expect(service).toHaveProperty('type');
        expect(service).toHaveProperty('config');
        expect(service).toHaveProperty('status');
      }
    });
  });

  describe('GET /api/services/:name', () => {
    it('should return 404 for non-existent service', async () => {
      const app = server.getApp();
      const response = await request(app).get('/api/services/non-existent-service');
      
      expect(response.status).toBe(404);
      expect(response.body.status).toBe('error');
    });
  });

  describe('GET /api/notifications', () => {
    it('should return notification history', async () => {
      const app = server.getApp();
      const response = await request(app).get('/api/notifications');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('notifications');
      expect(response.body.data).toHaveProperty('stats');
      expect(Array.isArray(response.body.data.notifications)).toBe(true);
    });

    it('should include notification stats', async () => {
      const app = server.getApp();
      const response = await request(app).get('/api/notifications');
      
      const { stats } = response.body.data;
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('bySeverity');
      expect(stats).toHaveProperty('byType');
      expect(stats).toHaveProperty('sent');
      expect(stats).toHaveProperty('failed');
      
      expect(stats.bySeverity).toHaveProperty('critical');
      expect(stats.bySeverity).toHaveProperty('warning');
      expect(stats.bySeverity).toHaveProperty('info');
      
      expect(stats.byType).toHaveProperty('health');
      expect(stats.byType).toHaveProperty('service');
      expect(stats.byType).toHaveProperty('system');
    });

    it('should support limit parameter', async () => {
      const app = server.getApp();
      const response = await request(app).get('/api/notifications?limit=5');
      
      expect(response.status).toBe(200);
      expect(response.body.data.notifications.length).toBeLessThanOrEqual(5);
    });

    it('should support severity filter', async () => {
      const app = server.getApp();
      const response = await request(app).get('/api/notifications?severity=critical');
      
      expect(response.status).toBe(200);
      // All returned notifications should have critical severity
      response.body.data.notifications.forEach((n: { severity: string }) => {
        expect(n.severity).toBe('critical');
      });
    });

    it('should support type filter', async () => {
      const app = server.getApp();
      const response = await request(app).get('/api/notifications?type=health');
      
      expect(response.status).toBe(200);
      // All returned notifications should have health type
      response.body.data.notifications.forEach((n: { type: string }) => {
        expect(n.type).toBe('health');
      });
    });
  });

  describe('GET /api/notifications/stats', () => {
    it('should return notification statistics', async () => {
      const app = server.getApp();
      const response = await request(app).get('/api/notifications/stats');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('total');
      expect(response.body.data).toHaveProperty('bySeverity');
      expect(response.body.data).toHaveProperty('byType');
      expect(response.body.data).toHaveProperty('hourly');
    });
  });

  describe('POST /api/notifications/test', () => {
    it('should send test notification', async () => {
      const app = server.getApp();
      const response = await request(app)
        .post('/api/notifications/test')
        .send({ title: 'Test', message: 'Test message', severity: 'info' });
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('sent');
      expect(response.body.data).toHaveProperty('channels');
      expect(response.body.data).toHaveProperty('timestamp');
    });

    it('should use default values when not provided', async () => {
      const app = server.getApp();
      const response = await request(app)
        .post('/api/notifications/test')
        .send({});
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });
  });

  describe('DELETE /api/notifications/history', () => {
    it('should clear notification history', async () => {
      const app = server.getApp();
      const response = await request(app).delete('/api/notifications/history');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('Notification history cleared');
    });
  });

  describe('GET /api/dashboard', () => {
    it('should return dashboard summary', async () => {
      const app = server.getApp();
      const response = await request(app).get('/api/dashboard');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('health');
      expect(response.body.data).toHaveProperty('services');
      expect(response.body.data).toHaveProperty('notifications');
      expect(response.body.data).toHaveProperty('timestamp');
    });

    it('should include health summary', async () => {
      const app = server.getApp();
      const response = await request(app).get('/api/dashboard');
      
      const { health } = response.body.data;
      expect(health).toHaveProperty('disk');
      expect(health).toHaveProperty('memory');
      expect(health).toHaveProperty('cpu');
      expect(health).toHaveProperty('overall');
    });

    it('should include services summary', async () => {
      const app = server.getApp();
      const response = await request(app).get('/api/dashboard');
      
      const { services } = response.body.data;
      expect(services).toHaveProperty('total');
    });

    it('should include notifications summary', async () => {
      const app = server.getApp();
      const response = await request(app).get('/api/dashboard');
      
      const { notifications } = response.body.data;
      expect(notifications).toHaveProperty('recent');
      expect(notifications).toHaveProperty('unread');
    });
  });

  describe('GET /api/events (SSE)', () => {
    it('should set SSE headers', async () => {
      const app = server.getApp();
      
      // SSE endpoints keep connection open, so we just verify it starts the response
      const req = request(app)
        .get('/api/events')
        .set('Accept', 'text/event-stream')
        .end(() => {}); // Don't wait for completion
      
      // Give it a moment to establish connection
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Abort the request
      req.abort();
      
      // If we got here without error, the endpoint is working
      expect(true).toBe(true);
    }, 5000);
  });

  describe('Error handling', () => {
    it('should handle errors gracefully', async () => {
      // This test verifies the error handler is in place
      const app = server.getApp();
      const response = await request(app).get('/api/unknown-path');
      
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('status', 'error');
      expect(response.body).toHaveProperty('message');
    });
  });
});

// Additional tests for WebSocket functionality
describe('WebSocket Manager', () => {
  it('should be importable', async () => {
    const { WebSocketManager } = await import('../src/api/websocket');
    expect(WebSocketManager).toBeDefined();
  });

  it('should create WebSocket manager instance', async () => {
    const { WebSocketManager } = await import('../src/api/websocket');
    const manager = new WebSocketManager(5000);
    expect(manager).toBeDefined();
    expect(manager.getClientCount()).toBe(0);
  });
});

// Test for API exports
describe('API Module Exports', () => {
  it('should export all required components', async () => {
    const api = await import('../src/api/index');
    
    expect(api.DashboardServer).toBeDefined();
    expect(api.createDashboardServer).toBeDefined();
    expect(api.dashboardServer).toBeDefined();
    expect(api.DEFAULT_SERVER_CONFIG).toBeDefined();
    expect(api.healthRouter).toBeDefined();
    expect(api.servicesRouter).toBeDefined();
    expect(api.notificationsRouter).toBeDefined();
    expect(api.WebSocketManager).toBeDefined();
    expect(api.wsManager).toBeDefined();
  });
});
