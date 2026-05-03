import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import Redis from "ioredis";
import { RedisStore } from "rate-limit-redis";
import { z } from "zod";
import sanitizeHtml from "sanitize-html";
import admin from "firebase-admin";
import dns from "dns/promises";
import ipaddr from "ipaddr.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Redis Initialization ---
const redisUrl = process.env.REDIS_URL;
export const redisClient = redisUrl ? new Redis(redisUrl) : null;
if (redisClient) {
  redisClient.on("error", (err) => console.error("Redis Client Error", err));
  redisClient.on("connect", () => console.log("Connected to Redis shared state"));
}

// --- Audit Logging Utility ---
let auditLogCache = new Map<string, number>();
setInterval(() => auditLogCache.clear(), 60000); // Clear cache every minute to prevent memory leak

function auditLog(userId: string | null, action: string, details: any, req: express.Request) {
  // Rate-limit the logs themselves to prevent Log Flooding (DoS)
  const cacheKey = `${req.ip}:${action}`;
  const now = Date.now();
  if (auditLogCache.has(cacheKey) && now - auditLogCache.get(cacheKey)! < 5000) {
    return; // Skip logging if we've logged this exact action from this IP in the last 5 seconds
  }
  auditLogCache.set(cacheKey, now);

  // Sanitize headers to prevent accidental credential leakage in logs
  const safeHeaders = { ...req.headers };
  delete safeHeaders.authorization;
  delete safeHeaders.cookie;

  const entry = {
    timestamp: new Date().toISOString(),
    event: action,
    userId: userId || 'anonymous',
    ip: req.ip,
    method: req.method,
    path: req.path,
    details
  };
  // Write pure structured telemetry (e.g., to Cloud Logging/SIEM)
  console.log(`[SEC-AUDIT] ${JSON.stringify(entry)}`);
}

// --- Threat Scoring Engine ---
interface ThreatEntry {
  score: number;
  lastDecay: number;
  blockedUntil?: number;
}
const localThreatStore = new Map<string, ThreatEntry>();

// Periodically clean up the local memory fallback store
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of localThreatStore.entries()) {
    if (entry.score <= 0 && (!entry.blockedUntil || now > entry.blockedUntil) && now - entry.lastDecay > 10 * 60 * 1000) {
      localThreatStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

async function getThreatEntry(key: string): Promise<ThreatEntry> {
  if (redisClient) {
    try {
      const data = await redisClient.get(`threat:${key}`);
      return data ? JSON.parse(data) : { score: 0, lastDecay: Date.now() };
    } catch (err) {
      console.error("Redis get error (threat)", err);
    }
  }
  return localThreatStore.get(key) || { score: 0, lastDecay: Date.now() };
}

async function setThreatEntry(key: string, entry: ThreatEntry): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.set(`threat:${key}`, JSON.stringify(entry), "EX", 3600);
    } catch (err) {
       console.error("Redis set error (threat)", err);
    }
  } else {
    localThreatStore.set(key, entry);
  }
}

function getThreatKey(req: express.Request) {
  return (req as any).user?.user_id || (req as any).user?.uid || req.ip;
}

const DECAY_RATE_PER_MIN = 2;
function decayScore(entry: ThreatEntry) {
  const now = Date.now();
  const minutes = Math.floor((now - entry.lastDecay) / 60000);
  if (minutes > 0) {
    entry.score = Math.max(0, entry.score - minutes * DECAY_RATE_PER_MIN);
    entry.lastDecay = now;
  }
  return entry;
}

const routeWeights: Record<string, number> = {
  "/api/proxy": 2.0,
  "/api/sales/lead": 1.5,
};

