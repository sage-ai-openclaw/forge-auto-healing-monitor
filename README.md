# Auto-Healing Monitor

Sistema de monitoreo y auto-reparación con notificaciones. Detecta problemas (disco lleno, RAM alta, servicios caídos) e intenta soluciones automáticas. Notifica a través de múltiples canales.

## Features

- ✅ System health checker module (disk, RAM, CPU)
- ✅ Service monitor module (systemd, Docker) with auto-restart
- ✅ Notification system (console, webhook, file log)
- Health dashboard API (TODO)
- Configuration file for thresholds and services (TODO)

## Installation

```bash
npm install
npm run build
```

## Usage

### Check system health

```bash
npm start -- check
# or
./dist/cli/index.js check
```

### Initialize configuration

```bash
npm start -- init
```

### Show configuration

```bash
npm start -- config
```

## Service Monitoring

### Add a service to monitor

```bash
# Systemd service
npm start -- service add nginx --type systemd --auto-restart --max-restarts 3 --restart-window 300

# Docker container
npm start -- service add my-container --type docker --auto-restart
```

### List monitored services

```bash
npm start -- service list
```

### Check service status

```bash
npm start -- service check
npm start -- service status nginx
```

### Remove a service

```bash
npm start -- service remove nginx
```

## Notifications

### Test notification channels

```bash
npm start -- notify test
```

### Send a test notification

```bash
npm start -- notify send -s critical -t "Test Alert" -m "This is a test"
```

### View notification history

```bash
npm start -- notify history
npm start -- notify history --minutes 30
```

### View notification config

```bash
npm start -- notify config
```

## Health Checks

### Disk Usage
- Warning: ≥80%
- Critical: ≥90%

### Memory Usage
- Warning: ≥80%
- Critical: ≥90%

### CPU Usage
- Warning: ≥70%
- Critical: ≥85%

## Configuration

Config file: `~/.aheal/config.json`

```json
{
  "healthCheckInterval": 60,
  "thresholds": {
    "diskWarning": 80,
    "diskCritical": 90,
    "memoryWarning": 80,
    "memoryCritical": 90,
    "cpuWarning": 70,
    "cpuCritical": 85
  },
  "services": [],
  "notificationConfig": {
    "enabled": true,
    "rules": [
      {
        "severity": ["critical"],
        "types": ["health", "service", "system"],
        "channels": ["console", "file"],
        "enabled": true
      },
      {
        "severity": ["warning"],
        "types": ["health", "service", "system"],
        "channels": ["console"],
        "enabled": true
      }
    ],
    "channels": {
      "console": true,
      "file": {
        "path": "~/.aheal/notifications.log",
        "maxSize": 10485760,
        "maxFiles": 5
      }
    },
    "rateLimit": {
      "enabled": true,
      "windowMs": 300000,
      "maxPerWindow": 1
    },
    "deduplicationWindowMs": 60000
  }
}
```

## Notification Channels

- **console**: Logs to stdout with colored output
- **file**: Writes to rotating log file
- **webhook**: POSTs to configured URL

## Development

```bash
npm run dev check
npm test
```

## Test Summary

- Health Checker: 11 tests
- Service Monitor: 21 tests
- Notification System: 32 tests
- **Total: 64 tests**
