import type { WebSocket } from 'ws';
import { HealthChecker } from '../health/HealthChecker';
import { ConfigManager } from '../config/ConfigManager';
import { ServiceMonitor } from '../services/ServiceMonitor';
import type { NotificationEvent } from '../notifications/types';

export interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping' | 'get_health' | 'get_services';
  channel?: string;
}

export interface HealthUpdate {
  type: 'health_update';
  data: {
    disk: { status: string; value: number };
    memory: { status: string; value: number };
    cpu: { status: string; value: number };
    overall: string;
    timestamp: Date;
  };
}

export interface ServiceUpdate {
  type: 'service_update';
  data: {
    services: Array<{
      name: string;
      isRunning: boolean;
      state: string;
    }>;
    summary: {
      total: number;
      running: number;
      failed: number;
    };
  };
}

export interface NotificationUpdate {
  type: 'notification';
  data: NotificationEvent;
}

export type UpdateMessage = HealthUpdate | ServiceUpdate | NotificationUpdate;

export class WebSocketManager {
  private clients: Set<WebSocket> = new Set();
  private healthInterval?: NodeJS.Timeout;
  private serviceInterval?: NodeJS.Timeout;
  private isRunning = false;
  private healthChecker: HealthChecker;
  private serviceMonitor: ServiceMonitor;
  private configManager: ConfigManager;
  private broadcastInterval: number;

  constructor(broadcastIntervalMs = 5000) {
    this.broadcastInterval = broadcastIntervalMs;
    this.configManager = new ConfigManager();
    this.healthChecker = new HealthChecker();
    this.serviceMonitor = new ServiceMonitor();
  }

  async initialize(): Promise<void> {
    const config = await this.configManager.load();
    this.healthChecker = new HealthChecker(config.thresholds);
    
    // Load services into monitor
    for (const svc of config.services) {
      this.serviceMonitor.addService({
        name: svc.name,
        type: svc.type,
        autoRestart: false, // Don't auto-restart in API mode
        maxRestarts: svc.maxRestarts,
        restartWindow: svc.restartWindow,
        checkInterval: svc.checkInterval,
      });
    }
  }

  addClient(ws: WebSocket): void {
    this.clients.add(ws);
    
    ws.on('message', (data) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        this.handleMessage(ws, message);
      } catch {
        // Invalid message, ignore
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
    });

    ws.on('error', () => {
      this.clients.delete(ws);
    });

    // Send initial health data
    this.sendInitialData(ws);
  }

  private async sendInitialData(ws: WebSocket): Promise<void> {
    try {
      // Send current health
      const health = await this.healthChecker.checkAll();
      const hasIssues = this.healthChecker.hasIssues(health);
      const criticalIssues = this.healthChecker.getCriticalIssues(health);
      
      const healthUpdate: HealthUpdate = {
        type: 'health_update',
        data: {
          disk: { status: health.disk.status, value: health.disk.value },
          memory: { status: health.memory.status, value: health.memory.value },
          cpu: { status: health.cpu.status, value: health.cpu.value },
          overall: criticalIssues.length > 0 ? 'critical' : hasIssues ? 'warning' : 'healthy',
          timestamp: health.timestamp,
        },
      };
      
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(JSON.stringify(healthUpdate));
      }

      // Send current services status
      await this.broadcastServiceUpdate();
    } catch {
      // Ignore errors during initial data send
    }
  }

  private handleMessage(ws: WebSocket, message: WebSocketMessage): void {
    switch (message.type) {
      case 'ping':
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        }
        break;
      case 'get_health':
        this.sendInitialData(ws);
        break;
      case 'get_services':
        this.broadcastServiceUpdate();
        break;
    }
  }

  startBroadcasting(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Broadcast health updates
    this.healthInterval = setInterval(async () => {
      await this.broadcastHealthUpdate();
    }, this.broadcastInterval);

    // Broadcast service updates (less frequently)
    this.serviceInterval = setInterval(async () => {
      await this.broadcastServiceUpdate();
    }, this.broadcastInterval * 2);
  }

  stopBroadcasting(): void {
    this.isRunning = false;
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = undefined;
    }
    if (this.serviceInterval) {
      clearInterval(this.serviceInterval);
      this.serviceInterval = undefined;
    }
  }

  private async broadcastHealthUpdate(): Promise<void> {
    try {
      const health = await this.healthChecker.checkAll();
      const hasIssues = this.healthChecker.hasIssues(health);
      const criticalIssues = this.healthChecker.getCriticalIssues(health);
      
      const update: HealthUpdate = {
        type: 'health_update',
        data: {
          disk: { status: health.disk.status, value: health.disk.value },
          memory: { status: health.memory.status, value: health.memory.value },
          cpu: { status: health.cpu.status, value: health.cpu.value },
          overall: criticalIssues.length > 0 ? 'critical' : hasIssues ? 'warning' : 'healthy',
          timestamp: health.timestamp,
        },
      };

      this.broadcast(update);
    } catch {
      // Ignore broadcast errors
    }
  }

  private async broadcastServiceUpdate(): Promise<void> {
    try {
      const checkResults = await this.serviceMonitor.checkAllServices();
      const services = this.serviceMonitor.getAllServices().map(state => ({
        name: state.service.name,
        isRunning: state.status.isRunning,
        state: state.status.state,
      }));

      const runningCount = services.filter(s => s.isRunning).length;

      const update: ServiceUpdate = {
        type: 'service_update',
        data: {
          services,
          summary: {
            total: services.length,
            running: runningCount,
            failed: services.length - runningCount,
          },
        },
      };

      this.broadcast(update);
    } catch {
      // Ignore broadcast errors
    }
  }

  broadcastNotification(event: NotificationEvent): void {
    const update: NotificationUpdate = {
      type: 'notification',
      data: event,
    };
    this.broadcast(update);
  }

  private broadcast(message: UpdateMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(data);
      }
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }

  closeAll(): void {
    this.stopBroadcasting();
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
  }
}

export const wsManager = new WebSocketManager();
