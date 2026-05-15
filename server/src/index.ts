import { createServer } from 'http';
import app from './app.js';
import { config } from './config.js';
import { setupSocket } from './socket/index.js';
import prisma from './db.js';
import { startScheduler, stopScheduler } from './services/scheduler.service.js';
import { startPriceService, stopPriceService } from './services/price.service.js';
import { startTrustMRRService, stopTrustMRRService } from './services/trustmrr.service.js';
import { startStripeRevenueService, stopStripeRevenueService } from './services/stripe-revenue.service.js';
import { prewarmJwks } from './middleware/auth.js';
// Force skill scan at boot so the "[skills] loaded ..." log appears on
// startup. Without this import, the SkillsLoader module wouldn't be
// evaluated until the first SuperAgent v2 turn (which dynamic-imports it).
import './services/skillsLoader.service.js';

const server = createServer(app);

// Setup WebSocket
setupSocket(server);

async function main() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');

    // Pre-warm JWKS cache before accepting requests, to avoid cold-start 401s
    await prewarmJwks();

    // Start background jobs
    startScheduler();
    startPriceService();
    await startTrustMRRService();
    await startStripeRevenueService();

    server.listen(config.port, () => {
      console.log(`🚀 Server running on http://localhost:${config.port}`);
      console.log(`📡 WebSocket ready`);
      console.log(`🌍 Environment: ${config.nodeEnv}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown handler
let isShuttingDown = false;
async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n${signal} received, graceful shutdown...`);

  stopScheduler();
  stopPriceService();
  stopTrustMRRService();
  stopStripeRevenueService();

  // Stop accepting new connections, give 10s for in-flight requests
  const forceTimeout = setTimeout(() => {
    console.error('⏰ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);

  server.close(async () => {
    await prisma.$disconnect();
    clearTimeout(forceTimeout);
    console.log('👋 Server shut down cleanly');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main();
