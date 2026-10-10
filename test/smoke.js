import assert from 'assert';
import http from 'http';
import { TokenBucket, LeakyBucket, RateLimiterRegistry } from '../src/core.js';
import { createProxyServer } from '../src/proxy.js';

async function testTokenBucket() {
  process.stdout.write('Testing TokenBucket logic... ');
  const bucket = new TokenBucket(5, 10);
  
  for (let i = 0; i < 5; i++) {
    const res = bucket.consume(1);
    assert.strictEqual(res.allowed, true, `Token ${i + 1} should be allowed`);
  }
  
  const exhausted = bucket.consume(1);
  assert.strictEqual(exhausted.allowed, false, '6th request must be rejected');
  assert(exhausted.retryAfterMs > 0, 'Retry-After should be calculated');

  // Wait 120ms to allow at least 1 token refill (10 tokens/sec = 1 per 100ms)
  await new Promise((r) => setTimeout(r, 120));
  const refilled = bucket.consume(1);
  assert.strictEqual(refilled.allowed, true, 'Bucket must refill over time');
  console.log('PASSED');
}

async function testLeakyBucket() {
  process.stdout.write('Testing LeakyBucket logic... ');
  const bucket = new LeakyBucket(3, 5);

  assert.strictEqual(bucket.consume(1).allowed, true);
  assert.strictEqual(bucket.consume(1).allowed, true);
  assert.strictEqual(bucket.consume(1).allowed, true);
  assert.strictEqual(bucket.consume(1).allowed, false, 'Overflow should be dropped');

  // Wait 250ms for leaks (5 leaks/sec = 1 leak every 200ms)
  await new Promise((r) => setTimeout(r, 250));
  assert.strictEqual(bucket.consume(1).allowed, true, 'Bucket should leak and accept input');
  console.log('PASSED');
}

async function testRegistry() {
  process.stdout.write('Testing RateLimiterRegistry... ');
  const registry = new RateLimiterRegistry({
    algorithm: 'token-bucket',
    capacity: 2,
    rate: 1
  });

  assert.strictEqual(registry.consume('clientA', 1).allowed, true);
  assert.strictEqual(registry.consume('clientA', 1).allowed, true);
  assert.strictEqual(registry.consume('clientA', 1).allowed, false);

  assert.strictEqual(registry.consume('clientB', 1).allowed, true, 'Client B should have independent limit');
  registry.destroy();
  console.log('PASSED');
}

async function testProxy() {
  process.stdout.write('Testing Proxy integration... ');
  
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('UPSTREAM_OK');
  });

  await new Promise((resolve) => upstream.listen(0, resolve));
  const upstreamPort = upstream.address().port;

  const { server } = createProxyServer({
    target: `http://127.0.0.1:${upstreamPort}`,
    algorithm: 'token-bucket',
    capacity: 2,
    rate: 1,
    keyBy: 'header:x-test-user'
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const proxyPort = server.address().port;

  const makeReq = () => new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${proxyPort}/`, {
      headers: { 'x-test-user': 'dev-1' }
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
  });

  const res1 = await makeReq();
  const res2 = await makeReq();
  const res3 = await makeReq();

  assert.strictEqual(res1.status, 200);
  assert.strictEqual(res1.body, 'UPSTREAM_OK');
  assert.strictEqual(res2.status, 200);
  assert.strictEqual(res3.status, 429, '3rd request must be rate limited with 429');

  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => upstream.close(resolve));
  console.log('PASSED');
}

async function main() {
  try {
    await testTokenBucket();
    await testLeakyBucket();
    await testRegistry();
    await testProxy();
    console.log('\nAll smoke tests passed cleanly!');
    process.exit(0);
  } catch (err) {
    console.error('\nSmoke test failure:', err);
    process.exit(1);
  }
}

main();
