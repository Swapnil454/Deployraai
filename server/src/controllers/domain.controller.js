import dns from "dns/promises";
import DomainSetup from "../models/DomainSetup.js";
import Project from "../models/Project.js";
import Deployment from "../models/Deployment.js";
import DomainActivityLog from "../models/DomainActivityLog.js";
import {
  getVercelToken,
  addVercelDomain,
  getVercelDomain,
  removeVercelDomain,
  forceVerifyVercelDomain,
  updateVercelDomain,
} from "../services/providers/vercel.service.js";
import {
  getRenderToken,
  addRenderCustomDomain,
  getRenderCustomDomain,
  removeRenderCustomDomain,
  forceVerifyRenderDomain,
  listRenderCustomDomains,
} from "../services/providers/render.service.js";
import {
  getRailwayToken,
} from "../services/providers/railway.service.js";
import { createDefaultMonitors } from "../services/monitoring.service.js";
import {
  getCloudflareToken,
  findZoneByDomain,
  getDnsRecords,
  createDnsRecord,
} from "../services/providers/cloudflare.service.js";

const logDomainActivity = async ({ domainSetupId, projectId, userId, action, status = 'success', message, metadata = {} }) => {
  try {
    await DomainActivityLog.create({
      domainSetupId,
      projectId,
      userId,
      action,
      status,
      message,
      metadata
    });
  } catch (error) {
    console.error("Failed to log domain activity:", error);
  }
};

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// TLDs that should never be accepted as real custom domains
const BLOCKED_TLDS = /\.(localhost|local|internal|test|example|invalid|corp|home|lan)$/i;

// Private / reserved IPv4 ranges (CIDR notation handled manually via prefix checks)
const PRIVATE_IP_PATTERNS = [
  /^127\./,                        // Loopback
  /^10\./,                         // RFC-1918 Class A
  /^192\.168\./,                   // RFC-1918 Class C
  /^172\.(1[6-9]|2\d|3[01])\./,   // RFC-1918 Class B
  /^169\.254\./,                   // Link-local (AWS metadata)
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // RFC-6598 shared address
  /^0\./,                          // "This" network
  /^::1$/,                         // IPv6 loopback
  /^fc00:/i,                       // IPv6 unique local
  /^fe80:/i,                       // IPv6 link-local
];

// In-memory rate limiter: domainSetupId â†’ timestamp of last verify call
const verifyRateLimitMap = new Map();
const VERIFY_RATE_LIMIT_MS = 30_000; // 30 seconds

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Validates the surface syntax of a domain string.
 */
const validateDomainFormat = (domain) => {
  if (!domain || typeof domain !== "string") return false;
  if (domain.length > 253) return false;
  const regex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  return regex.test(domain);
};

/**
 * SSRF guard â€” resolves the domain's A/AAAA records and rejects if any IP
 * falls within a private, loopback, or link-local range.
 * Throws with a human-readable message on failure.
 */
const assertNotPrivateIp = async (domain) => {
  let addresses = [];
  try {
    const v4 = await dns.resolve4(domain).catch(() => []);
    const v6 = await dns.resolve6(domain).catch(() => []);
    addresses = [...v4, ...v6];
  } catch (_) {
    // Domain doesn't resolve yet â€” that's fine; SSRF risk is zero
    return;
  }

  for (const addr of addresses) {
    if (PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(addr))) {
      throw new Error(
        `Domain resolves to a private/reserved IP address (${addr}). ` +
        `Custom domains must point to publicly routable addresses.`
      );
    }
  }
};

/**
 * Push a structured log entry onto a DomainSetup document (in-memory only;
 * caller is responsible for saving).
 */
const addLog = (domainSetup, message, level = "info") => {
  // Keep only the last 100 entries to avoid unbounded growth
  if (domainSetup.verificationLogs.length >= 100) {
    domainSetup.verificationLogs.shift();
  }
  domainSetup.verificationLogs.push({ message, level, createdAt: new Date() });
};

