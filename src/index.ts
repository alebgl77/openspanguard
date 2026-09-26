import { loadConfig } from './config.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = buildServer(config);
  if (config.demoMode || config.evaluator === 'demo') process.stderr.write('WARNING: OpenSpanGuard demo mode produces synthetic signals; do not use for production decisions.\n');
  let shutdownStarted = false;
  const shutdown = async () => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    try { await app.close(); } catch { process.exitCode = 1; }
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  await app.listen({ host: config.host, port: config.port });
  process.stdout.write(`OpenSpanGuard listening on ${config.host}:${config.port}\n`);
}

main().catch(() => { process.stderr.write('OpenSpanGuard startup failed; check configuration and listener availability.\n'); process.exitCode = 1; });
