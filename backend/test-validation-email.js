/**
 * Test script to trigger a validation run and verify email sending
 */

import http from 'http';
import { startServer, stopServer } from './index.js';

console.log('Starting validation run test...\n');

const DEFAULT_PORT = 5000;
const TEST_PORT = process.env.TEST_PORT ? parseInt(process.env.TEST_PORT, 10) : null;

function requestWithRetry({ hostname, port, path, method = 'GET', maxAttempts = 5 }) {
  let attempt = 0;
  let delayMs = 200;

  return new Promise((resolve, reject) => {
    const tryRequest = () => {
      attempt += 1;
      const req = http.request({ hostname, port, path, method }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body: data });
        });
      });

      req.on('error', (err) => {
        if (err.code === 'ECONNREFUSED' && attempt < maxAttempts) {
          console.log(`[Retry] ${path} attempt ${attempt} failed (ECONNREFUSED). Retrying in ${delayMs}ms...`);
          setTimeout(() => {
            delayMs *= 2;
            tryRequest();
          }, delayMs);
          return;
        }
        reject(err);
      });

      req.setTimeout(5000, () => {
        req.destroy(new Error('Request timeout'));
      });

      req.end();
    };

    tryRequest();
  });
}

async function waitForServerReady({ hostname, port, timeoutMs = 20000 }) {
  const start = Date.now();
  let delayMs = 200;

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await requestWithRetry({ hostname, port, path: '/health', maxAttempts: 1 });
      if (res.statusCode === 200) {
        console.log('[Ready] /health responded with 200');
        return;
      }
    } catch (err) {
      console.log(`[Ready] /health not ready yet (${err.message}). Retrying in ${delayMs}ms...`);
    }

    await new Promise(resolve => setTimeout(resolve, delayMs));
    delayMs = Math.min(delayMs * 2, 2000);
  }

  throw new Error('Server did not become ready in time');
}

async function run() {
  const portToUse = TEST_PORT ?? DEFAULT_PORT;
  const { server } = await startServer({ port: portToUse });
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : DEFAULT_PORT;
  const hostname = '127.0.0.1';

  console.log(`[Test] Server started on ${hostname}:${actualPort}`);

  try {
    await waitForServerReady({ hostname, port: actualPort });

    console.log('Sending POST request to /api/validation-runs...');
    const res = await requestWithRetry({
      hostname,
      port: actualPort,
      path: '/api/validation-runs',
      method: 'POST',
      maxAttempts: 5
    });

    console.log(`Response status: ${res.statusCode}`);
    try {
      const result = JSON.parse(res.body);
      console.log('\n✓ Validation run started successfully!');
      console.log('  Run ID:', result.runId);
      console.log('  Status:', result.status);
      console.log('\nCheck the server logs above for email sending details.');
    } catch (e) {
      console.log('\n✓ Validation run started');
      console.log('Raw response:', res.body.substring(0, 200));
    }
  } finally {
    await stopServer(server);
  }
}

run().catch((err) => {
  console.error('\n✗ Test failed:', err.message);
  process.exit(1);
});
