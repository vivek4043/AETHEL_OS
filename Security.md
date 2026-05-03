# AETHELOS System Architecture: Security First Paradigm

This document outlines the security architecture integrated into the **AETHELOS** Multi-Agent Platform, focusing on enterprise-grade controls that adhere strictly to the OWASP Top 10 guidelines (Latest Guidelines) and general secure coding practices. 

## OWASP Top 10 (2021) Mapping

The following controls have been implemented at both the infrastructure (Node/Express backend) and presentation (React/Vite frontend) layers.

1.  **Broken Access Control**
    *   *Implementation:* Developed a custom `requireAuth` middleware (`server.ts`) that intercepts every request directed to `/api/*` and mandates a valid Firebase ID Token Bearer string.
    *   *Enforcement:* If the Authorization header is omitted or fails verification, the request is immediately rejected with an HTTP 401 Unauthorized status.
    
2.  **Cryptographic Failures**
    *   *Implementation:* All data in transit between the client Application and Google's Auth / Gemini services use TLS 1.2+ encryption (HTTPS). Passwords are never seen by our backend; Firebase Auth securely manages PBKDF2/scrypt/argon-level hashing underneath. No API secrets are exposed to the browser.
    *   *Enforcement:* API Keys (like `GEMINI_API_KEY`) reside purely in backend process environments.

3.  **Injection (SQL/NoSQL/Command/Prompt)**
    *   *Implementation:* For AI generation functions (`generateSalesFollowUp` inside `src/services/aiService.ts`), user inputs (e.g., `leadName`, `status`) are strictly bounded using demarcation tokens (`[LEAD NAME DATA START]`).
    *   *Enforcement:* A "CRITICAL SYSTEM INSTRUCTION" is injected into the prompt context advising the LLM to ignore nested commands. Our code scans the AI response output (`Error: Invalid Input`) to sanitize potential exploits. 

4.  **Insecure Design**
    *   *Implementation:* The system prioritizes a Zero-Trust architecture. Endpoints assume the caller is malicious until proven otherwise via the Token middleware. Also, generic error handlers don't expose stack traces.
    
5.  **Security Misconfiguration**
    *   *Implementation:* The `helmet` library is implemented within `server.ts` to attach secure HTTP headers globally.
    *   *Enforcement:* Missing `X-Powered-By` limits fingerprinting, and Content-Security-Policy (CSP) dictates explicitly trusted origins for scripts and API connections.

6.  **Vulnerable and Outdated Components**
    *   *Implementation:* Only recognized, widely vetted packages (`express`, `helmet`, `cors`, `firebase`) have been installed.
    *   *Practice Recommendation:* Regular execution of `npm audit` is assumed as part of CI/CD workflows.

7.  **Identification and Authentication Failures**
    *   *Implementation:* We enforce authentication checks via Google OAuth. The `express-rate-limit` package mitigates automated credential stuffing or brute-forcing by restricting traffic strictly to 100 requests per 15-minute window for a given IP.

8.  **Software and Data Integrity Failures**
    *   *Implementation:* Implemented request body size limiters inside `express.json({ limit: "10kb" })` mitigating payload tampering or buffer/heap saturation attacks.
    *   *Enforcement:* React automatically escapes text properties mitigating DOM-based data integrity vulnerabilities (like XSS injections).

9.  **Security Logging and Monitoring Failures**
    *   *Implementation:* Developed generic client-serving error handlers that redirect specific stack trace metadata exclusively to internal telemetry `console.error('[SEC-LOG] ...')`.
    *   *Enforcement:* A client will receive a blanket `500 Server Error`, hiding sensitive configuration data from unauthorized snooping.

10. **Server-Side Request Forgery (SSRF)**
    *   *Implementation:* Internal API routes strictly limit outbound requests solely to the authorized domains (e.g., Gemini API endpoint config). No endpoints accept naked user URLs for proxying.

## Advanced Data Protection

### Strict Input Validation & Output Encoding
Using the `zod` schema validator, all incoming POST/PUT JSON payloads are strictly typed. Extraneous fields are ignored, and malformed strings (like an invalid email schema or unbounded deal values) immediately return an HTTP 400 without the data payload being processed by internal logic. 

**Output Encoding:** Structural validation prevents injections into our database, and we employ `sanitize-html` to forcefully strip script tags from input fields before they ever touch the database, protecting downstream components in addition to React's native JSX escaping.

### Advanced Authentication & Authorization (CSRF/CORS)
Because this application relies on standard Bearer Token JWTs sent via the `Authorization` header rather than implicit Cookies, the system inherently mitigates Cross-Site Request Forgery (CSRF). 
- Furthermore, strict CORS settings limit the methods and origins (`https://your-production-domain.com`) acceptable for cross-origin requests.

### User Endpoint Rate Limiting (Brute force & DDoS)
Beyond generic IP-based rate limiting via reverse-proxy identification (`trust proxy`), we have deployed a **Granular User-Based Rate Limiter**.
- This limiter tracks usage per authenticated `user_id` falling back to IP limits, strictly choking sustained automated abuse patterns. Keep-alive timeouts handle Slowloris attempts.

