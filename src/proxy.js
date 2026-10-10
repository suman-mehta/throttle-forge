import http from 'http';
import https from 'https';
import { URL } from 'url';
import { RateLimiterRegistry } from './core.js';

export function createProxyServer(config) {
  const targetUrl = new URL(config.target);
  const isTargetHttps = targetUrl.protocol === 'https:';
  const clientModule = isTargetHttps ? https : http;

  const limiter = new RateLimiterRegistry({
    algorithm: config.algorithm,
    capacity: config.capacity,
    rate: config.rate,
    ttlMs: config.ttlMs || 60000
  });

  const extractKey = (req) => {
    const keyBy = config.keyBy || 'ip';
    if (keyBy === 'ip') {
      return req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    }
    if (keyBy.startsWith('header:')) {
      const headerName = keyBy.replace('header:', '').toLowerCase();
      return req.headers[headerName] || 'anonymous';
    }
    return 'global';
  };

  const server = http.createServer((req, res) => {
    const clientKey = extractKey(req);
    const result = limiter.consume(clientKey, 1);

    res.setHeader('X-RateLimit-Limit', config.capacity);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Algorithm', config.algorithm);

    if (!result.allowed) {
      res.setHeader('Retry-After', Math.ceil(result.retryAfterMs / 1000));
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Too Many Requests',
        algorithm: config.algorithm,
        retryAfterMs: result.retryAfterMs,
        key: clientKey
      }));
      return;
    }

    const outboundHeaders = { ...req.headers };
    outboundHeaders.host = targetUrl.host;

    const proxyReq = clientModule.request(
      targetUrl,
      {
        method: req.method,
        path: req.url,
        headers: outboundHeaders
      },
      (targetRes) => {
        res.writeHead(targetRes.statusCode, targetRes.headers);
        targetRes.pipe(res);
      }
    );

    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Gateway', message: err.message }));
      }
    });

    req.pipe(proxyReq);
  });

  return { server, limiter };
}
