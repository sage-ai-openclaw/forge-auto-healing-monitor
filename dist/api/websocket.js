"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wsManager = exports.WebSocketManager = void 0;
const HealthChecker_1 = require("../health/HealthChecker");
const ConfigManager_1 = require("../config/ConfigManager");
const ServiceMonitor_1 = require("../services/ServiceMonitor");
class WebSocketManager {
    clients = new Set();
    healthInterval;
    serviceInterval;
    isRunning = false;
    healthChecker;
    serviceMonitor;
    configManager;
    broadcastInterval;
    constructor(broadcastIntervalMs = 5000) {
        this.broadcastInterval = broadcastIntervalMs;
        this.configManager = new ConfigManager_1.ConfigManager();
        this.healthChecker = new HealthChecker_1.HealthChecker();
        this.serviceMonitor = new ServiceMonitor_1.ServiceMonitor();
    }
    async initialize() {
        const config = await this.configManager.load();
        this.healthChecker = new HealthChecker_1.HealthChecker(config.thresholds);
        // Load services into monitor
        for (const svc of config.services) {
            this.serviceMonitor.addService({
                name: svc.name,
                type: svc.type,
                autoRestart: false, // Don't auto-restart in API mode
                maxRestarts: svc.maxRestarts,
                restartWindow: svc.restartWindow,
                checkInterval: svc.checkInterval,
            });
        }
    }
    addClient(ws) {
        this.clients.add(ws);
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleMessage(ws, message);
            }
            catch {
                // Invalid message, ignore
            }
        });
        ws.on('close', () => {
            this.clients.delete(ws);
        });
        ws.on('error', () => {
            this.clients.delete(ws);
        });
        // Send initial health data
        this.sendInitialData(ws);
    }
    async sendInitialData(ws) {
        try {
            // Send current health
            const health = await this.healthChecker.checkAll();
            const hasIssues = this.healthChecker.hasIssues(health);
            const criticalIssues = this.healthChecker.getCriticalIssues(health);
            const healthUpdate = {
                type: 'health_update',
                data: {
                    disk: { status: health.disk.status, value: health.disk.value },
                    memory: { status: health.memory.status, value: health.memory.value },
                    cpu: { status: health.cpu.status, value: health.cpu.value },
                    overall: criticalIssues.length > 0 ? 'critical' : hasIssues ? 'warning' : 'healthy',
                    timestamp: health.timestamp,
                },
            };
            if (ws.readyState === 1) { // WebSocket.OPEN
                ws.send(JSON.stringify(healthUpdate));
            }
            // Send current services status
            await this.broadcastServiceUpdate();
        }
        catch {
            // Ignore errors during initial data send
        }
    }
    handleMessage(ws, message) {
        switch (message.type) {
            case 'ping':
                if (ws.readyState === 1) {
                    ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
                }
                break;
            case 'get_health':
                this.sendInitialData(ws);
                break;
            case 'get_services':
                this.broadcastServiceUpdate();
                break;
        }
    }
    startBroadcasting() {
        if (this.isRunning)
            return;
        this.isRunning = true;
        // Broadcast health updates
        this.healthInterval = setInterval(async () => {
            await this.broadcastHealthUpdate();
        }, this.broadcastInterval);
        // Broadcast service updates (less frequently)
        this.serviceInterval = setInterval(async () => {
            await this.broadcastServiceUpdate();
        }, this.broadcastInterval * 2);
    }
    stopBroadcasting() {
        this.isRunning = false;
        if (this.healthInterval) {
            clearInterval(this.healthInterval);
            this.healthInterval = undefined;
        }
        if (this.serviceInterval) {
            clearInterval(this.serviceInterval);
            this.serviceInterval = undefined;
        }
    }
    async broadcastHealthUpdate() {
        try {
            const health = await this.healthChecker.checkAll();
            const hasIssues = this.healthChecker.hasIssues(health);
            const criticalIssues = this.healthChecker.getCriticalIssues(health);
            const update = {
                type: 'health_update',
                data: {
                    disk: { status: health.disk.status, value: health.disk.value },
                    memory: { status: health.memory.status, value: health.memory.value },
                    cpu: { status: health.cpu.status, value: health.cpu.value },
                    overall: criticalIssues.length > 0 ? 'critical' : hasIssues ? 'warning' : 'healthy',
                    timestamp: health.timestamp,
                },
            };
            this.broadcast(update);
        }
        catch {
            // Ignore broadcast errors
        }
    }
    async broadcastServiceUpdate() {
        try {
            const checkResults = await this.serviceMonitor.checkAllServices();
            const services = this.serviceMonitor.getAllServices().map(state => ({
                name: state.service.name,
                isRunning: state.status.isRunning,
                state: state.status.state,
            }));
            const runningCount = services.filter(s => s.isRunning).length;
            const update = {
                type: 'service_update',
                data: {
                    services,
                    summary: {
                        total: services.length,
                        running: runningCount,
                        failed: services.length - runningCount,
                    },
                },
            };
            this.broadcast(update);
        }
        catch {
            // Ignore broadcast errors
        }
    }
    broadcastNotification(event) {
        const update = {
            type: 'notification',
            data: event,
        };
        this.broadcast(update);
    }
    broadcast(message) {
        const data = JSON.stringify(message);
        for (const client of this.clients) {
            if (client.readyState === 1) { // WebSocket.OPEN
                client.send(data);
            }
        }
    }
    getClientCount() {
        return this.clients.size;
    }
    closeAll() {
        this.stopBroadcasting();
        for (const client of this.clients) {
            client.close();
        }
        this.clients.clear();
    }
}
exports.WebSocketManager = WebSocketManager;
exports.wsManager = new WebSocketManager();
//# sourceMappingURL=websocket.js.map