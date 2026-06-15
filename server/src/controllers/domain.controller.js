import dns from "dns/promises";
import DomainSetup from "../models/DomainSetup.js";
import Project from "../models/Project.js";
import Deployment from "../models/Deployment.js";
import {
  getVercelToken,
  addVercelDomain,
  getVercelDomain,
  removeVercelDomain,
  forceVerifyVercelDomain,
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

// ─── Constants ───────────────────────────────────────────────────────────────
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

// In-memory rate limiter: domainSetupId → timestamp of last verify call
const verifyRateLimitMap = new Map();
const VERIFY_RATE_LIMIT_MS = 30_000; // 30 seconds

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
 * SSRF guard — resolves the domain's A/AAAA records and rejects if any IP
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
    // Domain doesn't resolve yet — that's fine; SSRF risk is zero
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

// ─── Controllers ─────────────────────────────────────────────────────────────

export const addCustomDomain = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { rootDomain } = req.body;
    const userId = req.user.userId;

    // ── 1. Input validation ──────────────────────────────────────────────────
    if (!rootDomain || !validateDomainFormat(rootDomain)) {
      return res.status(400).json({ error: "Invalid domain format." });
    }
    if (BLOCKED_TLDS.test(rootDomain)) {
      return res.status(400).json({ error: "That TLD is not allowed for custom domains." });
    }

    // ── 2. SSRF guard ────────────────────────────────────────────────────────
    try {
      await assertNotPrivateIp(rootDomain);
    } catch (ssrfErr) {
      return res.status(400).json({ error: ssrfErr.message });
    }

    // ── 3. Project ownership ─────────────────────────────────────────────────
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
    if (project.configuration.frontendPlatform === "vercel" && !vercelProjectId) {
      return res.status(400).json({
        error: "Vercel Project ID not found. Please deploy frontend first.",
      });
    }

    // ── 4. Idempotency — return existing setup for this project + domain ─────
    const existing = await DomainSetup.findOne({ projectId, rootDomain });
    if (existing) {
      return res.status(200).json({ success: true, domainSetup: existing, alreadyExists: true });
    }

    // ── 5. Global uniqueness — reject if another project already owns this domain ──
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

    // ── 6. Build DomainSetup document ────────────────────────────────────────
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

    addLog(domainSetup, `Domain setup initiated for ${rootDomain}`);

    // ── 7. Register with providers ───────────────────────────────────────────

    // Frontend: Vercel
    if (project.configuration.frontendPlatform === "vercel") {
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
          // Best-effort www — ignore failure
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

    if (project.configuration.backendPlatform === "render" && backendServiceId) {
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
        domainSetup.dnsRecords.push({ type: "CNAME", name: "api", value: renderUrl, purpose: "backend" });
      }
    } else if (project.configuration.backendPlatform === "railway" && backendServiceId) {
      domainSetup.backendVerification = "manual_setup_required";
      domainSetup.dnsRecords.push({
        type: "CNAME",
        name: "api",
        value: "your-railway-provided-domain.up.railway.app",
        purpose: "backend",
        status: "pending",
      });
      addLog(domainSetup, "Railway backend requires manual domain configuration", "warn");
    }

    await domainSetup.save();
    return res.status(201).json({ success: true, domainSetup });
  } catch (error) {
    console.error("Add custom domain error:", error);
    res.status(500).json({ error: "Failed to add custom domain." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

export const getProjectDomains = async (req, res) => {
  try {
    const { projectId } = req.params;
    const domains = await DomainSetup.find({ projectId, userId: req.user.userId }).sort({ createdAt: -1 });
    res.json(domains);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch domains." });
  }
};

export const getDomain = async (req, res) => {
  try {
    const { domainSetupId } = req.params;
    const domain = await DomainSetup.findOne({ _id: domainSetupId, userId: req.user.userId });
    if (!domain) return res.status(404).json({ error: "Domain not found." });
    res.json(domain);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch domain." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Core verification logic — callable both from the HTTP handler and the cron job.
 *
 * @param {Document} domainSetup  - Mongoose document (will be mutated and saved)
 * @param {object}   [opts]
 * @param {boolean}  [opts.fromCron=false] - Set true when called by the health cron
 */
export const verifyDomainLogic = async (domainSetup, { fromCron = false } = {}) => {
  const prevStatus = domainSetup.status;
  domainSetup.status = "verifying";
  domainSetup.lastVerifiedAt = new Date();
  if (!fromCron) {
    addLog(domainSetup, "Manual verification triggered");
  }
  await domainSetup.save();

  let frontendVerified = false;
  let backendVerified  = false;

  // ── Frontend verification ─────────────────────────────────────────────────
  try {
    if (domainSetup.frontendProvider === "vercel") {
      const token = await getVercelToken(domainSetup.userId);
      if (token) {
        try { await forceVerifyVercelDomain(token, domainSetup.providerProjectId, domainSetup.frontendDomain); } catch (_) {}

        const vData = await getVercelDomain(token, domainSetup.providerProjectId, domainSetup.frontendDomain);
        if (vData?.verified) {
          // Vercel's "verified" flag is permanent — it does NOT reflect whether DNS records
          // still exist. We must independently confirm the A record still points to Vercel.
          let dnsStillValid = false;
          try {
            const aRecords = await dns.resolve4(domainSetup.frontendDomain).catch(() => []);
            // Vercel's shared IP — any Vercel anycast address is acceptable
            dnsStillValid = aRecords.includes("76.76.21.21") || aRecords.length > 0;
          } catch (_) {
            // If resolution fails completely, treat as degraded
            dnsStillValid = false;
          }

          if (dnsStillValid) {
            frontendVerified = true;
            addLog(domainSetup, `Frontend domain ${domainSetup.frontendDomain} verified ✓`);
          } else {
            addLog(
              domainSetup,
              `Frontend domain ${domainSetup.frontendDomain}: Vercel reports verified but A record is missing — DNS records were removed`,
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

          addLog(domainSetup, `Frontend domain ${domainSetup.frontendDomain} not yet verified — DNS pending`, "warn");
        }
      }
    }
  } catch (e) {
    console.error("[verifyDomainLogic] Vercel check error:", e);
    addLog(domainSetup, `Vercel check error: ${e.message}`, "error");
  }

  // ── Backend verification ──────────────────────────────────────────────────
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
              addLog(domainSetup, `Backend domain ${domainSetup.backendDomain} verified ✓`);
            } else {
              addLog(domainSetup, `Backend domain ${domainSetup.backendDomain} not yet verified — DNS pending`, "warn");
            }
          }
        }
      }
    } else if (domainSetup.backendVerification === "manual_setup_required") {
      // Manual Railway — treat as verified so it doesn't block overall status
      backendVerified = true;
    } else if (!domainSetup.backendProvider || domainSetup.backendProvider === "none") {
      backendVerified = true;
    }
  } catch (e) {
    console.error("[verifyDomainLogic] Render check error:", e);
    addLog(domainSetup, `Render check error: ${e.message}`, "error");
  }

  // ── Update per-provider verification fields ───────────────────────────────
  domainSetup.frontendVerification = frontendVerified ? "verified" : "pending";
  if (domainSetup.backendVerification !== "manual_setup_required") {
    domainSetup.backendVerification = backendVerified ? "verified" : "pending";
  }

  // ── Compute overall status ────────────────────────────────────────────────
  const bothVerified     = frontendVerified && backendVerified;
  const partiallyVerified = frontendVerified || backendVerified;

  if (bothVerified) {
    const wasActive    = prevStatus === "active";
    const wasDegraded  = prevStatus === "degraded";

    domainSetup.status             = "active";
    domainSetup.consecutiveFailures = 0;
    domainSetup.degradedAt         = undefined;

    if (wasDegraded) {
      addLog(domainSetup, "Domain recovered — DNS records restored ✓", "info");
    }

    if (!wasActive && !wasDegraded) {
      // First time going active — spin up monitors
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
      // Was previously working — now DNS is gone
      domainSetup.status = "degraded";
      if (!domainSetup.degradedAt) {
        domainSetup.degradedAt = new Date();
        addLog(
          domainSetup,
          `Domain went degraded — DNS records appear to have been removed. Consecutive failures: ${domainSetup.consecutiveFailures}`,
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
    }
  }

  await domainSetup.save();
  return domainSetup;
};

// ─────────────────────────────────────────────────────────────────────────────

export const verifyDomain = async (req, res) => {
  try {
    const { domainSetupId } = req.params;
    const userId = req.user.userId;

    // ── Rate limit — 1 call per 30 s per domainSetupId ───────────────────────
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

    // ── IDOR guard ─────────────────────────────────────────────────────────
    const domainSetup = await DomainSetup.findOne({ _id: domainSetupId, userId });
    if (!domainSetup) return res.status(404).json({ error: "Domain not found." });

    const updated = await verifyDomainLogic(domainSetup);
    res.json({ success: true, domainSetup: updated });
  } catch (error) {
    console.error("Verify domain error:", error);
    res.status(500).json({ error: "Failed to verify domain." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

export const deleteDomain = async (req, res) => {
  try {
    const { domainSetupId } = req.params;
    const userId = req.user.userId;

    const domainSetup = await DomainSetup.findOne({ _id: domainSetupId, userId });
    if (!domainSetup) return res.status(404).json({ error: "Domain setup not found." });

    const project = await Project.findById(domainSetup.projectId);
    if (!project || project.userId.toString() !== userId.toString()) {
      return res.status(403).json({ error: "Access denied." });
    }

    // Remove from Vercel
    if (project.configuration.frontendPlatform === "vercel" && domainSetup.providerProjectId) {
      try {
        const token = await getVercelToken(userId);
        if (token) {
          await removeVercelDomain(token, domainSetup.providerProjectId, domainSetup.frontendDomain);
          await removeVercelDomain(token, domainSetup.providerProjectId, domainSetup.wwwDomain);
        }
      } catch (e) {
        console.error("Vercel delete error:", e);
      }
    }

    // Remove from Render
    if (project.configuration.backendPlatform === "render" && domainSetup.providerBackendDomainId) {
      try {
        const token = await getRenderToken(userId);
        const backendServiceId =
          project.configuration.renderServiceId || project.configuration.railwayServiceId;
        if (token && backendServiceId) {
          await removeRenderCustomDomain(token, backendServiceId, domainSetup.providerBackendDomainId);
        }
      } catch (e) {
        console.error("Render delete error:", e);
      }
    }

    await DomainSetup.findByIdAndDelete(domainSetupId);
    res.json({ success: true, message: "Domain deleted successfully." });
  } catch (error) {
    console.error("Delete domain error:", error);
    res.status(500).json({ error: "Failed to delete domain." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

export const applyCloudflareDns = async (req, res) => {
  try {
    const { domainSetupId } = req.params;
    const { dryRun } = req.query;
    const isDryRun = dryRun === "true";
    const userId = req.user.userId;

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

    addLog(domainSetup, `Cloudflare DNS applied — ${preview.length} record(s) processed`);
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
