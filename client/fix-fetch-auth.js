const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, 'app', 'dashboard', 'logs');

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;

      // Replace headers: { Authorization: ... } with credentials: "include"
      const authHeaderRegex1 = /headers:\s*\{\s*Authorization:\s*`Bearer\s*\$\{user\.token\}`\s*\}/g;
      const authHeaderRegex2 = /headers:\s*\{\s*Authorization:\s*`Bearer\s*\$\{token\}`\s*,\s*"Content-Type":\s*"application\/json"\s*\}/g;
      const authHeaderRegex3 = /headers:\s*\{\s*Authorization:\s*`Bearer\s*\$\{token\}`\s*\}/g;
      const authHeaderRegex4 = /headers:\s*\{\s*Authorization:\s*`Bearer\s*\$\{user\.token\}`\s*,\s*"Content-Type":\s*"application\/json"\s*\}/g;

      if (authHeaderRegex1.test(content) || authHeaderRegex2.test(content) || authHeaderRegex3.test(content) || authHeaderRegex4.test(content)) {
        content = content.replace(authHeaderRegex1, 'credentials: "include"');
        content = content.replace(authHeaderRegex2, 'credentials: "include",\\n        headers: { "Content-Type": "application/json" }');
        content = content.replace(authHeaderRegex3, 'credentials: "include"');
        content = content.replace(authHeaderRegex4, 'credentials: "include",\\n        headers: { "Content-Type": "application/json" }');
        changed = true;
      }

      // Remove !user checks in useEffects
      if (content.includes('!user')) {
        content = content.replace(/!projectId \|\| !user/g, '!projectId');
        content = content.replace(/!projectId \|\| !incidentId \|\| !user/g, '!projectId || !incidentId');
        content = content.replace(/!projectId \|\| !issueId \|\| !user/g, '!projectId || !issueId');
        changed = true;
      }

      // Remove useAuth references to clean up
      if (content.includes('const { user } = useAuth();')) {
        content = content.replace(/const \{ user \} = useAuth\(\);\s*\n/g, '');
        changed = true;
      }
      if (content.includes('import { useAuth } from "@/lib/auth";')) {
        content = content.replace(/import \{ useAuth \} from "@\/lib\/auth";\s*\n/g, '');
        changed = true;
      }
      if (content.includes('const token = localStorage.getItem(')) {
        content = content.replace(/const token = localStorage.getItem\('token'\);\s*\n/g, '');
        changed = true;
      }
      
      // Fix useEffect dependencies
      if (content.includes('user,')) {
         content = content.replace(/user,\s*/g, '');
         changed = true;
      }
      if (content.includes(', user]')) {
         content = content.replace(/,\s*user\]/g, ']');
         changed = true;
      }

      if (changed) {
        fs.writeFileSync(fullPath, content);
        console.log("Fixed " + fullPath);
      }
    }
  }
}

processDir(targetDir);
console.log("All fetch calls updated!");
