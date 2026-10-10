#!/usr/bin/env node
import { createProxyServer } from './proxy.js';
import { TokenBucket, LeakyBucket } from './core.js';

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    mode: 'proxy',
    port: 8080,
    target: 'http://127.0.0.1:3000',
    algorithm: 'token-bucket',
    capacity: 10,
    rate: 5,
    keyBy: 'ip'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--test' || arg === 'bench') {
      options.mode = 'bench';
    } else if (arg === '--port' || arg === '-p') {
      options.port = parseInt(args[++i], 10);
    } else if (arg === '--target' || arg === '-t') {
      options.target = args[++i];
    } else if (arg === '--algo' || arg === '-a') {
      options.algorithm = args[++i];
    } else if (arg === '--capacity' || arg === '-c') {
      options.capacity = parseFloat(args[++i]);
    } else if (arg === '--rate' || arg === '-r') {
      options.rate = parseFloat(args[++i]);
    } else if (arg === '--key-by' || arg === '-k') {
      options.keyBy = args[++i];
    }
  }
  return options;
}

function printHelp() {
  console.log(`
throttle-forge - High Performance Rate Limiter & Sidecar Proxy

Usage:
  throttle-forge [options]
  throttle-forge bench [options]

Options:
  -p, --port <number>       Port to listen on (default: 8080)
  -t, --target <url>        Target backend upstream URL (default: http://127.0.0.1:3000)
  -a, --algo <name>         Limiting algorithm: 'token-bucket' | 'leaky-bucket' (default: token-bucket)
  -c, --capacity <number>   Max burst capacity or bucket size (default: 10)
  -r, --rate <number>       Token refill or leak rate per second (default: 5)
  -k, --key-by <strategy>   Strategy: 'ip', 'global', or 'header:<name>' (default: ip)
  -h, --help                Show this help screen
`);
}

async function runBenchmark(options) {
  console.log(`[bench] Running simulation for algorithm: ${options.algorithm}`);
  console.log(`[bench] Parameters -> Capacity: ${options.capacity}, Rate: ${options.rate}/sec`);

  const bucket = options.algorithm === 'leaky-bucket'
    ? new LeakyBucket(options.capacity, options.rate)
    : new TokenBucket(options.capacity, options.rate);

  let accepted = 0;
  let rejected = 0;
  const total = 50;
  const delayMs = 15;

  console.log(`[bench] Emitting ${total} requests spaced at ${delayMs}ms intervals...`);

  for (let i = 1; i <= total; i++) {
    const res = bucket.consume(1);
    if (res.allowed) {
      accepted++;
    } else {
      rejected++;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  console.log(`[bench] Results Completed:`);
  console.log(` - Total Requests: ${total}`);
  console.log(` - Allowed:        ${accepted}`);
  console.log(` - Throttled:      ${rejected}`);
  console.log(` - Pass Rate:      ${((accepted / total) * 100).toFixed(1)}%`);
}

const options = parseArgs(process.argv);

if (options.help) {
  printHelp();
  process.exit(0);
}

if (options.mode === 'bench') {
  await runBenchmark(options);
  process.exit(0);
}

const { server } = createProxyServer(options);
server.listen(options.port, () => {
  console.log(`[throttle-forge] Reverse proxy running on http://127.0.0.1:${options.port}`);
  console.log(`[throttle-forge] Forwarding to: ${options.target}`);
  console.log(`[throttle-forge] Algorithm: ${options.algorithm} (Capacity: ${options.capacity}, Rate: ${options.rate}/s)`);
  console.log(`[throttle-forge] Partition Key: ${options.keyBy}`);
});
