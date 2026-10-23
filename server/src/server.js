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
import { stopHeartbeatBatcher } from "./uptime-cron/controller.js";
import { stopHeartbeatDetector } from "./uptime-cron/heartbeatDetector.js";
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

// Handle transient cloud connection drops (e.g. Neon auto-suspend, network resets) gracefully
process.on('unhandledRejection', (reason) => {
  console.warn('[System] Unhandled promise rejection:', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
  console.error('[System] Uncaught exception:', err?.message || err);
  if (
    err?.code === 'ECONNRESET' || 
    err?.code === '57P01' || // terminating connection due to administrator command / server shutdown
    err?.message?.includes('writeAfterFIN') || 
    err?.message?.includes('Connection terminated')
  ) {
    console.warn('[System] Handled transient database socket severance. Service remains active.');
    return;
  }
});

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

        let isShuttingDown = false;
        const gracefulShutdown = (signal) => {
          if (isShuttingDown) return;
          isShuttingDown = true;
          console.log(`[Server] Received ${signal}. Commencing graceful shutdown...`);

          // 1. Immediately halt the heartbeat detector sweep loop before draining.
          // Prevents overdue false DOWN alerts while pings remain buffered in Node memory.
          try {
            stopHeartbeatDetector();
          } catch (e) {
            console.error("[Server] Error stopping heartbeat detector:", e);
          }

          // 2. Unconditional hard deadline (17s).
          // Guarantees process terminates even if server.close() or batch flush hangs.
          const hardDeadlineTimer = setTimeout(() => {
            console.error("[Server] Hard shutdown deadline (17s) reached. Forcing immediate process exit.");
            process.exit(1);
          }, 17_000);
          hardDeadlineTimer.unref();

          let serverClosed = false;
          let flushFailed = false;

          // 3. Stop accepting new connections
          server.close(async () => {
            if (serverClosed) return;
            serverClosed = true;
            console.log("[Server] HTTP server closed. Draining in-flight heartbeat batcher buffer...");
            try {
              // Bounded flush (5s max) on the normal callback path
              const flushPromise = stopHeartbeatBatcher();
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Shutdown flush timed out (5s)")), 5000)
              );
              const res = await Promise.race([flushPromise, timeoutPromise]);
              if (!res.success) {
                flushFailed = true;
                console.error(`[Server] FATAL: Shutdown flush failed. ${res.remaining} heartbeat pings were lost!`);
              }
              // Note: Phase 3 ClickHouse buffer flush will also be awaited here
            } catch (err) {
              flushFailed = true;
              console.error("[Server] Error stopping heartbeat batcher:", err.message);
            }
            if (flushFailed) {
              console.error("[Server] Exiting with code 1 due to unpersisted telemetry.");
              process.exit(1);
            }
            console.log("[Server] Clean shutdown complete.");
            process.exit(0);
          });

          // Node 18+: Close idle keep-alives immediately so they do not hold server.close()
          if (typeof server.closeIdleConnections === "function") {
            server.closeIdleConnections();
          }

          // 4. Timer fallback (10s): If active requests don't finish in 10s, sever connections
          setTimeout(async () => {
            if (serverClosed) return;
            serverClosed = true;
            console.warn("[Server] Drain timeout (10s) reached. Severing active client connections...");
            if (typeof server.closeAllConnections === "function") {
              server.closeAllConnections();
            }

            console.log("[Server] Attempting bounded 5s emergency flush of heartbeat batcher...");
            try {
              const flushPromise = stopHeartbeatBatcher();
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Emergency flush timed out (5s)")), 5000)
              );
              const res = await Promise.race([flushPromise, timeoutPromise]);
              if (!res.success) {
                console.error(`[Server] Emergency flush incomplete: ${res.remaining} pings lost.`);
                process.exit(1);
              }
              console.log("[Server] Emergency flush succeeded after connection severance.");
              process.exit(0);
            } catch (err) {
              console.error("[Server] Emergency flush failed or timed out:", err.message);
              process.exit(1);
            }
          }, 10_000).unref();
        };

        process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
        process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    })
    .catch((error) => {
        console.error(" MongoDB connection error:", error);
    });
