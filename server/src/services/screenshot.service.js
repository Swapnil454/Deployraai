import puppeteer from 'puppeteer';
import { v2 as cloudinary } from 'cloudinary';
import Deployment from '../models/Deployment.js';
import dns from 'dns/promises';

// Private / reserved IP ranges — block them in Puppeteer request interception
const SCREENSHOT_BLOCKED_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,   // AWS/GCP/Azure metadata
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

const isBlockedAddr = (addr) => SCREENSHOT_BLOCKED_IP_PATTERNS.some(p => p.test(addr));

/**
 * Returns true if the given URL should be blocked inside the screenshot browser.
 * Resolves the hostname's DNS records and rejects if any address is private/reserved.
 */
const isInternalUrl = async (url) => {
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false; // Malformed URL — let Puppeteer handle it
  }

  // Reject bare private IPs immediately
  if (isBlockedAddr(hostname)) return true;

  try {
    const v4 = await dns.resolve4(hostname).catch(() => []);
    const v6 = await dns.resolve6(hostname).catch(() => []);
    return [...v4, ...v6].some(isBlockedAddr);
  } catch {
    return false; // Cannot resolve — not our concern here
  }
};

export const captureDeploymentScreenshot = async (deploymentId, url) => {
    try {
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET
        });

        if (!url || !url.startsWith('http')) {
            console.error(`[ScreenshotService] Invalid URL provided: ${url}`);
            return null;
        }

        console.log(`[ScreenshotService] Capturing screenshot for ${deploymentId} at ${url}`);
        
        const deployment = await Deployment.findById(deploymentId);
        if (!deployment) {
            console.error(`[ScreenshotService] Deployment not found: ${deploymentId}`);
            return null;
        }
        
        const userId = deployment.userId.toString();

        // Vercel apps sometimes take a few extra seconds to boot on first request
        // We'll give it a slight artificial delay before even attempting, or just rely on networkidle0
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // --- SSRF Guard: Block any sub-request targeting private/internal IPs ---
        // This prevents malicious JS on a deployed app from using our headless
        // browser as an SSRF proxy to reach cloud metadata (169.254.169.254) etc.
        await page.setRequestInterception(true);
        page.on('request', async (interceptedReq) => {
            try {
                const reqUrl = interceptedReq.url();
                // Always allow data: URIs and the initial navigation itself
                if (reqUrl.startsWith('data:') || reqUrl === url) {
                    return interceptedReq.continue();
                }
                if (await isInternalUrl(reqUrl)) {
                    console.warn(`[ScreenshotService] Blocked internal request to: ${reqUrl}`);
                    return interceptedReq.abort('accessdenied');
                }
                interceptedReq.continue();
            } catch {
                interceptedReq.continue();
            }
        });
        // -----------------------------------------------------------------------

        // Go to URL, wait for 0 active network connections for at least 500ms
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 45000 });

        // Additional 2 seconds wait for any final JS animations or hydration
        await new Promise(resolve => setTimeout(resolve, 2000));

        const screenshotBuffer = await page.screenshot({ encoding: 'binary' });
        await browser.close();

        // Upload directly to Cloudinary via stream
        const uploadResult = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: `AI_Agents/screenshots/users/${userId}`,
                    public_id: deploymentId.toString(),
                    format: 'png',
                    overwrite: true
                },
                (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                }
            );
            uploadStream.end(screenshotBuffer);
        });

        const screenshotUrl = uploadResult.secure_url;
        await Deployment.findByIdAndUpdate(deploymentId, {
            'finalSummary.screenshotUrl': screenshotUrl
        });

        console.log(`[ScreenshotService] Successfully captured and saved screenshot: ${screenshotUrl}`);
        return screenshotUrl;
    } catch (error) {
        console.error(`[ScreenshotService] Failed to capture screenshot for ${deploymentId}:`, error);
        return null;
    }
};
