import net from "net";
import dns from "dns";
import { promisify } from "util";
import { isForbiddenIP } from "./validation.js";

const lookupAsync = promisify(dns.lookup);

export async function runPortCheck(monitor) {
  const host = monitor.target_host;
  const port = monitor.target_port;
  const timeoutMs = monitor.connect_timeout || 2000;
  const startTime = Date.now();

  try {
    // 1. Resolve DNS first
    let address = host;
    if (!net.isIP(host)) {
      const { address: resolvedIp } = await lookupAsync(host);
      address = resolvedIp;
    }

    // 2. SSRF check on the resolved IP
    if (isForbiddenIP(address)) {
      return {
        success: false,
        statusCode: null,
        cause: "ssrf_blocked",
        errorMessage: "Port check aborted: resolved IP points to an internal/private network.",
        responseTimeMs: Date.now() - startTime,
      };
    }

    // 3. Socket Connection using the Validated IP to prevent DNS Rebinding
    return await new Promise((resolve) => {
      const socket = new net.Socket();
      
      socket.setTimeout(timeoutMs);

      // We explicitly pass the validated `address` as host, NOT the original hostname
      socket.connect({ host: address, port }, () => {
        const timeTaken = Date.now() - startTime;
        socket.destroy(); // cleanup
        resolve({
          success: true,
          statusCode: null,
          responseTimeMs: timeTaken,
          errorMessage: null,
          cause: null,
        });
      });

      socket.on("timeout", () => {
        socket.destroy(); // cleanup
        resolve({
          success: false,
          statusCode: null,
          cause: "timeout",
          errorMessage: `Port connection timed out after ${timeoutMs}ms.`,
          responseTimeMs: Date.now() - startTime,
        });
      });

      socket.on("error", (err) => {
        socket.destroy(); // cleanup
        resolve({
          success: false,
          statusCode: null,
          cause: "connection_refused",
          errorMessage: `Port connection failed: ${err.message}`,
          responseTimeMs: Date.now() - startTime,
        });
      });
    });

  } catch (err) {
    // DNS resolution failure or other fatal errors
    return {
      success: false,
      statusCode: null,
      cause: "dns_error",
      errorMessage: `Failed to resolve host: ${err.message}`,
      responseTimeMs: Date.now() - startTime,
    };
  }
}
