import crypto from "crypto";
import ConnectedAccount from "../models/ConnectedAccount.js";
import User from "../models/User.js";
import { encryptSecret } from "../utils/encryption.js";
import { validateRenderToken } from '../services/providers/render.service.js';
import { validateRailwayToken } from '../services/providers/railway.service.js';
import { validateCloudflareToken, getCloudflareZones as fetchCloudflareZones, getCloudflareToken } from '../services/providers/cloudflare.service.js';
import { validateVercelToken } from '../services/providers/vercel.service.js';

const getOauthProviders = () => ({
  github: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    callbackUrl: process.env.GITHUB_CALLBACK_URL,
    scopes: "read:user user:email public_repo"
  },
  vercel: {
    clientId: process.env.VERCEL_CLIENT_ID,
    clientSecret: process.env.VERCEL_CLIENT_SECRET,
    authorizeUrl: "https://vercel.com/oauth/authorize",
    tokenUrl: "https://api.vercel.com/v2/oauth/access_token",
    callbackUrl: process.env.VERCEL_CALLBACK_URL,
    scopes: ""
  },
  netlify: {
    clientId: process.env.NETLIFY_CLIENT_ID,
    clientSecret: process.env.NETLIFY_CLIENT_SECRET,
    authorizeUrl: "https://app.netlify.com/authorize",
    tokenUrl: "https://api.netlify.com/oauth/token",
    callbackUrl: process.env.NETLIFY_CALLBACK_URL,
    scopes: ""
  },
  railway: {
    clientId: process.env.RAILWAY_CLIENT_ID,
    clientSecret: process.env.RAILWAY_CLIENT_SECRET,
    authorizeUrl: "https://railway.app/oauth/authorize",
    tokenUrl: "https://backboard.railway.app/oauth/token",
    callbackUrl: process.env.RAILWAY_CALLBACK_URL,
    scopes: ""
  }
});

export const getIntegrationStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    const accounts = await ConnectedAccount.find({ userId });
    
    const status = {
      github: {
        connected: !!user?.githubConnected,
        providerType: "oauth",
        accountName: user?.githubUsername || "Unknown"
      },
      vercel: { connected: false, providerType: "oauth" },
      netlify: { connected: false, providerType: "oauth" },
      railway: { connected: false, providerType: "api_key" },
      render: { connected: false, providerType: "api_key" },
      cloudflare: { connected: false, providerType: "api_key" }
    };

    for (const acc of accounts) {
      if (status[acc.provider]) {
        status[acc.provider] = {
          connected: acc.status === "connected",
          providerType: acc.providerType,
          accountName: acc.providerAccountName || null
        };
      }
    }

    res.json(status);
  } catch (error) {
    console.error("Status error:", error);
    res.status(500).json({ error: "Failed to fetch status" });
  }
};

export const connectProvider = async (req, res) => {
  const { provider } = req.params;
  const config = getOauthProviders()[provider];
  
  if (!config) {
    return res.status(400).json({ error: `Provider ${provider} not supported for OAuth` });
  }

  const state = crypto.randomBytes(16).toString("hex");
  let returnTo = req.query.returnTo || `${process.env.FRONTEND_URL}/dashboard`;
  
  // Prevent Open Redirect: Ensure returnTo begins with the configured FRONTEND_URL
  if (!returnTo.startsWith(process.env.FRONTEND_URL)) {
    returnTo = `${process.env.FRONTEND_URL}/dashboard`;
  }
  
  res.cookie(`oauth_state_${provider}`, state, { httpOnly: true, maxAge: 10 * 60 * 1000 });
  res.cookie(`oauth_return_${provider}`, returnTo, { httpOnly: true, maxAge: 10 * 60 * 1000 });

  const authUrl = `${config.authorizeUrl}?client_id=${config.clientId}&redirect_uri=${encodeURIComponent(config.callbackUrl)}&state=${state}&response_type=code&prompt=consent`;
  
  res.redirect(authUrl);
};

