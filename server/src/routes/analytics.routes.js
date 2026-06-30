import express from "express";

const router = express.Router();

// Auto-Injector script served to Vercel builds
router.get("/injector.js", (req, res) => {
  res.type('application/javascript');
  res.send(`
const fs = require('fs');
const path = require('path');

const trackingId = process.env.DEPLOYAI_TRACKING_ID;
const apiUrl = process.env.DEPLOYAI_API_URL || 'https://api.deployai.in';

if (!trackingId) {
  console.log('=> No DEPLOYAI_TRACKING_ID found. Skipping injection.');
  process.exit(0);
}

const scriptTag = '\\n<script defer src="' + apiUrl + '/analytics.js" data-tracking-id="' + trackingId + '"></script>\\n';

const targetFiles = [
  'app/layout.tsx', 'app/layout.jsx', 'src/app/layout.tsx', 'src/app/layout.jsx',
  'pages/_document.tsx', 'pages/_document.jsx', 'src/pages/_document.tsx', 'src/pages/_document.jsx',
  'index.html', 'public/index.html'
];

let injected = false;

for (const relPath of targetFiles) {
  const filePath = path.join(process.cwd(), relPath);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('analytics.js') && content.includes('data-tracking-id')) {
      console.log('=> Analytics already present in ' + relPath);
      injected = true;
      continue;
    }

    if (content.includes('</body>')) {
      content = content.replace('</body>', scriptTag + '</body>');
    } else if (content.includes('</head>')) {
      content = content.replace('</head>', scriptTag + '</head>');
    } else if (content.includes('</Head>')) {
      content = content.replace('</Head>', scriptTag + '</Head>');
    } else {
      continue;
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('=> Successfully auto-injected DeployAI Analytics into ' + relPath);
    injected = true;
  }
}

if (!injected) {
  console.log('=> DeployAI Auto-Injector could not find a suitable file to inject.');
}
  `);
});

export default router;
