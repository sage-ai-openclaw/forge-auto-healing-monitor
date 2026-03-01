#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const HealthChecker_1 = require("../health/HealthChecker");
const ConfigManager_1 = require("../config/ConfigManager");
const ServiceMonitor_1 = require("../services/ServiceMonitor");
const program = new commander_1.Command();
program
    .name('aheal')
    .description('Auto-Healing Monitor - Sistema de monitoreo y auto-reparacion')
    .version('1.0.0');
program
    .command('check')
    .description('Ejecuta un chequeo de salud del sistema')
    .action(async () => {
    try {
        const configManager = new ConfigManager_1.ConfigManager();
        const config = await configManager.load();
        console.log('🔍 Verificando salud del sistema...\n');
        const checker = new HealthChecker_1.HealthChecker(config.thresholds);
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
            }
            else {
                console.log('   Advertencias detectadas');
            }
        }
        else {
            console.log('\n✅ Sistema saludable');
        }
    }
    catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
});
program
    .command('init')
    .description('Inicializa el archivo de configuración')
    .action(async () => {
    try {
        const configManager = new ConfigManager_1.ConfigManager();
        await configManager.init();
        console.log(`✅ Configuración inicializada en: ${configManager.getConfigPath()}`);
    }
    catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
});
program
    .command('config')
    .description('Muestra la configuración actual')
    .action(async () => {
    try {
        const configManager = new ConfigManager_1.ConfigManager();
        const config = await configManager.load();
        console.log(JSON.stringify(config, null, 2));
    }
    catch (err) {
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
    .action(async (name, options) => {
    try {
        const configManager = new ConfigManager_1.ConfigManager();
        const config = await configManager.load();
        // Check if service already exists
        if (config.services.find(s => s.name === name)) {
            console.error(`❌ El servicio "${name}" ya está en la lista de monitoreo`);
            process.exit(1);
        }
        const serviceConfig = {
            name,
            type: options.type,
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
    }
    catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
});
serviceCmd
    .command('remove <name>')
    .description('Elimina un servicio del monitoreo')
    .action(async (name) => {
    try {
        const configManager = new ConfigManager_1.ConfigManager();
        const config = await configManager.load();
        const initialLength = config.services.length;
        config.services = config.services.filter(s => s.name !== name);
        if (config.services.length === initialLength) {
            console.error(`❌ El servicio "${name}" no está en la lista de monitoreo`);
            process.exit(1);
        }
        await configManager.save(config);
        console.log(`✅ Servicio "${name}" eliminado del monitoreo`);
    }
    catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
});
serviceCmd
    .command('list')
    .description('Lista los servicios monitoreados')
    .action(async () => {
    try {
        const configManager = new ConfigManager_1.ConfigManager();
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
    }
    catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
});
serviceCmd
    .command('check')
    .description('Chequea el estado de todos los servicios monitoreados')
    .action(async () => {
    try {
        const configManager = new ConfigManager_1.ConfigManager();
        const config = await configManager.load();
        if (config.services.length === 0) {
            console.log('ℹ️  No hay servicios configurados para monitoreo');
            return;
        }
        console.log('🔍 Chequeando servicios...\n');
        // Load services into monitor
        for (const svc of config.services) {
            ServiceMonitor_1.serviceMonitor.addService({
                name: svc.name,
                type: svc.type,
                autoRestart: false, // Manual check, no auto-restart
                maxRestarts: svc.maxRestarts,
                restartWindow: svc.restartWindow,
                checkInterval: svc.checkInterval,
            });
        }
        const results = await ServiceMonitor_1.serviceMonitor.checkAllServices();
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
        }
        else {
            console.log('\n✅ Todos los servicios están ejecutándose correctamente');
        }
    }
    catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
});
serviceCmd
    .command('status <name>')
    .description('Muestra el estado detallado de un servicio')
    .action(async (name) => {
    try {
        const configManager = new ConfigManager_1.ConfigManager();
        const config = await configManager.load();
        const serviceCfg = config.services.find(s => s.name === name);
        if (!serviceCfg) {
            console.error(`❌ El servicio "${name}" no está en la lista de monitoreo`);
            process.exit(1);
        }
        ServiceMonitor_1.serviceMonitor.addService({
            name: serviceCfg.name,
            type: serviceCfg.type,
            autoRestart: serviceCfg.autoRestart,
            maxRestarts: serviceCfg.maxRestarts,
            restartWindow: serviceCfg.restartWindow,
            checkInterval: serviceCfg.checkInterval,
        });
        const status = await ServiceMonitor_1.serviceMonitor.checkService(name);
        console.log(`📊 Estado de ${name}:`);
        console.log(`   Tipo: ${status.type}`);
        console.log(`   Estado: ${status.isRunning ? '✅ Ejecutándose' : '❌ Detenido'}`);
        console.log(`   Sub-estado: ${status.state}`);
        if (status.pid) {
            console.log(`   PID: ${status.pid}`);
        }
        console.log(`   Último chequeo: ${status.lastChecked.toISOString()}`);
        const history = ServiceMonitor_1.serviceMonitor.getRestartHistory(name);
        if (history && history.length > 0) {
            console.log(`\n   Historial de reinicios (${history.length}):`);
            for (const attempt of history.slice(-5)) {
                const status = attempt.success ? '✅' : '❌';
                console.log(`     ${status} ${attempt.timestamp.toISOString()}`);
            }
        }
    }
    catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
});
program.parse();
//# sourceMappingURL=index.js.map