export const callbackProvider = async (req, res) => {
  const { provider } = req.params;
  const { code, state, error, error_description } = req.query;
  const config = getOauthProviders()[provider];

  let returnTo = req.cookies[`oauth_return_${provider}`] || process.env.FRONTEND_URL;
  if (!returnTo.startsWith(process.env.FRONTEND_URL)) {
    returnTo = process.env.FRONTEND_URL;
  }

  // Clear cookies
  res.clearCookie(`oauth_state_${provider}`);
  res.clearCookie(`oauth_return_${provider}`);

  if (!storedState || state !== storedState) {
    return res.redirect(`${returnTo}?error=${provider}_invalid_state`);
  }

  try {
    let accessToken = "mock_token_" + provider;
    
    if (error) {
      console.error(`OAuth provider returned error: ${error} - ${error_description}`);
      throw new Error(`OAuth provider error: ${error}`);
    }

    // Force nodemon restart for ultimate max-compatibility auth fix
    if (provider === 'vercel' && config.clientId && config.clientSecret) {
      console.log("DEBUG: Exchanging Vercel token with config:", {
        clientId: config.clientId,
        secretLength: config.clientSecret.length,
        code: code,
        callbackUrl: config.callbackUrl
      });
      
      const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
      const payload = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code: code,
        redirect_uri: config.callbackUrl,
        grant_type: 'authorization_code'
      }).toString();
      
      try {
        const { default: axios } = await import('axios');
        const response = await axios.post(config.tokenUrl, payload, {
          headers: { 
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${basicAuth}`
          }
        });
        accessToken = response.data.access_token;
      } catch (err) {
        console.error("Vercel token error response:", err.response?.data || err.message);
        const data = err.response?.data || {};
        const errorMsg = data.error?.message || data.error_description || data.error || err.message || "Unknown token error";
        throw new Error(`Vercel exchange failed: ${errorMsg}. Debug: ID=${config.clientId}, SecLen=${config.clientSecret.length}`);
      }
    } else if (provider === 'github' && config.clientId && config.clientSecret) {
      const { default: axios } = await import('axios');
      const response = await axios.post(
        config.tokenUrl,
        {
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code: code,
          redirect_uri: config.callbackUrl,
        },
        { headers: { Accept: 'application/json' } }
      );
      if (!response.data.access_token) {
        throw new Error("GitHub token exchange failed: " + JSON.stringify(response.data));
      }
      accessToken = response.data.access_token;
    }
    
    await ConnectedAccount.findOneAndUpdate(
      { userId: req.user.userId, provider },
      {
        providerType: "oauth",
        status: "connected",
        accessTokenEncrypted: encryptSecret(accessToken),
        connectedAt: new Date()
      },
      { upsert: true, returnDocument: 'after' }
    );

    res.redirect(`${returnTo}?connected=${provider}`);
    } catch (error) {
      console.error("Callback error:", error);
      res.redirect(`${returnTo}?error=${encodeURIComponent(error.message)}`);
    }
};

export const disconnectProvider = async (req, res) => {
  const { provider } = req.params;
  try {
    await ConnectedAccount.findOneAndDelete({ userId: req.user.userId, provider });
    
    // Also clear legacy flags on the User model
    const update = {};
    if (provider === 'github') {
      update.githubConnected = false;
      update.githubAccessTokenEncrypted = "";
    } else if (provider === 'vercel') {
      update.vercelConnected = false;
      update.vercelAccessTokenEncrypted = "";
    }
    
    if (Object.keys(update).length > 0) {
      await User.findByIdAndUpdate(req.user.userId, update);
    }

    res.json({ success: true, message: `Disconnected ${provider}` });
  } catch (error) {
    res.status(500).json({ error: "Failed to disconnect" });
  }
};

export const connectApiKey = async (req, res) => {
  try {
    const { provider } = req.params;
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: "API key is required" });
    if (!['render', 'railway', 'vercel', 'cloudflare'].includes(provider)) {
      return res.status(400).json({ error: "Invalid provider for API key connection" });
    }
    
    let isValid = false;
    if (provider === 'render') {
      isValid = await validateRenderToken(apiKey);
    } else if (provider === 'railway') {
      isValid = await validateRailwayToken(apiKey);
    } else if (provider === 'vercel') {
      isValid = await validateVercelToken(apiKey);
    } else if (provider === 'cloudflare') {
      isValid = await validateCloudflareToken(apiKey);
    }

    if (!isValid) return res.status(400).json({ error: "Invalid API key" });

    await ConnectedAccount.findOneAndUpdate(
      { userId: req.user.userId, provider },
      {
        providerType: "api_key",
        status: "connected",
        accessTokenEncrypted: encryptSecret(apiKey),
        connectedAt: new Date()
      },
      { upsert: true, returnDocument: 'after' }
    );

    res.json({ success: true, message: `Successfully connected ${provider}` });
  } catch (error) {
    console.error(`Connect ${req.params.provider} error:`, error);
    res.status(500).json({ error: `Failed to connect ${req.params.provider}` });
  }
};

export const getCloudflareZones = async (req, res) => {
  try {
    const token = await getCloudflareToken(req.user.userId);
    if (!token) return res.status(401).json({ error: "Cloudflare not connected" });
    
    const zones = await fetchCloudflareZones(token);
    res.json({ success: true, zones });
  } catch (error) {
    console.error("Fetch Cloudflare zones error:", error);
    res.status(500).json({ error: "Failed to fetch Cloudflare zones" });
  }
};
