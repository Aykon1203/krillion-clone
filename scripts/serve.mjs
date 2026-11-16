/**
 * krillion.io - Zero-Dependency Static Local HTTP Server
 *
 * Provides static asset serving with appropriate MIME types, path traversal
 * protection, directory index fallback, and graceful termination.
 *
 * Usage via CLI:
 *   node scripts/serve.mjs [--port <port>]
 *
 * Usage as Module:
 *   import { createStaticServer } from './scripts/serve.mjs';
 *   const server = createStaticServer({ rootDir: '.', port: 8000 });
 *   server.listen(8000);
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

/**
 * Resolves port from CLI arguments, PORT environment variable, or default 8000.
 */
export function resolvePort(args = process.argv.slice(2), env = process.env) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' || args[i] === '-p') {
      const p = parseInt(args[i + 1], 10);
      if (!isNaN(p) && p > 0 && p < 65536) return p;
    }
  }
  if (env.PORT) {
    const p = parseInt(env.PORT, 10);
    if (!isNaN(p) && p > 0 && p < 65536) return p;
  }
  return 8000;
}

/**
 * Creates and configures the HTTP static server.
 *
 * @param {Object} options
 * @param {string} [options.rootDir] - Root directory to serve (defaults to project root)
 * @param {number} [options.port=8000] - Default port
 * @returns {http.Server}
 */
export function createStaticServer({ rootDir, port = 8000 } = {}) {
  const baseDir = rootDir
    ? path.resolve(rootDir)
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

  const server = http.createServer((req, res) => {
    // 1. Method verification: Only GET and HEAD are permitted
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Allow': 'GET, HEAD'
      });
      res.end('Method Not Allowed');
      return;
    }

    // Security header: prevent MIME-sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // 2. Parse URL and strip query strings
    const urlWithoutQuery = (req.url || '/').split('?')[0];

    // 3. URL Decode with try/catch to protect against malformed encodings
    let decodedPath = '';
    try {
      decodedPath = decodeURIComponent(urlWithoutQuery);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }

    // 4. Directory traversal defense: reject .. or %2e%2e
    if (req.url.includes('..') || decodedPath.includes('..')) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    // Normalize path and remove leading relative traversal indicators
    const normalizedSafe = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
    if (normalizedSafe.includes('..')) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    // 5. Resolve absolute file path and verify boundary constraint
    let filePath = path.resolve(baseDir, '.' + normalizedSafe);
    if (!filePath.startsWith(baseDir)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    // 6. Check file existence
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    // 7. Directory handling: serve index.html if requested path is a directory
    let stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      const indexPath = path.join(filePath, 'index.html');
      if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
        filePath = indexPath;
        stat = fs.statSync(indexPath);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }
    }

    // 8. Determine Content-Type MIME header
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size
    });

    // 9. Respond to HEAD method with headers only
    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    // 10. Stream file content for GET method
    const stream = fs.createReadStream(filePath);
    stream.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Internal Server Error');
      } else {
        res.destroy(err);
      }
    });
    stream.pipe(res);
  });

  return server;
}

export default createStaticServer;

// Direct execution entrypoint
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = resolvePort();
  const server = createStaticServer();
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

  server.listen(port, () => {
    console.log('====================================================');
    console.log('         🌊 KRILLION.IO STATIC LOCAL SERVER          ');
    console.log('====================================================');
    console.log(`📡 Local URL : http://localhost:${port}`);
    console.log(`📁 Serving   : ${rootDir}`);
    console.log('🛑 Press Ctrl+C to stop the server.');
    console.log('====================================================\n');
  });

  const shutdown = () => {
    console.log('\n🛑 Closing Krillion static server...');
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