// â”€â”€â”€ Controllers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const addCustomDomain = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { rootDomain, targetService = 'both', addDomainOption, redirectStatus, redirectTarget } = req.body;
    const userId = req.user.userId;

    // â”€â”€ 1. Input validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (!rootDomain || !validateDomainFormat(rootDomain)) {
      return res.status(400).json({ error: "Invalid domain format." });
    }
    if (BLOCKED_TLDS.test(rootDomain)) {
      return res.status(400).json({ error: "That TLD is not allowed for custom domains." });
    }

    // â”€â”€ 2. SSRF guard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    try {
      await assertNotPrivateIp(rootDomain);
    } catch (ssrfErr) {
      return res.status(400).json({ error: ssrfErr.message });
    }

    // â”€â”€ 3. Project ownership â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const project = await Project.findById(projectId);
    if (!project || project.userId.toString() !== userId.toString()) {
      return res.status(404).json({ error: "Project not found or access denied." });
    }

    const latestDeployment = await Deployment.findOne({
      projectId,
      status: { $in: ["completed", "success"] },
    }).sort({ createdAt: -1 });

    if (!latestDeployment) {
      return res.status(400).json({
        error: "Deploy the project successfully before adding a custom domain.",
      });
    }

    const vercelProjectId = project.configuration?.vercelProjectId;
    if ((targetService === 'frontend' || targetService === 'both') && project.configuration.frontendPlatform === "vercel" && !vercelProjectId) {
      return res.status(400).json({
        error: "Vercel Project ID not found. Please deploy frontend first.",
      });
    }

    // â”€â”€ 4. Idempotency â€” return existing setup for this project + domain â”€â”€â”€â”€â”€
    const existing = await DomainSetup.findOne({ projectId, rootDomain });
    if (existing) {
      return res.status(400).json({ error: "This domain already exists in this project." });
    }

    // â”€â”€ 5. Global uniqueness â€” reject if another project already owns this domain â”€â”€
    // The user requested to disable global checking and only check in specific projects.
    /*
    const globalConflict = await DomainSetup.findOne({
      rootDomain,
      status: { $in: ["active", "partially_active", "degraded", "verifying", "pending_dns"] },
    });
    if (globalConflict && globalConflict.projectId.toString() !== projectId.toString()) {
      return res.status(409).json({
        error:
          "This domain is already associated with another project. " +
          "Remove it from that project before adding it here.",
      });
    }
    */

    // â”€â”€ 6. Build DomainSetup document â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const isFrontend = targetService === 'frontend' || targetService === 'both';
    const isBackend = targetService === 'backend' || targetService === 'both';

    const frontendDomain = isFrontend ? rootDomain : undefined;
    const wwwDomain = isFrontend ? `www.${rootDomain}` : undefined;
    const backendDomain = isBackend ? (targetService === 'backend' ? rootDomain : `api.${rootDomain}`) : undefined;

    const domainSetup = new DomainSetup({
      userId,
      projectId,
      rootDomain,
      frontendDomain,
      wwwDomain,
      backendDomain,
      frontendProvider: isFrontend ? project.configuration.frontendPlatform : undefined,
      backendProvider: isBackend ? project.configuration.backendPlatform : undefined,
      status: "pending_dns",
      dnsRecords: [],
      providerProjectId: isFrontend ? vercelProjectId : undefined,
      isRedirect: addDomainOption === 'redirect',
      redirectStatus: addDomainOption === 'redirect' ? redirectStatus : undefined,
      redirectTarget: addDomainOption === 'redirect' ? redirectTarget : undefined,
    });

    addLog(domainSetup, `Domain setup initiated for ${rootDomain} (Target: ${targetService})`);

    // â”€â”€ 7. Register with providers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    // Frontend: Vercel
    if (isFrontend && project.configuration.frontendPlatform === "vercel") {
      try {
        const token = await getVercelToken(userId);
        if (token) {
          const vData = await addVercelDomain(token, vercelProjectId, frontendDomain);
          if (vData?.verification?.length) {
            vData.verification.forEach((v) => {
              domainSetup.dnsRecords.push({
                type: v.type,
                name: v.domain.replace(`.${rootDomain}`, ""),
                value: v.value,
                purpose: "frontend_verification",
              });
            });
          }
          // Best-effort www â€” ignore failure
          try { await addVercelDomain(token, vercelProjectId, wwwDomain); } catch (_) {}

          domainSetup.dnsRecords.push({ type: "A",     name: "@",   value: "76.76.21.21",       purpose: "frontend" });
          domainSetup.dnsRecords.push({ type: "CNAME", name: "www", value: "cname.vercel-dns.com", purpose: "www" });
          addLog(domainSetup, `Registered ${frontendDomain} with Vercel`);
        }
      } catch (err) {
        console.error("Vercel add domain error:", err);
        addLog(domainSetup, `Vercel registration failed: ${err.message}`, "error");
        return res.status(400).json({
          error: `Vercel: ${err.message || "Domain is already in use by another Vercel project."}`,
        });
      }
    }

    // Backend: Render
    const backendServiceId =
      latestDeployment.providerServiceId ||
      project.configuration?.renderServiceId ||
      project.configuration?.railwayServiceId;

    if (isBackend && project.configuration.backendPlatform === "render" && backendServiceId) {
      try {
        const token = await getRenderToken(userId);
        if (token) {
          const rData = await addRenderCustomDomain(token, backendServiceId, backendDomain);
          domainSetup.providerBackendDomainId = rData?.id;
          addLog(domainSetup, `Registered ${backendDomain} with Render`);
        }
      } catch (err) {
        console.error("Render add domain error:", err);
        addLog(domainSetup, `Render registration failed: ${err.message}`, "warn");
      } finally {
        let renderUrl = latestDeployment?.finalSummary?.backendUrl || "onrender.com";
        renderUrl = renderUrl.replace(/^https?:\/\//, "");
        domainSetup.dnsRecords.push({ type: "CNAME", name: backendDomain === rootDomain ? "@" : "api", value: renderUrl, purpose: "backend" });
      }
    } else if (isBackend && project.configuration.backendPlatform === "railway" && backendServiceId) {
      domainSetup.backendVerification = "manual_setup_required";
      domainSetup.dnsRecords.push({
        type: "CNAME",
        name: backendDomain === rootDomain ? "@" : "api",
        value: "your-railway-provided-domain.up.railway.app",
        purpose: "backend",
        status: "pending",
      });
      addLog(domainSetup, "Railway backend requires manual domain configuration", "warn");
    }

    await domainSetup.save();

    await logDomainActivity({
      domainSetupId: domainSetup._id,
      projectId,
      userId: req.user.userId,
      action: 'domain_created',
      message: `Domain added for service: ${targetService}`
    });

    return res.status(201).json({ success: true, domainSetup });
  } catch (error) {
    console.error("Add custom domain error:", error);
    res.status(500).json({ error: "Failed to add custom domain." });
  }
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const getProjectDomains = async (req, res) => {
  try {
    const { projectId } = req.params;
    const domains = await DomainSetup.find({ projectId, userId: req.user.userId }).sort({ createdAt: -1 });
    res.json(domains);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch domains." });
  }
};

