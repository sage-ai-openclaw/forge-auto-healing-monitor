import { type NotificationEvent, type NotificationConfig, type NotificationChannel, type NotificationHistoryEntry } from './types';
export declare class NotificationService {
    private config;
    private history;
    private rateLimits;
    private recentNotifications;
    private historyFilePath?;
    constructor(config?: Partial<NotificationConfig>);
    /**
     * Send a notification through configured channels
     */
    notify(event: Omit<NotificationEvent, 'id' | 'timestamp'>): Promise<NotificationHistoryEntry>;
    /**
     * Quick methods for common notification types
     */
    info(title: string, message: string, metadata?: Record<string, unknown>): Promise<NotificationHistoryEntry>;
    warning(title: string, message: string, metadata?: Record<string, unknown>): Promise<NotificationHistoryEntry>;
    critical(title: string, message: string, metadata?: Record<string, unknown>): Promise<NotificationHistoryEntry>;
    healthAlert(checkName: string, status: 'warning' | 'critical', message: string, value?: number): Promise<NotificationHistoryEntry>;
    serviceAlert(serviceName: string, isRunning: boolean, action?: string, details?: string): Promise<NotificationHistoryEntry>;
    /**
     * Get notification history
     */
    getHistory(limit?: number): NotificationHistoryEntry[];
    /**
     * Get recent notifications (last N minutes)
     */
    getRecent(minutes: number): NotificationHistoryEntry[];
    /**
     * Clear notification history
     */
    clearHistory(): void;
    /**
     * Get rate limit status for debugging
     */
    getRateLimitStatus(): Record<string, {
        count: number;
        windowRemainingMs: number;
    }>;
    /**
     * Test all configured notification channels
     */
    testChannels(): Promise<Record<NotificationChannel, {
        success: boolean;
        error?: string;
    }>>;
    /**
     * Update configuration
     */
    updateConfig(config: Partial<NotificationConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): NotificationConfig;
    private generateId;
    private expandPath;
    private getChannelsForEvent;
    private isChannelConfigured;
    private isDuplicate;
    private isRateLimited;
    private updateRateLimit;
    private sendToChannel;
    private sendToConsole;
    private sendToWebhook;
    private sendToFile;
    private maybeRotateLog;
    private getSeverityIcon;
    private createHistoryEntry;
    private addToHistory;
}
export declare const notificationService: NotificationService;
