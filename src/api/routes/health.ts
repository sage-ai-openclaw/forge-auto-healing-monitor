import { Router, type Request, type Response } from 'express';
import { HealthChecker } from '../../health/HealthChecker';
import { ConfigManager } from '../../config/ConfigManager';

const router = Router();

/**
 * GET /api/health
 * Returns current system health status (disk, memory, CPU)
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const configManager = new ConfigManager();
    const config = await configManager.load();
    
    const checker = new HealthChecker(config.thresholds);
    const health = await checker.checkAll();
    
    // Calculate overall status
    const hasIssues = checker.hasIssues(health);
    const criticalIssues = checker.getCriticalIssues(health);
    
    res.json({
      status: 'success',
      data: {
        ...health,
        overall: {
          status: criticalIssues.length > 0 ? 'critical' : hasIssues ? 'warning' : 'healthy',
          hasIssues,
          criticalCount: criticalIssues.length,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: `Failed to check health: ${error}`,
    });
  }
});

/**
 * GET /api/health/summary
 * Returns a quick summary for dashboard widgets
 */
router.get('/summary', async (_req: Request, res: Response) => {
  try {
    const configManager = new ConfigManager();
    const config = await configManager.load();
    
    const checker = new HealthChecker(config.thresholds);
    const health = await checker.checkAll();
    
    const criticalIssues = checker.getCriticalIssues(health);
    
    res.json({
      status: 'success',
      data: {
        overall: criticalIssues.length > 0 ? 'critical' : checker.hasIssues(health) ? 'warning' : 'healthy',
        disk: {
          status: health.disk.status,
          value: health.disk.value,
        },
        memory: {
          status: health.memory.status,
          value: health.memory.value,
        },
        cpu: {
          status: health.cpu.status,
          value: health.cpu.value,
        },
        timestamp: health.timestamp,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: `Failed to get health summary: ${error}`,
    });
  }
});

export default router;
export { router as healthRouter };
