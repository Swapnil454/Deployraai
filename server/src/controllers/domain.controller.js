import DomainSetup from "../models/DomainSetup.js";
import Project from "../models/Project.js";
import Deployment from "../models/Deployment.js";
import dns from "dns/promises";
import https from "https";
import { getVercelToken, addVercelDomain, getVercelDomain, removeVercelDomain, forceVerifyVercelDomain } from "../services/providers/vercel.service.js";
import { getRenderToken, addRenderCustomDomain, getRenderCustomDomain, removeRenderCustomDomain, forceVerifyRenderDomain, listRenderCustomDomains } from "../services/providers/render.service.js";
import { getRailwayToken, addRailwayCustomDomain, getRailwayCustomDomain, listRailwayDomains } from "../services/providers/railway.service.js";
import { createDefaultMonitors } from "../services/monitoring.service.js";
import { getCloudflareToken, findZoneByDomain, getDnsRecords, createDnsRecord, updateDnsRecord } from "../services/providers/cloudflare.service.js";

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
          const vData = await addVercelDomain(token, vercelProjectId, frontendDomain);
          // Check for verification challenges
          if (vData && vData.verification && Array.isArray(vData.verification)) {
            vData.verification.forEach(v => {
              domainSetup.dnsRecords.push({ type: v.type, name: v.domain.replace(`.${rootDomain}`, ''), value: v.value, purpose: `frontend_verification` });
            });
          }
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

  try {
    if (domainSetup.frontendProvider === "vercel") {
      const token = await getVercelToken(domainSetup.userId);
      if (token) {
        // Force aggressive verification check first
        try { await forceVerifyVercelDomain(token, domainSetup.providerProjectId, domainSetup.frontendDomain); } catch (e) {}

        const vData = await getVercelDomain(token, domainSetup.providerProjectId, domainSetup.frontendDomain);
        if (vData && vData.verified) {
          frontendVerified = true;
        } else if (vData && vData.verification && Array.isArray(vData.verification)) {
          // Add TXT challenges to DNS records for user
          const existingTxTs = domainSetup.dnsRecords.filter(r => r.type === 'TXT');
          vData.verification.forEach(v => {
            if (!existingTxTs.find(r => r.value === v.value)) {
                let name = v.domain.replace(`.${domainSetup.rootDomain}`, '');
                if (name === domainSetup.rootDomain) name = '@';
                domainSetup.dnsRecords.push({ type: v.type, name, value: v.value, purpose: `frontend_verification` });
            }
          });
        }
      }
    }
  } catch (e) {
    console.error("Vercel verify check error:", e);
  }

  try {
    if (domainSetup.backendProvider === "render") {
      const token = await getRenderToken(domainSetup.userId);
      if (token) {
        const project = await Project.findById(domainSetup.projectId);
        const latestDeployment = await Deployment.findOne({ projectId: domainSetup.projectId, status: { $in: ["completed", "success"] } }).sort({ createdAt: -1 });
        const backendServiceId = latestDeployment?.providerServiceId || project?.configuration?.renderServiceId;
        
        if (backendServiceId) {
           let domainId = domainSetup.providerBackendDomainId;
           
           if (!domainId) {
               const domains = await listRenderCustomDomains(token, backendServiceId);
               if (Array.isArray(domains)) {
                   const matched = domains.find(d => d.customDomain?.name === domainSetup.backendDomain || d.name === domainSetup.backendDomain);
                   if (matched) {
                       domainId = matched.id || matched.customDomain?.id;
                       domainSetup.providerBackendDomainId = domainId;
                   }
               }
           }

           if (domainId) {
               // Force aggressive verification check first
               try { await forceVerifyRenderDomain(token, backendServiceId, domainId); } catch (e) {}

               const rData = await getRenderCustomDomain(token, backendServiceId, domainId);
               if (rData && (rData.verificationStatus === "verified" || rData.customDomain?.verificationStatus === "verified")) {
                  backendVerified = true;
               }
           }
        }
      }
    } else if (domainSetup.backendProvider === "railway") {
        // Skip railway for now
        backendVerified = false;
    }
  } catch (e) {
    console.error("Render verify check error:", e);
  }

  domainSetup.frontendVerification = frontendVerified ? "verified" : "pending";
  if (domainSetup.backendVerification !== "manual_setup_required") {
      domainSetup.backendVerification = backendVerified ? "verified" : "pending";
  }

  if (domainSetup.frontendVerification === "verified" && domainSetup.backendVerification === "verified") {
    const wasActive = domainSetup.status === "active";
    domainSetup.status = "active";
    
    if (!wasActive) {
      // Auto-create monitors when domain first becomes fully active
      try {
        await createDefaultMonitors(domainSetup.projectId);
      } catch (monitorErr) {
        console.error("Failed to auto-create monitors after domain activation:", monitorErr);
      }
    }
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
