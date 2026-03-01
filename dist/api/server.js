"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardServer = exports.DashboardServer = exports.DEFAULT_SERVER_CONFIG = void 0;
exports.createDashboardServer = createDashboardServer;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = require("http");
const ws_1 = require("ws");
const health_1 = require("./routes/health");
const services_1 = require("./routes/services");
const notifications_1 = require("./routes/notifications");
const websocket_1 = require("./websocket");
exports.DEFAULT_SERVER_CONFIG = {
    port: 3000,
    enableCors: true,
    enableWebSocket: true,
    broadcastInterval: 5000,
};
class DashboardServer {
    app;
    server;
    wss;
    wsManager;
    config;
    isRunning = false;
    constructor(config = {}) {
        this.config = { ...exports.DEFAULT_SERVER_CONFIG, ...config };
        this.app = (0, express_1.default)();
        this.server = (0, http_1.createServer)(this.app);
        this.wsManager = new websocket_1.WebSocketManager(this.config.broadcastInterval);
        this.setupMiddleware();
        this.setupRoutes();
        if (this.config.enableWebSocket) {
            this.setupWebSocket();
        }
    }
    setupMiddleware() {
        // CORS
        if (this.config.enableCors) {
            this.app.use((0, cors_1.default)({
                origin: '*',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
                allowedHeaders: ['Content-Type', 'Authorization'],
            }));
        }
        // Body parsing
        this.app.use(express_1.default.json());
        this.app.use(express_1.default.urlencoded({ extended: true }));
        // Request logging (development)
        this.app.use((req, _res, next) => {
            console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
            next();
        });
    }
    setupRoutes() {
        // Health check endpoint (simple ping)
        this.app.get('/ping', (_req, res) => {
            res.json({ status: 'ok', timestamp: new Date().toISOString() });
        });
        // API routes
        this.app.use('/api/health', health_1.healthRouter);
        this.app.use('/api/services', services_1.servicesRouter);
        this.app.use('/api/notifications', notifications_1.notificationsRouter);
        // Dashboard info endpoint
        this.app.get('/api/dashboard', async (_req, res) => {
            try {
                const { HealthChecker } = await Promise.resolve().then(() => __importStar(require('../health/HealthChecker')));
                const { ConfigManager } = await Promise.resolve().then(() => __importStar(require('../config/ConfigManager')));
                const { NotificationService } = await Promise.resolve().then(() => __importStar(require('../notifications/NotificationService')));
                const configManager = new ConfigManager();
                const config = await configManager.load();
                const healthChecker = new HealthChecker(config.thresholds);
                const health = await healthChecker.checkAll();
                const notificationService = new NotificationService(config.notificationConfig);
                const recentNotifications = notificationService.getRecent(60); // Last hour
                const criticalIssues = healthChecker.getCriticalIssues(health);
                const hasIssues = healthChecker.hasIssues(health);
                res.json({
                    status: 'success',
                    data: {
                        health: {
                            disk: { status: health.disk.status, value: health.disk.value },
                            memory: { status: health.memory.status, value: health.memory.value },
                            cpu: { status: health.cpu.status, value: health.cpu.value },
                            overall: criticalIssues.length > 0 ? 'critical' : hasIssues ? 'warning' : 'healthy',
                        },
                        services: {
                            total: config.services.length,
                        },
                        notifications: {
                            recent: recentNotifications.length,
                            unread: recentNotifications.filter(n => n.severity === 'critical' && !n.sentSuccessfully).length,
                        },
                        timestamp: new Date().toISOString(),
                    },
                });
            }
            catch (error) {
                res.status(500).json({
                    status: 'error',
                    message: `Failed to get dashboard data: ${error}`,
                });
            }
        });
        // Server-sent events endpoint for live updates (alternative to WebSocket)
        this.app.get('/api/events', (req, res) => {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            const sendEvent = (data) => {
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            };
            // Send initial connection message
            sendEvent({ type: 'connected', timestamp: new Date().toISOString() });
            // Set up interval to send health updates
            const interval = setInterval(async () => {
                try {
                    const { HealthChecker } = await Promise.resolve().then(() => __importStar(require('../health/HealthChecker')));
                    const { ConfigManager } = await Promise.resolve().then(() => __importStar(require('../config/ConfigManager')));
                    const configManager = new ConfigManager();
                    const config = await configManager.load();
                    const healthChecker = new HealthChecker(config.thresholds);
                    const health = await healthChecker.checkAll();
                    sendEvent({
                        type: 'health_update',
                        data: {
                            disk: { status: health.disk.status, value: health.disk.value },
                            memory: { status: health.memory.status, value: health.memory.value },
                            cpu: { status: health.cpu.status, value: health.cpu.value },
                            timestamp: health.timestamp,
                        },
                    });
                }
                catch {
                    sendEvent({ type: 'error', message: 'Failed to fetch health data' });
                }
            }, this.config.broadcastInterval);
            // Clean up on client disconnect
            req.on('close', () => {
                clearInterval(interval);
            });
        });
        // Error handling
        this.app.use((err, _req, res, _next) => {
            console.error('API Error:', err);
            res.status(500).json({
                status: 'error',
                message: 'Internal server error',
            });
        });
        // 404 handler
        this.app.use((_req, res) => {
            res.status(404).json({
                status: 'error',
                message: 'Endpoint not found',
            });
        });
    }
    setupWebSocket() {
        this.wss = new ws_1.WebSocketServer({ server: this.server });
        this.wss.on('connection', (ws, req) => {
            console.log(`WebSocket client connected from ${req.socket.remoteAddress}`);
            this.wsManager.addClient(ws);
        });
        this.wss.on('error', (error) => {
            console.error('WebSocket server error:', error);
        });
    }
    async start() {
        if (this.isRunning) {
            throw new Error('Server is already running');
        }
        // Initialize WebSocket manager
        await this.wsManager.initialize();
        return new Promise((resolve) => {
            this.server.listen(this.config.port, () => {
                this.isRunning = true;
                console.log(`🚀 Dashboard server running on port ${this.config.port}`);
                console.log(`   API: http://localhost:${this.config.port}/api`);
                console.log(`   WebSocket: ws://localhost:${this.config.port}`);
                if (this.config.enableWebSocket) {
                    this.wsManager.startBroadcasting();
                }
                resolve();
            });
        });
    }
    async stop() {
        if (!this.isRunning) {
            return;
        }
        this.wsManager.stopBroadcasting();
        this.wsManager.closeAll();
        return new Promise((resolve, reject) => {
            this.server.close((err) => {
                if (err) {
                    reject(err);
                }
                else {
                    this.isRunning = false;
                    console.log('Dashboard server stopped');
                    resolve();
                }
            });
        });
    }
    getApp() {
        return this.app;
    }
    getPort() {
        return this.config.port;
    }
    isListening() {
        return this.isRunning;
    }
}
exports.DashboardServer = DashboardServer;
// Export factory function for easy usage
function createDashboardServer(config) {
    return new DashboardServer(config);
}
// Singleton instance for CLI usage
exports.dashboardServer = new DashboardServer();
//# sourceMappingURL=server.js.map