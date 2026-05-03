# Security Hardened React & Express App (AETHELOS)

This project is a highly secure, production-ready Full-Stack application featuring React on the frontend and Express with Vite middleware on the backend. This application is fortified with an advanced **Behavior-Based Threat Scoring Engine (AETHELOS)** built directly into the middleware, among other elite security guarantees.

## Features & Security Layers

### 🧠 Adaptive Threat Scoring System (AETHELOS) & Redis Integration
A dynamic, behavioral risk evaluation layer that dynamically adjusts access control, throttling, and response latency based on aggregated security signals across authentication, validation, and network activity.
- **Distributed State (Redis)**: Achieves complete horizontal scaling consistency. Threat scores, blocked identities, and rate limiter caches are synchronized across all load-balanced nodes via Redis (`ioredis`, `rate-limit-redis`). One attacker blocked on Node A is instantly blocked on Node B.
- Dynamically calculates risk score.
- Implements **Adaptive Tarpitting** (exponential delay up to 5 seconds) to frustrate automated attackers.
- Invokes Hard Blocks (`HTTP 403`, `Retry-After: 3600`) at high risk thresholds.
- Time-based decay ensures legitimate users aren't permanently locked out.
- Context-aware scoring based on route sensitivity (e.g., SSRF endpoints penalize harder).

### 🚀 Advanced Rate Limiting
- Environment-aware configurations (Dev vs Prod).
- Differentiated limiters: General global limiters vs. strict Sensitive-route limiters.
- Exponential backoff hinting and robust `Retry-After` enforcement.
- Safe `req.ip` extraction utilizing `trust proxy`.

### 🛡 Elite Server-Side Request Forgery (SSRF) Protection
- Validates all outbound proxy requests via a hardened `safeFetch` wrapper.
- Performs full DNS resolution checks (A and AAAA records) to block private, loopback, broadcast, and multicast IP ranges.
- Disables automatic redirects to prevent DNS rebinding bypasses.

### 🔒 Cryptographic JWT Verification (Auth)
- Rejects missing, malformed, or invalid auth configurations immediately.
- Validates token format strictly and executes rigorous RSA signature and issuer verification using Firebase Admin on the backend.

### 🌐 Secure Headers & CSP
- Adopts advanced `helmet` configurations.
- Fundamentally eliminates `'unsafe-inline'` and `'unsafe-eval'` from `script-src`.
- Express payload sizes are strictly capped (`10kb`) to prevent heap exhaustion or DoS attacks.

### 🧾 Comprehensive Observability & Telemetry
- Isolated security audit logs decoupled from standard application logs.
- Emits events like `RATE_LIMIT_EXCEEDED`, `AUTH_FAILURE`, `SSRF_PREVENTED`, and `THREAT_SCORE_UPDATE`.

## Getting Started

### Prerequisites
- Node.js (v18+)
- npm or yarn

### Installation
1. Clone the repository.
2. Run `npm install` to install dependencies.
3. Define your environment variables based on `.env.example`. Create a `.env` file for your local environment (remember: NEVER commit `.env` or service accounts to GitHub).

### Running the App
Start the development server:
```bash
npm run dev
```

Build the production app:
```bash
npm run build
```

Start the production server:
```bash
npm run start
```
