"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationService = exports.NotificationService = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const types_1 = require("./types");
class NotificationService {
    config;
    history = [];
    rateLimits = new Map();
    recentNotifications = new Map();
    historyFilePath;
    constructor(config) {
        this.config = { ...types_1.DEFAULT_NOTIFICATION_CONFIG, ...config };
        // Set up history file path if file channel is configured
        if (this.config.channels.file?.path) {
            this.historyFilePath = this.expandPath(this.config.channels.file.path);
        }
    }
    /**
     * Send a notification through configured channels
     */
    async notify(event) {
        if (!this.config.enabled) {
            const entry = this.createHistoryEntry(event, [], false);
            this.addToHistory(entry);
            return entry;
        }
        const fullEvent = {
            ...event,
            id: this.generateId(),
            timestamp: new Date(),
        };
        // Check for duplicate notification
        if (this.isDuplicate(fullEvent)) {
            const entry = this.createHistoryEntry(event, [], false);
            this.addToHistory(entry);
            return entry;
        }
        // Determine which channels to use based on rules
        const channels = this.getChannelsForEvent(fullEvent);
        if (channels.length === 0) {
            const entry = this.createHistoryEntry(event, [], false);
            this.addToHistory(entry);
            return entry;
        }
        // Check rate limits
        if (this.config.rateLimit.enabled && this.isRateLimited(fullEvent)) {
            const entry = this.createHistoryEntry(event, channels, false);
            this.addToHistory(entry);
            return entry;
        }
        // Send through each channel
        const errors = {};
        let anySuccess = false;
        for (const channel of channels) {
            try {
                await this.sendToChannel(fullEvent, channel);
                anySuccess = true;
            }
            catch (error) {
                errors[channel] = String(error);
            }
        }
        // Update rate limit tracking
        this.updateRateLimit(fullEvent);
        // Create history entry
        const historyEntry = this.createHistoryEntry(fullEvent, channels, anySuccess, Object.keys(errors).length > 0 ? errors : undefined);
        // Add to history
        this.addToHistory(historyEntry);
        return historyEntry;
    }
    /**
     * Quick methods for common notification types
     */
    async info(title, message, metadata) {
        return this.notify({ type: 'system', severity: 'info', title, message, metadata });
    }
    async warning(title, message, metadata) {
        return this.notify({ type: 'system', severity: 'warning', title, message, metadata });
    }
    async critical(title, message, metadata) {
        return this.notify({ type: 'system', severity: 'critical', title, message, metadata });
    }
    async healthAlert(checkName, status, message, value) {
        return this.notify({
            type: 'health',
            severity: status,
            title: `Health Alert: ${checkName}`,
            message,
            metadata: { checkName, value },
        });
    }
    async serviceAlert(serviceName, isRunning, action, details) {
        return this.notify({
            type: 'service',
            severity: isRunning ? 'info' : 'critical',
            title: `Service ${isRunning ? 'Restored' : 'Down'}: ${serviceName}`,
            message: details || `Service ${serviceName} is ${isRunning ? 'running' : 'not running'}`,
            metadata: { serviceName, isRunning, action },
        });
    }
    /**
     * Get notification history
     */
    getHistory(limit) {
        const sorted = [...this.history].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        return limit ? sorted.slice(0, limit) : sorted;
    }
    /**
     * Get recent notifications (last N minutes)
     */
    getRecent(minutes) {
        const cutoff = new Date(Date.now() - minutes * 60 * 1000);
        return this.history.filter(h => h.timestamp >= cutoff);
    }
    /**
     * Clear notification history
     */
    clearHistory() {
        this.history = [];
    }
    /**
     * Get rate limit status for debugging
     */
    getRateLimitStatus() {
        const now = Date.now();
        const result = {};
        for (const [key, entry] of this.rateLimits) {
            const windowEnd = entry.firstSeen.getTime() + this.config.rateLimit.windowMs;
            result[key] = {
                count: entry.count,
                windowRemainingMs: Math.max(0, windowEnd - now),
            };
        }
        return result;
    }
    /**
     * Test all configured notification channels
     */
    async testChannels() {
        const testEvent = {
            id: this.generateId(),
            type: 'system',
            severity: 'info',
            title: 'Test Notification',
            message: 'This is a test notification from Auto-Healing Monitor',
            timestamp: new Date(),
        };
        const results = {};
        const availableChannels = ['console'];
        if (this.config.channels.webhook?.url) {
            availableChannels.push('webhook');
        }
        if (this.config.channels.file?.path) {
            availableChannels.push('file');
        }
        for (const channel of availableChannels) {
            try {
                await this.sendToChannel(testEvent, channel);
                results[channel] = { success: true };
            }
            catch (error) {
                results[channel] = { success: false, error: String(error) };
            }
        }
        return results;
    }
    /**
     * Update configuration
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
        if (this.config.channels.file?.path) {
            this.historyFilePath = this.expandPath(this.config.channels.file.path);
        }
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
    // Private methods
    generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    expandPath(filePath) {
        if (filePath.startsWith('~/')) {
            return path_1.default.join(os_1.default.homedir(), filePath.slice(2));
        }
        return filePath;
    }
    getChannelsForEvent(event) {
        const channels = new Set();
        for (const rule of this.config.rules) {
            if (!rule.enabled)
                continue;
            if (!rule.severity.includes(event.severity))
                continue;
            if (!rule.types.includes(event.type))
                continue;
            for (const channel of rule.channels) {
                // Only add channel if it's configured
                if (this.isChannelConfigured(channel)) {
                    channels.add(channel);
                }
            }
        }
        return Array.from(channels);
    }
    isChannelConfigured(channel) {
        switch (channel) {
            case 'console':
                return this.config.channels.console !== false;
            case 'webhook':
                return !!this.config.channels.webhook?.url;
            case 'file':
                return !!this.config.channels.file?.path;
            default:
                return false;
        }
    }
    isDuplicate(event) {
        const key = `${event.type}:${event.severity}:${event.title}`;
        const lastSent = this.recentNotifications.get(key);
        if (!lastSent) {
            this.recentNotifications.set(key, event.timestamp);
            return false;
        }
        const isDup = (event.timestamp.getTime() - lastSent.getTime()) < this.config.deduplicationWindowMs;
        if (!isDup) {
            this.recentNotifications.set(key, event.timestamp);
        }
        return isDup;
    }
    isRateLimited(event) {
        const key = `${event.type}:${event.title}`;
        const now = Date.now();
        const entry = this.rateLimits.get(key);
        if (!entry) {
            return false;
        }
        const windowEnd = entry.firstSeen.getTime() + this.config.rateLimit.windowMs;
        // If window has expired, not rate limited
        if (now > windowEnd) {
            return false;
        }
        return entry.count >= this.config.rateLimit.maxPerWindow;
    }
    updateRateLimit(event) {
        const key = `${event.type}:${event.title}`;
        const now = new Date();
        const entry = this.rateLimits.get(key);
        if (!entry) {
            this.rateLimits.set(key, {
                count: 1,
                firstSeen: now,
                lastSent: now,
            });
            return;
        }
        const windowEnd = entry.firstSeen.getTime() + this.config.rateLimit.windowMs;
        // Reset if window expired
        if (now.getTime() > windowEnd) {
            this.rateLimits.set(key, {
                count: 1,
                firstSeen: now,
                lastSent: now,
            });
        }
        else {
            entry.count++;
            entry.lastSent = now;
        }
    }
    async sendToChannel(event, channel) {
        switch (channel) {
            case 'console':
                await this.sendToConsole(event);
                break;
            case 'webhook':
                await this.sendToWebhook(event);
                break;
            case 'file':
                await this.sendToFile(event);
                break;
        }
    }
    async sendToConsole(event) {
        const timestamp = event.timestamp.toISOString();
        const icon = this.getSeverityIcon(event.severity);
        console.log(`\n${icon} [${event.severity.toUpperCase()}] ${event.title}`);
        console.log(`   Time: ${timestamp}`);
        console.log(`   Type: ${event.type}`);
        console.log(`   ${event.message}`);
        if (event.metadata && Object.keys(event.metadata).length > 0) {
            console.log(`   Metadata: ${JSON.stringify(event.metadata)}`);
        }
    }
    async sendToWebhook(event) {
        const config = this.config.channels.webhook;
        if (!config?.url) {
            throw new Error('Webhook not configured');
        }
        const payload = {
            id: event.id,
            type: event.type,
            severity: event.severity,
            title: event.title,
            message: event.message,
            metadata: event.metadata,
            timestamp: event.timestamp.toISOString(),
        };
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), config.timeout || 30000);
        try {
            const response = await fetch(config.url, {
                method: config.method || 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...config.headers,
                },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async sendToFile(event) {
        const config = this.config.channels.file;
        if (!config?.path) {
            throw new Error('File channel not configured');
        }
        const filePath = this.expandPath(config.path);
        const dir = path_1.default.dirname(filePath);
        // Ensure directory exists
        await promises_1.default.mkdir(dir, { recursive: true });
        const entry = {
            ...event,
            timestamp: event.timestamp.toISOString(),
        };
        const line = JSON.stringify(entry) + '\n';
        await promises_1.default.appendFile(filePath, line, 'utf-8');
        // Check rotation if needed
        await this.maybeRotateLog(filePath, config.maxSize, config.maxFiles);
    }
    async maybeRotateLog(filePath, maxSize, maxFiles) {
        const sizeLimit = maxSize || 10 * 1024 * 1024;
        const fileLimit = maxFiles || 5;
        try {
            const stats = await promises_1.default.stat(filePath);
            if (stats.size < sizeLimit) {
                return;
            }
            // Rotate files: log.4 -> log.5, log.3 -> log.4, etc.
            for (let i = fileLimit - 1; i >= 1; i--) {
                const oldPath = i === 1 ? filePath : `${filePath}.${i - 1}`;
                const newPath = `${filePath}.${i}`;
                try {
                    await promises_1.default.rename(oldPath, newPath);
                }
                catch {
                    // File might not exist, that's ok
                }
            }
        }
        catch {
            // File might not exist yet
        }
    }
    getSeverityIcon(severity) {
        switch (severity) {
            case 'critical':
                return '🔴';
            case 'warning':
                return '🟡';
            case 'info':
                return '🔵';
            default:
                return '⚪';
        }
    }
    createHistoryEntry(event, channels, sentSuccessfully, errors) {
        return {
            ...event,
            id: this.generateId(),
            timestamp: new Date(),
            channels,
            sentSuccessfully,
            errors,
        };
    }
    addToHistory(entry) {
        this.history.push(entry);
        // Keep only last 1000 entries in memory
        if (this.history.length > 1000) {
            this.history = this.history.slice(-1000);
        }
    }
}
exports.NotificationService = NotificationService;
// Singleton instance for CLI usage
exports.notificationService = new NotificationService();
//# sourceMappingURL=NotificationService.js.map