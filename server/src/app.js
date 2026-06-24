import express from "express"
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
import "./workflows/index.js"; // Register workflows

const app = express();

app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

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

// Proxy health check — avoids CORS when the widget pings a backend /health endpoint
app.get("/api/proxy-health", async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "url query param required" });
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 7000);
        const upstream = await fetch(decodeURIComponent(url), { signal: controller.signal });
        clearTimeout(timeout);
        res.status(upstream.ok ? 200 : 503).json({ ok: upstream.ok, status: upstream.status });
    } catch (err) {
        res.status(503).json({ ok: false, error: err.message });
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
