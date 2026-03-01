# US5 - Configuration System Specification

## CLI Commands

### `aheal config get <path>`
Get a configuration value by path (dot notation)
```bash
aheal config get thresholds.diskWarning
aheal config get services
aheal config get notificationConfig.enabled
```

### `aheal config set <path> <value>`
Set a configuration value by path
```bash
aheal config set thresholds.diskWarning 85
aheal config set notificationConfig.enabled true
aheal config set services '[{"name":"nginx","type":"systemd"}]'
```

### `aheal config list`
List all configuration values

### `aheal config reset`
Reset to default configuration

### `aheal config validate`
Validate current configuration

## Configuration Schema

```typescript
interface MonitorConfig {
  healthCheckInterval: number;  // seconds
  thresholds: {
    diskWarning: number;    // percentage
    diskCritical: number;   // percentage
    memoryWarning: number;  // percentage
    memoryCritical: number; // percentage
    cpuWarning: number;     // percentage
    cpuCritical: number;    // percentage
  };
  services: ServiceConfig[];
  notificationConfig: NotificationConfig;
}
```

## Validation Rules
- thresholds.*: number, 0-100
- healthCheckInterval: number, > 0
- services: array
- notificationConfig.enabled: boolean
