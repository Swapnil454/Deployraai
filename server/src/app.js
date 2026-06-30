import express from "express";
import rateLimit from "express-rate-limit";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from 'path';
import { fileURLToPath } from 'url';
import { oauthRouter, apiAuthRouter } from "./routes/auth.routes.js";
import githubRoutes from "./routes/github.routes.js";
import projectRoutes from "./routes/project.routes.js";
import integrationRoutes from "./routes/integration.routes.js";
import fixPrRoutes from "./routes/fixPr.routes.js";
import deploymentRoutes from "./routes/deployment.routes.js";
import domainRoutes from "./routes/domain.routes.js";
import monitoringRoutes from "./routes/monitoring.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import workflowRoutes from "./routes/workflow.routes.js";
import supportRoutes from "./routes/support.routes.js";
import observabilityRoutes from "./routes/observability.routes.js";
import alertRoutes from "./routes/alert.routes.js";
import issueRoutes from "./routes/issue.routes.js";
import statusRoutes from "./routes/status.routes.js";
import sloRoutes from "./routes/slo.routes.js";
import statusComponentRoutes from "./routes/statusComponent.routes.js";
import logPipelinesRoutes from "./routes/logPipelines.routes.js";
import incidentRoutes from "./routes/incident.routes.js";
import internalRoutes from "./routes/internal.routes.js";
import "./workflows/index.js"; // Register workflows

const app = express();
app.set('trust proxy', 1);

app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));

const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 500, // Limit each IP to 500 requests per window (5 minutes)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again after 5 minutes' }
});

import { requireOrigin } from "./middleware/csrf.middleware.js";

// Apply rate limiting and CSRF middleware
app.use('/api/', apiLimiter, requireOrigin);
app.use('/auth/', apiLimiter, requireOrigin);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, '../public')));
app.use('/screenshots', express.static(path.join(__dirname, '../public/screenshots')));

// Mount routes
app.use("/auth", oauthRouter);
app.use("/api/auth", apiAuthRouter);
app.use("/api/github", githubRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/integrations", integrationRoutes);
app.use("/api/deployments", deploymentRoutes);
app.use("/api/fix-prs", fixPrRoutes);



app.use("/api", domainRoutes);
app.use("/api", monitoringRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/projects/:projectId/workflows", workflowRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/observability", observabilityRoutes);
app.use("/api/projects", alertRoutes);
app.use("/api/projects", issueRoutes);
app.use("/api/projects", sloRoutes);
app.use("/api/projects", statusComponentRoutes);
app.use("/api/observability/projects", logPipelinesRoutes);
app.use("/api/projects", incidentRoutes);
app.use("/api/public/status", statusRoutes);
app.use("/api/internal", internalRoutes);

// Analytics routes need open CORS since they're called from arbitrary user websites
app.use("/api/analytics", (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
});

app.use("/api/analytics", async (req, res, next) => {
    try {
        const { default: router } = await import("./routes/analytics.routes.js");
        return router(req, res, next);
    } catch (err) {
        next(err);
    }
});


app.get("/", (req, res) => {
    res.send({
        "status": "ok",
    })
});

app.get("/health", (req, res) => {
    res.send({
        "status": "healthy",
    })
});

// Add test endpoint
app.post("/api/test", (req, res) => {
    res.json({ message: "Test endpoint working", body: req.body });
});

import { requireAuth } from "./middleware/auth.middleware.js";
import dns from 'dns/promises';

// Private / reserved IP ranges — must match BEFORE the actual HTTP fetch
// to prevent decimal-IP, octal-IP, and DNS-rebinding attacks.
const PROXY_PRIVATE_IP_PATTERNS = [
  /^127\./,                                           // Loopback
  /^10\./,                                            // RFC-1918 Class A
  /^192\.168\./,                                      // RFC-1918 Class C
  /^172\.(1[6-9]|2\d|3[01])\./,                      // RFC-1918 Class B
  /^169\.254\./,                                      // Link-local (cloud metadata)
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,       // RFC-6598 shared
  /^0\./,                                             // "This" network
  /^::1$/,                                            // IPv6 loopback
  /^fc00:/i,                                          // IPv6 unique local
  /^fe80:/i,                                          // IPv6 link-local
];

const isPrivateIp = (addr) => PROXY_PRIVATE_IP_PATTERNS.some(p => p.test(addr));

/**
 * Resolves the target hostname to its real IP(s) via the OS resolver.
 * Throws if any resolved address is private/reserved, which blocks:
 *  - Decimal IP encoding  (e.g. 2130706433 → 127.0.0.1)
 *  - Octal IP encoding    (e.g. 0177.0.0.1 → 127.0.0.1)
 *  - DNS Rebinding        (domain resolves to internal IP at request time)
 */
const assertProxyTargetSafe = async (parsedUrl) => {
  const hostname = parsedUrl.hostname;

  // Reject bare IPs immediately (before DNS)
  if (isPrivateIp(hostname)) {
    throw new Error(`Direct access to ${hostname} is forbidden`);
  }

  // Resolve DNS and recheck every returned address
  let addrs = [];
  try {
    const v4 = await dns.resolve4(hostname).catch(() => []);
    const v6 = await dns.resolve6(hostname).catch(() => []);
    addrs = [...v4, ...v6];
  } catch (_) {
    // Cannot resolve — refuse the request (nothing to reach anyway)
    throw new Error(`Cannot resolve hostname: ${hostname}`);
  }

  for (const addr of addrs) {
    if (isPrivateIp(addr)) {
      throw new Error(`${hostname} resolves to a private IP (${addr}) — access forbidden`);
    }
  }
};

// Proxy health check — avoids CORS when the widget pings a backend /health endpoint
app.get("/api/proxy-health", requireAuth, async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "url query param required" });
    
    try {
        const decodedUrl = decodeURIComponent(url);
        const parsedUrl = new URL(decodedUrl);

        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            return res.status(400).json({ error: "Invalid protocol" });
        }

        // SSRF guard: resolve DNS and validate against private IP ranges
        try {
            await assertProxyTargetSafe(parsedUrl);
        } catch (ssrfErr) {
            return res.status(403).json({ error: ssrfErr.message });
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 7000);
        
        req.on('close', () => {
            clearTimeout(timeout);
            controller.abort();
        });

        const upstream = await fetch(decodedUrl, { signal: controller.signal });
        clearTimeout(timeout);
        
        if (!res.headersSent) {
            res.status(upstream.ok ? 200 : 503).json({ ok: upstream.ok, status: upstream.status });
        }
    } catch (err) {
        if (!res.headersSent) {
            res.status(503).json({ ok: false, error: err.message });
        }
    }
});

export default app;
// trigger nodemon restart

// trigger restart 2

// trigger restart 3

// trigger restart 4

// trigger restart 5

// trigger restart 6

// trigger restart 7

// trigger restart 8

// trigger restart 9
