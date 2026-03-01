export type SeverityLevel = 'info' | 'warning' | 'critical';
export type NotificationChannel = 'console' | 'webhook' | 'file';
export interface NotificationEvent {
    id: string;
    type: 'health' | 'service' | 'system';
    severity: SeverityLevel;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
    timestamp: Date;
}
export interface NotificationRule {
    severity: SeverityLevel[];
    types: ('health' | 'service' | 'system')[];
    channels: NotificationChannel[];
    enabled: boolean;
}
export interface WebhookConfig {
    url: string;
    method?: 'POST' | 'PUT';
    headers?: Record<string, string>;
    timeout?: number;
}
export interface FileConfig {
    path: string;
    maxSize?: number;
    maxFiles?: number;
}
export interface RateLimitConfig {
    enabled: boolean;
    windowMs: number;
    maxPerWindow: number;
}
export interface NotificationConfig {
    enabled: boolean;
    rules: NotificationRule[];
    channels: {
        console?: boolean;
        webhook?: WebhookConfig;
        file?: FileConfig;
    };
    rateLimit: RateLimitConfig;
    deduplicationWindowMs: number;
}
export interface NotificationHistoryEntry extends NotificationEvent {
    channels: NotificationChannel[];
    sentSuccessfully: boolean;
    errors?: Record<NotificationChannel, string>;
}
export declare const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig;
export interface RateLimitEntry {
    count: number;
    firstSeen: Date;
    lastSent: Date;
}
