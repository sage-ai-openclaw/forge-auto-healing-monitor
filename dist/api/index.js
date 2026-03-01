"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wsManager = exports.WebSocketManager = exports.notificationsRouter = exports.servicesRouter = exports.healthRouter = exports.DEFAULT_SERVER_CONFIG = exports.dashboardServer = exports.createDashboardServer = exports.DashboardServer = void 0;
// Health Dashboard API exports
var server_1 = require("./server");
Object.defineProperty(exports, "DashboardServer", { enumerable: true, get: function () { return server_1.DashboardServer; } });
Object.defineProperty(exports, "createDashboardServer", { enumerable: true, get: function () { return server_1.createDashboardServer; } });
Object.defineProperty(exports, "dashboardServer", { enumerable: true, get: function () { return server_1.dashboardServer; } });
Object.defineProperty(exports, "DEFAULT_SERVER_CONFIG", { enumerable: true, get: function () { return server_1.DEFAULT_SERVER_CONFIG; } });
var health_1 = require("./routes/health");
Object.defineProperty(exports, "healthRouter", { enumerable: true, get: function () { return health_1.healthRouter; } });
var services_1 = require("./routes/services");
Object.defineProperty(exports, "servicesRouter", { enumerable: true, get: function () { return services_1.servicesRouter; } });
var notifications_1 = require("./routes/notifications");
Object.defineProperty(exports, "notificationsRouter", { enumerable: true, get: function () { return notifications_1.notificationsRouter; } });
var websocket_1 = require("./websocket");
Object.defineProperty(exports, "WebSocketManager", { enumerable: true, get: function () { return websocket_1.WebSocketManager; } });
Object.defineProperty(exports, "wsManager", { enumerable: true, get: function () { return websocket_1.wsManager; } });
//# sourceMappingURL=index.js.map