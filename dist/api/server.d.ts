import express from 'express';
export interface ServerConfig {
    port: number;
    enableCors: boolean;
    enableWebSocket: boolean;
    broadcastInterval: number;
}
export declare const DEFAULT_SERVER_CONFIG: ServerConfig;
export declare class DashboardServer {
    private app;
    private server;
    private wss?;
    private wsManager;
    private config;
    private isRunning;
    constructor(config?: Partial<ServerConfig>);
    private setupMiddleware;
    private setupRoutes;
    private setupWebSocket;
    start(): Promise<void>;
    stop(): Promise<void>;
    getApp(): express.Application;
    getPort(): number;
    isListening(): boolean;
}
export declare function createDashboardServer(config?: Partial<ServerConfig>): DashboardServer;
export declare const dashboardServer: DashboardServer;
