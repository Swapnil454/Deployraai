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
      
      // Fix literal '\n' inserted into code by previous script
      if (content.includes(',\\n        headers:')) {
        content = content.replace(/,\\n        headers:/g, ',\n        headers:');
        fs.writeFileSync(fullPath, content);
        console.log("Fixed newline in " + fullPath);
      }
    }
  }
}

processDir(targetDir);
