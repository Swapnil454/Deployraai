import { 
  addVercelDomain, 
  removeVercelDomain, 
  updateVercelDomainRedirect 
} from "./providers/vercel.service.js";
import { 
  addRenderCustomDomain, 
  removeRenderCustomDomain 
} from "./providers/render.service.js";
import { 
  addRailwayCustomDomain, 
  deleteRailwayCustomDomain 
} from "./providers/railway.service.js";

const providerCapabilities = {
  vercel: {
    addDomain: true,
    removeDomain: true,
    redirect: true
  },
  render: {
    addDomain: true,
    removeDomain: true,
    redirect: false
  },
  railway: {
    addDomain: true,
    removeDomain: true,
    redirect: false
  }
};

/**
 * Validates provider capabilities and executes adding a domain.
 */
export const addDomainToProvider = async ({ userId, platform, providerProjectId, domain, targetService, metadata }) => {
  if (!providerCapabilities[platform]?.addDomain) {
    return { success: false, code: "PROVIDER_FEATURE_UNSUPPORTED", message: `Adding domains is not supported for ${platform}.` };
  }

  try {
    switch (platform) {
      case "vercel":
        return await addVercelDomain(metadata.token, providerProjectId, domain);
      case "render":
        return await addRenderCustomDomain(metadata.token, providerProjectId, domain);
      case "railway":
        return await addRailwayCustomDomain(metadata.token, providerProjectId, domain);
      default:
        throw new Error(`Unsupported provider: ${platform}`);
    }
  } catch (error) {
    throw error;
  }
};

/**
 * Validates provider capabilities and executes removing a domain.
 */
export const removeDomainFromProvider = async ({ userId, platform, providerProjectId, domain, targetService, metadata }) => {
  if (!providerCapabilities[platform]?.removeDomain) {
    return { success: false, code: "PROVIDER_FEATURE_UNSUPPORTED", message: `Removing domains is not supported for ${platform}.` };
  }

  try {
    switch (platform) {
      case "vercel":
        return await removeVercelDomain(metadata.token, providerProjectId, domain);
      case "render":
        // For Render, providerProjectId is the serviceId, and the domain name is used or the provider ID if available.
        return await removeRenderCustomDomain(metadata.token, providerProjectId, metadata.providerDomainId || domain);
      case "railway":
        // For Railway, metadata.providerDomainId is the actual ID needed to delete
        return await deleteRailwayCustomDomain(metadata.token, providerProjectId, metadata.providerDomainId || domain);
      default:
        throw new Error(`Unsupported provider: ${platform}`);
    }
  } catch (error) {
    throw error;
  }
};

/**
 * Validates provider capabilities and executes a domain redirect update.
 */
export const updateDomainRedirect = async ({ userId, platform, providerProjectId, domain, redirectTo, statusCode = 308, targetService, metadata }) => {
  if (!providerCapabilities[platform]?.redirect) {
    return { success: false, code: "PROVIDER_FEATURE_UNSUPPORTED", message: `Redirects are not supported for ${platform} yet.` };
  }

  try {
    switch (platform) {
      case "vercel":
        return await updateVercelDomainRedirect(metadata.token, providerProjectId, domain, redirectTo, statusCode);
      default:
        throw new Error(`Unsupported provider: ${platform}`);
    }
  } catch (error) {
    throw error;
  }
};

export default {
  addDomainToProvider,
  removeDomainFromProvider,
  updateDomainRedirect,
  providerCapabilities
};
