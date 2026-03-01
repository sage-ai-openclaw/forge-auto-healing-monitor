"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRouter = void 0;
const express_1 = require("express");
const HealthChecker_1 = require("../../health/HealthChecker");
const ConfigManager_1 = require("../../config/ConfigManager");
const router = (0, express_1.Router)();
exports.healthRouter = router;
/**
 * GET /api/health
 * Returns current system health status (disk, memory, CPU)
 */
router.get('/', async (_req, res) => {
    try {
        const configManager = new ConfigManager_1.ConfigManager();
        const config = await configManager.load();
        const checker = new HealthChecker_1.HealthChecker(config.thresholds);
        const health = await checker.checkAll();
        // Calculate overall status
        const hasIssues = checker.hasIssues(health);
        const criticalIssues = checker.getCriticalIssues(health);
        res.json({
            status: 'success',
            data: {
                ...health,
                overall: {
                    status: criticalIssues.length > 0 ? 'critical' : hasIssues ? 'warning' : 'healthy',
                    hasIssues,
                    criticalCount: criticalIssues.length,
                },
            },
        });
    }
    catch (error) {
        res.status(500).json({
            status: 'error',
            message: `Failed to check health: ${error}`,
        });
    }
});
/**
 * GET /api/health/summary
 * Returns a quick summary for dashboard widgets
 */
router.get('/summary', async (_req, res) => {
    try {
        const configManager = new ConfigManager_1.ConfigManager();
        const config = await configManager.load();
        const checker = new HealthChecker_1.HealthChecker(config.thresholds);
        const health = await checker.checkAll();
        const criticalIssues = checker.getCriticalIssues(health);
        res.json({
            status: 'success',
            data: {
                overall: criticalIssues.length > 0 ? 'critical' : checker.hasIssues(health) ? 'warning' : 'healthy',
                disk: {
                    status: health.disk.status,
                    value: health.disk.value,
                },
                memory: {
                    status: health.memory.status,
                    value: health.memory.value,
                },
                cpu: {
                    status: health.cpu.status,
                    value: health.cpu.value,
                },
                timestamp: health.timestamp,
            },
        });
    }
    catch (error) {
        res.status(500).json({
            status: 'error',
            message: `Failed to get health summary: ${error}`,
        });
    }
});
exports.default = router;
//# sourceMappingURL=health.js.map