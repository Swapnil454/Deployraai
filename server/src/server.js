import app from "./app.js";
import connect from "./connect.js";
import dotenv from "dotenv";
import { initCron } from "./cron.js";

dotenv.config({ override: true });

// ── Startup environment guard ────────────────────────────────────────────────
const REQUIRED_ENV = ["JWT_SECRET", "MONGO_URI"];
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

        const server = app.listen(PORT, HOST, () => {
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