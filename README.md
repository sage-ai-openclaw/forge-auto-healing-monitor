# Auto-Healing Monitor

Sistema de monitoreo y auto-reparación con notificaciones. Detecta problemas (disco lleno, RAM alta, servicios caídos) e intenta soluciones automáticas. Notifica a Telegram si no puede resolver.

## Features

- ✅ System health checker module (disk, RAM, CPU)
- Service monitor module (TODO)
- Notification system (TODO)
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
  "notifications": {
    "enabled": false
  }
}
```

## Development

```bash
npm run dev check
npm test
```
