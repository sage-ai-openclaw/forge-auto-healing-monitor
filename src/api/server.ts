import express from 'express';
import cors from 'cors';
import { createServer as createHttpServer } from 'http';
import { WebSocketServer } from 'ws';
import { healthRouter } from './routes/health';
import { servicesRouter } from './routes/services';
import { notificationsRouter } from './routes/notifications';
import { WebSocketManager } from './websocket';

export interface ServerConfig {
  port: number;
  enableCors: boolean;
  enableWebSocket: boolean;
  broadcastInterval: number;
}

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  port: 3000,
  enableCors: true,
  enableWebSocket: true,
  broadcastInterval: 5000,
};

export class DashboardServer {
  private app: express.Application;
  private server: ReturnType<typeof createHttpServer>;
  private wss?: WebSocketServer;
  private wsManager: WebSocketManager;
  private config: ServerConfig;
  private isRunning = false;

  constructor(config: Partial<ServerConfig> = {}) {
    this.config = { ...DEFAULT_SERVER_CONFIG, ...config };
    this.app = express();
    this.server = createHttpServer(this.app);
    this.wsManager = new WebSocketManager(this.config.broadcastInterval);

    this.setupMiddleware();
    this.setupRoutes();
    
    if (this.config.enableWebSocket) {
      this.setupWebSocket();
    }
  }

  private setupMiddleware(): void {
    // CORS
    if (this.config.enableCors) {
      this.app.use(cors({
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      }));
    }

    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging (development)
    this.app.use((req, _res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint (simple ping)
    this.app.get('/ping', (_req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // API routes
    this.app.use('/api/health', healthRouter);
    this.app.use('/api/services', servicesRouter);
    this.app.use('/api/notifications', notificationsRouter);

    // Dashboard info endpoint
    this.app.get('/api/dashboard', async (_req, res) => {
      try {
        const { HealthChecker } = await import('../health/HealthChecker');
        const { ConfigManager } = await import('../config/ConfigManager');
        const { NotificationService } = await import('../notifications/NotificationService');

        const configManager = new ConfigManager();
        const config = await configManager.load();

        const healthChecker = new HealthChecker(config.thresholds);
        const health = await healthChecker.checkAll();

        const notificationService = new NotificationService(config.notificationConfig);
        const recentNotifications = notificationService.getRecent(60); // Last hour

        const criticalIssues = healthChecker.getCriticalIssues(health);
        const hasIssues = healthChecker.hasIssues(health);

        res.json({
          status: 'success',
          data: {
            health: {
              disk: { status: health.disk.status, value: health.disk.value },
              memory: { status: health.memory.status, value: health.memory.value },
              cpu: { status: health.cpu.status, value: health.cpu.value },
              overall: criticalIssues.length > 0 ? 'critical' : hasIssues ? 'warning' : 'healthy',
            },
            services: {
              total: config.services.length,
            },
            notifications: {
              recent: recentNotifications.length,
              unread: recentNotifications.filter(n => n.severity === 'critical' && !n.sentSuccessfully).length,
            },
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        res.status(500).json({
          status: 'error',
          message: `Failed to get dashboard data: ${error}`,
        });
      }
    });

    // Server-sent events endpoint for live updates (alternative to WebSocket)
    this.app.get('/api/events', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const sendEvent = (data: unknown) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      // Send initial connection message
      sendEvent({ type: 'connected', timestamp: new Date().toISOString() });

      // Set up interval to send health updates
      const interval = setInterval(async () => {
        try {
          const { HealthChecker } = await import('../health/HealthChecker');
          const { ConfigManager } = await import('../config/ConfigManager');

          const configManager = new ConfigManager();
          const config = await configManager.load();
          const healthChecker = new HealthChecker(config.thresholds);
          const health = await healthChecker.checkAll();

          sendEvent({
            type: 'health_update',
            data: {
              disk: { status: health.disk.status, value: health.disk.value },
              memory: { status: health.memory.status, value: health.memory.value },
              cpu: { status: health.cpu.status, value: health.cpu.value },
              timestamp: health.timestamp,
            },
          });
        } catch {
          sendEvent({ type: 'error', message: 'Failed to fetch health data' });
        }
      }, this.config.broadcastInterval);

      // Clean up on client disconnect
      req.on('close', () => {
        clearInterval(interval);
      });
    });

    // Error handling
    this.app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error('API Error:', err);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
      });
    });

    // 404 handler
    this.app.use((_req, res) => {
      res.status(404).json({
        status: 'error',
        message: 'Endpoint not found',
      });
    });
  }

  private setupWebSocket(): void {
    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on('connection', (ws, req) => {
      console.log(`WebSocket client connected from ${req.socket.remoteAddress}`);
      this.wsManager.addClient(ws);
    });

    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Server is already running');
    }

    // Initialize WebSocket manager
    await this.wsManager.initialize();

    return new Promise((resolve) => {
      this.server.listen(this.config.port, () => {
        this.isRunning = true;
        console.log(`🚀 Dashboard server running on port ${this.config.port}`);
        console.log(`   API: http://localhost:${this.config.port}/api`);
        console.log(`   WebSocket: ws://localhost:${this.config.port}`);
        
        if (this.config.enableWebSocket) {
          this.wsManager.startBroadcasting();
        }
        
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.wsManager.stopBroadcasting();
    this.wsManager.closeAll();

    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.isRunning = false;
          console.log('Dashboard server stopped');
          resolve();
        }
      });
    });
  }

  getApp(): express.Application {
    return this.app;
  }

  getPort(): number {
    return this.config.port;
  }

  isListening(): boolean {
    return this.isRunning;
  }
}

// Export factory function for easy usage
export function createDashboardServer(config?: Partial<ServerConfig>): DashboardServer {
  return new DashboardServer(config);
}

// Singleton instance for CLI usage
export const dashboardServer = new DashboardServer();