### Elite Server-Side Request Forgery (SSRF) Protection
To allow our agents to reach out to the world safely, we have implemented a hardened `safeFetch` wrapper.
- All outbound proxy queries MUST pass DNS resolution verification checking ALL records (A and AAAA protocols). 
- Target URLs are strictly matched to the `https:` protocol—meaning `http:`, `file:`, `gopher:`, and `ftp:` attacks are neutered.
- The target IP is parsed using `ipaddr.js` to strictly enforce unicast/public IP addresses, completely blocking internal metadata attacks, private VPC queries (`10.0.0.x`, `192.168.x.x`), and loopback enumerations.
- Finally, redirected requests (`redirect: manual`) are not blindly followed, thereby preventing attackers from bypassing DNS checks through remote redirects targeting local resources.

### Advanced Authentication & Cryptography
The application strictly demands production cryptographic validation for JWTs using the Firebase Admin SDK. 
- *Zero Downgrade Policy*: Simulated fallback verifications have been entirely eliminated. The server mandates actual environment credentials and `admin.auth().verifyIdToken()`. An inability to cryptographically verify guarantees an HTTP 401. 
- Context-aware Output Encoding is achieved on the frontend natively via DOM execution isolation (React escaping string payloads), but is coupled structurally by back-end field-level sanitizations prior to database commitments. 

### CSP Hardening
Our `helmet` configuration represents a strict execution perimeter:
- We have fundamentally eliminated `'unsafe-inline'` and `'unsafe-eval'` from our `script-src` directive, ensuring injected string interpolation and cross-site scripting attacks cannot spawn rogue execution flows, even during DOM-based escalations. 
- Broad network protections govern request limits (`express.urlencoded` paired with `express.json` sizes restricted to `10kb`), preventing large payload heap exhaustion attacks (DoS).

### Adaptive Threat Scoring System (AETHELOS)
A fully dynamic, behavioral Threat Scoring Engine operates cross-layer globally on all API endpoints. Rather than relying entirely on deterministic rules, the engine calculates risk based on accumulating behavioral indicators over time.

- **Dynamic Evaluation**: Flagrant violations (such as failed authentication, triggered rate limits, invalid Zod payloads, or SSRF boundary attacks) heavily increase the risk score (`+10` to `+40` points per infraction), compounded by High-Risk Route Multipliers on sensitive API surfaces globally (e.g. `2.0x` modifier on proxy requests). Clean, normal requests are intentionally ignored to neutralize score-diluting evasion tactics.
- **Time-Based Decay**: To avoid permanently locking out legitimate clients after isolated mistakes, scores strictly decay over time via the structural time-fractional helper (`decayScore()`, -2 points per minute using exact Math.floor bucket bounds). Capping prevents overflow boundaries. 
- **Adaptive Responses**: 
   - `Score > 60`: Invokes intense multi-second Artificial Delays (Exponential Tarpitting via `setTimeout` based on `$score * 20ms`), drastically reducing the viability of automated script reconnaissance without fully denying a real user.
   - `Score > 100`: Hard blocks the request entirely with `HTTP 403`, halting processing and returning a `Retry-After: 3600` heuristic block while imprinting an absolute un-bypassable `blockedUntil` cooldown expiration on the cache record.
- **Observability**: Threat Score modifications and Tarpitting actions (`TARPITTING_ACTIVE`, `THREAT_SCORE_UPDATE`) are piped directly into the separated Security Audit Log, granting complete administrative analysis of coordinated network threats bypassing structural edge controls.

### Enterprise Readiness Roadmap
While AETHELOS operates efficiently at a foundational level, transitioning to a fully enterprise-grade deployment at global scale requires addressing the following distributed infrastructure considerations:
1. **Distributed Attack Resistance**: Moving beyond IP/UID tracking by incorporating cross-identity correlation and device fingerprinting to mitigate botnets and IP-rotation strategies.
2. **Horizontal Scaling Consistency**: Transitioning the localized, in-memory `Map()` store and Express Rate Limiter stores to a shared, centralized cache (e.g., Redis) ensuring consistent threat state evaluation across multiple load-balanced infrastructure nodes.
3. **Long-Term Intelligence & SIEM Integration**: Forwarding JSON audit logs to a dedicated SIEM (Security Information and Event Management) or Data Warehouse for long-term anomaly detection, slow-attack visibility, and historical risk pattern analysis.
4. **Adversarial Validation**: Conducting formal external Penetration Testing, Chaos Engineering, and Red Teaming to validate edge case resilience under live fire.

### Telemetry & Security Auditing
Standard application logging has been separated from Security Audit logs. We invoke `auditLog()` across authentication endpoints, validation failures, limits triggers, and SSRF interventions.
- Audit logs systematically track the actor (`req.user_id`), the event, the timestamp, and the target, while intentionally stripping sensitive details (like raw Authorization headers) from the console output.
The backend strictly formats every response into a singular, predictable structure:
`{ success: boolean, data: T | null, error: string | null }`
This ensures the frontend relies on deterministic response shapes without guessing, preventing runtime crashes derived from unhandled exceptions.

## Advanced Configuration Contexts
-   **Security Middleware (`server.ts`):** Ensure the Node environment defines `process.env.GEMINI_API_KEY` remotely. You shouldn't check `.env` into source control.
-   **Production Run:** Ensure you deploy on platforms supporting containerized Zero-Trust overlays (like Cloud Run) and enforcing environment variable management securely. 
