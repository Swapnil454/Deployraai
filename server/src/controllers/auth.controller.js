import axios from "axios";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { encryptSecret } from "../utils/encryption.js";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const COOKIE_NAME = process.env.COOKIE_NAME || "deployai_token";

export const githubLogin = (req, res) => {
  // Generate random state to protect against CSRF
  const state = Math.random().toString(36).substring(7);
  
  // Store state in a short-lived cookie
  res.cookie('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 1000 * 60 * 10 // 10 minutes
  });

  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=${process.env.GITHUB_CALLBACK_URL}&scope=read:user user:email public_repo&state=${state}`;
  
  res.redirect(githubAuthUrl);
};

export const githubCallback = async (req, res) => {
  const { code, state } = req.query;
  const storedState = req.cookies.oauth_state;

  if (!state || state !== storedState) {
    return res.redirect(`${FRONTEND_URL}/login?error=invalid_state`);
  }

  res.clearCookie('oauth_state');

  try {
    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: process.env.GITHUB_CALLBACK_URL,
      },
      { headers: { Accept: 'application/json' } }
    );

    const accessToken = tokenResponse.data.access_token;
    const scope = tokenResponse.data.scope; // e.g. "public_repo,read:user,user:email"
    if (!accessToken) {
      return res.redirect(`${FRONTEND_URL}/login?error=github_auth_failed`);
    }

    const userResponse = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    const githubUser = userResponse.data;
    let email = githubUser.email;

    if (!email) {
      const emailResponse = await axios.get('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const emails = emailResponse.data;
      const primaryEmail = emails.find(e => e.primary && e.verified);
      email = primaryEmail ? primaryEmail.email : `github_${githubUser.login}@github.local`;
    }

    const encryptedToken = encryptSecret(accessToken);
    const scopesArray = scope ? scope.split(',') : [];

    let user = await User.findOne({ githubId: githubUser.id.toString() });
    
    if (user) {
      user.name = githubUser.name || githubUser.login;
      user.email = email;
      user.avatar = githubUser.avatar_url;
      user.githubUsername = githubUser.login;
      user.githubAccessTokenEncrypted = encryptedToken;
      user.githubScopes = scopesArray;
      user.githubTokenLastUpdatedAt = new Date();
      user.githubConnected = true;
      await user.save();
    } else {
      user = await User.create({
        name: githubUser.name || githubUser.login,
        email: email,
        avatar: githubUser.avatar_url,
        githubId: githubUser.id.toString(),
        githubUsername: githubUser.login,
        provider: 'github',
        githubAccessTokenEncrypted: encryptedToken,
        githubScopes: scopesArray,
        githubTokenLastUpdatedAt: new Date(),
        githubConnected: true
      });
    }

    const jwtPayload = { userId: user._id, role: user.role };
    const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod';
    const jwtToken = jwt.sign(jwtPayload, jwtSecret, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

    const isProd = process.env.NODE_ENV === "production";
    res.cookie(COOKIE_NAME, jwtToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.redirect(`${FRONTEND_URL}/dashboard`);

  } catch (error) {
    console.error("GitHub Auth Error:", error.response?.data || error.message);
    res.redirect(`${FRONTEND_URL}/login?error=github_auth_failed`);
  }
};

export const me = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      githubUsername: user.githubUsername,
      role: user.role,
      githubConnected: user.githubConnected,
      vercelConnected: user.vercelConnected,
      renderConnected: user.renderConnected,
      cloudflareConnected: user.cloudflareConnected
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};

export const logout = (req, res) => {
  const isProd = process.env.NODE_ENV === "production";
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax"
  });
  res.json({ success: true });
};
