import express from "express";
import { getRepos, getBranches } from "../controllers/github.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.get("/repos", getRepos);
router.get("/repos/:owner/:repo/branches", getBranches);

export default router;
