import DomainSetup from "../models/DomainSetup.js";
import Project from "../models/Project.js";
import Deployment from "../models/Deployment.js";
import dns from "dns/promises";
import https from "https";
import { getVercelToken, addVercelDomain, getVercelDomain, removeVercelDomain } from "../services/providers/vercel.service.js";
import { getRenderToken, addRenderCustomDomain, getRenderCustomDomain, removeRenderCustomDomain } from "../services/providers/render.service.js";
import { getRailwayToken, addRailwayCustomDomain, getRailwayCustomDomain, listRailwayDomains } from "../services/providers/railway.service.js";
import { getCloudflareToken, findZoneByDomain, getDnsRecords, createDnsRecord, updateDnsRecord } from "../services/providers/cloudflare.service.js";
import { createDefaultMonitors } from "../services/monitoring.service.js";

const validateDomain = (domain) => {
  const regex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  return regex.test(domain);
};

export const addCustomDomain = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { rootDomain } = req.body;
    const userId = req.user.userId;

    if (!rootDomain || !validateDomain(rootDomain)) {
      return res.status(400).json({ error: "Invalid domain format" });
    }

    const project = await Project.findById(projectId);
    if (!project || project.userId.toString() !== userId.toString()) {
      return res.status(404).json({ error: "Project not found or access denied" });
    }

    const latestDeployment = await Deployment.findOne({ projectId, status: { $in: ["completed", "success"] } }).sort({ createdAt: -1 });
    if (!latestDeployment) {
      return res.status(400).json({ error: "Deploy the project successfully before adding a custom domain." });
    }
    
    // Resolve the actual IDs from the project configuration
    const vercelProjectId = project.configuration?.vercelProjectId;
    const backendServiceId = latestDeployment.providerServiceId || project.configuration?.renderServiceId || project.configuration?.railwayServiceId;

    if (project.configuration.frontendPlatform === "vercel" && !vercelProjectId) {
      return res.status(400).json({ error: "Vercel Project ID not found. Please deploy frontend first." });
    }

    const frontendDomain = rootDomain;
    const wwwDomain = `www.${rootDomain}`;
    const backendDomain = `api.${rootDomain}`;

    const domainSetup = new DomainSetup({
      userId,
      projectId,
      rootDomain,
      frontendDomain,
      wwwDomain,
      backendDomain,
      frontendProvider: project.configuration.frontendPlatform,
      backendProvider: project.configuration.backendPlatform,
      status: "pending_dns",
      dnsRecords: [],
      providerProjectId: vercelProjectId,
    });

    // Frontend: Vercel
    if (project.configuration.frontendPlatform === "vercel") {
      try {
        const token = await getVercelToken(userId);
        if (token) {
          await addVercelDomain(token, vercelProjectId, frontendDomain);
          // Don't fail the whole block if www fails, or vice versa
          try { await addVercelDomain(token, vercelProjectId, wwwDomain); } catch (e) {}
        }
      } catch (err) {
        console.error("Vercel add domain error:", err);
      } finally {
        domainSetup.dnsRecords.push({ type: "A", name: "@", value: "76.76.21.21", purpose: "frontend" });
        domainSetup.dnsRecords.push({ type: "CNAME", name: "www", value: "cname.vercel-dns.com", purpose: "www" });
      }
    }

    // Backend: Render or Railway
    if (project.configuration.backendPlatform === "render" && backendServiceId) {
      try {
        const token = await getRenderToken(userId);
        if (token) {
          const res = await addRenderCustomDomain(token, backendServiceId, backendDomain);
          domainSetup.providerBackendDomainId = res?.id;
        }
      } catch (err) {
        console.error("Render add domain error:", err);
      } finally {
        let renderUrl = latestDeployment?.finalSummary?.backendUrl || "onrender.com";
        renderUrl = renderUrl.replace(/^https?:\/\//, '');
        domainSetup.dnsRecords.push({ type: "CNAME", name: "api", value: renderUrl, purpose: "backend" });
      }
    } else if (project.configuration.backendPlatform === "railway" && backendServiceId) {
      try {
        const token = await getRailwayToken(userId);
        if (token) {
          // Railway environment ID is required. Let's pull from project configuration or recent deployment logs... 
          // Actually Railway graphql might fail if we don't have environmentId.
          // For MVP, we catch error and fallback.
          throw new Error("Railway automated custom domain requires environmentId");
        }
      } catch (err) {
        console.error("Railway add domain fallback:", err);
        domainSetup.backendVerification = "manual_setup_required";
        domainSetup.dnsRecords.push({ type: "CNAME", name: "api", value: "your-railway-provided-domain.up.railway.app", purpose: "backend", status: "pending" });
      }
    }

    await domainSetup.save();
    return res.status(201).json({ success: true, domainSetup });
  } catch (error) {
    console.error("Add custom domain error:", error);
    res.status(500).json({ error: "Failed to add custom domain" });
  }
};

