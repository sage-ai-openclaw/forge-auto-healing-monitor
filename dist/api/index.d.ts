export { DashboardServer, createDashboardServer, dashboardServer, DEFAULT_SERVER_CONFIG } from './server';
export { healthRouter } from './routes/health';
export { servicesRouter } from './routes/services';
export { notificationsRouter } from './routes/notifications';
export { WebSocketManager, wsManager } from './websocket';
export type { ServerConfig } from './server';
export type { WebSocketMessage, UpdateMessage, HealthUpdate, ServiceUpdate, NotificationUpdate } from './websocket';
