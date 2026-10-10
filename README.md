# throttle-forge

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen.svg)](https://nodejs.org)
[![Zero-Dependencies](https://img.shields.io/badge/Dependencies-0-orange.svg)](#)

> **High-throughput in-memory Token & Leaky Bucket rate limiter and reverse proxy sidecar with zero external dependencies.**

---

## 🎯 The Problem
During local development, staging integration, API load testing, and edge container sidecar deployments, developers frequently need to enforce strict rate-limiting and traffic shaping policies without setting up heavy external infrastructure like Redis or NGINX. Standard libraries often require third-party dependencies with large vulnerability footprints or lack dual algorithm support (Token Bucket for burst allowance vs Leaky Bucket for smooth queue-based pacing). throttle-forge delivers an embeddable, zero-dependency, ultra-fast in-memory rate-limiting reverse proxy, benchmark harness, and CLI inspection engine.

## ✨ Key Features
- **Zero External Dependencies**: Pure Node.js runtime primitives.
- **Production Grade**: Linted, exception-guarded, and CI/CD-friendly.
- **Fast Execution**: Minimal footprint with microsecond overhead.

# throttle-forge

Production-grade, zero-dependency in-memory Token Bucket & Leaky Bucket rate limiter and reverse proxy sidecar for Node.js.

## Why throttle-forge?

Setting up Redis, Envoy, or NGINX just to protect local developer endpoints, throttle batch API invocations, or prevent external API rate-limit exhaustion during staging tests introduces unnecessary infrastructure overhead. `throttle-forge` provides high-throughput algorithmic rate-limiting as either a drop-in reverse proxy sidecar or an importable library module without any external dependencies.

### Algorithms Supported
- **Token Bucket**: Allows bursts up to bucket capacity while refilling tokens continuously at a smooth rate.
- **Leaky Bucket**: Enforces a constant outflow rate, dropping requests when capacity overflow occurs to eliminate burst peaks.

---

## CLI Usage

```bash
# Run as reverse proxy with token-bucket
throttle-forge --port 8080 --target http://127.0.0.1:3000 --algo token-bucket --capacity 20 --rate 5

# Run with leaky-bucket, partitioning by API key header
throttle-forge --port 8080 --target http://127.0.0.1:3000 --algo leaky-bucket --capacity 10 --rate 2 --key-by header:x-api-key

# Run built-in algorithmic simulation benchmark
throttle-forge bench --algo token-bucket --capacity 10 --rate 20
```

## Options Table

| Flag | Alias | Default | Description |
|---|---|---|---|
| `--port` | `-p` | `8080` | Local port for proxy to listen on |
| `--target` | `-t` | `http://127.0.0.1:3000` | Upstream backend URL to forward valid traffic |
| `--algo` | `-a` | `token-bucket` | Limiter algorithm: `token-bucket` or `leaky-bucket` |
| `--capacity`| `-c` | `10` | Max capacity / burst allowance |
| `--rate` | `-r` | `5` | Tokens refilled or leaked per second |
| `--key-by` | `-k` | `ip` | Partition key strategy: `ip`, `global`, or `header:<name>` |
| `--help` | `-h` | - | Display CLI help message |

## Programmatic Usage

```javascript
import { TokenBucket, LeakyBucket, RateLimiterRegistry } from 'throttle-forge/src/core.js';

const limiter = new RateLimiterRegistry({
  algorithm: 'token-bucket',
  capacity: 50,
  rate: 10
});

const result = limiter.consume('user-123', 1);
if (result.allowed) {
  // Process request
} else {
  console.log(`Rate limited! Retry after ${result.retryAfterMs}ms`);
}
```

## Testing

Execute the zero-dependency test suite:
```bash
node test/smoke.js
```


---

## 📄 License
MIT License.
