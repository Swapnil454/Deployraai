import express from "express";
import { addCustomDomain, getProjectDomains, getAllDomains, getDomain, verifyDomain, deleteDomain, applyCloudflareDns, updateDomain } from "../controllers/domain.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.get("/domains", getAllDomains);
router.post("/projects/:projectId/domains", addCustomDomain);
router.get("/projects/:projectId/domains", getProjectDomains);
router.get("/domains/:domainSetupId", getDomain);
router.post("/domains/:domainSetupId/verify", verifyDomain);
router.put("/domains/:domainSetupId", updateDomain);
router.delete("/domains/:domainSetupId", deleteDomain);
router.post("/domains/:domainSetupId/apply-cloudflare-dns", applyCloudflareDns);

export default router;