async function addThreatScore(req: express.Request, basePoints: number, reason: string): Promise<void> {
  if (!req.ip) return;
  const key = getThreatKey(req);
  let entry = await getThreatEntry(key);
  entry = decayScore(entry);
  
  const multiplier = routeWeights[req.path] || 1;
  const points = Math.floor(basePoints * multiplier);
  
  entry.score = Math.min(entry.score + points, 200); // Cap max score to 200
  await setThreatEntry(key, entry);
  
  if (redisClient) await redisClient.incr("global:threat:score").catch(console.error);

  auditLog(key, "THREAT_SCORE_UPDATE", { points, reason, total: entry.score }, req);
}

async function threatMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const key = getThreatKey(req);
  let entry = await getThreatEntry(key);
  entry = decayScore(entry);
  await setThreatEntry(key, entry);

  if (entry.blockedUntil && Date.now() < entry.blockedUntil) {
    res.setHeader("Retry-After", Math.ceil((entry.blockedUntil - Date.now()) / 1000).toString());
    return res.status(403).json({ success: false, data: null, error: "Access temporarily blocked due to repeated high risk activity." });
  }

  if (entry.score > 100) {
    entry.blockedUntil = Date.now() + 60 * 60 * 1000; // 1 hour block
    await setThreatEntry(key, entry);
    
    auditLog(key, "BLOCKED_HIGH_RISK", { score: entry.score }, req);
    res.setHeader("Retry-After", "3600");
    return res.status(403).json({ success: false, data: null, error: "High risk activity detected. Access temporarily blocked." });
  }

  if (entry.score > 60) {
    (req as any).isSuspicious = true;
    const delay = Math.min(5000, entry.score * 20); // Adaptive tarpitting
    auditLog(key, "TARPITTING_ACTIVE", { score: entry.score, delay }, req);
    setTimeout(next, delay); // Artificial delay to frustrate attackers
    return;
  }

  next();
}

// --- SSRF Protection Utility ---
// Whenever the server needs to make outbound requests on behalf of users or AI agents, use this safeFetch wrapper.
async function safeFetch(targetUrl: string, options?: RequestInit) {
  const parsed = new URL(targetUrl);
  if (parsed.protocol !== "https:") {
    throw new Error("SSRF Prevention: Invalid protocol. Only HTTPS allowed.");
  }

  // Resolve all hostname records (A and AAAA)
  const records = await dns.lookup(parsed.hostname, { all: true });
  for (const record of records) {
    const ip = ipaddr.parse(record.address);
    const range = ip.range();

    // Block private, loopback, and local network IP ranges
    if (['private', 'loopback', 'linkLocal', 'broadcast', 'multicast', 'unspecified', 'carrierGradeNat'].includes(range)) {
      throw new Error(`SSRF Prevention: Cannot fetch to internal/private IP range (${range}).`);
    }
  }

  // Prevent following redirects automatically to avoid redirect-based SSRF (DNS rebinding bypass)
  return fetch(targetUrl, { ...options, redirect: "manual" });
}

// Initialize Firebase Admin (Note: In production, supply credentials via FIREBASE_SERVICE_ACCOUNT variable or Application Default Credentials)
if (!admin.apps.length) {
  try {
    admin.initializeApp();
  } catch (e) {
    console.error("Firebase admin init failed:", e);
  }
}

// Standard API Response Structure
function sendSuccess<T>(res: express.Response, data: T, status = 200) {
  res.status(status).json({ success: true, data, error: null });
}

