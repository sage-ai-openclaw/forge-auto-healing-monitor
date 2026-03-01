export interface HealthCheck {
    name: string;
    status: 'healthy' | 'warning' | 'critical';
    value: number;
    threshold: number;
    message: string;
    timestamp: Date;
}
export interface SystemHealth {
    disk: HealthCheck;
    memory: HealthCheck;
    cpu: HealthCheck;
    timestamp: Date;
}
export interface HealthThresholds {
    diskWarning: number;
    diskCritical: number;
    memoryWarning: number;
    memoryCritical: number;
    cpuWarning: number;
    cpuCritical: number;
}
export declare const DEFAULT_THRESHOLDS: HealthThresholds;
export declare class HealthChecker {
    private thresholds;
    constructor(thresholds?: Partial<HealthThresholds>);
    checkAll(): Promise<SystemHealth>;
    checkDisk(): Promise<HealthCheck>;
    checkMemory(): Promise<HealthCheck>;
    checkCpu(): Promise<HealthCheck>;
    hasIssues(health: SystemHealth): boolean;
    getCriticalIssues(health: SystemHealth): HealthCheck[];
}
