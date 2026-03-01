import type { HealthThresholds } from '../health/HealthChecker';
import type { ServiceType } from '../services/ServiceMonitor';
export interface ServiceConfig {
    name: string;
    type: ServiceType;
    autoRestart: boolean;
    maxRestarts: number;
    restartWindow: number;
    checkInterval: number;
}
export interface MonitorConfig {
    healthCheckInterval: number;
    thresholds: HealthThresholds;
    services: ServiceConfig[];
    notifications: {
        enabled: boolean;
        webhook?: string;
        email?: string;
    };
}
export declare const DEFAULT_CONFIG: MonitorConfig;
export declare class ConfigManager {
    private configPath;
    constructor(configPath?: string);
    load(): Promise<MonitorConfig>;
    save(config: MonitorConfig): Promise<void>;
    init(): Promise<void>;
    getConfigPath(): string;
}
