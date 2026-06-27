const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, 'app', 'dashboard');

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;

      // Only touch files in the moved folders
      if (fullPath.includes('\\issues\\') || fullPath.includes('\\incidents\\') || fullPath.includes('\\slos\\') || fullPath.includes('\\status-pages\\')) {
        
        // Status Pages redirect fix
        if (content.includes('/dashboard/logs/${params.projectId}/status-page/settings')) {
          content = content.replace('/dashboard/logs/${params.projectId}/status-page/settings', '/dashboard/status-pages/${params.projectId}/settings');
          changed = true;
        }
        
        // Issues fixes
        if (content.includes('/dashboard/logs/${projectId}/issues/alerts')) {
          content = content.replace('/dashboard/logs/${projectId}/issues/alerts', '/dashboard/issues/${projectId}/alerts');
          changed = true;
        }
        if (content.includes('/dashboard/logs/${projectId}/issues/${issue.id}')) {
          content = content.replace('/dashboard/logs/${projectId}/issues/${issue.id}', '/dashboard/issues/${projectId}/${issue.id}');
          changed = true;
        }
        
        // Incidents fixes
        if (content.includes('/dashboard/logs/${projectId}/incidents')) {
          content = content.replace(/(\/dashboard\/logs\/\$\{projectId\}\/incidents)/g, '/dashboard/incidents/${projectId}');
          changed = true;
        }
      }

      if (changed) {
        fs.writeFileSync(fullPath, content);
        console.log("Fixed links in " + fullPath);
      }
    }
  }
}

processDir(targetDir);
