import { createServer } from 'node:http';

let notifications = 0;
const recent = [];
const safe = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,80}$/.test(value) ? value : 'unknown';
const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/healthz') {
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, notifications, recent }));
    return;
  }
  if (request.method !== 'POST' || request.url !== '/alerts') {
    response.writeHead(404).end(); return;
  }
  try {
    let bytes = 0;
    const chunks = [];
    for await (const chunk of request) {
      bytes += chunk.length;
      if (bytes > 262144) { response.writeHead(413).end(); return; }
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!Array.isArray(body.alerts) || body.alerts.length > 100) {
      response.writeHead(400).end(); return;
    }
    for (const alert of body.alerts) {
      const entry = {
        event: 'local_demo_alert', status: safe(alert?.status),
        alertname: safe(alert?.labels?.alertname), severity: safe(alert?.labels?.severity),
        cohort: safe(alert?.labels?.cohort),
      };
      console.log(JSON.stringify(entry));
      recent.push(entry);
      if (recent.length > 10) recent.shift();
    }
    notifications += body.alerts.length;
    response.writeHead(200, { 'content-type': 'application/json' }).end('{}');
  } catch {
    response.writeHead(400).end();
  }
});
server.listen(9080, '0.0.0.0');
process.on('SIGTERM', () => server.close());
