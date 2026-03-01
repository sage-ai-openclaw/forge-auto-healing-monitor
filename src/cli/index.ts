#!/usr/bin/env node

import { Command } from 'commander';
import { HealthChecker } from '../health/HealthChecker';
import { ConfigManager, type ServiceConfig } from '../config/ConfigManager';
import { ServiceMonitor, serviceMonitor, type ServiceType } from '../services/ServiceMonitor';
import { NotificationService, notificationService } from '../notifications/NotificationService';

const program = new Command();

program
  .name('aheal')
  .description('Auto-Healing Monitor - Sistema de monitoreo y auto-reparacion')
  .version('1.0.0');

program
  .command('check')
  .description('Ejecuta un chequeo de salud del sistema')
  .action(async () => {
    try {
      const configManager = new ConfigManager();
      const config = await configManager.load();
      
      console.log('🔍 Verificando salud del sistema...\n');
      
      const checker = new HealthChecker(config.thresholds);
      const health = await checker.checkAll();

      console.log(`💾 Disco: ${health.disk.message} (${health.disk.status})`);
      console.log(`🧠 Memoria: ${health.memory.message} (${health.memory.status})`);
      console.log(`⚡ CPU: ${health.cpu.message} (${health.cpu.status})`);

      if (checker.hasIssues(health)) {
        console.log('\n⚠️  Se detectaron problemas:');
        const critical = checker.getCriticalIssues(health);
        if (critical.length > 0) {
          console.log('   CRÍTICOS:', critical.map(c => c.name).join(', '));
          process.exit(1);
        } else {
          console.log('   Advertencias detectadas');
        }
      } else {
        console.log('\n✅ Sistema saludable');
      }
    } catch (err) {
      console.error('❌ Error:', err);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Inicializa el archivo de configuración')
  .action(async () => {
    try {
      const configManager = new ConfigManager();
      await configManager.init();
      console.log(`✅ Configuración inicializada en: ${configManager.getConfigPath()}`);
    } catch (err) {
      console.error('❌ Error:', err);
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Muestra la configuración actual')
  .action(async () => {
    try {
      const configManager = new ConfigManager();
      const config = await configManager.load();
      console.log(JSON.stringify(config, null, 2));
    } catch (err) {
      console.error('❌ Error:', err);
      process.exit(1);
    }
  });

// Service commands (US2)
const serviceCmd = program
  .command('service')
  .description('Gestiona servicios monitoreados');

serviceCmd
  .command('add <name>')
  .description('Agrega un servicio al monitoreo')
  .option('-t, --type <type>', 'Tipo de servicio (systemd|docker)', 'systemd')
  .option('--no-auto-restart', 'Deshabilitar auto-reinicio')
  .option('-m, --max-restarts <n>', 'Máximo de reinicios en la ventana', '3')
  .option('-w, --restart-window <seconds>', 'Ventana de tiempo para reinicios (segundos)', '300')
  .option('-i, --interval <seconds>', 'Intervalo de chequeo (segundos)', '30')
  .action(async (name: string, options) => {
    try {
      const configManager = new ConfigManager();
      const config = await configManager.load();

      // Check if service already exists
      if (config.services.find(s => s.name === name)) {
        console.error(`❌ El servicio "${name}" ya está en la lista de monitoreo`);
        process.exit(1);
      }

      const serviceConfig: ServiceConfig = {
        name,
        type: options.type as ServiceType,
        autoRestart: options.autoRestart,
        maxRestarts: parseInt(options.maxRestarts, 10),
        restartWindow: parseInt(options.restartWindow, 10),
        checkInterval: parseInt(options.interval, 10),
      };

      config.services.push(serviceConfig);
      await configManager.save(config);

      console.log(`✅ Servicio "${name}" agregado al monitoreo`);
      console.log(`   Tipo: ${serviceConfig.type}`);
      console.log(`   Auto-restart: ${serviceConfig.autoRestart ? 'Sí' : 'No'}`);
      console.log(`   Max restarts: ${serviceConfig.maxRestarts} en ${serviceConfig.restartWindow}s`);
      console.log(`   Check interval: ${serviceConfig.checkInterval}s`);
    } catch (err) {
      console.error('❌ Error:', err);
      process.exit(1);
    }
  });

serviceCmd
  .command('remove <name>')
  .description('Elimina un servicio del monitoreo')
  .action(async (name: string) => {
    try {
      const configManager = new ConfigManager();
      const config = await configManager.load();

      const initialLength = config.services.length;
      config.services = config.services.filter(s => s.name !== name);

      if (config.services.length === initialLength) {
        console.error(`❌ El servicio "${name}" no está en la lista de monitoreo`);
        process.exit(1);
      }

      await configManager.save(config);
      console.log(`✅ Servicio "${name}" eliminado del monitoreo`);
    } catch (err) {
      console.error('❌ Error:', err);
      process.exit(1);
    }
  });

serviceCmd
  .command('list')
  .description('Lista los servicios monitoreados')
  .action(async () => {
    try {
      const configManager = new ConfigManager();
      const config = await configManager.load();

      if (config.services.length === 0) {
        console.log('ℹ️  No hay servicios configurados para monitoreo');
        return;
      }

      console.log(`📋 Servicios monitoreados (${config.services.length}):\n`);
      
      for (const service of config.services) {
        console.log(`  • ${service.name}`);
        console.log(`    Tipo: ${service.type}`);
        console.log(`    Auto-restart: ${service.autoRestart ? 'Sí' : 'No'}`);
        console.log(`    Max restarts: ${service.maxRestarts}/${service.restartWindow}s`);
        console.log(`    Check interval: ${service.checkInterval}s`);
        console.log('');
      }
    } catch (err) {
      console.error('❌ Error:', err);
      process.exit(1);
    }
  });

serviceCmd
  .command('check')
  .description('Chequea el estado de todos los servicios monitoreados')
  .action(async () => {
    try {
      const configManager = new ConfigManager();
      const config = await configManager.load();

      if (config.services.length === 0) {
        console.log('ℹ️  No hay servicios configurados para monitoreo');
        return;
      }

      console.log('🔍 Chequeando servicios...\n');

      // Load services into monitor
      for (const svc of config.services) {
        serviceMonitor.addService({
          name: svc.name,
          type: svc.type,
          autoRestart: false, // Manual check, no auto-restart
          maxRestarts: svc.maxRestarts,
          restartWindow: svc.restartWindow,
          checkInterval: svc.checkInterval,
        });
      }

      const results = await serviceMonitor.checkAllServices();

      for (const result of results) {
        const icon = result.isRunning ? '✅' : '❌';
        console.log(`${icon} ${result.name}: ${result.state}`);
        if (result.message) {
          console.log(`   ${result.message}`);
        }
      }

      const failedCount = results.filter(r => !r.isRunning).length;
      if (failedCount > 0) {
        console.log(`\n⚠️  ${failedCount} servicio(s) no están ejecutándose`);
        process.exit(1);
      } else {
        console.log('\n✅ Todos los servicios están ejecutándose correctamente');
      }
    } catch (err) {
      console.error('❌ Error:', err);
      process.exit(1);
    }
  });

serviceCmd
  .command('status <name>')
  .description('Muestra el estado detallado de un servicio')
  .action(async (name: string) => {
    try {
      const configManager = new ConfigManager();
      const config = await configManager.load();

      const serviceCfg = config.services.find(s => s.name === name);
      if (!serviceCfg) {
        console.error(`❌ El servicio "${name}" no está en la lista de monitoreo`);
        process.exit(1);
      }

      serviceMonitor.addService({
        name: serviceCfg.name,
        type: serviceCfg.type,
        autoRestart: serviceCfg.autoRestart,
        maxRestarts: serviceCfg.maxRestarts,
        restartWindow: serviceCfg.restartWindow,
        checkInterval: serviceCfg.checkInterval,
      });

      const status = await serviceMonitor.checkService(name);

      console.log(`📊 Estado de ${name}:`);
      console.log(`   Tipo: ${status.type}`);
      console.log(`   Estado: ${status.isRunning ? '✅ Ejecutándose' : '❌ Detenido'}`);
      console.log(`   Sub-estado: ${status.state}`);
      if (status.pid) {
        console.log(`   PID: ${status.pid}`);
      }
      console.log(`   Último chequeo: ${status.lastChecked.toISOString()}`);

      const history = serviceMonitor.getRestartHistory(name);
      if (history && history.length > 0) {
        console.log(`\n   Historial de reinicios (${history.length}):`);
        for (const attempt of history.slice(-5)) {
          const status = attempt.success ? '✅' : '❌';
          console.log(`     ${status} ${attempt.timestamp.toISOString()}`);
        }
      }
    } catch (err) {
      console.error('❌ Error:', err);
      process.exit(1);
    }
  });

// Notification commands (US3)
const notifyCmd = program
  .command('notify')
  .description('Gestiona notificaciones y alertas');

notifyCmd
  .command('test')
  .description('Prueba los canales de notificación configurados')
  .option('--webhook <url>', 'URL de webhook para prueba (opcional)')
  .action(async (options) => {
    try {
      const configManager = new ConfigManager();
      const config = await configManager.load();

      // Create notification service with config
      const notifier = new NotificationService(config.notificationConfig);

      // If webhook URL provided via CLI, temporarily override
      if (options.webhook) {
        notifier.updateConfig({
          channels: {
            ...config.notificationConfig.channels,
            webhook: { url: options.webhook, method: 'POST' },
          },
        });
      }

      console.log('🧪 Probando canales de notificación...\n');

      const results = await notifier.testChannels();

      console.log('\n📊 Resultados de prueba:\n');
      for (const [channel, result] of Object.entries(results)) {
        const icon = result.success ? '✅' : '❌';
        console.log(`${icon} ${channel.toUpperCase()}`);
        if (result.error) {
          console.log(`   Error: ${result.error}`);
        }
      }

      const allSuccess = Object.values(results).every(r => r.success);
      if (!allSuccess) {
        console.log('\n⚠️  Algunos canales fallaron. Revisa la configuración.');
        process.exit(1);
      } else {
        console.log('\n✅ Todos los canales funcionan correctamente');
      }
    } catch (err) {
      console.error('❌ Error:', err);
      process.exit(1);
    }
  });

notifyCmd
  .command('send')
  .description('Envía una notificación de prueba manual')
  .option('-t, --title <title>', 'Título de la notificación', 'Notificación de prueba')
  .option('-m, --message <message>', 'Mensaje de la notificación', 'Esto es una prueba del sistema de notificaciones')
  .option('-s, --severity <severity>', 'Severidad (info|warning|critical)', 'info')
  .action(async (options) => {
    try {
      const configManager = new ConfigManager();
      const config = await configManager.load();

      const notifier = new NotificationService(config.notificationConfig);

      console.log('📤 Enviando notificación de prueba...\n');

      const result = await notifier.notify({
        type: 'system',
        severity: options.severity as 'info' | 'warning' | 'critical',
        title: options.title,
        message: options.message,
      });

      if (result.sentSuccessfully) {
        console.log('\n✅ Notificación enviada correctamente');
        console.log(`   Canales: ${result.channels.join(', ')}`);
      } else {
        console.log('\n⚠️  La notificación no se envió (posiblemente limitada por rate limit o duplicada)');
      }
    } catch (err) {
      console.error('❌ Error:', err);
      process.exit(1);
    }
  });

notifyCmd
  .command('history')
  .description('Muestra el historial de notificaciones')
  .option('-l, --limit <n>', 'Número máximo de entradas', '20')
  .option('--minutes <m>', 'Mostrar notificaciones de los últimos M minutos')
  .action(async (options) => {
    try {
      const configManager = new ConfigManager();
      const config = await configManager.load();

      const notifier = new NotificationService(config.notificationConfig);

      let history;
      if (options.minutes) {
        history = notifier.getRecent(parseInt(options.minutes, 10));
      } else {
        history = notifier.getHistory(parseInt(options.limit, 10));
      }

      if (history.length === 0) {
        console.log('ℹ️  No hay notificaciones en el historial');
        return;
      }

      console.log(`📜 Historial de notificaciones (${history.length} entradas):\n`);

      for (const entry of history) {
        const icon = entry.sentSuccessfully ? '✅' : '⏸️';
        const severityIcon = entry.severity === 'critical' ? '🔴' : entry.severity === 'warning' ? '🟡' : '🔵';
        console.log(`${icon} ${severityIcon} [${entry.severity.toUpperCase()}] ${entry.title}`);
        console.log(`   Tipo: ${entry.type} | Canales: ${entry.channels.join(', ') || 'ninguno'}`);
        console.log(`   ${entry.message}`);
        console.log(`   ${entry.timestamp.toISOString()}`);
        if (entry.errors) {
          console.log(`   Errores: ${JSON.stringify(entry.errors)}`);
        }
        console.log('');
      }
    } catch (err) {
      console.error('❌ Error:', err);
      process.exit(1);
    }
  });

notifyCmd
  .command('config')
  .description('Muestra la configuración de notificaciones')
  .action(async () => {
    try {
      const configManager = new ConfigManager();
      const config = await configManager.load();

      console.log('🔧 Configuración de notificaciones:\n');
      console.log(JSON.stringify(config.notificationConfig, null, 2));
    } catch (err) {
      console.error('❌ Error:', err);
      process.exit(1);
    }
  });

// Dashboard API commands (US4)
const dashboardCmd = program
  .command('dashboard')
  .description('Dashboard API - Health dashboard and monitoring API');

dashboardCmd
  .command('start')
  .description('Inicia el servidor del dashboard API')
  .option('-p, --port <port>', 'Puerto del servidor', '3000')
  .option('--no-cors', 'Deshabilitar CORS')
  .option('--no-ws', 'Deshabilitar WebSocket')
  .option('-i, --interval <ms>', 'Intervalo de actualización en ms', '5000')
  .action(async (options) => {
    try {
      const { DashboardServer } = await import('../api/server');
      
      const server = new DashboardServer({
        port: parseInt(options.port, 10),
        enableCors: options.cors,
        enableWebSocket: options.ws,
        broadcastInterval: parseInt(options.interval, 10),
      });

      console.log('🚀 Iniciando Dashboard API...\n');
      await server.start();

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        console.log('\n🛑 Deteniendo servidor...');
        await server.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        console.log('\n🛑 Deteniendo servidor...');
        await server.stop();
        process.exit(0);
      });
    } catch (err) {
      console.error('❌ Error:', err);
      process.exit(1);
    }
  });

dashboardCmd
  .command('status')
  .description('Verifica el estado del servidor dashboard')
  .option('-p, --port <port>', 'Puerto del servidor', '3000')
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      
      // Try to fetch from the API
      const response = await fetch(`http://localhost:${port}/ping`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Dashboard API está corriendo');
        console.log(`   URL: http://localhost:${port}`);
        console.log(`   Status: ${data.status}`);
        console.log(`   Timestamp: ${data.timestamp}`);
      } else {
        console.log('❌ Dashboard API no responde correctamente');
        process.exit(1);
      }
    } catch {
      console.log('❌ Dashboard API no está corriendo');
      console.log(`   No se pudo conectar a http://localhost:${options.port}`);
      process.exit(1);
    }
  });

dashboardCmd
  .command('endpoints')
  .description('Muestra los endpoints disponibles del API')
  .action(() => {
    console.log('📡 Endpoints del Dashboard API:\n');
    console.log('  Health:');
    console.log('    GET  /api/health          - Estado de salud completo');
    console.log('    GET  /api/health/summary  - Resumen de salud (rápido)');
    console.log('');
    console.log('  Servicios:');
    console.log('    GET  /api/services              - Lista todos los servicios');
    console.log('    GET  /api/services/:name        - Estado de un servicio específico');
    console.log('    POST /api/services/:name/restart - Reiniciar un servicio');
    console.log('');
    console.log('  Notificaciones:');
    console.log('    GET    /api/notifications       - Historial de notificaciones');
    console.log('    GET    /api/notifications/stats - Estadísticas de notificaciones');
    console.log('    POST   /api/notifications/test  - Enviar notificación de prueba');
    console.log('    DELETE /api/notifications/history - Limpiar historial');
    console.log('');
    console.log('  Dashboard:');
    console.log('    GET  /api/dashboard       - Resumen completo del dashboard');
    console.log('    GET  /api/events          - Server-Sent Events (tiempo real)');
    console.log('    GET  /ping                - Health check simple');
    console.log('');
    console.log('  WebSocket:');
    console.log('    ws://localhost:3000       - Conexión WebSocket para actualizaciones en vivo');
    console.log('');
    console.log('Ejemplo de uso:');
    console.log('  curl http://localhost:3000/api/health');
    console.log('  curl http://localhost:3000/api/services');
    console.log('  curl http://localhost:3000/api/notifications?limit=10');
  });

program.parse();
