/**
 * Aggressively sanitizes deployment logs to ensure no secrets or sensitive data
 * are accidentally sent to the AI Error Explanation endpoint.
 */
export const sanitizeDeploymentLogs = (logsArray) => {
  if (!logsArray || !Array.isArray(logsArray)) return [];

  const patterns = [
    // MongoDB URIs (mongodb:// or mongodb+srv://)
    { regex: /mongodb(?:\+srv)?:\/\/[^\s]+/gi, replacement: '[MASKED_MONGO_URI]' },
    // Generic credentialed URLs (http://user:pass@host)
    { regex: /https?:\/\/[^:\s\/]+:[^@\s\/]+@[^\s]+/gi, replacement: 'https://[MASKED_CREDENTIALS]@...' },
    // Bearer tokens
    { regex: /Bearer\s+[a-zA-Z0-9\-\._~+\/]+/gi, replacement: 'Bearer [MASKED_TOKEN]' },
    // GitHub Tokens
    { regex: /(gh[posur]_[a-zA-Z0-9_]{36,}|github_pat_[a-zA-Z0-9_]+)/gi, replacement: '[MASKED_GITHUB_TOKEN]' },
    // Generic Secret Keys (sk-...)
    { regex: /sk-[a-zA-Z0-9_]{20,}/gi, replacement: '[MASKED_SECRET_KEY]' },
    // Key-Value pairs for passwords, secrets, tokens
    { regex: /(password|secret|token|api_key|apikey)[=:]\s*["']?[^\s"']+["']?/gi, replacement: '$1=[MASKED_VALUE]' },
    // JWT-like strings
    { regex: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, replacement: '[MASKED_JWT]' }
  ];

  return logsArray.map(log => {
    // If log is a Mongoose document, convert it to a plain object
    const plainLog = typeof log.toObject === 'function' ? log.toObject() : { ...log };

    let cleanMessage = plainLog.message;
    if (typeof cleanMessage === 'string') {
      patterns.forEach(({ regex, replacement }) => {
        cleanMessage = cleanMessage.replace(regex, replacement);
      });
    }

    let cleanMetadata = plainLog.metadata;
    if (cleanMetadata && typeof cleanMetadata === 'object') {
      try {
        let metaStr = JSON.stringify(cleanMetadata);
        patterns.forEach(({ regex, replacement }) => {
          metaStr = metaStr.replace(regex, replacement);
        });
        cleanMetadata = JSON.parse(metaStr);
      } catch (e) {
        cleanMetadata = { _masked: 'failed_to_parse' };
      }
    }

    return {
      ...plainLog,
      message: cleanMessage,
      metadata: cleanMetadata
    };
  });
};
