import dns from "node:dns/promises";
import pLimit from "p-limit";
import { isForbiddenIP } from "./validation.js";

// Global concurrency cap for authoritative queries to protect upstream infrastructure.
// Note for future scaling: If DeployAI scales to multiple worker instances, this process-local
// cap should be replaced with a distributed semaphore (e.g., via Redis) to coordinate the limit globally.
export const authoritativeLimit = pLimit(10);

function formatDnsError(err) {
  if (err.code === "ENOTFOUND") return { cause: "NXDOMAIN", errorMessage: "Domain does not exist (NXDOMAIN)." };
  if (err.code === "ENODATA") return { cause: "ENODATA", errorMessage: "Domain exists but has no records of the requested type (ENODATA)." };
  if (err.code === "SERVFAIL") return { cause: "SERVFAIL", errorMessage: "Server failed to resolve the request (SERVFAIL)." };
  if (err.code === "ETIMEDOUT") return { cause: "ETIMEDOUT", errorMessage: "DNS resolver timed out or is unreachable (ETIMEDOUT)." };
  return { cause: "DNS_ERROR", errorMessage: err.message || "Unknown DNS error." };
}

function normalizeDnsValues(values) {
  if (!values) return [];
  return values.map(v => typeof v === 'string' ? v.toLowerCase().replace(/\.$/, "") : String(v)).sort();
}

function extractRecordValues(records, type) {
  if (!records || !Array.isArray(records)) return [];
  // `dns.promises.resolve*` can return arrays of strings (A, AAAA, NS, CNAME)
  // or arrays of objects (MX: { priority, exchange }, SOA: { nsname, hostmaster, ... }, TXT: array of arrays of strings)
  return records.map(record => {
    if (typeof record === 'string') return record;
    if (type === 'MX' && record.exchange) return `${record.priority} ${record.exchange}`;
    if (type === 'TXT' && Array.isArray(record)) return record.join('');
    if (type === 'SOA' && record.nsname) return `${record.nsname} ${record.hostmaster} ${record.serial} ${record.refresh} ${record.retry} ${record.expire} ${record.minttl}`;
    return JSON.stringify(record); // Fallback
  });
}

function compareDns(returned, expected, mode) {
  const normReturned = normalizeDnsValues(returned);
  const normExpected = normalizeDnsValues(expected);

  if (mode === 'exact_set') {
    if (normReturned.length !== normExpected.length) return false;
    for (let i = 0; i < normReturned.length; i++) {
      if (normReturned[i] !== normExpected[i]) return false;
    }
    return true;
  }
  
  if (mode === 'contains') {
    return normExpected.every(exp => normReturned.includes(exp));
  }
  
  if (mode === 'any_match') {
    return normExpected.some(exp => normReturned.includes(exp));
  }
  
  return false;
}

export async function runDnsCheck(monitor) {
  const start = performance.now();
  const hostname = monitor.dns_hostname;
  const type = monitor.dns_record_type;
  const expected = monitor.dns_expected_values || [];
  const mode = monitor.dns_match_mode || 'exact_set';
  const resolverMode = monitor.dns_resolver_mode || 'authoritative';
  
  try {
    let resolver = dns;
    let queryFn = async () => resolver.resolve(hostname, type);
    
    if (resolverMode === 'public_resolver') {
      const publicResolver = new dns.Resolver();
      publicResolver.setServers([monitor.dns_custom_resolver_ip || '8.8.8.8']);
      resolver = publicResolver;
      queryFn = async () => resolver.resolve(hostname, type);
    } else if (resolverMode === 'authoritative') {
      // Authoritative mode requires two steps, protected by concurrency limit
      queryFn = () => authoritativeLimit(async () => {
        const publicResolver = new dns.Resolver();
        publicResolver.setServers(['8.8.8.8']);
        
        let nsRecords;
        try {
          nsRecords = await publicResolver.resolveNs(hostname);
        } catch (nsErr) {
          if (nsErr.code === 'ENODATA' || nsErr.code === 'ENOTFOUND') {
            // Traverse up to find authoritative NS (simplification: fail gracefully if not found on domain directly)
            throw nsErr;
          }
          throw nsErr;
        }

        if (!nsRecords || nsRecords.length === 0) {
          const err = new Error("No NS records found to perform authoritative lookup");
          err.code = "ENODATA";
          throw err;
        }

        let lastErr = null;
        // Try up to 2 NS servers for redundancy
        const nsServersToTry = nsRecords.slice(0, 2);
        
        for (const ns of nsServersToTry) {
          try {
            // Resolve the IP of the NS
            const nsIps = await publicResolver.resolve4(ns);
            if (!nsIps || nsIps.length === 0) continue;
            
            const nsIp = nsIps[0];
            if (isForbiddenIP(nsIp)) {
              console.warn(`[DNS] SSRF attempt detected: NS ${ns} resolved to forbidden IP ${nsIp}. Skipping.`);
              continue;
            }

            const authResolver = new dns.Resolver();
            authResolver.setServers([nsIp]);
            
            // Execute the actual query against the authoritative server
            return await authResolver.resolve(hostname, type);
          } catch (err) {
            lastErr = err;
            // ETIMEDOUT, SERVFAIL, or ENOTFOUND/ENODATA means we should try the next NS
            if (err.code !== 'ETIMEDOUT' && err.code !== 'SERVFAIL' && err.code !== 'ENOTFOUND' && err.code !== 'ENODATA') {
              throw err; // Real domain error, bubble it up
            }
            console.warn(`[DNS] Authoritative query failed against NS ${ns} with ${err.code}. Falling back to next NS...`);
          }
        }
        
        // If we exhausted our retries and only had timeouts/servfails, bubble the last one
        throw lastErr || new Error("Authoritative NS lookup failed");
      });
    }

    const records = await queryFn();
    const responseTimeMs = Math.round(performance.now() - start);
    
    const returnedValues = extractRecordValues(records, type);
    const isMatch = compareDns(returnedValues, expected, mode);
    
    if (isMatch) {
      return {
        success: true,
        responseTimeMs,
        cause: null,
        errorMessage: null,
        statusCode: null,
        headersSnapshot: {},
        isSlow: false
      };
    } else {
      return {
        success: false,
        responseTimeMs,
        cause: "VALUE_MISMATCH",
        errorMessage: `DNS record values did not match expected values (Mode: ${mode}). Returned: [${returnedValues.join(', ')}]`,
        statusCode: null,
        headersSnapshot: {},
        isSlow: false
      };
    }

  } catch (error) {
    const responseTimeMs = Math.round(performance.now() - start);
    const { cause, errorMessage } = formatDnsError(error);
    
    return {
      success: false,
      responseTimeMs,
      cause,
      errorMessage,
      statusCode: null,
      headersSnapshot: {},
      isSlow: false
    };
  }
}