export const getProjectDomains = async (req, res) => {
  try {
    const { projectId } = req.params;
    const domains = await DomainSetup.find({ projectId, userId: req.user.userId }).sort({ createdAt: -1 });
    res.json(domains);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch domains" });
  }
};

export const getDomain = async (req, res) => {
  try {
    const { domainSetupId } = req.params;
    const domain = await DomainSetup.findOne({ _id: domainSetupId, userId: req.user.userId });
    if (!domain) return res.status(404).json({ error: "Domain not found" });
    res.json(domain);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch domain" });
  }
};

export const verifyDomainLogic = async (domainSetup) => {
  domainSetup.status = "verifying";
  domainSetup.lastVerifiedAt = new Date();
  await domainSetup.save();

  let frontendVerified = false;
  let backendVerified = false;

  // 1. DNS Resolution
  try {
    const records = await dns.resolve4(domainSetup.frontendDomain);
    if (records.includes("76.76.21.21")) frontendVerified = true;
  } catch (e) {
    // ignore
  }

  try {
    const records = await dns.resolveCname(domainSetup.backendDomain);
    if (records.some(r => r.includes("onrender.com") || r.includes("railway.app"))) {
      backendVerified = true;
    }
  } catch (e) {
    // ignore
  }

  // 2. HTTPS Verification
  const checkHttps = (url) => {
    return new Promise((resolve) => {
      https.get(url, (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 400);
      }).on('error', () => {
        resolve(false);
      });
    });
  };

  let frontendHttps = false;
  let backendHttps = false;

  if (frontendVerified) {
    frontendHttps = await checkHttps(`https://${domainSetup.frontendDomain}`);
  }
  
  if (backendVerified) {
    backendHttps = await checkHttps(`https://${domainSetup.backendDomain}/health`);
  }

  domainSetup.frontendVerification = (frontendVerified && frontendHttps) ? "verified" : "pending";
  if (domainSetup.backendVerification !== "manual_setup_required") {
      domainSetup.backendVerification = (backendVerified && backendHttps) ? "verified" : "pending";
  }

  if (domainSetup.frontendVerification === "verified" && domainSetup.backendVerification === "verified") {
    domainSetup.status = "active";
    // Phase 5C: Auto-create monitors when domain becomes fully active
    await createDefaultMonitors(domainSetup.projectId).catch(err => console.error("Monitor auto-create error:", err));
  } else if (domainSetup.frontendVerification === "verified" || domainSetup.backendVerification === "verified") {
    domainSetup.status = "partially_active";
  } else {
    domainSetup.status = "pending_dns";
  }

  await domainSetup.save();
  return domainSetup;
};

export const verifyDomain = async (req, res) => {
  try {
    const { domainSetupId } = req.params;
    let domainSetup = await DomainSetup.findOne({ _id: domainSetupId, userId: req.user.userId });
    if (!domainSetup) return res.status(404).json({ error: "Domain not found" });

    domainSetup = await verifyDomainLogic(domainSetup);

    res.json({ success: true, domainSetup });
  } catch (error) {
    console.error("Verify domain error:", error);
    res.status(500).json({ error: "Failed to verify domain" });
  }
};