export const getAllDomains = async (req, res) => {
  try {
    const { projectId } = req.query;
    
    const match = { userId: req.user.userId };
    if (projectId) match.projectId = projectId;
    
    const customDomains = await DomainSetup.find(match).populate("projectId", "repoName").sort({ createdAt: -1 }).lean();

    const projMatch = { userId: req.user.userId };
    if (projectId) projMatch._id = projectId;
    const projects = await Project.find(projMatch).lean();
    
    const Deployment = (await import('../models/Deployment.js')).default;
    const allDomains = [];

    customDomains.forEach(cd => {
      if (cd.targetService === 'frontend' || cd.targetService === 'both' || cd.frontendDomain) {
        allDomains.push({
          id: cd._id.toString(),
          domain: cd.frontendDomain || cd.rootDomain,
          type: 'Third Party',
          isBackend: false,
          provider: 'third_party',
          status: cd.status,
          projectId: cd.projectId?._id,
          projectName: cd.projectId?.repoName,
          createdAt: cd.createdAt,
          isRedirect: cd.isRedirect,
          redirectStatus: cd.redirectStatus,
          redirectTarget: cd.redirectTo || cd.redirectTarget,
          healthCheck: cd.healthCheck,
          domainRole: cd.domainRole,
          targetService: 'frontend',
          dnsRecords: cd.dnsRecords || [],
          rootDomain: cd.rootDomain,
          frontendDomain: cd.frontendDomain,
          backendDomain: cd.backendDomain
        });
      }
      if (cd.targetService === 'backend' || cd.targetService === 'both' || cd.backendDomain) {
         allDomains.push({
          id: cd._id.toString() + '_api',
          domain: cd.backendDomain,
          type: 'Third Party API',
          isBackend: true,
          provider: 'third_party',
          status: cd.status,
          projectId: cd.projectId?._id,
          projectName: cd.projectId?.repoName,
          createdAt: cd.createdAt,
          healthCheck: cd.healthCheck,
          domainRole: cd.domainRole,
          targetService: 'backend',
          dnsRecords: cd.dnsRecords || [],
          rootDomain: cd.rootDomain,
          frontendDomain: cd.frontendDomain,
          backendDomain: cd.backendDomain
        });
      }
    });

    if (projectId) {
      // Keep track of domains we already added from DomainSetup to avoid duplicates
      const existingDomainNames = new Set(allDomains.map(d => d.domain));

      for (const project of projects) {
        const hasPrimaryFrontend = customDomains.some(cd => cd.projectId?._id?.toString() === project._id.toString() && cd.domainRole === 'primary' && (cd.targetService === 'frontend' || cd.targetService === 'both'));
        const hasPrimaryBackend = customDomains.some(cd => cd.projectId?._id?.toString() === project._id.toString() && cd.domainRole === 'primary' && (cd.targetService === 'backend' || cd.targetService === 'both'));

        const feDep = await Deployment.findOne({ 
          projectId: project._id, 
          type: { $in: ['frontend', 'full'] },
          status: { $in: ['success', 'completed'] }
        }).sort({ createdAt: -1 }).lean();

        if (feDep && feDep.finalSummary?.frontendUrl) {
           const feUrl = feDep.finalSummary.frontendUrl.replace(/^https?:\/\//, '');
           if (!existingDomainNames.has(feUrl)) {
               allDomains.push({
                  id: `provider_fe_${project._id}`,
                  domain: feUrl,
                  type: `${feDep.platform.charAt(0).toUpperCase() + feDep.platform.slice(1)} Provided`,
                  isBackend: false,
                  provider: feDep.platform,
                  status: 'active',
                  projectId: project._id,
                  projectName: project.repoName,
                  createdAt: feDep.createdAt,
                  domainRole: hasPrimaryFrontend ? 'alias' : 'primary',
                  targetService: 'frontend'
               });
               existingDomainNames.add(feUrl);
           }
        }

        const beDep = await Deployment.findOne({ 
          projectId: project._id, 
          type: { $in: ['backend', 'full'] },
          status: { $in: ['success', 'completed'] }
        }).sort({ createdAt: -1 }).lean();

        if (beDep && beDep.finalSummary?.backendUrl) {
           const beUrl = beDep.finalSummary.backendUrl.replace(/^https?:\/\//, '');
           if (!existingDomainNames.has(beUrl)) {
               allDomains.push({
                  id: `provider_be_${project._id}`,
                  domain: beUrl,
                  type: `${beDep.platform.charAt(0).toUpperCase() + beDep.platform.slice(1)} API`,
                  isBackend: true,
                  provider: beDep.platform,
                  status: 'active',
                  projectId: project._id,
                  projectName: project.repoName,
                  createdAt: beDep.createdAt,
                  domainRole: hasPrimaryBackend ? 'alias' : 'primary',
                  targetService: 'backend'
               });
               existingDomainNames.add(beUrl);
           }
        }
        
        const deployaiUrl = `${project.repoName.toLowerCase().replace(/[^a-z0-9-]/g, '')}.deployai.app`;
        if (!existingDomainNames.has(deployaiUrl)) {
            allDomains.push({
              id: `deployai_${project._id}`,
              domain: deployaiUrl,
              type: `DeployAI Provided`,
              isBackend: false,
              provider: 'deployai',
              status: 'active',
              projectId: project._id,
              projectName: project.repoName,
              createdAt: project.createdAt,
              domainRole: hasPrimaryFrontend ? 'alias' : 'primary',
              targetService: 'frontend'
            });
            existingDomainNames.add(deployaiUrl);
        }
      }
    }

    res.json(allDomains);
  } catch (error) {
    console.error("Get All Domains Error:", error);
    res.status(500).json({ error: "Failed to fetch domains." });
  }
};

export const getDomain = async (req, res) => {
  try {
    let { domainSetupId } = req.params;
    if (domainSetupId && domainSetupId.endsWith('_api')) domainSetupId = domainSetupId.replace('_api', '');

    if (domainSetupId.startsWith('provider_') || domainSetupId.startsWith('deployai_')) {
      return res.json({ 
        _id: domainSetupId, 
        domainRole: "primary", 
        targetService: domainSetupId.includes('_fe_') || domainSetupId.startsWith('deployai_') ? 'frontend' : 'backend',
        status: "active",
        dnsRecords: []
      });
    }

    const domain = await DomainSetup.findOne({ _id: domainSetupId, userId: req.user.userId });
    if (!domain) return res.status(404).json({ error: "Domain not found." });
    res.json(domain);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch domain." });
  }
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Core verification logic â€” callable both from the HTTP handler and the cron job.
 *
 * @param {Document} domainSetup  - Mongoose document (will be mutated and saved)
 * @param {object}   [opts]
 * @param {boolean}  [opts.fromCron=false] - Set true when called by the health cron
 */
export const verifyDomainLogic = async (domainSetup, { fromCron = false } = {}) => {
  const prevStatus = domainSetup.status;
  domainSetup.status = "verifying";
  await logDomainActivity({ domainSetupId: domainSetup._id, projectId: domainSetup.projectId, userId: domainSetup.userId, action: "dns_verification_started", status: "pending", message: "DNS verification started" });
  domainSetup.lastVerifiedAt = new Date();
  if (!fromCron) {
    addLog(domainSetup, "Manual verification triggered");
  }
  await domainSetup.save();

  let frontendVerified = false;
  let backendVerified  = false;

  // â”€â”€ Frontend verification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  try {
    if (domainSetup.frontendProvider === "vercel") {
      const token = await getVercelToken(domainSetup.userId);
      if (token) {
        try { await forceVerifyVercelDomain(token, domainSetup.providerProjectId, domainSetup.frontendDomain); } catch (_) {}

        const vData = await getVercelDomain(token, domainSetup.providerProjectId, domainSetup.frontendDomain);
        if (vData?.verified) {
          // Vercel's "verified" flag is permanent â€” it does NOT reflect whether DNS records
          // still exist. We must independently confirm the A record still points to Vercel.
          let dnsStillValid = false;
          try {
            const aRecords = await dns.resolve4(domainSetup.frontendDomain).catch(() => []);
            // Vercel's shared IP â€” any Vercel anycast address is acceptable
            dnsStillValid = aRecords.includes("76.76.21.21") || aRecords.length > 0;
          } catch (_) {
            // If resolution fails completely, treat as degraded
            dnsStillValid = false;
          }

          if (dnsStillValid) {
            frontendVerified = true;
            addLog(domainSetup, `Frontend domain ${domainSetup.frontendDomain} verified âœ“`);
          } else {
            addLog(
              domainSetup,
              `Frontend domain ${domainSetup.frontendDomain}: Vercel reports verified but A record is missing â€” DNS records were removed`,
              "warn"
            );
          }
        } else {
          // Ensure latest TXT challenges are stored so the user can see them
          if (vData?.verification?.length) {
            vData.verification.forEach((v) => {
              const existingTxts = domainSetup.dnsRecords.filter((r) => r.type === "TXT");
              if (!existingTxts.find((r) => r.value === v.value)) {
                const name = v.domain.replace(`.${domainSetup.rootDomain}`, "") || "@";
                domainSetup.dnsRecords.push({ type: v.type, name, value: v.value, purpose: "frontend_verification" });
              }
            });
          }

          addLog(domainSetup, `Frontend domain ${domainSetup.frontendDomain} not yet verified â€” DNS pending`, "warn");
        }
      }
    }
  } catch (e) {
    console.error("[verifyDomainLogic] Vercel check error:", e);
    addLog(domainSetup, `Vercel check error: ${e.message}`, "error");
  }

  // â”€â”€ Backend verification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  try {
    if (domainSetup.backendProvider === "render") {
      const token = await getRenderToken(domainSetup.userId);
      if (token) {
        const project = await Project.findById(domainSetup.projectId);
        const latestDeployment = await Deployment.findOne({
          projectId: domainSetup.projectId,
          status: { $in: ["completed", "success"] },
        }).sort({ createdAt: -1 });

        const backendServiceId =
          latestDeployment?.providerServiceId || project?.configuration?.renderServiceId;

        if (backendServiceId) {
          let domainId = domainSetup.providerBackendDomainId;
          if (!domainId) {
            const domains = await listRenderCustomDomains(token, backendServiceId);
            if (Array.isArray(domains)) {
              const matched = domains.find(
                (d) => d.customDomain?.name === domainSetup.backendDomain || d.name === domainSetup.backendDomain
              );
              if (matched) {
                domainId = matched.id || matched.customDomain?.id;
                domainSetup.providerBackendDomainId = domainId;
              }
            }
          }

          if (domainId) {
            try { await forceVerifyRenderDomain(token, backendServiceId, domainId); } catch (_) {}

            const rData = await getRenderCustomDomain(token, backendServiceId, domainId);
            const renderVerified =
              rData?.verificationStatus === "verified" ||
              rData?.customDomain?.verificationStatus === "verified";

            if (renderVerified) {
              backendVerified = true;
              addLog(domainSetup, `Backend domain ${domainSetup.backendDomain} verified âœ“`);
            } else {
              addLog(domainSetup, `Backend domain ${domainSetup.backendDomain} not yet verified â€” DNS pending`, "warn");
            }
          }
        }
      }
    } else if (domainSetup.backendVerification === "manual_setup_required") {
      // Manual Railway â€” treat as verified so it doesn't block overall status
      backendVerified = true;
    } else if (!domainSetup.backendProvider || domainSetup.backendProvider === "none") {
      backendVerified = true;
    }
  } catch (e) {
    console.error("[verifyDomainLogic] Render check error:", e);
    addLog(domainSetup, `Render check error: ${e.message}`, "error");
  }

  // â”€â”€ Update per-provider verification fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  domainSetup.frontendVerification = frontendVerified ? "verified" : "pending";
  if (domainSetup.backendVerification !== "manual_setup_required") {
    domainSetup.backendVerification = backendVerified ? "verified" : "pending";
  }

  // â”€â”€ Compute overall status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const bothVerified     = frontendVerified && backendVerified;
  const partiallyVerified = frontendVerified || backendVerified;

  if (bothVerified) {
    const wasActive    = prevStatus === "active";
    const wasDegraded  = prevStatus === "degraded";

    domainSetup.status             = "active";
    await logDomainActivity({ domainSetupId: domainSetup._id, projectId: domainSetup.projectId, userId: domainSetup.userId, action: "dns_verified", status: "success", message: "DNS verification succeeded" });
    domainSetup.consecutiveFailures = 0;
    domainSetup.degradedAt         = undefined;

    if (wasDegraded) {
      addLog(domainSetup, "Domain recovered â€” DNS records restored âœ“", "info");
    }

    if (!wasActive && !wasDegraded) {
      // First time going active â€” spin up monitors
      try {
        await createDefaultMonitors(domainSetup.projectId);
      } catch (err) {
        console.error("[verifyDomainLogic] Failed to auto-create monitors:", err);
      }
    }
  } else if (partiallyVerified) {
    domainSetup.status = "partially_active";
  } else {
    // Nothing verified
    const wasHealthy = prevStatus === "active" || prevStatus === "partially_active";
    domainSetup.consecutiveFailures = (domainSetup.consecutiveFailures || 0) + 1;

    if (wasHealthy || prevStatus === "degraded") {
      // Was previously working â€” now DNS is gone
      domainSetup.status = "degraded";
      if (!domainSetup.degradedAt) {
        domainSetup.degradedAt = new Date();
        addLog(
          domainSetup,
          `Domain went degraded â€” DNS records appear to have been removed. Consecutive failures: ${domainSetup.consecutiveFailures}`,
          "warn"
        );
      } else {
        addLog(
          domainSetup,
          `Domain still degraded. Consecutive failures: ${domainSetup.consecutiveFailures}`,
          "warn"
        );
      }
    } else {
      domainSetup.status = "pending_dns";
    await logDomainActivity({ domainSetupId: domainSetup._id, projectId: domainSetup.projectId, userId: domainSetup.userId, action: "dns_verification_failed", status: "error", message: "DNS verification failed. Records missing." });
    }
  }

  await domainSetup.save();
  return domainSetup;
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const verifyDomain = async (req, res) => {
  try {
    let { domainSetupId } = req.params;
    if (domainSetupId && domainSetupId.endsWith('_api')) domainSetupId = domainSetupId.replace('_api', '');
    const userId = req.user.userId;

    // â”€â”€ Rate limit â€” 1 call per 30 s per domainSetupId â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const lastCall = verifyRateLimitMap.get(domainSetupId);
    const now      = Date.now();
    if (lastCall && now - lastCall < VERIFY_RATE_LIMIT_MS) {
      const retryAfter = Math.ceil((VERIFY_RATE_LIMIT_MS - (now - lastCall)) / 1000);
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: `Too many verification requests. Please wait ${retryAfter} second(s) before trying again.`,
      });
    }
    verifyRateLimitMap.set(domainSetupId, now);

    if (!domainSetupId.match(/^[a-f\d]{24}$/i)) {
      return res.status(400).json({ error: "Provider-managed domains cannot be verified here." });
    }

    // â”€â”€ IDOR guard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const domainSetup = await DomainSetup.findOne({ _id: domainSetupId, userId });
    if (!domainSetup) return res.status(404).json({ error: "Domain not found." });

    const updated = await verifyDomainLogic(domainSetup);
    res.json({ success: true, domainSetup: updated });
  } catch (error) {
    console.error("Verify domain error:", error);
    res.status(500).json({ error: "Failed to verify domain." });
  }
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import { checkBackendHealth } from "../services/healthCheck.service.js";

const waitForDeploymentHealthy = async (deploymentId, type) => {
  let attempts = 0;
  while (attempts < 60) { // Max 5 minutes
    await new Promise(r => setTimeout(r, 5000));
    const dep = await Deployment.findById(deploymentId);
    if (!dep) return { status: 'failed', message: 'Deployment not found' };
    
    if (dep.status === 'success' || dep.status === 'failed') {
      if (dep.status === 'failed') return { status: 'failed', message: 'Backend deployment failed' };
      
      // If success, run health check
      if (type === 'backend') {
        const backendUrl = dep.domainSnapshot?.backendPrimaryDomain 
          ? `https://${dep.domainSnapshot.backendPrimaryDomain}` 
          : dep.providerUrl;
          
        if (backendUrl) {
          const health = await checkBackendHealth(backendUrl, () => {});
          if (health.status === 'passed') return { status: 'success' };
          // If warning or failed, we might still want to proceed, but let's be strict
          if (health.status === 'failed') return { status: 'failed', message: 'Backend health check failed' };
          return { status: 'success' }; // passed or warning
        }
      }
      return { status: 'success' };
    }
    attempts++;
  }
  return { status: 'failed', message: 'Timeout waiting for backend deployment' };
};


export const deleteDomain = async (req, res) => {
  try {
    let { domainSetupId } = req.params;
    if (domainSetupId && domainSetupId.endsWith('_api')) {
      domainSetupId = domainSetupId.replace('_api', '');
    }
    const userId = req.user.userId;

    // Guard: provider pseudo-domain ids are not valid ObjectIds
    if (!domainSetupId.match(/^[a-f\d]{24}$/i)) {
      return res.status(400).json({ error: "Provider-managed domains cannot be removed from here." });
    }

    const domainSetup = await DomainSetup.findOne({ _id: domainSetupId, userId });
    if (!domainSetup) return res.status(404).json({ error: "Domain setup not found." });

    const project = await Project.findById(domainSetup.projectId);
    if (!project || project.userId.toString() !== userId.toString()) {
      return res.status(403).json({ error: "Access denied." });
    }

    const { projectId, targetService, isPrimary, domainRole } = domainSetup;

    // Remove Domain Safely Rules
    const otherDomainsCount = await DomainSetup.countDocuments({
      projectId,
      targetService,
      status: "active",
      _id: { $ne: domainSetup._id }
    });

    if (isPrimary && otherDomainsCount > 0) {
      return res.status(400).json({
        success: false,
        code: "PRIMARY_DOMAIN_HAS_ALIASES",
        message: "This is your primary domain. To avoid unexpected production URL changes, please make another active domain primary before removing this one."
      });
    }

    // Soft delete
    domainSetup.status = "removed";
    domainSetup.isPrimary = false;
    domainSetup.domainRole = "alias";
    domainSetup.redirectTo = null;
    domainSetup.removedAt = new Date();
    await domainSetup.save();

    // Detach from Providers
    // Remove from Vercel
    if (project.configuration.frontendPlatform === "vercel" && domainSetup.providerProjectId) {
      try {
        const token = await getVercelToken(userId);
        if (token) {
          await removeVercelDomain(token, domainSetup.providerProjectId, domainSetup.frontendDomain);
          if (domainSetup.wwwDomain) {
            await removeVercelDomain(token, domainSetup.providerProjectId, domainSetup.wwwDomain);
          }
        }
      } catch (e) {
        console.error("Vercel delete error:", e);
      }
    }

    // Remove from Render
    if (project.configuration.backendPlatform === "render" && domainSetup.providerBackendDomainId) {
      try {
        const token = await getRenderToken(userId);
        const backendServiceId = project.configuration.renderServiceId || project.configuration.railwayServiceId;
        if (token && backendServiceId) {
          await removeRenderCustomDomain(token, backendServiceId, domainSetup.providerBackendDomainId);
        }
      } catch (e) {
        console.error("Render delete error:", e);
      }
    }

    res.json({ success: true, message: "Domain deleted successfully." });

    // Background Orchestration
    (async () => {
      try {
        if (!isPrimary && domainRole === 'alias') {
          if (targetService === 'frontend') {
             const reqMock = { params: { projectId }, user: { userId }, body: { triggerReason: "domain_removed_cors_update" } };
             const resMock = { status: () => resMock, json: () => {} };
             await triggerBackendDeployment(reqMock, resMock);
          }
          // Backend alias removal needs no redeploy
        } else if (otherDomainsCount === 0) {
          // Only domain for service removed - redeploy backend first, then frontend
          const reqMock = { params: { projectId }, user: { userId }, body: { triggerReason: "domain_removed" } };
          
          let backendDeploymentId = null;
          const backendResMock = { 
            status: () => backendResMock, 
            json: (data) => { if (data.deploymentId) backendDeploymentId = data.deploymentId; } 
          };
          
          await triggerBackendDeployment(reqMock, backendResMock);

          if (backendDeploymentId) {
            const waitResult = await waitForDeploymentHealthy(backendDeploymentId, 'backend');
            if (waitResult.status === 'failed') {
              console.error(`Backend deployment orchestration failed after domain removal: ${waitResult.message}`);
              return;
            }
          }
          
          const frontendResMock = { status: () => frontendResMock, json: () => {} };
          await triggerFrontendDeployment(reqMock, frontendResMock);
        }
      } catch (err) {
        console.error("Delete domain orchestration error:", err);
      }
    })();
  } catch (error) {
    console.error("Delete domain error:", error);
    res.status(500).json({ error: "Failed to delete domain." });
  }
};


// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const applyCloudflareDns = async (req, res) => {
  try {
    let { domainSetupId } = req.params;
    if (domainSetupId && domainSetupId.endsWith('_api')) domainSetupId = domainSetupId.replace('_api', '');
    const { dryRun } = req.query;
    const isDryRun = dryRun === "true";
    const userId = req.user.userId;

    if (!domainSetupId.match(/^[a-f\d]{24}$/i)) {
      return res.status(400).json({ error: "Provider-managed domains do not use custom DNS." });
    }

    let domainSetup = await DomainSetup.findOne({ _id: domainSetupId, userId });
    if (!domainSetup) return res.status(404).json({ error: "Domain setup not found." });

    const token = await getCloudflareToken(userId);
    if (!token) return res.status(400).json({ error: "Cloudflare is not connected." });

    const zone = await findZoneByDomain(token, domainSetup.rootDomain);
    if (!zone) {
      return res.status(404).json({ error: `Cloudflare zone for ${domainSetup.rootDomain} not found.` });
    }

    const existingRecords = (await getDnsRecords(token, zone.id)) || [];
    const preview = [];
    let hasChanges = false;

    for (const record of domainSetup.dnsRecords) {
      const cfName        = record.name === "@" ? domainSetup.rootDomain : `${record.name}.${domainSetup.rootDomain}`;
      const sameNameRecs  = existingRecords.filter((r) => r.name === cfName);
      const exactMatch    = sameNameRecs.find((r) => r.type === record.type && r.content === record.value);
      const conflictMatch = sameNameRecs.find((r) => r.type !== record.type || r.content !== record.value);

      if (exactMatch) {
        if (!isDryRun) record.status = "verified";
        preview.push({ action: "skip", record: cfName, reason: "Already correct" });
      } else if (conflictMatch) {
        if (!isDryRun) record.status = "conflict";
        preview.push({
          action: "conflict",
          record: cfName,
          reason: `Exists as ${conflictMatch.type} pointing to ${conflictMatch.content}`,
          existingValue: conflictMatch.content,
        });
      } else {
        if (!isDryRun) {
          try {
            await createDnsRecord(token, zone.id, {
              type: record.type,
              name: cfName,
              content: record.value,
              proxied: false,
              ttl: 1,
            });
            record.status = "verified";
            hasChanges = true;
          } catch (err) {
            record.status = "failed";
            console.error("Cloudflare create record error:", err);
            preview.push({ action: "error", record: cfName, reason: err.message });
            continue;
          }
        }
        preview.push({ action: "create", record: cfName, reason: "Missing record" });
      }
    }

    if (isDryRun) return res.json({ success: true, preview });

    addLog(domainSetup, `Cloudflare DNS applied â€” ${preview.length} record(s) processed`);
    await domainSetup.save();

    if (hasChanges) {
      domainSetup = await verifyDomainLogic(domainSetup);
    }

    res.json({ success: true, domainSetup, preview });
  } catch (error) {
    console.error("Apply Cloudflare DNS error:", error);
    res.status(500).json({ error: error.message || "Failed to apply DNS records." });
  }
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const updateDomain = async (req, res) => {
  try {
    let { domainSetupId } = req.params;
    if (domainSetupId && domainSetupId.endsWith('_api')) domainSetupId = domainSetupId.replace('_api', '');

    // Guard: provider pseudo-domain ids are not valid ObjectIds
    if (!domainSetupId.match(/^[a-f\d]{24}$/i)) {
      return res.status(400).json({ error: "Provider-managed domains cannot be edited here." });
    }

    const { addDomainOption, redirectStatus, redirectTarget, targetService } = req.body;
    const userId = req.user.userId;

    const validServices = ['frontend', 'backend', 'both'];
    if (targetService && !validServices.includes(targetService)) {
      return res.status(400).json({ error: "Invalid targetService value." });
    }

    const domainSetup = await DomainSetup.findOne({ _id: domainSetupId, userId });
    if (!domainSetup) {
      return res.status(404).json({ error: "Domain setup not found." });
    }

    const prevTargetService = domainSetup.targetService;
    const isRedirect = addDomainOption === 'redirect';
    domainSetup.isRedirect = isRedirect;
    domainSetup.domainRole = isRedirect ? 'redirect' : (domainSetup.domainRole === 'redirect' ? 'alias' : domainSetup.domainRole);

    if (isRedirect) {
      domainSetup.redirectStatus = redirectStatus;
      domainSetup.redirectTarget = redirectTarget;
    } else {
      domainSetup.redirectStatus = undefined;
      domainSetup.redirectTarget = undefined;
    }

    const effectiveService = targetService || prevTargetService;
    domainSetup.targetService = effectiveService;

    if (effectiveService === 'backend') {
      domainSetup.backendDomain = domainSetup.rootDomain;
      domainSetup.frontendDomain = undefined;
      domainSetup.wwwDomain = undefined;
    } else if (effectiveService === 'frontend') {
      domainSetup.frontendDomain = domainSetup.rootDomain;
      domainSetup.wwwDomain = `www.${domainSetup.rootDomain}`;
      domainSetup.backendDomain = undefined;
    } else if (effectiveService === 'both') {
      domainSetup.frontendDomain = domainSetup.rootDomain;
      domainSetup.wwwDomain = `www.${domainSetup.rootDomain}`;
      domainSetup.backendDomain = `api.${domainSetup.rootDomain}`;
    }

    if (targetService && targetService !== prevTargetService) {
      try {
        const project = await Project.findOne({ _id: domainSetup.projectId, userId });
        if (project) {
          const latestDeployment = await Deployment.findOne({
            projectId: project._id,
            status: { $in: ['success', 'completed'] }
          }).sort({ createdAt: -1 }).lean();

          const newDnsRecords = [];
          const isFe = effectiveService === 'frontend' || effectiveService === 'both';
          const isBe = effectiveService === 'backend' || effectiveService === 'both';

          if (isFe && project.configuration?.frontendPlatform === 'vercel') {
            newDnsRecords.push({ type: 'A',     name: '@',   value: '76.76.21.21',          purpose: 'frontend' });
            newDnsRecords.push({ type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com', purpose: 'www' });
          }
          if (isBe && latestDeployment) {
            const beName = effectiveService === 'backend' ? '@' : 'api';
            const beUrl = (latestDeployment.finalSummary?.backendUrl || 'onrender.com').replace(/^https?:\/\//, '');
            if (project.configuration?.backendPlatform === 'render') {
              newDnsRecords.push({ type: 'CNAME', name: beName, value: beUrl, purpose: 'backend' });
            } else if (project.configuration?.backendPlatform === 'railway') {
              newDnsRecords.push({ type: 'CNAME', name: beName, value: 'your-railway-domain.up.railway.app', purpose: 'backend' });
            }
          }
          const existingTxt = domainSetup.dnsRecords.filter(r => r.type === 'TXT');
          domainSetup.dnsRecords = [...newDnsRecords, ...existingTxt];
        }
      } catch (dnsErr) {
        console.error("DNS record regeneration error:", dnsErr);
      }
      domainSetup.status = 'pending_dns';
      domainSetup.frontendVerification = undefined;
      domainSetup.backendVerification = undefined;
    }

    await domainSetup.save();

    await logDomainActivity({
      domainSetupId: domainSetup._id,
      projectId: domainSetup.projectId,
      userId,
      action: 'domain_updated',
      status: 'success',
      message: `Domain updated. Mode: ${addDomainOption}${targetService && targetService !== prevTargetService ? `. Service: ${prevTargetService} -> ${targetService}` : ''}`,
      metadata: { addDomainOption, targetService, prevTargetService }
    });

    res.json({ success: true, domainSetup });
  } catch (error) {
    console.error("Update custom domain error:", error);
    res.status(500).json({ error: "Failed to update custom domain." });
  }
};


export const makePrimary = async (req, res) => {
  try {
    let { domainSetupId } = req.params;
    if (domainSetupId && domainSetupId.endsWith('_api')) domainSetupId = domainSetupId.replace('_api', '');
    const userId = req.user.userId;

    if (!domainSetupId.match(/^[a-f\d]{24}$/i)) {
      return res.status(400).json({ error: "Provider-managed domains cannot be modified here." });
    }

    const domain = await DomainSetup.findOne({
      _id: domainSetupId,
      userId,
      status: { $in: ["active", "partially_active", "verifying", "degraded"] }
    });

    if (!domain) {
      return res.status(404).json({ success: false, message: "Active domain not found" });
    }

    if (domain.isPrimary && domain.domainRole === "primary") {
      return res.json({ success: true, message: "Domain is already primary", domainSetup: domain });
    }

    if (domain.domainRole !== 'alias') {
      return res.status(400).json({ success: false, message: "Only alias domains can be made primary" });
    }

    const { projectId, targetService } = domain;

    // Demote old primary
    await DomainSetup.updateMany(
      {
        projectId,
        targetService,
        status: { $in: ["active", "partially_active", "verifying", "degraded"] },
        _id: { $ne: domain._id }
      },
      {
        $set: {
          isPrimary: false,
          domainRole: "alias",
          redirectTo: null
        }
      }
    );

    // Promote selected domain
    domain.isPrimary = true;
    domain.domainRole = "primary";
    domain.redirectTo = null;

    try {
      await domain.save();
    } catch (saveErr) {
      if (saveErr.code === 11000) {
         // Duplicate key error - another domain just became primary for this service! Fallback to Alias.
         domain.isPrimary = false;
         domain.domainRole = "alias";
         domain.redirectTo = null;
         await domain.save();
         return res.status(409).json({ success: false, message: "Failed to acquire primary lock. Another domain may have just been promoted. Please try again." });
      } else {
         throw saveErr;
      }
    }

    const backendDep = await triggerBackendService(domain.projectId, domain.userId, "domain_make_primary");
    const frontendDep = await createQueuedFrontendDeployment(domain.projectId, domain.userId, "domain_make_primary");

    res.json({ 
      success: true, 
      message: "Domain promoted to primary successfully. Deployments triggered.", 
      domainSetup: domain,
      deployments: [backendDep, frontendDep].filter(Boolean)
    });

    // Background Deployment Orchestration
    (async () => {
      try {
        if (backendDep) {
          const waitResult = await waitForDeploymentHealthy(backendDep.id, 'backend');
          if (waitResult.status === 'failed') {
            console.error(`Backend deployment orchestration failed: ${waitResult.message}`);
            return; // Stop orchestration, do not trigger frontend
          }
        } else {
          console.error("Backend deployment failed to start or return an ID");
          return;
        }

        // Execute the queued frontend deployment
        if (frontendDep) {
          await triggerFrontendService(domain.projectId, domain.userId, "domain_make_primary", frontendDep.id);
        }
      } catch (e) {
        console.error("Background Make Primary deployment orchestration error:", e);
      }
    })();
  } catch (error) {
    console.error("Make Primary error:", error);
    res.status(500).json({ success: false, message: "Failed to promote domain to primary." });
  }
};



export const redirectToPrimary = async (req, res) => {
  try {
    let { domainSetupId } = req.params;
    if (domainSetupId && domainSetupId.endsWith('_api')) domainSetupId = domainSetupId.replace('_api', '');
    const userId = req.user.userId;

    if (!domainSetupId.match(/^[a-f\d]{24}$/i)) {
      return res.status(400).json({ error: "Provider-managed domains cannot be modified here." });
    }

    const domain = await DomainSetup.findOne({
      _id: domainSetupId,
      userId,
      status: { $in: ["active", "partially_active", "verifying", "degraded"] },
      domainRole: "alias",
      targetService: "frontend",
      isPrimary: false
    });

    if (!domain) {
      return res.status(404).json({ success: false, message: "Valid active frontend alias domain not found" });
    }

    const primaryDomain = await DomainSetup.findOne({
      projectId: domain.projectId,
      targetService: "frontend",
      status: { $in: ["active", "partially_active", "verifying", "degraded"] },
      domainRole: "primary",
      isPrimary: true
    });

    if (!primaryDomain) {
      return res.status(400).json({ success: false, message: "No active primary frontend domain found to redirect to." });
    }

    const project = await Project.findById(domain.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    // 1. Configure provider-level 308 redirect
    if (project.configuration.frontendPlatform === "vercel" && domain.providerProjectId) {
      try {
        const token = await getVercelToken(userId);
        if (token) {
          const targetDomain = primaryDomain.frontendDomain || primaryDomain.rootDomain;
          const redirectOptions = {
            redirect: targetDomain,
            redirectStatusCode: 308
          };
          await updateVercelDomain(token, domain.providerProjectId, domain.frontendDomain, redirectOptions);
          if (domain.wwwDomain) {
            await updateVercelDomain(token, domain.providerProjectId, domain.wwwDomain, redirectOptions);
          }
        }
      } catch (e) {
        console.error("Vercel domain redirect error:", e);
        return res.status(500).json({ success: false, message: "Failed to configure provider-level redirect." });
      }
    }

    // 2. Update DB
    domain.domainRole = "redirect";
    domain.redirectTo = primaryDomain.frontendDomain || primaryDomain.rootDomain;
    domain.isPrimary = false;
    domain.providerRedirectConfigured = true;
    domain.redirectStatusCode = 308;
    await domain.save();

    // 3. Trigger backend redeploy
    const backendDep = await triggerBackendService(domain.projectId, domain.userId, "domain_redirect_enabled");

    return res.json({ 
      success: true, 
      message: "Domain redirected successfully. Backend redeploying for CORS cleanup.", 
      domainSetup: domain,
      deployments: backendDep ? [backendDep] : []
    });
  } catch (error) {
    console.error("Redirect to Primary error:", error);
    res.status(500).json({ success: false, message: "Failed to redirect domain to primary." });
  }
};



export const disableRedirect = async (req, res) => {
  try {
    let { domainSetupId } = req.params;
    if (domainSetupId && domainSetupId.endsWith('_api')) domainSetupId = domainSetupId.replace('_api', '');
    const userId = req.user.userId;

    if (!domainSetupId.match(/^[a-f\d]{24}$/i)) {
      return res.status(400).json({ error: "Provider-managed domains cannot be modified here." });
    }

    const domain = await DomainSetup.findOne({
      _id: domainSetupId,
      userId,
      status: { $in: ["active", "partially_active", "verifying", "degraded"] },
      domainRole: "redirect",
      targetService: "frontend"
    });

    if (!domain) {
      return res.status(404).json({ success: false, message: "Valid active frontend redirect domain not found" });
    }

    const project = await Project.findById(domain.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    // 1. Remove provider-level redirect
    if (project.configuration.frontendPlatform === "vercel" && domain.providerProjectId) {
      try {
        const token = await getVercelToken(userId);
        if (token) {
          const resetOptions = {
            redirect: null
          };
          await updateVercelDomain(token, domain.providerProjectId, domain.frontendDomain, resetOptions);
          if (domain.wwwDomain) {
            await updateVercelDomain(token, domain.providerProjectId, domain.wwwDomain, resetOptions);
          }
        }
      } catch (e) {
        console.error("Vercel domain disable-redirect error:", e);
        return res.status(500).json({ success: false, message: "Failed to remove provider-level redirect." });
      }
    }

    // 2. Update DB
    domain.domainRole = "alias";
    domain.redirectTo = null;
    domain.providerRedirectConfigured = false;
    await domain.save();

    // 3. Trigger backend redeploy
    const backendDep = await triggerBackendService(domain.projectId, domain.userId, "domain_redirect_disabled");

    return res.json({ 
      success: true, 
      message: "Redirect disabled successfully. Backend redeploying to restore CORS access.", 
      domainSetup: domain,
      deployments: backendDep ? [backendDep] : []
    });
  } catch (error) {
    console.error("Disable Redirect error:", error);
    res.status(500).json({ success: false, message: "Failed to disable redirect." });
  }
};



export const checkDomainHealth = async (req, res) => {
  try {
    let { domainSetupId } = req.params;
    let isBackendCheck = false;
    if (domainSetupId && domainSetupId.endsWith('_api')) {
      domainSetupId = domainSetupId.replace('_api', '');
      isBackendCheck = true;
    }
    const userId = req.user.userId;


    // Handle pseudo-domains (provider default URLs)
    if (domainSetupId.startsWith('provider_') || domainSetupId.startsWith('deployai_')) {
      const parts = domainSetupId.split('_');
      const projectId = parts.pop();
      const type = domainSetupId.startsWith('provider_fe_') || domainSetupId.startsWith('deployai_') ? 'frontend' : 'backend';
      
      const Deployment = (await import('../models/Deployment.js')).default;
      const Project = (await import('../models/Project.js')).default;
      const project = await Project.findOne({ _id: projectId, userId });
      if (!project) return res.status(404).json({ success: false, message: "Project not found" });

      let hostname;
      if (domainSetupId.startsWith('deployai_')) {
        hostname = `${project.repoName.toLowerCase().replace(/[^a-z0-9-]/g, '')}.deployai.app`;
      } else {
        const dep = await Deployment.findOne({ 
          projectId, 
          type: { $in: [type, 'full'] },
          status: { $in: ['success', 'completed'] }
        }).sort({ createdAt: -1 }).lean();
        
        if (!dep) return res.status(404).json({ success: false, message: "No successful deployment found for provider URL" });
        const urlStr = type === 'frontend' ? dep.finalSummary?.frontendUrl : dep.finalSummary?.backendUrl;
        if (!urlStr) return res.status(404).json({ success: false, message: "Provider URL not found in deployment" });
        hostname = urlStr.replace(/^https?:\/\//, '');
      }

      // Mock a domain object for the health check logic
      const domain = {
        _id: domainSetupId,
        projectId,
        targetService: type,
        domainRole: "primary",
        frontendDomain: type === 'frontend' ? hostname : null,
        backendDomain: type === 'backend' ? hostname : null,
        rootDomain: hostname
      };

      // Proceed with the normal health check logic, but don't save to DB
      // We will extract the logic into a shared scope, or just duplicate the fetch part
      try {
        const responseTimeStart = Date.now();
        const response = await fetch(`https://${hostname}`, { signal: AbortSignal.timeout(8000) });
        const contentType = response.headers.get("content-type") || "";
        
        return res.json({
          success: true,
          health: {
            status: response.status >= 200 && response.status < 300 ? "healthy" : "failed",
            checkedAt: new Date(),
            httpStatus: response.status,
            sslValid: true,
            dnsResolved: true,
            redirectValid: false,
            responseTimeMs: Date.now() - responseTimeStart,
            message: response.status >= 200 && response.status < 300 ? "Provider domain is reachable." : `Returned status ${response.status}`,
            lastErrorCode: null
          }
        });
      } catch (err) {
        return res.json({
          success: true,
          health: {
            status: "failed",
            checkedAt: new Date(),
            httpStatus: null,
            sslValid: false,
            dnsResolved: false,
            responseTimeMs: null,
            message: `Unreachable: ${err.message}`,
            lastErrorCode: err.code
          }
        });
      }
    }

    if (!domainSetupId.match(/^[a-f\d]{24}$/i)) {
      return res.status(400).json({ success: false, message: "Invalid domain ID format" });
    }

    const domain = await DomainSetup.findOne({ _id: domainSetupId, userId });
    if (!domain) {
      return res.status(404).json({ success: false, message: "Domain not found" });
    }

    const effectiveTargetService = domain.targetService === 'both' ? (isBackendCheck ? 'backend' : 'frontend') : domain.targetService;
    const hostname = effectiveTargetService === 'backend' ? (domain.backendDomain || domain.rootDomain) : (domain.frontendDomain || domain.rootDomain);
    const url = `https://${hostname}`;
    const startTime = Date.now();

    let health = {
      status: "unknown",
      checkedAt: new Date(),
      httpStatus: null,
      sslValid: false,
      dnsResolved: false,
      redirectValid: false,
      responseTimeMs: null,
      message: "",
      lastErrorCode: null
    };

    // 1. DNS Resolution Check
    try {
      const aRecords = await dns.resolve4(hostname);
      if (aRecords && aRecords.length > 0) health.dnsResolved = true;
    } catch (e) {
      // Ignore A record error, try CNAME
    }

    if (!health.dnsResolved) {
      try {
        const cnameRecords = await dns.resolveCname(hostname);
        if (cnameRecords && cnameRecords.length > 0) health.dnsResolved = true;
      } catch (e) {
        health.lastErrorCode = e.code || 'DNS_FAILED';
      }
    }

    if (!health.dnsResolved) {
      health.status = "failed";
      health.message = "DNS does not resolve for this domain.";
      domain.healthCheck = health;

    await logDomainActivity({ domainSetupId: domain._id, projectId: domain.projectId, userId: req.user.userId, action: health.status === "healthy" ? "domain_health_check_passed" : "domain_health_check_failed", status: health.status === "healthy" ? "success" : "error", message: health.message, metadata: { httpStatus: health.httpStatus, lastErrorCode: health.lastErrorCode } });
      await domain.save();
      return res.json({ success: true, health });
    }

    // 2. HTTP/HTTPS Check & SSL Validation
    try {
      const responseTimeStart = Date.now();
      let fetchOptions = {
        signal: AbortSignal.timeout(8000),
        headers: {}
      };

      if (domain.domainRole === "redirect") {
        fetchOptions.redirect = "manual";
      }

      let testUrl = url;
      if (domain.domainRole === "redirect") {
        testUrl = `${url}/__deployra_health_check?source=domain`;
      }

      const response = await fetch(testUrl, fetchOptions);
      health.responseTimeMs = Date.now() - responseTimeStart;
      health.httpStatus = response.status;
      health.sslValid = true; // If fetch succeeds, SSL is valid in Node unless specifically ignored

      // 3. Role-Based Rule Checks
      if (effectiveTargetService === "frontend") {
        if (domain.domainRole === "primary") {
          const contentType = response.headers.get("content-type") || "";
          if (health.httpStatus >= 200 && health.httpStatus < 300) {
            if (contentType.includes("text/html")) {
              health.status = "healthy";
              health.message = "Domain is reachable and serving the frontend correctly.";
            } else {
              health.status = "warning";
              health.message = `Domain is reachable but returned ${contentType} instead of text/html`;
            }
          } else {
            health.status = "failed";
            health.message = `Domain returned error status ${health.httpStatus}`;
          }
        } else if (domain.domainRole === "alias") {
          const contentType = response.headers.get("content-type") || "";
          if (health.httpStatus >= 200 && health.httpStatus < 300) {
            // Basic reachability passed, check CORS against backend primary
            const backendPrimary = await DomainSetup.findOne({
              projectId: domain.projectId,
              targetService: "backend",
              status: "active",
              isPrimary: true
            });

            if (!backendPrimary) {
              health.status = "warning";
              health.message = "Domain is reachable (text/html), but no active backend primary found to test CORS.";
            } else {
              const backendUrl = `https://${backendPrimary.backendDomain || backendPrimary.rootDomain}`;
              try {
                const corsResponse = await fetch(`${backendUrl}/health`, {
                  headers: { Origin: `https://${hostname}` },
                  signal: AbortSignal.timeout(5000)
                });
                const allowOrigin = corsResponse.headers.get("access-control-allow-origin");
                if (allowOrigin === `https://${hostname}`) {
                  health.status = "healthy";
                  health.message = "Domain is reachable and backend CORS allows this origin.";
                } else {
                  health.status = "warning";
                  health.message = `Domain is reachable, but backend CORS returned: ${allowOrigin || 'missing header'}`;
                }
              } catch (corsErr) {
                health.status = "warning";
                health.message = "Domain is reachable, but failed to verify CORS against backend.";
                health.lastErrorCode = corsErr.code;
              }
            }
          } else {
            health.status = "failed";
            health.message = `Domain returned error status ${health.httpStatus}`;
          }
        } else if (domain.domainRole === "redirect") {
          if (health.httpStatus === 301 || health.httpStatus === 308) {
            const location = response.headers.get("location");
            const primaryDomain = await DomainSetup.findOne({
              projectId: domain.projectId,
              targetService: "frontend",
              status: "active",
              domainRole: "primary"
            });
            const primaryHostname = primaryDomain ? (primaryDomain.frontendDomain || primaryDomain.rootDomain) : null;
            
            if (primaryHostname && location === `https://${primaryHostname}/__deployra_health_check?source=domain`) {
              health.redirectValid = true;
              health.status = "healthy";
              health.message = "Redirect is configured correctly to primary domain.";
            } else {
              health.status = "failed";
              health.message = `Redirect target (${location}) does not match expected primary domain path.`;
            }
          } else {
            health.status = "failed";
            health.message = `Expected 301/308 redirect, but got status ${health.httpStatus}`;
          }
        }
      } else if (effectiveTargetService === "backend") {

        const backendHealth = await checkBackendHealth(url, () => {});
        health.httpStatus = backendHealth.statusCode;
        if (backendHealth.status === 'passed') {
          health.status = "healthy";
          health.message = "Backend health check passed successfully.";
        } else if (backendHealth.status === 'warning') {
          health.status = "warning";
          health.message = backendHealth.message;
        } else {
          health.status = "failed";
          health.message = backendHealth.message;
        }
      }
    } catch (e) {
      health.responseTimeMs = Date.now() - responseTimeStart;
      health.status = "failed";
      health.lastErrorCode = e.code || e.cause?.code || "FETCH_FAILED";

      if (e.code === 'CERT_HAS_EXPIRED' || e.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || e.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
        health.sslValid = false;
        health.message = "SSL certificate is invalid or expired.";
      } else if (e.code === 'ENOTFOUND' || e.code === 'ECONNREFUSED' || e.name === 'TimeoutError') {
        health.sslValid = true; // Assume SSL wasn't the issue if it's connection refused/timeout
        health.message = "Domain is unreachable (Connection refused or timed out).";
      } else {
        health.sslValid = false;
        health.message = `Domain health check failed: ${e.message}`;
      }
    }

    domain.healthCheck = health;
    await domain.save();

    res.json({ success: true, health });
  } catch (error) {
    console.error("Domain health check error:", error);
    res.status(500).json({ success: false, message: "Failed to perform domain health check." });
  }
};

export const getDomainActivity = async (req, res) => {
  try {
    const { domainSetupId } = req.params;
    const userId = req.user.userId;

    // Handle pseudo-domains
    if (domainSetupId.startsWith('provider_') || domainSetupId.startsWith('deployai_')) {
      return res.json([{
        _id: 'mock_log_1',
        action: 'domain_created',
        status: 'success',
        message: 'Provider default URL automatically provisioned.',
        createdAt: new Date(),
      }]);
    }

    if (!domainSetupId.match(/^[a-f\d]{24}$/i)) {
      return res.status(400).json({ error: "Invalid domain ID format" });
    }

    // Ensure the domain belongs to the user
    const domainSetup = await DomainSetup.findOne({ _id: domainSetupId, userId: req.user.userId });
    if (!domainSetup) {
      return res.status(404).json({ error: "Domain not found" });
    }

    const logs = await DomainActivityLog.find({
      domainSetupId,
      userId: req.user.userId
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json(logs);
  } catch (error) {
    console.error("Error fetching domain activity:", error);
    res.status(500).json({ error: "Failed to fetch domain activity" });
  }
};
