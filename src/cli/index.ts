#!/usr/bin/env node

import { Command } from 'commander';
import { HealthChecker } from '../health/HealthChecker';
import { ConfigManager } from '../config/ConfigManager';

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

program.parse();
