import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import Deployment from '../models/Deployment.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const captureDeploymentScreenshot = async (deploymentId, url) => {
    try {
        if (!url || !url.startsWith('http')) {
            console.error(`[ScreenshotService] Invalid URL provided: ${url}`);
            return null;
        }

        console.log(`[ScreenshotService] Capturing screenshot for ${deploymentId} at ${url}`);
        
        const screenshotDir = path.join(__dirname, '../../public/screenshots');
        if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir, { recursive: true });
        }

        const fileName = `${deploymentId}.png`;
        const filePath = path.join(screenshotDir, fileName);

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

        await page.screenshot({ path: filePath });
        await browser.close();

        const screenshotUrl = `/screenshots/${fileName}`;
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
