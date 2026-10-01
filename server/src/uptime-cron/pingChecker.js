import dns from 'dns';
import { promisify } from 'util';
import ping from 'ping';

const lookup = promisify(dns.lookup);

// IP range block list for SSRF prevention
const isPrivateOrLocalIP = (ip) => {
  // Check IPv4
  if (ip.includes('.')) {
    const parts = ip.split('.').map(Number);
    if (
      parts[0] === 10 || // 10.x.x.x
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || // 172.16-31.x.x
      (parts[0] === 192 && parts[1] === 168) || // 192.168.x.x
      parts[0] === 127 || // Loopback
      parts[0] === 0 || // 0.x.x.x
      (parts[0] === 169 && parts[1] === 254) || // Cloud metadata
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) // Carrier grade NAT
    ) {
      return true;
    }
  }
  
  // Check IPv6 (simplified check for localhost and unique local addresses)
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    if (
      lower === '::1' || 
      lower === '0:0:0:0:0:0:0:1' ||
      lower.startsWith('fc') || 
      lower.startsWith('fd') ||
      lower.startsWith('fe80')
    ) {
      return true;
    }
  }
  
  return false;
};

export async function runPingCheck(monitor) {
  const startTime = Date.now();
  let ipToPing = monitor.target_host;
  
  try {
    // 1. DNS Resolution (Prevents DNS rebinding and SSRF via Hostname)
    // If it's already an IP, dns.lookup just returns it.
    const { address } = await lookup(monitor.target_host);
    ipToPing = address;
    
    // 2. SSRF Validation
    if (isPrivateOrLocalIP(ipToPing)) {
      throw new Error(`Target resolved to a private/internal IP (${ipToPing}) which is not allowed.`);
    }

    // 3. Execution
    // ping package uses timeout in SECONDS
    const timeoutSeconds = Math.max(1, Math.floor((monitor.packet_timeout || 2000) / 1000));
    
    const result = await ping.promise.probe(ipToPing, {
      timeout: timeoutSeconds,
      min_reply: monitor.packet_count || 4,
    });

    const duration = Date.now() - startTime;

    if (!result.alive) {
      return {
        success: false,
        statusCode: null,
        responseTimeMs: duration,
        cause: "timeout",
        errorMessage: "Ping failed or timed out",
      };
    }

    // result.time can be 'unknown' on some platforms if it fails, but alive=true means it succeeded
    const pingTime = (result.time === 'unknown' || typeof result.time !== 'number') 
      ? duration 
      : Math.round(result.time);

    return {
      success: true,
      statusCode: null,
      responseTimeMs: pingTime,
      cause: null,
      errorMessage: null,
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      success: false,
      statusCode: null,
      responseTimeMs: duration,
      cause: "network_error",
      errorMessage: error.message || "Ping resolution or execution failed",
    };
  }
}
