import type { HealthThresholds } from '../health/HealthChecker';
import type { ServiceType } from '../services/ServiceMonitor';
import type { NotificationConfig } from '../notifications/types';
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
    notificationConfig: NotificationConfig;
    notifications: {
        enabled: boolean;
        webhook?: string;
        email?: string;
    };
}
export declare const DEFAULT_CONFIG: MonitorConfig;
export interface ValidationError {
    path: string;
    message: string;
    value?: unknown;
}
export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
}
export type ConfigChangeCallback = (config: MonitorConfig, previousConfig: MonitorConfig) => void;
export declare class ConfigManager {
    private configPath;
    private currentConfig;
    private fileWatcher;
    private changeCallbacks;
    private lastModifiedTime;
    constructor(configPath?: string);
    /**
     * Load configuration from file
     */
    load(): Promise<MonitorConfig>;
    /**
     * Save configuration to file
     */
    save(config: MonitorConfig): Promise<void>;
    /**
     * Initialize with default configuration
     */
    init(): Promise<void>;
    /**
     * Get configuration file path
     */
    getConfigPath(): string;
    /**
     * Merge user config with defaults
     */
    private mergeWithDefaults;
    /**
     * Validate configuration
     */
    validate(config?: MonitorConfig): ValidationResult;
    /**
     * Get a value by dot-notation path
     */
    getValue(path: string, config?: MonitorConfig): unknown;
    /**
     * Set a value by dot-notation path
     */
    setValue(path: string, value: unknown, config?: MonitorConfig): MonitorConfig;
    /**
     * Reset to default configuration
     */
    reset(): Promise<MonitorConfig>;
    /**
     * Enable hot-reload of configuration
     */
    enableHotReload(): void;
    /**
     * Disable hot-reload
     */
    disableHotReload(): void;
    /**
     * Register a callback for config changes
     */
    onChange(callback: ConfigChangeCallback): () => void;
    /**
     * Check if file exists
     */
    exists(): Promise<boolean>;
    /**
     * Get configuration as flat key-value pairs for listing
     */
    getFlatConfig(config?: MonitorConfig, prefix?: string): Record<string, unknown>;
}
export declare const configManager: ConfigManager;
