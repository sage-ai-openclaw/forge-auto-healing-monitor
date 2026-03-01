import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { 
  type NotificationEvent, 
  type NotificationConfig, 
  type NotificationChannel,
  type NotificationHistoryEntry,
  type SeverityLevel,
  DEFAULT_NOTIFICATION_CONFIG,
  type RateLimitEntry,
} from './types';

export class NotificationService {
  private config: NotificationConfig;
  private history: NotificationHistoryEntry[] = [];
  private rateLimits: Map<string, RateLimitEntry> = new Map();
  private recentNotifications: Map<string, Date> = new Map();
  private historyFilePath?: string;

  constructor(config?: Partial<NotificationConfig>) {
    this.config = { ...DEFAULT_NOTIFICATION_CONFIG, ...config };
    
    // Set up history file path if file channel is configured
    if (this.config.channels.file?.path) {
      this.historyFilePath = this.expandPath(this.config.channels.file.path);
    }
  }

  /**
   * Send a notification through configured channels
   */
  async notify(event: Omit<NotificationEvent, 'id' | 'timestamp'>): Promise<NotificationHistoryEntry> {
    if (!this.config.enabled) {
      const entry = this.createHistoryEntry(event, [], false);
      this.addToHistory(entry);
      return entry;
    }

    const fullEvent: NotificationEvent = {
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
    const errors: Record<NotificationChannel, string> = {} as Record<NotificationChannel, string>;
    let anySuccess = false;

    for (const channel of channels) {
      try {
        await this.sendToChannel(fullEvent, channel);
        anySuccess = true;
      } catch (error) {
        errors[channel] = String(error);
      }
    }

    // Update rate limit tracking
    this.updateRateLimit(fullEvent);

    // Create history entry
    const historyEntry = this.createHistoryEntry(
      fullEvent,
      channels,
      anySuccess,
      Object.keys(errors).length > 0 ? errors : undefined
    );

    // Add to history
    this.addToHistory(historyEntry);

    return historyEntry;
  }

  /**
   * Quick methods for common notification types
   */
  async info(title: string, message: string, metadata?: Record<string, unknown>): Promise<NotificationHistoryEntry> {
    return this.notify({ type: 'system', severity: 'info', title, message, metadata });
  }

  async warning(title: string, message: string, metadata?: Record<string, unknown>): Promise<NotificationHistoryEntry> {
    return this.notify({ type: 'system', severity: 'warning', title, message, metadata });
  }

  async critical(title: string, message: string, metadata?: Record<string, unknown>): Promise<NotificationHistoryEntry> {
    return this.notify({ type: 'system', severity: 'critical', title, message, metadata });
  }

  async healthAlert(checkName: string, status: 'warning' | 'critical', message: string, value?: number): Promise<NotificationHistoryEntry> {
    return this.notify({
      type: 'health',
      severity: status,
      title: `Health Alert: ${checkName}`,
      message,
      metadata: { checkName, value },
    });
  }

  async serviceAlert(serviceName: string, isRunning: boolean, action?: string, details?: string): Promise<NotificationHistoryEntry> {
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
  getHistory(limit?: number): NotificationHistoryEntry[] {
    const sorted = [...this.history].sort((a, b) => 
      b.timestamp.getTime() - a.timestamp.getTime()
    );
    return limit ? sorted.slice(0, limit) : sorted;
  }

  /**
   * Get recent notifications (last N minutes)
   */
  getRecent(minutes: number): NotificationHistoryEntry[] {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return this.history.filter(h => h.timestamp >= cutoff);
  }

  /**
   * Clear notification history
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Get rate limit status for debugging
   */
  getRateLimitStatus(): Record<string, { count: number; windowRemainingMs: number }> {
    const now = Date.now();
    const result: Record<string, { count: number; windowRemainingMs: number }> = {};
    
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
  async testChannels(): Promise<Record<NotificationChannel, { success: boolean; error?: string }>> {
    const testEvent: NotificationEvent = {
      id: this.generateId(),
      type: 'system',
      severity: 'info',
      title: 'Test Notification',
      message: 'This is a test notification from Auto-Healing Monitor',
      timestamp: new Date(),
    };

    const results: Record<NotificationChannel, { success: boolean; error?: string }> = {} as Record<NotificationChannel, { success: boolean; error?: string }>;

    const availableChannels: NotificationChannel[] = ['console'];
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
      } catch (error) {
        results[channel] = { success: false, error: String(error) };
      }
    }

    return results;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<NotificationConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.config.channels.file?.path) {
      this.historyFilePath = this.expandPath(this.config.channels.file.path);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): NotificationConfig {
    return { ...this.config };
  }

  // Private methods

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private expandPath(filePath: string): string {
    if (filePath.startsWith('~/')) {
      return path.join(os.homedir(), filePath.slice(2));
    }
    return filePath;
  }

  private getChannelsForEvent(event: NotificationEvent): NotificationChannel[] {
    const channels = new Set<NotificationChannel>();

    for (const rule of this.config.rules) {
      if (!rule.enabled) continue;
      if (!rule.severity.includes(event.severity)) continue;
      if (!rule.types.includes(event.type)) continue;
      
      for (const channel of rule.channels) {
        // Only add channel if it's configured
        if (this.isChannelConfigured(channel)) {
          channels.add(channel);
        }
      }
    }

    return Array.from(channels);
  }

  private isChannelConfigured(channel: NotificationChannel): boolean {
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

  private isDuplicate(event: NotificationEvent): boolean {
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

  private isRateLimited(event: NotificationEvent): boolean {
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

  private updateRateLimit(event: NotificationEvent): void {
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
    } else {
      entry.count++;
      entry.lastSent = now;
    }
  }

  private async sendToChannel(event: NotificationEvent, channel: NotificationChannel): Promise<void> {
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

  private async sendToConsole(event: NotificationEvent): Promise<void> {
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

  private async sendToWebhook(event: NotificationEvent): Promise<void> {
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
    } finally {
      clearTimeout(timeout);
    }
  }

  private async sendToFile(event: NotificationEvent): Promise<void> {
    const config = this.config.channels.file;
    if (!config?.path) {
      throw new Error('File channel not configured');
    }

    const filePath = this.expandPath(config.path);
    const dir = path.dirname(filePath);
    
    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });

    const entry = {
      ...event,
      timestamp: event.timestamp.toISOString(),
    };

    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(filePath, line, 'utf-8');

    // Check rotation if needed
    await this.maybeRotateLog(filePath, config.maxSize, config.maxFiles);
  }

  private async maybeRotateLog(filePath: string, maxSize?: number, maxFiles?: number): Promise<void> {
    const sizeLimit = maxSize || 10 * 1024 * 1024;
    const fileLimit = maxFiles || 5;

    try {
      const stats = await fs.stat(filePath);
      if (stats.size < sizeLimit) {
        return;
      }

      // Rotate files: log.4 -> log.5, log.3 -> log.4, etc.
      for (let i = fileLimit - 1; i >= 1; i--) {
        const oldPath = i === 1 ? filePath : `${filePath}.${i - 1}`;
        const newPath = `${filePath}.${i}`;
        
        try {
          await fs.rename(oldPath, newPath);
        } catch {
          // File might not exist, that's ok
        }
      }
    } catch {
      // File might not exist yet
    }
  }

  private getSeverityIcon(severity: SeverityLevel): string {
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

  private createHistoryEntry(
    event: Omit<NotificationEvent, 'id' | 'timestamp'>,
    channels: NotificationChannel[],
    sentSuccessfully: boolean,
    errors?: Record<NotificationChannel, string>
  ): NotificationHistoryEntry {
    return {
      ...event,
      id: this.generateId(),
      timestamp: new Date(),
      channels,
      sentSuccessfully,
      errors,
    };
  }

  private addToHistory(entry: NotificationHistoryEntry): void {
    this.history.push(entry);
    
    // Keep only last 1000 entries in memory
    if (this.history.length > 1000) {
      this.history = this.history.slice(-1000);
    }
  }
}

// Singleton instance for CLI usage
export const notificationService = new NotificationService();
