import { v2 as cloudinary } from 'cloudinary';
import Deployment from '../models/Deployment.js';

// Sentinel value written to DB when all screenshot providers fail.
// The UI checks for this string to stop polling and show a graceful fallback.
const SCREENSHOT_UNAVAILABLE = 'unavailable';

/**
 * Fetch a screenshot image buffer using ScreenshotOne API (primary provider).
 * Docs: https://screenshotone.com/docs/
 * Free tier: 100 screenshots/month with SCREENSHOTONE_KEY set.
 */
const fetchViaScreenshotOne = async (url) => {
    const key = process.env.SCREENSHOTONE_KEY;
    if (!key) throw new Error('SCREENSHOTONE_KEY not set');

    const params = new URLSearchParams({
        access_key: key,
        url,
        viewport_width: '1280',
        viewport_height: '800',
        format: 'png',
        block_ads: 'true',
        block_cookie_banners: 'true',
        delay: '2',
        timeout: '40',
    });

    const apiUrl = `https://api.screenshotone.com/take?${params.toString()}`;
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(50000) });
    if (!res.ok) throw new Error(`ScreenshotOne error ${res.status}: ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
};

/**
 * Fetch a screenshot image buffer using Microlink API (free fallback, no key needed).
 * Docs: https://microlink.io/docs/api/parameters/screenshot
 * Rate-limited to ~50 req/day on free tier.
 */
const fetchViaMicrolink = async (url) => {
    const params = new URLSearchParams({
        url,
        screenshot: 'true',
        meta: 'false',
        embed: 'screenshot.url',
    });

    const apiUrl = `https://api.microlink.io/?${params.toString()}`;
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(50000) });
    if (!res.ok) throw new Error(`Microlink API error ${res.status}`);

    // Microlink returns JSON with data.screenshot.url
    const json = await res.json();
    const screenshotImageUrl = json?.data?.screenshot?.url;
    if (!screenshotImageUrl) throw new Error('Microlink returned no screenshot URL');

    // Fetch the actual image
    const imgRes = await fetch(screenshotImageUrl, { signal: AbortSignal.timeout(20000) });
    if (!imgRes.ok) throw new Error(`Failed to download Microlink image: ${imgRes.status}`);
    return Buffer.from(await imgRes.arrayBuffer());
};

export const captureDeploymentScreenshot = async (deploymentId, url) => {
    try {
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
        });

        if (!url || !url.startsWith('http')) {
            console.error(`[ScreenshotService] Invalid URL provided: ${url}`);
            await Deployment.findByIdAndUpdate(deploymentId, {
                'finalSummary.screenshotUrl': SCREENSHOT_UNAVAILABLE,
            });
            return null;
        }

        console.log(`[ScreenshotService] Capturing screenshot for ${deploymentId} at ${url}`);

        const deployment = await Deployment.findById(deploymentId);
        if (!deployment) {
            console.error(`[ScreenshotService] Deployment not found: ${deploymentId}`);
            return null;
        }

        const userId = deployment.userId.toString();

        // --- Try providers in order: ScreenshotOne → Microlink ---
        let screenshotBuffer = null;
        let providerUsed = null;

        // Give the newly deployed site 5 seconds to fully boot before screenshotting
        await new Promise(resolve => setTimeout(resolve, 5000));

        try {
            screenshotBuffer = await fetchViaScreenshotOne(url);
            providerUsed = 'screenshotone';
        } catch (err1) {
            console.warn(`[ScreenshotService] ScreenshotOne failed: ${err1.message}. Trying Microlink...`);
            try {
                screenshotBuffer = await fetchViaMicrolink(url);
                providerUsed = 'microlink';
            } catch (err2) {
                console.error(`[ScreenshotService] Microlink also failed: ${err2.message}`);
            }
        }

        if (!screenshotBuffer) {
            console.warn(`[ScreenshotService] All providers failed for ${deploymentId}. Marking as unavailable.`);
            // Write sentinel so the UI knows to stop polling
            await Deployment.findByIdAndUpdate(deploymentId, {
                'finalSummary.screenshotUrl': SCREENSHOT_UNAVAILABLE,
            });
            return null;
        }

        // Upload to Cloudinary
        const uploadResult = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: `AI_Agents/screenshots/users/${userId}`,
                    public_id: deploymentId.toString(),
                    format: 'png',
                    overwrite: true,
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
            'finalSummary.screenshotUrl': screenshotUrl,
        });

        console.log(`[ScreenshotService] Successfully captured via ${providerUsed}: ${screenshotUrl}`);
        return screenshotUrl;
    } catch (error) {
        console.error(`[ScreenshotService] Failed to capture screenshot for ${deploymentId}:`, error);
        // Mark as unavailable so the UI stops polling
        await Deployment.findByIdAndUpdate(deploymentId, {
            'finalSummary.screenshotUrl': SCREENSHOT_UNAVAILABLE,
        }).catch(() => {});
        return null;
    }
};
