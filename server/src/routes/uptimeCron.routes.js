import express from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  createGroup, createMonitor, deleteMonitor,
  getIncident, getMonitorDashboard,
  listChecks, listGroups, listIncidents, listMonitors,
  pauseMonitor, updateMonitor,
  ingestHeartbeatPing
} from "../uptime-cron/controller.js";

import {
  getStatusPages, getStatusPage, createStatusPage, updateStatusPage, deleteStatusPage, getPublicStatusPage
} from "../uptime-cron/statusPageController.js";

import {
  listMaintenanceWindows, getMaintenanceWindow, createMaintenanceWindow, updateMaintenanceWindow, deleteMaintenanceWindow, toggleMaintenanceWindow
} from "../uptime-cron/maintenanceController.js";

const router = express.Router();

// Public endpoints
router.get("/ping/:token", ingestHeartbeatPing);
router.post("/ping/:token", ingestHeartbeatPing);
router.get("/status/:slug", getPublicStatusPage);

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

// Protected Status Pages
router.get("/status-pages", getStatusPages);
router.post("/status-pages", createStatusPage);
router.get("/status-pages/:id", getStatusPage);
router.put("/status-pages/:id", updateStatusPage);
router.delete("/status-pages/:id", deleteStatusPage);

// Protected Maintenance Windows
router.get("/maintenance", listMaintenanceWindows);
router.post("/maintenance", createMaintenanceWindow);
router.get("/maintenance/:id", getMaintenanceWindow);
router.put("/maintenance/:id", updateMaintenanceWindow);
router.delete("/maintenance/:id", deleteMaintenanceWindow);
router.patch("/maintenance/:id/toggle", toggleMaintenanceWindow);

export default router;
