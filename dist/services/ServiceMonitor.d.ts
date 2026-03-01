export type ServiceType = 'systemd' | 'docker';
export interface MonitoredService {
    name: string;
    type: ServiceType;
    autoRestart: boolean;
    maxRestarts: number;
    restartWindow: number;
    checkInterval: number;
}
export interface ServiceStatus {
    name: string;
    type: ServiceType;
    isRunning: boolean;
    state: string;
    pid?: number;
    uptime?: string;
    lastChecked: Date;
}
export interface RestartAttempt {
    timestamp: Date;
    success: boolean;
    error?: string;
}
export interface ServiceState {
    service: MonitoredService;
    status: ServiceStatus;
    restartHistory: RestartAttempt[];
    restartCount: number;
    lastRestart?: Date;
}
export interface ServiceCheckResult {
    name: string;
    isRunning: boolean;
    state: string;
    action?: 'restarted' | 'restart_failed' | 'max_restarts_exceeded';
    message?: string;
}
export declare class ServiceMonitor {
    private services;
    private checkIntervals;
    addService(service: MonitoredService): void;
    removeService(name: string): boolean;
    getService(name: string): ServiceState | undefined;
    getAllServices(): ServiceState[];
    checkService(name: string): Promise<ServiceStatus>;
    checkAllServices(): Promise<ServiceCheckResult[]>;
    private getServiceStatus;
    private checkSystemdService;
    private checkDockerContainer;
    private attemptRestart;
    startMonitoring(name: string): boolean;
    stopMonitoring(name: string): boolean;
    startAllMonitoring(): void;
    stopAllMonitoring(): void;
    getRestartHistory(name: string): RestartAttempt[] | undefined;
    clearRestartHistory(name: string): boolean;
}
export declare const serviceMonitor: ServiceMonitor;
