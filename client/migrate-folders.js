const fs = require('fs');
const path = require('path');

const dashboardDir = path.join(__dirname, 'app', 'dashboard');
const logsProjectDir = path.join(dashboardDir, 'logs', '[projectId]');

const targets = [
  { name: 'issues', sourceFolder: 'issues', proxyPage: 'issues/page.tsx' },
  { name: 'incidents', sourceFolder: 'incidents', proxyPage: 'incidents/page.tsx' },
  { name: 'slos', sourceFolder: 'slos', proxyPage: 'slos/page.tsx' },
  { name: 'status-pages', sourceFolder: 'status-page', proxyPage: 'status-pages/page.tsx' } // the source folder inside logs is "status-page", the proxy is "status-pages"
];

for (const target of targets) {
  const sourcePath = path.join(logsProjectDir, target.sourceFolder);
  const destDir = path.join(dashboardDir, target.name, '[projectId]');

  // 1. Create [projectId] folder inside the main feature folder
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // 2. Move files from source to dest
  if (fs.existsSync(sourcePath)) {
    const items = fs.readdirSync(sourcePath);
    for (const item of items) {
      fs.renameSync(path.join(sourcePath, item), path.join(destDir, item));
    }
    // Clean up empty source directory
    fs.rmdirSync(sourcePath);
    console.log(`Moved ${target.sourceFolder} out of logs.`);
  }

  // 3. Update the proxy page routing
  const proxyPath = path.join(dashboardDir, target.proxyPage);
  if (fs.existsSync(proxyPath)) {
    let content = fs.readFileSync(proxyPath, 'utf8');
    // Replace `/dashboard/logs/${p._id}/issues` with `/dashboard/issues/${p._id}`
    const regex = new RegExp(`\\/dashboard\\/logs\\/\\$\\{p\\._id\\}\\/${target.sourceFolder}`, 'g');
    content = content.replace(regex, `/dashboard/${target.name}/\${p._id}`);
    
    fs.writeFileSync(proxyPath, content);
    console.log(`Updated proxy link in ${target.proxyPage}`);
  }
}

console.log("Migration complete!");
