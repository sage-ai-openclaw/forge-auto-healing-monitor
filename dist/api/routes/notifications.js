"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationsRouter = void 0;
const express_1 = require("express");
const NotificationService_1 = require("../../notifications/NotificationService");
const ConfigManager_1 = require("../../config/ConfigManager");
const router = (0, express_1.Router)();
exports.notificationsRouter = router;
/**
 * GET /api/notifications
 * Returns notification history with optional filtering
 */
router.get('/', async (req, res) => {
    try {
        const configManager = new ConfigManager_1.ConfigManager();
        const config = await configManager.load();
        const notificationService = new NotificationService_1.NotificationService(config.notificationConfig);
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
        const severity = req.query.severity;
        const type = req.query.type;
        const minutes = req.query.minutes ? parseInt(req.query.minutes, 10) : undefined;
        let history = minutes
            ? notificationService.getRecent(minutes)
            : notificationService.getHistory(limit);
        // Apply filters
        if (severity) {
            history = history.filter(h => h.severity === severity);
        }
        if (type) {
            history = history.filter(h => h.type === type);
        }
        // Calculate stats
        const stats = {
            total: history.length,
            bySeverity: {
                critical: history.filter(h => h.severity === 'critical').length,
                warning: history.filter(h => h.severity === 'warning').length,
                info: history.filter(h => h.severity === 'info').length,
            },
            byType: {
                health: history.filter(h => h.type === 'health').length,
                service: history.filter(h => h.type === 'service').length,
                system: history.filter(h => h.type === 'system').length,
            },
            sent: history.filter(h => h.sentSuccessfully).length,
            failed: history.filter(h => !h.sentSuccessfully).length,
        };
        res.json({
            status: 'success',
            data: {
                notifications: history.map(h => ({
                    id: h.id,
                    type: h.type,
                    severity: h.severity,
                    title: h.title,
                    message: h.message,
                    metadata: h.metadata,
                    timestamp: h.timestamp,
                    channels: h.channels,
                    sentSuccessfully: h.sentSuccessfully,
                })),
                stats,
            },
        });
    }
    catch (error) {
        res.status(500).json({
            status: 'error',
            message: `Failed to get notifications: ${error}`,
        });
    }
});
/**
 * GET /api/notifications/stats
 * Returns notification statistics only
 */
router.get('/stats', async (_req, res) => {
    try {
        const configManager = new ConfigManager_1.ConfigManager();
        const config = await configManager.load();
        const notificationService = new NotificationService_1.NotificationService(config.notificationConfig);
        const history = notificationService.getHistory(1000);
        // Group by hour for the last 24 hours
        const now = Date.now();
        const hourlyStats = {};
        for (let i = 0; i < 24; i++) {
            const hour = new Date(now - i * 60 * 60 * 1000);
            const hourKey = hour.toISOString().slice(0, 13) + ':00';
            hourlyStats[hourKey] = { total: 0, critical: 0, warning: 0, info: 0 };
        }
        history.forEach(h => {
            const hourKey = h.timestamp.toISOString().slice(0, 13) + ':00';
            if (hourlyStats[hourKey]) {
                hourlyStats[hourKey].total++;
                hourlyStats[hourKey][h.severity]++;
            }
        });
        res.json({
            status: 'success',
            data: {
                total: history.length,
                bySeverity: {
                    critical: history.filter(h => h.severity === 'critical').length,
                    warning: history.filter(h => h.severity === 'warning').length,
                    info: history.filter(h => h.severity === 'info').length,
                },
                byType: {
                    health: history.filter(h => h.type === 'health').length,
                    service: history.filter(h => h.type === 'service').length,
                    system: history.filter(h => h.type === 'system').length,
                },
                sent: history.filter(h => h.sentSuccessfully).length,
                failed: history.filter(h => !h.sentSuccessfully).length,
                hourly: hourlyStats,
            },
        });
    }
    catch (error) {
        res.status(500).json({
            status: 'error',
            message: `Failed to get notification stats: ${error}`,
        });
    }
});
/**
 * POST /api/notifications/test
 * Send a test notification
 */
router.post('/test', async (req, res) => {
    try {
        const configManager = new ConfigManager_1.ConfigManager();
        const config = await configManager.load();
        const notificationService = new NotificationService_1.NotificationService(config.notificationConfig);
        const { title = 'Test Notification', message = 'This is a test', severity = 'info' } = req.body || {};
        const result = await notificationService.notify({
            type: 'system',
            severity: severity,
            title,
            message,
        });
        res.json({
            status: 'success',
            data: {
                id: result.id,
                sent: result.sentSuccessfully,
                channels: result.channels,
                timestamp: result.timestamp,
            },
        });
    }
    catch (error) {
        res.status(500).json({
            status: 'error',
            message: `Failed to send test notification: ${error}`,
        });
    }
});
/**
 * DELETE /api/notifications/history
 * Clear notification history
 */
router.delete('/history', async (_req, res) => {
    try {
        const configManager = new ConfigManager_1.ConfigManager();
        const config = await configManager.load();
        const notificationService = new NotificationService_1.NotificationService(config.notificationConfig);
        notificationService.clearHistory();
        res.json({
            status: 'success',
            message: 'Notification history cleared',
        });
    }
    catch (error) {
        res.status(500).json({
            status: 'error',
            message: `Failed to clear history: ${error}`,
        });
    }
});
exports.default = router;
//# sourceMappingURL=notifications.js.map