export const deleteDomain = async (req, res) => {
  try {
    const { domainSetupId } = req.params;
    const userId = req.user.userId;

    const domainSetup = await DomainSetup.findById(domainSetupId);
    if (!domainSetup) return res.status(404).json({ error: "Domain setup not found" });

    const project = await Project.findById(domainSetup.projectId);
    if (project.userId.toString() !== userId.toString()) return res.status(403).json({ error: "Access denied" });

    // Cascading delete from Vercel
    if (project.configuration.frontendPlatform === "vercel" && domainSetup.providerProjectId) {
      try {
        const token = await getVercelToken(userId);
        if (token) {
          await removeVercelDomain(token, domainSetup.providerProjectId, domainSetup.frontendDomain);
          await removeVercelDomain(token, domainSetup.providerProjectId, domainSetup.wwwDomain);
        }
      } catch (e) { console.error("Vercel delete error:", e); }
    }

    // Cascading delete from Render
    if (project.configuration.backendPlatform === "render" && domainSetup.providerBackendDomainId) {
       try {
         const token = await getRenderToken(userId);
         const backendServiceId = domainSetup.providerServiceId || project.configuration.renderServiceId || project.configuration.railwayServiceId;
         if (token && backendServiceId) {
           await removeRenderCustomDomain(token, backendServiceId, domainSetup.providerBackendDomainId);
         }
       } catch (e) { console.error("Render delete error:", e); }
    }

    await DomainSetup.findByIdAndDelete(domainSetupId);
    res.json({ success: true, message: "Domain deleted successfully" });
  } catch (error) {
    console.error("Delete domain error:", error);
    res.status(500).json({ error: "Failed to delete domain" });
  }
};

export const applyCloudflareDns = async (req, res) => {
  try {
    const { domainSetupId } = req.params;
    const { dryRun } = req.query;
    const isDryRun = dryRun === 'true';

    const userId = req.user.userId;

    let domainSetup = await DomainSetup.findOne({ _id: domainSetupId, userId });
    if (!domainSetup) return res.status(404).json({ error: "Domain setup not found" });

    const token = await getCloudflareToken(userId);
    if (!token) return res.status(400).json({ error: "Cloudflare is not connected" });

    const zone = await findZoneByDomain(token, domainSetup.rootDomain);
    if (!zone) return res.status(404).json({ error: `Cloudflare zone for ${domainSetup.rootDomain} not found` });

    const existingRecordsResponse = await getDnsRecords(token, zone.id);
    const existingRecords = existingRecordsResponse || [];

    const preview = [];
    let hasChanges = false;

    for (let record of domainSetup.dnsRecords) {
      // Cloudflare record name for root is rootDomain, else subdomain.rootDomain
      const cfName = record.name === "@" ? domainSetup.rootDomain : `${record.name}.${domainSetup.rootDomain}`;
      
      // Find any existing record with the exact same name
      const matchingNameRecords = existingRecords.filter(r => r.name === cfName);
      
      const exactMatch = matchingNameRecords.find(r => r.type === record.type && r.content === record.value);
      const conflictMatch = matchingNameRecords.find(r => r.type !== record.type || r.content !== record.value);

      if (exactMatch) {
        if (!isDryRun) record.status = "verified";
        preview.push({ action: 'skip', record: cfName, reason: 'Already correct' });
      } else if (conflictMatch) {
        // Conflict
        if (!isDryRun) {
          record.status = "conflict";
          // We can attach existing value to the mongoose subdocument using markModified if needed,
          // but we can just use dynamic properties since mongoose strict is generally true.
          // Let's ensure existingValue is accessible in UI via plain object or updated schema.
        }
        preview.push({ 
          action: 'conflict', 
          record: cfName, 
          reason: `Exists as ${conflictMatch.type} pointing to ${conflictMatch.content}`,
          existingValue: conflictMatch.content
        });
      } else {
        // Missing
        if (!isDryRun) {
          try {
            await createDnsRecord(token, zone.id, {
              type: record.type,
              name: cfName,
              content: record.value,
              proxied: false,
              ttl: 1
            });
            record.status = "verified";
            hasChanges = true;
          } catch (err) {
            record.status = "failed";
            console.error("Cloudflare create record error:", err);
            preview.push({ action: 'error', record: cfName, reason: err.message });
            continue;
          }
        }
        preview.push({ action: 'create', record: cfName, reason: 'Missing record' });
      }
    }

    if (isDryRun) {
      return res.json({ success: true, preview });
    }

    await domainSetup.save();

    // Verify after saving
    if (hasChanges) {
      domainSetup = await verifyDomainLogic(domainSetup);
    }

    res.json({ success: true, domainSetup, preview });
  } catch (error) {
    console.error("Apply Cloudflare DNS error:", error);
    res.status(500).json({ error: error.message || "Failed to apply DNS records" });
  }
};
