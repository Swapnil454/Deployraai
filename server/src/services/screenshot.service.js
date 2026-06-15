import puppeteer from 'puppeteer';
import { v2 as cloudinary } from 'cloudinary';
import Deployment from '../models/Deployment.js';

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
