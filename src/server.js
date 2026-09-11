// Content Research Radar - Entry point
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { seed } from './db/seed.js';
import { createApiRoutes } from './api/routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

// Seed on boot
const { workspaceId } = seed();

const app = new Hono();

// Simple session-less workspace resolution: single-user demo mode
function getWorkspaceId() {
  return workspaceId;
}

// API
app.route('/api', createApiRoutes({ getWorkspaceId }));

// Static assets
app.use('/js/*', serveStatic({ root: './public' }));
app.use('/css/*', serveStatic({ root: './public' }));
app.use('/favicon.ico', serveStatic({ path: './public/favicon.ico' }));

// SPA fallback: serve index.html for any non-API GET
app.get('*', c => {
  const p = path.join(PUBLIC_DIR, 'index.html');
  const html = fs.readFileSync(p, 'utf8');
  return c.html(html);
});

const PORT = Number(process.env.PORT || 3000);
serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, info => {
  console.log(`Content Research Radar listening on http://0.0.0.0:${info.port}`);
});
