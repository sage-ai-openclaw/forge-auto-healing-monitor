"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigManager = exports.DEFAULT_CONFIG = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
exports.DEFAULT_CONFIG = {
    healthCheckInterval: 60,
    thresholds: {
        diskWarning: 80,
        diskCritical: 90,
        memoryWarning: 80,
        memoryCritical: 90,
        cpuWarning: 70,
        cpuCritical: 85,
    },
    services: [],
    notifications: {
        enabled: false,
    },
};
class ConfigManager {
    configPath;
    constructor(configPath) {
        this.configPath = configPath || path_1.default.join(os_1.default.homedir(), '.aheal', 'config.json');
    }
    async load() {
        try {
            const data = await promises_1.default.readFile(this.configPath, 'utf-8');
            const config = JSON.parse(data);
            return { ...exports.DEFAULT_CONFIG, ...config };
        }
        catch {
            return exports.DEFAULT_CONFIG;
        }
    }
    async save(config) {
        const dir = path_1.default.dirname(this.configPath);
        await promises_1.default.mkdir(dir, { recursive: true });
        await promises_1.default.writeFile(this.configPath, JSON.stringify(config, null, 2));
    }
    async init() {
        const config = await this.load();
        await this.save(config);
    }
    getConfigPath() {
        return this.configPath;
    }
}
exports.ConfigManager = ConfigManager;
//# sourceMappingURL=ConfigManager.js.map