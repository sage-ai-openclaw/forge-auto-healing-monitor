import { Router, type Request, type Response } from 'express';
import { ServiceMonitor } from '../../services/ServiceMonitor';
import { ConfigManager } from '../../config/ConfigManager';

const router = Router();
const serviceMonitor = new ServiceMonitor();

/**
 * GET /api/services
 * Returns all monitored services with their current status
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const configManager = new ConfigManager();
    const config = await configManager.load();
    
    // Load services into monitor
    for (const svc of config.services) {
      serviceMonitor.addService({
        name: svc.name,
        type: svc.type,
        autoRestart: svc.autoRestart,
        maxRestarts: svc.maxRestarts,
        restartWindow: svc.restartWindow,
        checkInterval: svc.checkInterval,
      });
    }
    
    // Check all services
    const checkResults = await serviceMonitor.checkAllServices();
    
    // Get detailed state for each service
    const services = serviceMonitor.getAllServices().map(state => {
      const checkResult = checkResults.find(r => r.name === state.service.name);
      return {
        name: state.service.name,
        type: state.service.type,
        config: {
          autoRestart: state.service.autoRestart,
          maxRestarts: state.service.maxRestarts,
          restartWindow: state.service.restartWindow,
          checkInterval: state.service.checkInterval,
        },
        status: {
          isRunning: state.status.isRunning,
          state: state.status.state,
          pid: state.status.pid,
          uptime: state.status.uptime,
          lastChecked: state.status.lastChecked,
        },
        lastAction: checkResult?.action,
        message: checkResult?.message,
        restartHistory: state.restartHistory.slice(-5), // Last 5 restarts
        restartCount: state.restartCount,
        lastRestart: state.lastRestart,
      };
    });
    
    const runningCount = services.filter(s => s.status.isRunning).length;
    const failedCount = services.length - runningCount;
    
    res.json({
      status: 'success',
      data: {
        services,
        summary: {
          total: services.length,
          running: runningCount,
          failed: failedCount,
          overall: failedCount === 0 ? 'healthy' : failedCount === services.length ? 'critical' : 'warning',
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: `Failed to get services: ${error}`,
    });
  }
});

/**
 * GET /api/services/:name
 * Returns status of a specific service
 */
router.get('/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const configManager = new ConfigManager();
    const config = await configManager.load();
    
    const serviceCfg = config.services.find(s => s.name === name);
    if (!serviceCfg) {
      res.status(404).json({
        status: 'error',
        message: `Service "${name}" not found`,
      });
      return;
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
    const history = serviceMonitor.getRestartHistory(name) || [];
    
    res.json({
      status: 'success',
      data: {
        name: serviceCfg.name,
        type: serviceCfg.type,
        config: {
          autoRestart: serviceCfg.autoRestart,
          maxRestarts: serviceCfg.maxRestarts,
          restartWindow: serviceCfg.restartWindow,
          checkInterval: serviceCfg.checkInterval,
        },
        status: {
          isRunning: status.isRunning,
          state: status.state,
          pid: status.pid,
          uptime: status.uptime,
          lastChecked: status.lastChecked,
        },
        restartHistory: history,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: `Failed to get service: ${error}`,
    });
  }
});

/**
 * POST /api/services/:name/restart
 * Manually restart a service
 */
router.post('/:name/restart', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const configManager = new ConfigManager();
    const config = await configManager.load();
    
    const serviceCfg = config.services.find(s => s.name === name);
    if (!serviceCfg) {
      res.status(404).json({
        status: 'error',
        message: `Service "${name}" not found`,
      });
      return;
    }
    
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    // Attempt restart
    try {
      if (serviceCfg.type === 'systemd') {
        await execAsync(`sudo systemctl restart ${name}`, { timeout: 30000 });
      } else {
        await execAsync(`docker restart ${name}`, { timeout: 30000 });
      }
      
      // Wait and verify
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      serviceMonitor.addService({
        name: serviceCfg.name,
        type: serviceCfg.type,
        autoRestart: serviceCfg.autoRestart,
        maxRestarts: serviceCfg.maxRestarts,
        restartWindow: serviceCfg.restartWindow,
        checkInterval: serviceCfg.checkInterval,
      });
      
      const newStatus = await serviceMonitor.checkService(name);
      
      res.json({
        status: 'success',
        data: {
          name,
          restarted: true,
          isRunning: newStatus.isRunning,
          state: newStatus.state,
          message: newStatus.isRunning ? 'Service restarted successfully' : 'Service did not start after restart',
        },
      });
    } catch (execError) {
      res.status(500).json({
        status: 'error',
        message: `Failed to restart service: ${execError}`,
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: `Failed to restart service: ${error}`,
    });
  }
});

export default router;
export { router as servicesRouter };
