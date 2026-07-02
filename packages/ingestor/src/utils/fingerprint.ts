import crypto from 'crypto';

interface FingerprintInput {
  projectId: string;
  exceptionType?: string;
  exceptionMessage?: string;
  topFrame?: string;
}

export function createErrorFingerprint(input: FingerprintInput): string {
  // Normalize message by removing variable parts like numbers or hex hashes
  const normalizedMessage = input.exceptionMessage
    ?.replace(/\d+/g, ':number')
    .replace(/[a-f0-9]{24,}/gi, ':hash')
    .trim()
    .toLowerCase();

  const raw = [
    input.projectId,
    input.exceptionType || 'unknown',
    normalizedMessage || 'unknown',
    input.topFrame || 'unknown',
  ].join('|');

  return crypto.createHash('sha256').update(raw).digest('hex');
}
