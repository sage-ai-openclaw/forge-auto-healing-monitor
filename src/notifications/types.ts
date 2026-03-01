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
  maxSize?: number; // bytes, default 10MB
  maxFiles?: number; // default 5
}

export interface RateLimitConfig {
  enabled: boolean;
  windowMs: number; // Time window in milliseconds
  maxPerWindow: number; // Max notifications per window per issue
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
  deduplicationWindowMs: number; // Time to deduplicate similar notifications
}

export interface NotificationHistoryEntry extends NotificationEvent {
  channels: NotificationChannel[];
  sentSuccessfully: boolean;
  errors?: Record<NotificationChannel, string>;
}

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
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
      maxSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    },
  },
  rateLimit: {
    enabled: true,
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxPerWindow: 1,
  },
  deduplicationWindowMs: 60 * 1000, // 1 minute
};

// In-memory rate limit tracking
export interface RateLimitEntry {
  count: number;
  firstSeen: Date;
  lastSent: Date;
}
