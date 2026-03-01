import type { WebSocket } from 'ws';
import type { NotificationEvent } from '../notifications/types';
export interface WebSocketMessage {
    type: 'subscribe' | 'unsubscribe' | 'ping' | 'get_health' | 'get_services';
    channel?: string;
}
export interface HealthUpdate {
    type: 'health_update';
    data: {
        disk: {
            status: string;
            value: number;
        };
        memory: {
            status: string;
            value: number;
        };
        cpu: {
            status: string;
            value: number;
        };
        overall: string;
        timestamp: Date;
    };
}
export interface ServiceUpdate {
    type: 'service_update';
    data: {
        services: Array<{
            name: string;
            isRunning: boolean;
            state: string;
        }>;
        summary: {
            total: number;
            running: number;
            failed: number;
        };
    };
}
export interface NotificationUpdate {
    type: 'notification';
    data: NotificationEvent;
}
export type UpdateMessage = HealthUpdate | ServiceUpdate | NotificationUpdate;
export declare class WebSocketManager {
    private clients;
    private healthInterval?;
    private serviceInterval?;
    private isRunning;
    private healthChecker;
    private serviceMonitor;
    private configManager;
    private broadcastInterval;
    constructor(broadcastIntervalMs?: number);
    initialize(): Promise<void>;
    addClient(ws: WebSocket): void;
    private sendInitialData;
    private handleMessage;
    startBroadcasting(): void;
    stopBroadcasting(): void;
    private broadcastHealthUpdate;
    private broadcastServiceUpdate;
    broadcastNotification(event: NotificationEvent): void;
    private broadcast;
    getClientCount(): number;
    closeAll(): void;
}
export declare const wsManager: WebSocketManager;
