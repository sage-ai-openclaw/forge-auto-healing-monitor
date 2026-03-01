"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serviceMonitor = exports.ServiceMonitor = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class ServiceMonitor {
    services = new Map();
    checkIntervals = new Map();
    addService(service) {
        this.services.set(service.name, {
            service,
            status: {
                name: service.name,
                type: service.type,
                isRunning: false,
                state: 'unknown',
                lastChecked: new Date(),
            },
            restartHistory: [],
            restartCount: 0,
        });
    }
    removeService(name) {
        this.stopMonitoring(name);
        return this.services.delete(name);
    }
    getService(name) {
        return this.services.get(name);
    }
    getAllServices() {
        return Array.from(this.services.values());
    }
    async checkService(name) {
        const serviceState = this.services.get(name);
        if (!serviceState) {
            throw new Error(`Service ${name} not found`);
        }
        const status = await this.getServiceStatus(serviceState.service);
        serviceState.status = status;
        return status;
    }
    async checkAllServices() {
        const results = [];
        for (const [name, state] of this.services) {
            try {
                const status = await this.checkService(name);
                const result = {
                    name,
                    isRunning: status.isRunning,
                    state: status.state,
                };
                // Auto-restart if down and enabled
                if (!status.isRunning && state.service.autoRestart) {
                    const restartResult = await this.attemptRestart(state);
                    result.action = restartResult.action;
                    result.message = restartResult.message;
                }
                results.push(result);
            }
            catch (error) {
                results.push({
                    name,
                    isRunning: false,
                    state: 'error',
                    message: String(error),
                });
            }
        }
        return results;
    }
    async getServiceStatus(service) {
        if (service.type === 'systemd') {
            return this.checkSystemdService(service.name);
        }
        else {
            return this.checkDockerContainer(service.name);
        }
    }
    async checkSystemdService(name) {
        try {
            // Check if service is active
            const { stdout: activeState } = await execAsync(`systemctl show ${name} --property=ActiveState --value`, { timeout: 10000 });
            // Get more details
            const { stdout: subState } = await execAsync(`systemctl show ${name} --property=SubState --value`, { timeout: 10000 }).catch(() => ({ stdout: 'unknown' }));
            const { stdout: mainPid } = await execAsync(`systemctl show ${name} --property=MainPID --value`, { timeout: 10000 }).catch(() => ({ stdout: '0' }));
            const isRunning = activeState.trim() === 'active';
            const pid = parseInt(mainPid.trim(), 10) || undefined;
            return {
                name,
                type: 'systemd',
                isRunning,
                state: subState.trim() || activeState.trim(),
                pid: pid && pid > 0 ? pid : undefined,
                lastChecked: new Date(),
            };
        }
        catch (error) {
            return {
                name,
                type: 'systemd',
                isRunning: false,
                state: 'not-found',
                lastChecked: new Date(),
            };
        }
    }
    async checkDockerContainer(name) {
        try {
            const { stdout } = await execAsync(`docker inspect --format='{{.State.Status}}|{{.State.Pid}}|{{.State.Running}}' ${name} 2>/dev/null || echo "not-found|0|false"`, { timeout: 10000 });
            const [status, pidStr, running] = stdout.trim().split('|');
            const isRunning = running === 'true' && status === 'running';
            const pid = parseInt(pidStr, 10) || undefined;
            return {
                name,
                type: 'docker',
                isRunning,
                state: status,
                pid: pid && pid > 0 ? pid : undefined,
                lastChecked: new Date(),
            };
        }
        catch (error) {
            return {
                name,
                type: 'docker',
                isRunning: false,
                state: 'error',
                lastChecked: new Date(),
            };
        }
    }
    async attemptRestart(state) {
        const now = new Date();
        const windowStart = new Date(now.getTime() - state.service.restartWindow * 1000);
        // Clean up old restart history outside the window
        state.restartHistory = state.restartHistory.filter(r => r.timestamp >= windowStart);
        // Check if we've exceeded max restarts
        if (state.restartHistory.length >= state.service.maxRestarts) {
            return {
                action: 'max_restarts_exceeded',
                message: `Max restarts (${state.service.maxRestarts}) exceeded within ${state.service.restartWindow}s`,
            };
        }
        try {
            if (state.service.type === 'systemd') {
                await execAsync(`sudo systemctl restart ${state.service.name}`, { timeout: 30000 });
            }
            else {
                await execAsync(`docker restart ${state.service.name}`, { timeout: 30000 });
            }
            // Wait a moment and check if it's running
            await new Promise(resolve => setTimeout(resolve, 2000));
            const newStatus = await this.getServiceStatus(state.service);
            state.status = newStatus;
            const attempt = {
                timestamp: now,
                success: newStatus.isRunning,
            };
            state.restartHistory.push(attempt);
            state.lastRestart = now;
            if (newStatus.isRunning) {
                return { action: 'restarted', message: 'Service restarted successfully' };
            }
            else {
                return { action: 'restart_failed', message: 'Service did not start after restart' };
            }
        }
        catch (error) {
            const attempt = {
                timestamp: now,
                success: false,
                error: String(error),
            };
            state.restartHistory.push(attempt);
            return { action: 'restart_failed', message: `Restart failed: ${error}` };
        }
    }
    startMonitoring(name) {
        const state = this.services.get(name);
        if (!state)
            return false;
        // Stop existing interval if any
        this.stopMonitoring(name);
        const interval = setInterval(async () => {
            try {
                const status = await this.checkService(name);
                if (!status.isRunning && state.service.autoRestart) {
                    await this.attemptRestart(state);
                }
            }
            catch (error) {
                console.error(`Error monitoring ${name}:`, error);
            }
        }, state.service.checkInterval * 1000);
        this.checkIntervals.set(name, interval);
        return true;
    }
    stopMonitoring(name) {
        const interval = this.checkIntervals.get(name);
        if (interval) {
            clearInterval(interval);
            this.checkIntervals.delete(name);
            return true;
        }
        return false;
    }
    startAllMonitoring() {
        for (const name of this.services.keys()) {
            this.startMonitoring(name);
        }
    }
    stopAllMonitoring() {
        for (const name of this.checkIntervals.keys()) {
            this.stopMonitoring(name);
        }
    }
    getRestartHistory(name) {
        const state = this.services.get(name);
        return state?.restartHistory;
    }
    clearRestartHistory(name) {
        const state = this.services.get(name);
        if (state) {
            state.restartHistory = [];
            return true;
        }
        return false;
    }
}
exports.ServiceMonitor = ServiceMonitor;
// Singleton instance for CLI usage
exports.serviceMonitor = new ServiceMonitor();
//# sourceMappingURL=ServiceMonitor.js.map