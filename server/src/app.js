import express from "express"
import cors from "cors";
import cookieParser from "cookie-parser";
import { oauthRouter, apiAuthRouter } from "./routes/auth.routes.js";
import githubRoutes from "./routes/github.routes.js";
import projectRoutes from "./routes/project.routes.js";
import integrationRoutes from "./routes/integration.routes.js";
import deploymentRoutes from "./routes/deployment.routes.js";

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