import express from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { createGroup, createMonitor, deleteMonitor, getMonitorDashboard, listChecks, listGroups, listMonitors, pauseMonitor } from "../uptime-cron/controller.js";

const router = express.Router();
router.use(requireAuth);
router.get("/groups", listGroups);
router.post("/groups", createGroup);
router.get("/monitors", listMonitors);
router.post("/monitors", createMonitor);
router.get("/monitors/:monitorId", getMonitorDashboard);
router.get("/monitors/:monitorId/checks", listChecks);
router.patch("/monitors/:monitorId/pause", pauseMonitor);
router.delete("/monitors/:monitorId", deleteMonitor);

export default router;
