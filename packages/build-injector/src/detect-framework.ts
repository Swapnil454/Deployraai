import fs from 'fs/promises';
import path from 'path';

export type Framework =
  | 'nextjs'
  | 'express'
  | 'fastapi'
  | 'django'
  | 'nestjs'
  | 'astro'
  | 'remix'
  | 'sveltekit'
  | 'node'
  | 'unknown';

export async function detectFramework(repoPath: string): Promise<Framework> {
  const pkgPath = path.join(repoPath, 'package.json');

  try {
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps['next']) return 'nextjs';
    if (deps['@remix-run/node']) return 'remix';
    if (deps['@sveltejs/kit']) return 'sveltekit';
    if (deps['astro']) return 'astro';
    if (deps['@nestjs/core']) return 'nestjs';
    if (deps['express']) return 'express';
  } catch {}

  // Check for Python frameworks
  const requirementsPath = path.join(repoPath, 'requirements.txt');
  try {
    const requirements = await fs.readFile(requirementsPath, 'utf8');
    if (requirements.includes('fastapi')) return 'fastapi';
    if (requirements.includes('django')) return 'django';
  } catch {}

  return 'unknown';
}
