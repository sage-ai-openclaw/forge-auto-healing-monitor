"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_NOTIFICATION_CONFIG = void 0;
exports.DEFAULT_NOTIFICATION_CONFIG = {
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
//# sourceMappingURL=types.js.map