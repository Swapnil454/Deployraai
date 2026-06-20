import express from "express";
import { addCustomDomain, getProjectDomains, getAllDomains, getDomain, verifyDomain, deleteDomain, applyCloudflareDns, updateDomain, makePrimary, redirectToPrimary, disableRedirect, checkDomainHealth, getDomainActivity } from "../controllers/domain.controller.js";
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
router.post("/domains/:domainSetupId/make-primary", makePrimary);
router.post("/domains/:domainSetupId/redirect-to-primary", redirectToPrimary);
router.post("/domains/:domainSetupId/disable-redirect", disableRedirect);
router.post("/domains/:domainSetupId/health-check", checkDomainHealth);
router.post("/domains/:domainSetupId/apply-cloudflare-dns", applyCloudflareDns);
router.get("/domains/:domainSetupId/activity", getDomainActivity);

export default router;
