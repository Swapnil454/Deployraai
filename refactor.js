const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.js')) results.push(file);
    }
  });
  return results;
}

const files = walk('./client/app');
let modifiedCount = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // 1. We replace exact `"http://localhost:5000/` with `\`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/`
  // But wait, what if the string ends without a slash? `"http://localhost:5000"`
  
  // A foolproof way is to find `"http://localhost:5000` and `"` or `'http://localhost:5000` and `'`
  // Actually, in our codebase, `http://localhost:5000` is the base URL.
  
  // Let's just do a simple replacement for ALL instances of "http://localhost:5000" and 'http://localhost:5000'
  // to be `process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"` inside the string. But we can't inject JS into a plain string.
  // We MUST convert the string to a template literal.

  // Using regex again but safely:
  // We want to replace `"http://localhost:5000/api/projects"`
  // Let's use simple match.
  const regexDouble = /"http:\/\/localhost:5000([^"]*)"/g;
  content = content.replace(regexDouble, '`${process.env.NEXT_PUBLIC_API_URL || \'http://localhost:5000\'}$1`');

  const regexSingle = /'http:\/\/localhost:5000([^']*)'/g;
  content = content.replace(regexSingle, '`${process.env.NEXT_PUBLIC_API_URL || \'http://localhost:5000\'}$1`');

  const regexBacktick = /`http:\/\/localhost:5000([^`]*)`/g;
  content = content.replace(regexBacktick, '`${process.env.NEXT_PUBLIC_API_URL || \'http://localhost:5000\'}$1`');

  // If there are naked http://localhost:5000 inside an ALREADY EXISTING backtick string:
  // e.g. `http://localhost:5000/api/${id}`
  // But our previous regexBacktick matches the WHOLE backtick string. So `http://localhost:5000/api/${id}` becomes:
  // `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/${id}`
  // This is PERFECT!

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    modifiedCount++;
    console.log('Updated', file);
  }
});
console.log('Modified', modifiedCount, 'files.');
