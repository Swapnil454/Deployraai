import 'dotenv/config'; // MUST BE FIRST
import app from "./app.js";
import connect from "./connect.js";
import { initCron } from "./cron.js";
import http from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import HumanSupportCase from "./models/HumanSupportCase.js";
import { ensureMonitorCheckRetention } from "./models/MonitorCheck.js";
import { initializeUptimeCronSchema } from "./uptime-cron/schema.js";
import { startUptimeCronScheduler } from "./uptime-cron/service.js";
import { fork } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Spawn microservices (ingestor and analytics-api) if they exist
try {
  const ingestorPath = path.join(__dirname, '../../packages/ingestor/dist/index.js');
  const analyticsPath = path.join(__dirname, '../../packages/analytics-api/dist/index.js');
  
  if (fs.existsSync(ingestorPath)) {
      fork(ingestorPath, [], { env: { ...process.env, PORT: '4317' } });
      console.log("[System] Started embedded ingestor on port 4317");
  }
  if (fs.existsSync(analyticsPath)) {
      fork(analyticsPath, [], { env: { ...process.env, PORT: '4318' } });
      console.log("[System] Started embedded analytics-api on port 4318");
  }
} catch (e) {
  console.error("[System] Failed to spawn microservices:", e.message);
}

// ── Startup environment guard ────────────────────────────────────────────────
const REQUIRED_ENV = ["JWT_SECRET", "MONGO_URI", "DATABASE_URL", "UPTIMER_DB", "CLICKHOUSE_URL", "INGESTOR_JWT_SECRET"];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length > 0) {
  console.error(`[FATAL] Missing required environment variables: ${missingEnv.join(", ")}`);
  process.exit(1);
}
if (process.env.JWT_SECRET === "fallback_secret_do_not_use_in_prod") {
  console.error("[FATAL] JWT_SECRET is set to the known insecure fallback value. Set a real secret.");
  process.exit(1);
}

const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0";

connect(process.env.MONGO_URI)
    .then(() => {
        console.log(` MongoDB Connected`);

        ensureMonitorCheckRetention()
          .then(() => console.log('[Monitoring] Check retention configured'))
          .catch((error) => console.error('[Monitoring] Failed to configure check retention:', error.message));

        initializeUptimeCronSchema()
          .then(() => {
            console.log("[Uptime Cron] Dedicated UPTIMER_DB schema initialized");
            startUptimeCronScheduler();
          })
          .catch((error) => console.error("[Uptime Cron] Failed to initialize dedicated database:", error.message));

        const server = http.createServer(app);
        
        const io = new Server(server, {
          cors: {
            origin: (() => {
              const _o = process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000';
              const _set = new Set(_o.split(',').map(x => x.trim()).filter(Boolean));
              return (origin, cb) => { if (!origin || _set.has(origin)) return cb(null, true); cb(new Error('Socket CORS: not allowed')); };
            })(),
            credentials: true
          }
        });

        // Make io accessible in routes via req.app.get('io')
        app.set('io', io);

        // WebSocket Authentication Middleware
        io.use((socket, next) => {
          try {
            // Check auth token (from handshake auth or query)
            const token = socket.handshake.auth?.token || socket.handshake.query?.token;
            if (!token) return next(new Error("Authentication error: No token provided"));

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.user = decoded;
            next();
          } catch (err) {
            next(new Error("Authentication error: Invalid token"));
          }
        });

        io.on("connection", (socket) => {
          console.log(`[Socket] Client connected: ${socket.id} (User: ${socket.user?.userId})`);
          
          socket.on("join_case", async (caseId) => {
            try {
              if (!socket.user) return;
              
              // Prevent IDOR: Check if user owns the case or is admin
              const supportCase = await HumanSupportCase.findById(caseId).select('userId');
              if (!supportCase) return;

              if (socket.user.role === 'admin' || supportCase.userId.toString() === socket.user.userId) {
                socket.join(caseId);
                console.log(`[Socket] User ${socket.user.userId} joined case room ${caseId}`);
              } else {
                console.warn(`[Socket] User ${socket.user.userId} attempted to join unauthorized case room ${caseId}`);
              }
            } catch (err) {
              console.error("[Socket] Error joining case:", err.message);
            }
          });

          socket.on("disconnect", () => {
            console.log(`[Socket] Client disconnected: ${socket.id}`);
          });
        });

        server.listen(PORT, HOST, () => {
            console.log(`Server started successfully at http://${HOST}:${PORT}`);
            initCron();
        });

        server.on('error', (error) => {
            console.error(' Server error:', error);
        });
    })
    .catch((error) => {
        console.error(" MongoDB connection error:", error);
    });
