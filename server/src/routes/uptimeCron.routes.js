import express from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  createGroup, createMonitor, deleteMonitor,
  getIncident, getMonitorDashboard,
  listChecks, listGroups, listIncidents, listMonitors,
  pauseMonitor, updateMonitor,
  ingestHeartbeatPing
} from "../uptime-cron/controller.js";

const router = express.Router();

// Public endpoints
router.get("/ping/:token", ingestHeartbeatPing);
router.post("/ping/:token", ingestHeartbeatPing);

// Protected endpoints
router.use(requireAuth);

// Groups
router.get("/groups",  listGroups);
router.post("/groups", createGroup);

// Monitors
router.get("/monitors",                       listMonitors);
router.post("/monitors",                      createMonitor);
router.get("/monitors/:monitorId",            getMonitorDashboard);
router.get("/monitors/:monitorId/checks",     listChecks);
router.patch("/monitors/:monitorId",          updateMonitor);
router.patch("/monitors/:monitorId/pause",    pauseMonitor);
router.delete("/monitors/:monitorId",         deleteMonitor);

// Incidents
router.get("/incidents",               listIncidents);
router.get("/incidents/:incidentId",   getIncident);

export default router;
