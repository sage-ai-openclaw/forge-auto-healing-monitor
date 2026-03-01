"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthChecker = exports.DEFAULT_THRESHOLDS = void 0;
const systeminformation_1 = __importDefault(require("systeminformation"));
const node_disk_info_1 = require("node-disk-info");
exports.DEFAULT_THRESHOLDS = {
    diskWarning: 80,
    diskCritical: 90,
    memoryWarning: 80,
    memoryCritical: 90,
    cpuWarning: 70,
    cpuCritical: 85,
};
class HealthChecker {
    thresholds;
    constructor(thresholds = {}) {
        this.thresholds = { ...exports.DEFAULT_THRESHOLDS, ...thresholds };
    }
    async checkAll() {
        const [disk, memory, cpu] = await Promise.all([
            this.checkDisk(),
            this.checkMemory(),
            this.checkCpu(),
        ]);
        return {
            disk,
            memory,
            cpu,
            timestamp: new Date(),
        };
    }
    async checkDisk() {
        try {
            const disks = await (0, node_disk_info_1.getDiskInfo)();
            // Use the root partition or the disk with highest usage
            const rootDisk = disks.find(d => d.mounted === '/') || disks[0];
            if (!rootDisk) {
                return {
                    name: 'disk',
                    status: 'warning',
                    value: 0,
                    threshold: this.thresholds.diskWarning,
                    message: 'No disk information available',
                    timestamp: new Date(),
                };
            }
            const usedPercent = Math.round((rootDisk.used / rootDisk.blocks) * 100);
            let status = 'healthy';
            let message = `Disk usage: ${usedPercent}%`;
            if (usedPercent >= this.thresholds.diskCritical) {
                status = 'critical';
                message = `CRITICAL: Disk usage at ${usedPercent}%`;
            }
            else if (usedPercent >= this.thresholds.diskWarning) {
                status = 'warning';
                message = `WARNING: Disk usage at ${usedPercent}%`;
            }
            return {
                name: 'disk',
                status,
                value: usedPercent,
                threshold: this.thresholds.diskWarning,
                message,
                timestamp: new Date(),
            };
        }
        catch (error) {
            return {
                name: 'disk',
                status: 'warning',
                value: 0,
                threshold: this.thresholds.diskWarning,
                message: `Error checking disk: ${error}`,
                timestamp: new Date(),
            };
        }
    }
    async checkMemory() {
        try {
            const mem = await systeminformation_1.default.mem();
            const usedPercent = Math.round((mem.used / mem.total) * 100);
            let status = 'healthy';
            let message = `Memory usage: ${usedPercent}%`;
            if (usedPercent >= this.thresholds.memoryCritical) {
                status = 'critical';
                message = `CRITICAL: Memory usage at ${usedPercent}% (${Math.round(mem.used / 1024 / 1024)}MB used)`;
            }
            else if (usedPercent >= this.thresholds.memoryWarning) {
                status = 'warning';
                message = `WARNING: Memory usage at ${usedPercent}% (${Math.round(mem.used / 1024 / 1024)}MB used)`;
            }
            return {
                name: 'memory',
                status,
                value: usedPercent,
                threshold: this.thresholds.memoryWarning,
                message,
                timestamp: new Date(),
            };
        }
        catch (error) {
            return {
                name: 'memory',
                status: 'warning',
                value: 0,
                threshold: this.thresholds.memoryWarning,
                message: `Error checking memory: ${error}`,
                timestamp: new Date(),
            };
        }
    }
    async checkCpu() {
        try {
            const cpu = await systeminformation_1.default.currentLoad();
            const usedPercent = Math.round(cpu.currentLoad);
            let status = 'healthy';
            let message = `CPU usage: ${usedPercent}%`;
            if (usedPercent >= this.thresholds.cpuCritical) {
                status = 'critical';
                message = `CRITICAL: CPU usage at ${usedPercent}%`;
            }
            else if (usedPercent >= this.thresholds.cpuWarning) {
                status = 'warning';
                message = `WARNING: CPU usage at ${usedPercent}%`;
            }
            return {
                name: 'cpu',
                status,
                value: usedPercent,
                threshold: this.thresholds.cpuWarning,
                message,
                timestamp: new Date(),
            };
        }
        catch (error) {
            return {
                name: 'cpu',
                status: 'warning',
                value: 0,
                threshold: this.thresholds.cpuWarning,
                message: `Error checking CPU: ${error}`,
                timestamp: new Date(),
            };
        }
    }
    hasIssues(health) {
        return health.disk.status !== 'healthy' ||
            health.memory.status !== 'healthy' ||
            health.cpu.status !== 'healthy';
    }
    getCriticalIssues(health) {
        return [health.disk, health.memory, health.cpu].filter(check => check.status === 'critical');
    }
}
exports.HealthChecker = HealthChecker;
//# sourceMappingURL=HealthChecker.js.map