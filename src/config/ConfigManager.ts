import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { HealthThresholds } from '../health/HealthChecker';
import type { ServiceType } from '../services/ServiceMonitor';

export interface ServiceConfig {
  name: string;
  type: ServiceType;
  autoRestart: boolean;
  maxRestarts: number;
  restartWindow: number;  // seconds
  checkInterval: number;  // seconds
}

export interface MonitorConfig {
  healthCheckInterval: number;  // seconds
  thresholds: HealthThresholds;
  services: ServiceConfig[];
  notifications: {
    enabled: boolean;
    webhook?: string;
    email?: string;
  };
}

export const DEFAULT_CONFIG: MonitorConfig = {
  healthCheckInterval: 60,
  thresholds: {
    diskWarning: 80,
    diskCritical: 90,
    memoryWarning: 80,
    memoryCritical: 90,
    cpuWarning: 70,
    cpuCritical: 85,
  },
  services: [],
  notifications: {
    enabled: false,
  },
};

export class ConfigManager {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(os.homedir(), '.aheal', 'config.json');
  }

  async load(): Promise<MonitorConfig> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(data);
      return { ...DEFAULT_CONFIG, ...config };
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  async save(config: MonitorConfig): Promise<void> {
    const dir = path.dirname(this.configPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
  }

  async init(): Promise<void> {
    const config = await this.load();
    await this.save(config);
  }

  getConfigPath(): string {
    return this.configPath;
  }
}
