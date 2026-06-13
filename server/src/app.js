import express from "express"
import cors from "cors";
import cookieParser from "cookie-parser";
import { oauthRouter, apiAuthRouter } from "./routes/auth.routes.js";
import githubRoutes from "./routes/github.routes.js";
import projectRoutes from "./routes/project.routes.js";
import integrationRoutes from "./routes/integration.routes.js";
import fixPrRoutes from "./routes/fixPr.routes.js";
import deploymentRoutes from "./routes/deployment.routes.js";
import domainRoutes from "./routes/domain.routes.js";
import monitoringRoutes from "./routes/monitoring.routes.js";
import adminRoutes from "./routes/admin.routes.js";

const app = express();

app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

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
