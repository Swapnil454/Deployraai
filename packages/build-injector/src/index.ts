import fs from 'fs/promises';
import path from 'path';
import { detectFramework } from './detect-framework.js';

interface InjectionOptions {
  repoPath: string;
  projectId: string;
  deployId: string;
  environment: 'production' | 'preview';
}

export async function injectObservability(opts: InjectionOptions) {
  const framework = await detectFramework(opts.repoPath);
  console.log(`Detected framework: ${framework} — injecting observability`);

  // Step 1: Install the SDK
  await installSDK(opts.repoPath, framework);

  // Step 2: Inject the instrumentation file
  await injectInstrumentationFile(opts.repoPath, framework, opts);

  // Step 3: Modify package.json start script if needed (for Express/Node.js)
  if (framework === 'express' || framework === 'node') {
    await patchStartScript(opts.repoPath);
  }

  // Step 4: Patch Next.js config to enable source maps
  if (framework === 'nextjs') {
    await enableSourceMaps(opts.repoPath);
  }

  // Step 5: Inject deploy ID environment variable
  await injectEnvVars(opts);

  console.log('Observability injection complete');
}

export async function uploadSourceMaps(opts: InjectionOptions) {
  const framework = await detectFramework(opts.repoPath);
  if (framework !== 'nextjs') {
    console.log('Source map upload currently only supports Next.js');
    return;
  }

  console.log(`Scanning for source maps in ${opts.repoPath} (.next)...`);
  await scanAndUploadMaps(opts.repoPath, opts.projectId, opts.deployId);
  
  // Hardening: Delete maps so they aren't publicly exposed in production
  console.log(`Cleaning up public source maps...`);
  await deleteMapFiles(path.join(opts.repoPath, '.next', 'static'));
}

export async function injectEnvVars(opts: InjectionOptions) {
  // If the build environment supports a .env.production file, append to it
  const envPath = path.join(opts.repoPath, '.env.production');
  const envStr = `\nTRACEPILOT_DEPLOY_ID=${opts.deployId}\nNEXT_PUBLIC_TRACEPILOT_DEPLOY_ID=${opts.deployId}\nTRACEPILOT_PROJECT_ID=${opts.projectId}\n`;
  try {
    await fs.appendFile(envPath, envStr);
  } catch (err) {
    // If it fails (file doesn't exist etc), try to write it
    await fs.writeFile(envPath, envStr);
  }
}

async function deleteMapFiles(dir: string) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await deleteMapFiles(fullPath);
      } else if (entry.name.endsWith('.map')) {
        await fs.unlink(fullPath);
      }
    }
  } catch (err) {
    console.error(`Failed to delete map files in ${dir}:`, err);
  }
}

async function enableSourceMaps(repoPath: string) {
  const configPath = path.join(repoPath, 'next.config.ts');
  const jsConfigPath = path.join(repoPath, 'next.config.js');
  const mjsConfigPath = path.join(repoPath, 'next.config.mjs');

  // Try .ts, then .js, then .mjs
  const targetPath = await fs.access(configPath).then(() => configPath)
    .catch(() => fs.access(jsConfigPath).then(() => jsConfigPath))
    .catch(() => fs.access(mjsConfigPath).then(() => mjsConfigPath))
    .catch(() => null);

  if (!targetPath) return;

  let content = await fs.readFile(targetPath, 'utf8');

  // Add productionBrowserSourceMaps: true if not already present
  if (!content.includes('productionBrowserSourceMaps')) {
    content = content.replace(
      /const nextConfig[^=]*=\s*\{/,
      'const nextConfig = {\n  productionBrowserSourceMaps: true,'
    );
    // If it's a direct export default {}
    if (!content.includes('productionBrowserSourceMaps')) {
      content = content.replace(
        /export default\s*\{/,
        'export default {\n  productionBrowserSourceMaps: true,'
      );
    }
    // module.exports = {}
    if (!content.includes('productionBrowserSourceMaps')) {
      content = content.replace(
        /module\.exports\s*=\s*\{/,
        'module.exports = {\n  productionBrowserSourceMaps: true,'
      );
    }
    await fs.writeFile(targetPath, content);
  }
}

async function scanAndUploadMaps(repoPath: string, projectId: string, deployId: string) {
  const nextDir = path.join(repoPath, '.next', 'static');
  
  try {
    await fs.access(nextDir);
  } catch {
    console.log('.next/static directory not found, skipping source maps');
    return;
  }

  const mapFiles: string[] = [];

  // Recursive walk to find .map files
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const res = path.resolve(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(res);
      } else if (entry.name.endsWith('.map')) {
        mapFiles.push(res);
      }
    }
  }

  await walk(nextDir);

  const ingestorUrl = process.env.TRACEPILOT_INGESTOR_URL || 'http://localhost:4317';
  
  for (const mapFile of mapFiles) {
    const fileName = path.basename(mapFile);
    const content = await fs.readFile(mapFile, 'utf8');
    const sizeBytes = Buffer.byteLength(content, 'utf8');
    
    // Attempt to guess sourceUrl for UI grouping
    let sourceUrl = '';
    const relPath = path.relative(path.join(repoPath, '.next', 'static'), mapFile);
    sourceUrl = `/_next/static/${relPath.replace(/\.map$/, '')}`.replace(/\\/g, '/');

    console.log(`Uploading ${fileName} (${(sizeBytes / 1024 / 1024).toFixed(2)} MB)...`);
    try {
      const res = await fetch(`${ingestorUrl}/v1/sourcemaps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.TRACEPILOT_SECRET_TOKEN}` // Requires a platform-level secret or the projectId token
        },
        body: JSON.stringify({
          deployId,
          fileName,
          sourceUrl,
          sizeBytes,
          mapContent: content
        })
      });

      if (!res.ok) {
        console.error(`Failed to upload ${fileName}: ${res.statusText}`);
      }
    } catch (err) {
      console.error(`Error uploading ${fileName}:`, err);
    }
  }
}

async function installSDK(repoPath: string, framework: string) {
  const pkgPath = path.join(repoPath, 'package.json');
  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));

  pkg.dependencies = pkg.dependencies ?? {};
  pkg.dependencies['@swapnil454/tracepilot'] = '^0.1.0';

  await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2));
}

async function injectInstrumentationFile(
  repoPath: string,
  framework: string,
  opts: InjectionOptions
) {
  if (framework === 'nextjs') {
    const content = generateNextInstrumentationFile();
    const filePath = path.join(repoPath, 'instrumentation.ts');

    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    if (exists) {
      const existing = await fs.readFile(filePath, 'utf8');
      await fs.writeFile(filePath, mergeInstrumentationFiles(content, existing));
    } else {
      await fs.writeFile(filePath, content);
    }
  }
}

function mergeInstrumentationFiles(injectedContent: string, existingContent: string): string {
    return `${injectedContent}\n\n${existingContent}`;
}

function generateNextInstrumentationFile(): string {
  return `
// Auto-generated by YourPlatform — do not edit manually
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initTracer, setupGlobalErrorCapture } = await import('@swapnil454/tracepilot');
    initTracer();
    setupGlobalErrorCapture();
  }
}
`.trim();
}

async function patchStartScript(repoPath: string) {
  const pkgPath = path.join(repoPath, 'package.json');
  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));

  if (pkg.scripts?.start) {
    pkg.scripts.start = pkg.scripts.start.replace(
      /^node /,
      'node --require @swapnil454/tracepilot/express '
    );
  }

  await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2));
}
