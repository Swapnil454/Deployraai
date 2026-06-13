import express from "express";
import { addCustomDomain, getProjectDomains, getDomain, verifyDomain, deleteDomain, applyCloudflareDns } from "../controllers/domain.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.post("/projects/:projectId/domains", addCustomDomain);
router.get("/projects/:projectId/domains", getProjectDomains);
router.get("/domains/:domainSetupId", getDomain);
router.post("/domains/:domainSetupId/verify", verifyDomain);
router.delete("/domains/:domainSetupId", deleteDomain);
router.post("/domains/:domainSetupId/apply-cloudflare-dns", applyCloudflareDns);

export default router;
