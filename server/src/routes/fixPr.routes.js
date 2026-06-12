import express from "express";
import { getFixPr, listProjectFixPrs } from "../controllers/fixPr.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.get("/:fixPrId", getFixPr);
// We can mount this on project routes as well, but for now we mount it at /api/fix-prs
router.get("/project/:projectId", listProjectFixPrs);

export default router;
