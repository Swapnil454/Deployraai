export function extractErrorStack(sanitizedLogs, fallbackReason) {
  const errorKeywords = [
    "ReferenceError", "TypeError", "SyntaxError", "RangeError",
    "UnhandledPromiseRejection", "Cannot read properties of undefined",
    "is not defined", "is not a function"
  ];
  
  const stackKeywords = ["at server/", "at src/", "deployment.controller"];
  
  const extracted = sanitizedLogs
    .map(l => l.message)
    .filter(msg => {
      if (!msg) return false;
      return errorKeywords.some(kw => msg.includes(kw)) || 
             stackKeywords.some(kw => msg.includes(kw)) || 
             /^\s*at /.test(msg);
    });

  if (extracted.length > 0) {
    return extracted.join("\n");
  }

  if (fallbackReason) {
    return fallbackReason;
  }

  const errorLogs = sanitizedLogs
    .filter(l => l.level === 'error' || l.level === 'warning')
    .map(l => l.message);
    
  if (errorLogs.length > 0) {
    return errorLogs.slice(-10).join("\n");
  }

  return "No stack trace available.";
}

export function isPlatformInternalBug(sanitizedLogs) {
  const internalKeywords = [
    "ReferenceError", "TypeError", "is not defined", "is not a function",
    "deployment.controller.js", "provider service function missing"
  ];
  
  const stackKeywords = ["at server/", "at src/"];

  return sanitizedLogs.some(log => {
    if (!log.message) return false;
    return internalKeywords.some(kw => log.message.includes(kw)) || 
           stackKeywords.some(kw => log.message.includes(kw));
  });
}
