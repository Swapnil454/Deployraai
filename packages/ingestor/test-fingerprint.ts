import crypto from 'crypto';

function computeErrorFingerprint(exceptionType: string, stack: string): string {
  const frames = stack.split('\n');
  const normalizedFrames = [];
  
  for (const frame of frames) {
    const match = frame.match(/at .+ \((.+):\d+:\d+\)/);
    if (match && match[1]) {
      normalizedFrames.push(match[1]);
    } else {
      const fallbackMatch = frame.match(/at (.+):\d+:\d+/);
      if (fallbackMatch && fallbackMatch[1]) {
        normalizedFrames.push(fallbackMatch[1]);
      }
    }
    if (normalizedFrames.length === 3) break;
  }

  const hashString = exceptionType + normalizedFrames.join('|');
  return crypto.createHash('sha256').update(hashString).digest('hex');
}

const span1 = `    at Object.run (utils/db.ts:42:7)
    at Object.execute (utils/query.ts:12:1)`;

const span2 = `    at Object.run (utils/db.ts:108:3)
    at Object.execute (utils/query.ts:12:1)`;

const hash1 = computeErrorFingerprint('TypeError', span1);
const hash2 = computeErrorFingerprint('TypeError', span2);

console.log('Hash 1:', hash1);
console.log('Hash 2:', hash2);
console.log('Match?', hash1 === hash2);
