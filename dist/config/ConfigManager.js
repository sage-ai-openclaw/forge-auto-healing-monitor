"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configManager = exports.ConfigManager = exports.DEFAULT_CONFIG = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
exports.DEFAULT_CONFIG = {
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
    notificationConfig: {
        enabled: true,
        rules: [
            {
                severity: ['critical'],
                types: ['health', 'service', 'system'],
                channels: ['console', 'file'],
                enabled: true,
            },
            {
                severity: ['warning'],
                types: ['health', 'service', 'system'],
                channels: ['console'],
                enabled: true,
            },
        ],
        channels: {
            console: true,
            file: {
                path: '~/.aheal/notifications.log',
                maxSize: 10 * 1024 * 1024,
                maxFiles: 5,
            },
        },
        rateLimit: {
            enabled: true,
            windowMs: 5 * 60 * 1000,
            maxPerWindow: 1,
        },
        deduplicationWindowMs: 60 * 1000,
    },
    notifications: {
        enabled: false,
    },
};
class ConfigManager {
    configPath;
    currentConfig = null;
    fileWatcher = null;
    changeCallbacks = [];
    lastModifiedTime = 0;
    constructor(configPath) {
        this.configPath = configPath || path_1.default.join(os_1.default.homedir(), '.aheal', 'config.json');
    }
    /**
     * Load configuration from file
     */
    async load() {
        try {
            const data = await promises_1.default.readFile(this.configPath, 'utf-8');
            const config = JSON.parse(data);
            this.currentConfig = this.mergeWithDefaults(config);
            return this.currentConfig;
        }
        catch {
            this.currentConfig = { ...exports.DEFAULT_CONFIG };
            return this.currentConfig;
        }
    }
    /**
     * Save configuration to file
     */
    async save(config) {
        const dir = path_1.default.dirname(this.configPath);
        await promises_1.default.mkdir(dir, { recursive: true });
        await promises_1.default.writeFile(this.configPath, JSON.stringify(config, null, 2));
        this.currentConfig = config;
    }
    /**
     * Initialize with default configuration
     */
    async init() {
        const config = await this.load();
        await this.save(config);
    }
    /**
     * Get configuration file path
     */
    getConfigPath() {
        return this.configPath;
    }
    /**
     * Merge user config with defaults
     */
    mergeWithDefaults(config) {
        return {
            healthCheckInterval: config.healthCheckInterval ?? exports.DEFAULT_CONFIG.healthCheckInterval,
            thresholds: {
                diskWarning: config.thresholds?.diskWarning ?? exports.DEFAULT_CONFIG.thresholds.diskWarning,
                diskCritical: config.thresholds?.diskCritical ?? exports.DEFAULT_CONFIG.thresholds.diskCritical,
                memoryWarning: config.thresholds?.memoryWarning ?? exports.DEFAULT_CONFIG.thresholds.memoryWarning,
                memoryCritical: config.thresholds?.memoryCritical ?? exports.DEFAULT_CONFIG.thresholds.memoryCritical,
                cpuWarning: config.thresholds?.cpuWarning ?? exports.DEFAULT_CONFIG.thresholds.cpuWarning,
                cpuCritical: config.thresholds?.cpuCritical ?? exports.DEFAULT_CONFIG.thresholds.cpuCritical,
            },
            services: config.services ?? exports.DEFAULT_CONFIG.services,
            notificationConfig: config.notificationConfig ?? exports.DEFAULT_CONFIG.notificationConfig,
            notifications: config.notifications ?? exports.DEFAULT_CONFIG.notifications,
        };
    }
    /**
     * Validate configuration
     */
    validate(config) {
        const targetConfig = config || this.currentConfig || exports.DEFAULT_CONFIG;
        const errors = [];
        // Validate healthCheckInterval
        if (typeof targetConfig.healthCheckInterval !== 'number' || targetConfig.healthCheckInterval <= 0) {
            errors.push({
                path: 'healthCheckInterval',
                message: 'healthCheckInterval must be a positive number',
                value: targetConfig.healthCheckInterval,
            });
        }
        // Validate thresholds
        const thresholdFields = [
            'diskWarning', 'diskCritical',
            'memoryWarning', 'memoryCritical',
            'cpuWarning', 'cpuCritical',
        ];
        for (const field of thresholdFields) {
            const value = targetConfig.thresholds[field];
            if (typeof value !== 'number' || value < 0 || value > 100) {
                errors.push({
                    path: `thresholds.${field}`,
                    message: `${field} must be a number between 0 and 100`,
                    value,
                });
            }
        }
        // Validate threshold relationships (warning should be lower than critical)
        if (targetConfig.thresholds.diskWarning >= targetConfig.thresholds.diskCritical) {
            errors.push({
                path: 'thresholds.diskWarning',
                message: 'diskWarning must be less than diskCritical',
                value: targetConfig.thresholds.diskWarning,
            });
        }
        if (targetConfig.thresholds.memoryWarning >= targetConfig.thresholds.memoryCritical) {
            errors.push({
                path: 'thresholds.memoryWarning',
                message: 'memoryWarning must be less than memoryCritical',
                value: targetConfig.thresholds.memoryWarning,
            });
        }
        if (targetConfig.thresholds.cpuWarning >= targetConfig.thresholds.cpuCritical) {
            errors.push({
                path: 'thresholds.cpuWarning',
                message: 'cpuWarning must be less than cpuCritical',
                value: targetConfig.thresholds.cpuWarning,
            });
        }
        // Validate services array
        if (!Array.isArray(targetConfig.services)) {
            errors.push({
                path: 'services',
                message: 'services must be an array',
                value: targetConfig.services,
            });
        }
        else {
            for (let i = 0; i < targetConfig.services.length; i++) {
                const service = targetConfig.services[i];
                if (!service.name || typeof service.name !== 'string') {
                    errors.push({
                        path: `services[${i}].name`,
                        message: 'Service name is required and must be a string',
                        value: service.name,
                    });
                }
                if (!service.type || !['systemd', 'docker'].includes(service.type)) {
                    errors.push({
                        path: `services[${i}].type`,
                        message: 'Service type must be "systemd" or "docker"',
                        value: service.type,
                    });
                }
                if (typeof service.maxRestarts !== 'number' || service.maxRestarts < 0) {
                    errors.push({
                        path: `services[${i}].maxRestarts`,
                        message: 'maxRestarts must be a non-negative number',
                        value: service.maxRestarts,
                    });
                }
                if (typeof service.restartWindow !== 'number' || service.restartWindow <= 0) {
                    errors.push({
                        path: `services[${i}].restartWindow`,
                        message: 'restartWindow must be a positive number',
                        value: service.restartWindow,
                    });
                }
                if (typeof service.checkInterval !== 'number' || service.checkInterval <= 0) {
                    errors.push({
                        path: `services[${i}].checkInterval`,
                        message: 'checkInterval must be a positive number',
                        value: service.checkInterval,
                    });
                }
            }
        }
        // Validate notificationConfig
        if (typeof targetConfig.notificationConfig?.enabled !== 'boolean') {
            errors.push({
                path: 'notificationConfig.enabled',
                message: 'notificationConfig.enabled must be a boolean',
                value: targetConfig.notificationConfig?.enabled,
            });
        }
        return {
            valid: errors.length === 0,
            errors,
        };
    }
    /**
     * Get a value by dot-notation path
     */
    getValue(path, config) {
        const targetConfig = config || this.currentConfig;
        if (!targetConfig) {
            return undefined;
        }
        const parts = path.split('.');
        let current = targetConfig;
        for (const part of parts) {
            if (current === null || current === undefined) {
                return undefined;
            }
            current = current[part];
        }
        return current;
    }
    /**
     * Set a value by dot-notation path
     */
    setValue(path, value, config) {
        const targetConfig = config ? { ...config } : this.currentConfig ? { ...this.currentConfig } : { ...exports.DEFAULT_CONFIG };
        const parts = path.split('.');
        let current = targetConfig;
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (current === null || current === undefined) {
                throw new Error(`Cannot set value at path ${path}: ${parts.slice(0, i + 1).join('.')} is undefined`);
            }
            const next = current[part];
            if (typeof next === 'object' && next !== null) {
                current[part] = Array.isArray(next) ? [...next] : { ...next };
            }
            current = current[part];
        }
        const lastPart = parts[parts.length - 1];
        if (current === null || current === undefined) {
            throw new Error(`Cannot set value at path ${path}: parent is undefined`);
        }
        current[lastPart] = value;
        return targetConfig;
    }
    /**
     * Reset to default configuration
     */
    async reset() {
        const config = { ...exports.DEFAULT_CONFIG };
        await this.save(config);
        return config;
    }
    /**
     * Enable hot-reload of configuration
     */
    enableHotReload() {
        if (this.fileWatcher) {
            return; // Already watching
        }
        // Initialize lastModifiedTime from current file if not set
        const initWatcher = async () => {
            try {
                const stats = await promises_1.default.stat(this.configPath);
                this.lastModifiedTime = stats.mtimeMs;
            }
            catch {
                // File might not exist yet
                this.lastModifiedTime = Date.now();
            }
        };
        initWatcher();
        // Use polling-based watcher for compatibility
        const watchFile = async () => {
            try {
                const stats = await promises_1.default.stat(this.configPath);
                const mtime = stats.mtimeMs;
                if (mtime > this.lastModifiedTime) {
                    this.lastModifiedTime = mtime;
                    const previousConfig = this.currentConfig ? structuredClone(this.currentConfig) : null;
                    const newConfig = await this.load();
                    // Notify callbacks
                    if (previousConfig) {
                        for (const callback of this.changeCallbacks) {
                            try {
                                callback(newConfig, previousConfig);
                            }
                            catch (err) {
                                console.error('Error in config change callback:', err);
                            }
                        }
                    }
                }
            }
            catch {
                // File might not exist yet, ignore
            }
        };
        // Check every 500ms for faster detection
        const intervalId = setInterval(watchFile, 500);
        this.fileWatcher = { close: () => clearInterval(intervalId) };
    }
    /**
     * Disable hot-reload
     */
    disableHotReload() {
        if (this.fileWatcher) {
            this.fileWatcher.close();
            this.fileWatcher = null;
        }
    }
    /**
     * Register a callback for config changes
     */
    onChange(callback) {
        this.changeCallbacks.push(callback);
        return () => {
            const index = this.changeCallbacks.indexOf(callback);
            if (index > -1) {
                this.changeCallbacks.splice(index, 1);
            }
        };
    }
    /**
     * Check if file exists
     */
    async exists() {
        try {
            await promises_1.default.access(this.configPath);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Get configuration as flat key-value pairs for listing
     */
    getFlatConfig(config, prefix = '') {
        const targetConfig = config || this.currentConfig || exports.DEFAULT_CONFIG;
        const result = {};
        for (const [key, value] of Object.entries(targetConfig)) {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                Object.assign(result, this.getFlatConfig(value, fullKey));
            }
            else {
                result[fullKey] = value;
            }
        }
        return result;
    }
}
exports.ConfigManager = ConfigManager;
// Singleton instance
exports.configManager = new ConfigManager();
//# sourceMappingURL=ConfigManager.js.map