const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 10000;

/**
 * Helper to fetch a URL with simple retries for connection issues
 */
export const checkUrl = async (url, options = {}, retries = MAX_RETRIES, delayMs = RETRY_DELAY_MS, attemptCallback) => {
  for (let i = 1; i <= retries; i++) {
    if (attemptCallback) {
      await attemptCallback(i, retries);
    }
    
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
      // Accept ok, 404, or 401 as "server is up". 502/503 usually means booting.
      if (response.ok || response.status === 404 || response.status === 401 || response.status === 403) { 
          return response;
      }
    } catch (err) {
      // Network error, DNS error, timeout - server not up yet.
    }
    
    if (i < retries) {
      await delay(delayMs);
    }
  }
  return null; // Exhausted retries
};

export const checkBackendHealth = async (backendUrl, logCallback) => {
   // 1. Check /health
   let url = `${backendUrl.replace(/\/$/, '')}/health`;
   let response = await checkUrl(url, {}, MAX_RETRIES, RETRY_DELAY_MS, async (attempt, max) => {
       if (logCallback) await logCallback('info', 'checking_backend', `Attempt ${attempt}/${max}: GET /health`);
   });

   if (response && response.ok) {
       try {
           const data = await response.json();
           if (data.database === 'error' || data.database === 'disconnected') {
               return { status: 'failed', endpoint: '/health', message: 'Backend is up, but Database connection failed', statusCode: response.status };
           }
           return { status: 'passed', endpoint: '/health', message: 'Backend health check passed', statusCode: response.status, db: data.database || 'unknown' };
       } catch (e) {
           return { status: 'passed', endpoint: '/health', message: 'Backend health check passed (JSON parsing failed)', statusCode: response.status };
       }
   }

   // 2. Check /api/health
   if (logCallback) await logCallback('warning', 'checking_backend', `/health not available, trying /api/health`);
   url = `${backendUrl.replace(/\/$/, '')}/api/health`;
   response = await checkUrl(url, {}, 1, 0);
   
   if (response && response.ok) {
       return { status: 'passed', endpoint: '/api/health', message: 'Backend health check passed via /api/health', statusCode: response.status };
   }

   // 3. Check root /
   if (logCallback) await logCallback('warning', 'checking_backend', `/api/health not available, trying root URL`);
   url = `${backendUrl.replace(/\/$/, '')}/`;
   response = await checkUrl(url, {}, 1, 0);

   if (response) {
       return { status: 'warning', endpoint: '/', message: 'Backend root URL is reachable, but /health was not found', statusCode: response.status };
   }

   return { status: 'failed', endpoint: null, message: 'Backend is unreachable after all attempts', statusCode: null };
};

export const checkFrontendHealth = async (frontendUrl, logCallback) => {
   const url = frontendUrl.replace(/\/$/, '');
   const response = await checkUrl(url, {}, MAX_RETRIES, RETRY_DELAY_MS, async (attempt, max) => {
       if (logCallback) await logCallback('info', 'checking_frontend', `Attempt ${attempt}/${max}: GET Frontend Root`);
   });

   if (!response) {
       return { status: 'failed', message: 'Frontend is unreachable after all attempts', statusCode: null };
   }

   if (response.ok) {
       const contentType = response.headers.get('content-type') || '';
       if (contentType.includes('text/html')) {
           return { status: 'passed', message: 'Frontend is reachable and returning HTML', statusCode: response.status };
       } else {
           return { status: 'warning', message: `Frontend is reachable but returned ${contentType} instead of text/html`, statusCode: response.status };
       }
   }

   return { status: 'failed', message: `Frontend returned error status ${response.status}`, statusCode: response.status };
};

export const checkCors = async (frontendUrl, backendUrl, logCallback) => {
    const cleanBackendUrl = backendUrl.replace(/\/$/, '');
    const cleanFrontendUrl = frontendUrl.replace(/\/$/, '');
    
    // We try to ping the root to see if CORS headers are present
    const url = `${cleanBackendUrl}/`; 
    
    try {
        if (logCallback) await logCallback('info', 'checking_full_stack', `Checking CORS headers for Origin: ${cleanFrontendUrl}`);
        
        const response = await fetch(url, {
            headers: { 'Origin': cleanFrontendUrl },
            signal: AbortSignal.timeout(5000)
        });
        
        const allowOrigin = response.headers.get('access-control-allow-origin');
        if (allowOrigin === '*' || allowOrigin === cleanFrontendUrl) {
            return { status: 'passed', message: 'CORS passed for frontend origin', frontendUrl: cleanFrontendUrl, backendUrl: cleanBackendUrl };
        } else {
            if (!allowOrigin) {
                return { status: 'warning', message: 'CORS header missing. Frontend may not be able to call backend.', frontendUrl: cleanFrontendUrl, backendUrl: cleanBackendUrl };
            }
            return { status: 'failed', message: `CORS header returned ${allowOrigin}, which does not match frontend.`, frontendUrl: cleanFrontendUrl, backendUrl: cleanBackendUrl };
        }
    } catch (e) {
        return { status: 'warning', message: `Failed to execute CORS check: ${e.message}`, frontendUrl: cleanFrontendUrl, backendUrl: cleanBackendUrl };
    }
};
