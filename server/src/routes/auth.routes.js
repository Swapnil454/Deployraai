import express from "express";
import { githubLogin, githubCallback, me, logout, firebaseLogin } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

// Public OAuth routes (mounted at /auth in app.js usually, but we will mount correctly)
// Wait, the user asked for:
// GET /auth/github
// GET /auth/github/callback
// GET /api/auth/me
// POST /api/auth/logout

// This file will export two routers to keep it clean as requested by the user.

const oauthRouter = express.Router();
oauthRouter.get("/github", githubLogin);
oauthRouter.get("/github/callback", githubCallback);

const apiAuthRouter = express.Router();
apiAuthRouter.post("/firebase-login", firebaseLogin);
apiAuthRouter.get("/me", requireAuth, me);
apiAuthRouter.post("/logout", logout);

export { oauthRouter, apiAuthRouter };