function sendError(res: express.Response, error: string, status = 400) {
  res.status(status).json({ success: false, data: null, error });
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  const isProd = process.env.NODE_ENV === "production";

  // Global timeout middleware to prevent slowloris/resource exhaustion
  app.use((req, res, next) => {
    res.setTimeout(10000, () => res.status(408).send('Request Timeout'));
    next();
  });

  // --- OWASP #5 & #7: Secure Proxies & Headers ---
  // Trust exactly 1 hop (e.g., the Cloud Run load balancer) in production to avoid IP spoofing via X-Forwarded-For manipulation
  app.set("trust proxy", isProd ? 1 : false); 

  // --- OWASP #5: Security Misconfiguration (Secure Headers) ---
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://apis.google.com", "https://cdn.jsdelivr.net"],
        connectSrc: ["'self'", "https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com", "https://*.firebaseio.com", "https://*.googleapis.com"],
        objectSrc: ["'none'"], // Prevent Flash/Java/plugins
        baseUri: ["'self'"],   // Prevent base tag injection
        imgSrc: ["'self'", "data:", "https://*"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        // In preview environments, allow framing from AI Studio
        // In authentic production, this should be ['self'] or specific trusted domains
        frameAncestors: isProd ? ["'self'"] : ["*"], 
      },
    },
    // Required to allow the iframe embedding preview
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    noSniff: true,
  }));

  // --- OWASP #7: Identification and Authentication Failures (CORS & Rate Limiting) ---
  app.use(cors({
    origin: isProd ? "https://your-production-domain.com" : "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }));

  // Prevent abuse and brute-force attacks on our APIs
  // Note: For horizontal scaling in production, substitute memory store with a Redis Store instance.
  const generalLimiter = rateLimit({
    windowMs: isProd ? 15 * 60 * 1000 : 1 * 60 * 1000, // 15 minutes in Prod, 1 minute in Dev
    max: isProd ? 100 : 1000, // Limit each IP to 100 (Prod) / 1000 (Dev) requests per `window`
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    // Note: some libraries support 'burst' capacities inherently—for strict express-rate-limit, this relies on max/windowMs configuration.
    store: redisClient ? new RedisStore({ sendCommand: (...args: string[]) => redisClient.call(...(args as unknown as [string, ...string[]])) as any }) : undefined,
    skip: (req) => {
      // Allow fast loopback development without limits ONLY in dev
      return !isProd && (req.ip === "127.0.0.1" || req.ip === "::1" || req.ip?.includes("127.0.0.1"));
    },
    handler: (req, res) => {
      res.setHeader("Retry-After", isProd ? "900" : "60");
      auditLog(null, "RATE_LIMIT_EXCEEDED", { route: req.originalUrl }, req);
      addThreatScore(req, 20, "RATE_LIMIT_EXCEEDED").catch(console.error);
      sendError(res, "Too many requests from this IP, slow down.", 429);
    },
  });

  app.use(express.json({ limit: "10kb" })); // --- OWASP #8: Payload size limit ---
  app.use(express.urlencoded({ extended: true, limit: "10kb" })); // --- OWASP #8: Payload size limit for URL encoded ---

  // --- Authentication Middleware ---
  // Demonstrates JWT validation. Uses `firebase-admin` for full prod implementation.
  const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      auditLog(null, "AUTH_FAILURE", "Missing/Invalid Header", req);
      addThreatScore(req, 15, "AUTH_FAILURE_MISSING_HEADER").catch(console.error);
      return sendError(res, "Unauthorized: Missing or invalid token format", 401);
    }
    
    const token = authHeader.split("Bearer ")[1];
    
    try {
      if (admin.apps.length === 0) {
        throw new Error("Auth system not initialized. Proceeding with secure failure mode.");
      }
      
      // ACTUAL PRODUCTION VERIFICATION - Validates RSA signature, expiry, and issuer
      const decodedToken = await admin.auth().verifyIdToken(token);
      (req as any).user = decodedToken;
      return next();
    } catch (error) {
      // Intentionally avoiding logging the actual raw token for security (OWASP #9)
      auditLog(null, "AUTH_VERIFICATION_FAILED", "Verification failed", req);
      addThreatScore(req, 15, "AUTH_VERIFICATION_FAILED").catch(console.error);
      return sendError(res, "Unauthorized: Verification failed", 401);
    }
  };

  const sensitiveLimiter = rateLimit({
    windowMs: isProd ? 5 * 60 * 1000 : 1 * 60 * 1000, // 5 minutes in prod, 1 in dev
    max: isProd ? 50 : 500, // Strict: 50 requests per 5 minutes per user segment in prod
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      return !isProd && (req.ip === "127.0.0.1" || req.ip === "::1" || req.ip?.includes("127.0.0.1"));
    },
    store: redisClient ? new RedisStore({ sendCommand: (...args: string[]) => redisClient.call(...(args as unknown as [string, ...string[]])) as any }) : undefined,
    keyGenerator: (req) => {
      // Fallback to strict IP if auth metadata isn't populated (trust proxy handles correct IP)
      return (req as any).user?.user_id || (req as any).user?.uid || req.ip;
    },
    handler: (req, res) => {
      res.setHeader("Retry-After", isProd ? "300" : "60");
      auditLog((req as any).user?.user_id, "SENSITIVE_RATE_LIMIT_EXCEEDED", { route: req.originalUrl }, req);
      addThreatScore(req, 20, "SENSITIVE_RATE_LIMIT_EXCEEDED").catch(console.error);
      sendError(res, "Too many sensitive requests from this user.", 429);
    },
  });

  app.use("/api/", generalLimiter); // Global IP fallback limiter
  app.use("/api/", threatMiddleware); // Adaptive Threat Scoring
  app.use("/api/", requireAuth);
  
  // Apply sensitive limiter only to specific routes
  app.use("/api/sales/lead", sensitiveLimiter); 
  app.use("/api/proxy", sensitiveLimiter);

  app.get("/api/debug/threat-score", async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return sendError(res, "Not available in production", 404);
    }
    let entries: any[] = [];
    if (redisClient) {
      try {
         const keys = await redisClient.keys("threat:*");
         if (keys.length > 0) {
           const values = await redisClient.mget(...keys);
           entries = keys.map((key, i) => {
             const val = values[i] ? JSON.parse(values[i]!) : null;
             return {
               key: key.replace("threat:", ""),
               score: val?.score,
               lastDecay: val?.lastDecay ? new Date(val.lastDecay).toISOString() : null,
               blockedUntil: val?.blockedUntil ? new Date(val.blockedUntil).toISOString() : null
             };
           });
         }
      } catch(err) {
         console.error("Redis keys fetch error", err);
      }
    } else {
      entries = Array.from(localThreatStore.entries()).map(([key, value]) => ({
        key,
        score: value.score,
        lastDecay: new Date(value.lastDecay).toISOString(),
        blockedUntil: value.blockedUntil ? new Date(value.blockedUntil).toISOString() : null
      }));
    }
    sendSuccess(res, { threatScores: entries });
  });

  // --- API Routes ---

  app.get("/api/logs", (req, res) => {
    sendSuccess(res, {
      logs: [
        `[${new Date().toISOString()}] auth.log: sshd[1234]: Failed password for root from 192.168.1.105 port 54321 ssh2`,
        `[${new Date().toISOString()}] auth.log: sshd[1235]: Failed password for admin from 45.67.89.12 port 33211 ssh2`,
        `[${new Date(Date.now() - 5000).toISOString()}] auth.log: systemd: session opened for user vivek`,
        `[${new Date(Date.now() - 10000).toISOString()}] auth.log: sshd[1236]: Failed password for root from 192.168.1.105 port 54322 ssh2`,
        `[${new Date(Date.now() - 15000).toISOString()}] auth.log: sshd[1237]: Failed password for invalid user worker from 103.45.12.9 port 60123 ssh2`,
      ]
    });
  });

  app.get("/api/tasks", (req, res) => {
    sendSuccess(res, {
      tasks: [
        { id: 1, title: "Database migration", status: "In Progress", priority: "High", deadline: "2 hours" },
        { id: 2, title: "Edge node update", status: "Pending", priority: "Medium", deadline: "5 hours" },
        { id: 3, title: "SSL Certificate renewal", status: "Completed", priority: "Highest", deadline: "Done" },
        { id: 4, title: "Optimize index queries", status: "Delayed", priority: "Low", deadline: "Overdue" },
      ]
    });
  });

  app.get("/api/leads", (req, res) => {
    sendSuccess(res, {
      leads: [
        { id: "L001", name: "Global Tech Inc", value: "$50,000", status: "Contacted", lastContact: "2 days ago" },
        { id: "L002", name: "Innovate AI", value: "$12,000", status: "Qualified", lastContact: "Today" },
        { id: "L003", name: "Solaris Systems", value: "$120,000", status: "Negotiation", lastContact: "5 hours ago" },
      ]
    });
  });

  app.get("/api/marketing", (req, res) => {
    sendSuccess(res, {
      trendingKeywords: ["Personalized AI", "Low-latency streaming", "Cybersecurity Mesh"],
      currentEngagement: { clicks: 1240, impressions: 45000, ctr: "2.7%" },
      mockFeedback: ["Love the new dashboard UI!", "The security alerts are lifesaving.", "Need better mobile support."]
    });
  });

  app.get("/api/overview", (req, res) => {
    sendSuccess(res, {
      activeUsers: 452,
      systemHealth: "Optimal",
      revenueGrowth: "+12.5%",
      threatLevel: "Elevated",
      topPriority: "Investigate brute-force attempts on node-04"
    });
  });

  // Strict schema definition
  const leadSchema = z.object({
    name: z.string().min(1).max(50).regex(/^[a-zA-Z\s\-]+$/, "Invalid characters in name"),
    email: z.string().email(),
    value: z.number().positive().max(1000000000)
  });

  app.post("/api/sales/lead", (req, res) => {
    try {
      const parsedData = leadSchema.parse(req.body);

      // Output sanitization using sanitize-html
      const sanitizedName = sanitizeHtml(parsedData.name, {
        allowedTags: [], // Strip all HTML tags
        allowedAttributes: {}, // Strip all attributes
      });

      const sanitizedLead = {
        id: `L${Date.now()}`,
        name: sanitizedName,
        email: parsedData.email.toLowerCase(),
        value: parsedData.value,
        status: "New"
      };

      auditLog((req as any).user?.user_id, "CREATE_LEAD", { sanitizedLeadId: sanitizedLead.id }, req);
      sendSuccess(res, sanitizedLead, 201);
    } catch (err) {
      if (err instanceof z.ZodError) {
        auditLog((req as any).user?.user_id, "VALIDATION_FAILED", "Invalid lead payload", req);
        addThreatScore(req, 10, "INVALID_INPUT_PAYLOAD").catch(console.error);
        return sendError(res, "Validation failed: " + err.issues.map(e => e.message).join(", "), 400);
      }
      sendError(res, "Internal validation error", 500);
    } 
  });

  // --- OWASP #10: SSRF Protected Proxy Endpoint ---
  // Demonstrates fetching a remote resource safely
  app.post("/api/proxy", async (req, res) => {
    addThreatScore(req, 5, "SENSITIVE_ENDPOINT_ACCESS").catch(console.error);
    const targetUrl = req.body.url;
    if (!targetUrl || typeof targetUrl !== "string") {
       addThreatScore(req, 10, "INVALID_PROXY_INPUT").catch(console.error);
       return sendError(res, "Missing or invalid URL", 400);
    }

    try {
      const response = await safeFetch(targetUrl, { method: "GET" });
      const data = await response.text();
      auditLog((req as any).user?.user_id, "SSRF_SAFE_FETCH", { targetUrl, status: response.status }, req);
      sendSuccess(res, { body: data.substring(0, 1000) }); // Send first 1000 chars safely
    } catch(err: any) {
      auditLog((req as any).user?.user_id, "SSRF_PREVENTED", { targetUrl, reason: err.message }, req);
      addThreatScore(req, 40, "SSRF_ATTEMPT").catch(console.error);
      sendError(res, "Fetch failed or was blocked by security policy.", 403);
    }
  });

  // --- OWASP #9: Security Logging and Monitoring Failures ---
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(`[SEC-LOG] Error on ${req.method} ${req.url}:`, err.message); 
    sendError(res, "Internal Server Error", 500);
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
