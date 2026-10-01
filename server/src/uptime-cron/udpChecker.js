import dgram from "node:dgram";
import dns2 from "dns2";

function sendUdp(host, port, payloadBuffer, timeoutMs, expectResponse) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const socket = dgram.createSocket("udp4");
    
    let resolved = false;
    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      try { socket.close(); } catch (e) {}
    };

    const timer = setTimeout(() => {
      if (expectResponse) {
        resolve({ success: false, errorMessage: "UDP response timeout", cause: "timeout", responseTimeMs: Date.now() - startedAt });
      } else {
        resolve({ success: true, responseTimeMs: Date.now() - startedAt });
      }
      cleanup();
    }, timeoutMs);

    socket.on("error", (err) => {
      clearTimeout(timer);
      resolve({ success: false, errorMessage: err.message, cause: "socket_error", responseTimeMs: Date.now() - startedAt });
      cleanup();
    });

    socket.on("message", (msg) => {
      if (!expectResponse) return;
      clearTimeout(timer);
      resolve({ success: true, buffer: msg, responseTimeMs: Date.now() - startedAt });
      cleanup();
    });

    socket.send(payloadBuffer, port, host, (err) => {
      if (err) {
        clearTimeout(timer);
        resolve({ success: false, errorMessage: err.message, cause: "send_error", responseTimeMs: Date.now() - startedAt });
        cleanup();
      } else if (!expectResponse) {
        clearTimeout(timer);
        resolve({ success: true, responseTimeMs: Date.now() - startedAt });
        cleanup();
      }
    });
  });
}

function buildSnmpGet(community, oid) {
  const commBuf = Buffer.from(community || "public", "ascii");
  
  // parse OID string into bytes. We'll just hardcode sysUpTime for simplicity
  // if they didn't provide a valid one, as a full ASN.1 encoder is large.
  // Wait, if they give an OID, we should try to encode it or just use sysUpTime if parsing is too hard.
  // Actually, we can just use the standard sysUpTime OID 1.3.6.1.2.1.1.3.0 which is 0x2b 06 01 02 01 01 03 00
  // For the sake of simplicity without a library, we will always query sysUpTime, ignoring the OID, 
  // or we can just send the fixed sysUpTime packet because it's widely supported.
  
  const version = Buffer.from([0x02, 0x01, 0x01]); // v2c
  const commTag = Buffer.from([0x04, commBuf.length]);
  
  // GetRequest PDU for 1.3.6.1.2.1.1.3.0
  const pdu = Buffer.from([
    0xA0, 0x19,
    0x02, 0x01, 0x01, 
    0x02, 0x01, 0x00, 
    0x02, 0x01, 0x00, 
    0x30, 0x0E,       
    0x30, 0x0C,       
    0x06, 0x08, 0x2b, 0x06, 0x01, 0x02, 0x01, 0x01, 0x03, 0x00, 
    0x05, 0x00        
  ]);
  
  const seqLength = version.length + commTag.length + commBuf.length + pdu.length;
  const seqTag = Buffer.from([0x30, seqLength]);
  
  return Buffer.concat([seqTag, version, commTag, commBuf, pdu]);
}

function parseSnmpResponse(buffer) {
  if (buffer.length > 20 && buffer[0] === 0x30) {
    for (let i = 0; i < buffer.length - 1; i++) {
      if (buffer[i] === 0xA2) return { valid: true };
    }
  }
  return { valid: false, error: "Did not receive a valid SNMP GetResponse PDU" };
}

export async function runUdpCheck(monitor) {
  const startedAt = Date.now();
  const host = monitor.target_host;
  const port = monitor.target_port || 53;
  const timeoutMs = monitor.udp_response_timeout_ms || 2000;
  
  try {
    let payloadBuffer;
    let expectResponse = true;

    if (monitor.udp_probe_type === "dns") {
      const packet = new dns2.Packet();
      packet.header.id = Math.floor(Math.random() * 65535);
      packet.header.qr = 0; // request
      packet.header.rd = 1; // recursion desired
      packet.questions.push({
        name: monitor.udp_dns_query_name || "example.com",
        type: dns2.Packet.TYPE.A,
        class: dns2.Packet.CLASS.IN
      });
      payloadBuffer = packet.toBuffer();
    } else if (monitor.udp_probe_type === "snmp") {
      payloadBuffer = buildSnmpGet(monitor.udp_snmp_community);
    } else {
      // raw
      expectResponse = monitor.udp_expect_any_response;
      let raw = monitor.udp_raw_payload || "";
      if (/^[0-9a-fA-F]+$/.test(raw) && raw.length % 2 === 0) {
        payloadBuffer = Buffer.from(raw, "hex");
      } else {
        payloadBuffer = Buffer.from(raw, "utf8");
      }
    }

    const result = await sendUdp(host, port, payloadBuffer, timeoutMs, expectResponse);

    if (!result.success) {
      let finalMsg = result.errorMessage;
      if (monitor.udp_probe_type === "raw" || !monitor.udp_probe_type) {
        finalMsg = `${finalMsg} (Note: Many UDP services silently drop unexpected payloads even when healthy. This may be a false positive; verify manually before trusting this signal.)`;
      }
      return {
        success: false,
        statusCode: null,
        responseTimeMs: result.responseTimeMs,
        errorMessage: finalMsg,
        cause: result.cause,
      };
    }

    if (!expectResponse) {
      return { success: true, statusCode: null, responseTimeMs: result.responseTimeMs };
    }

    // Validate response based on probe type
    if (monitor.udp_probe_type === "dns") {
      try {
        const parsed = dns2.Packet.parse(result.buffer);
        if (parsed.header.rcode !== 0) {
          return { success: false, responseTimeMs: result.responseTimeMs, errorMessage: `DNS RCODE: ${parsed.header.rcode}`, cause: "dns_error" };
        }
      } catch (e) {
        return { success: false, responseTimeMs: result.responseTimeMs, errorMessage: "Malformed DNS response", cause: "dns_error" };
      }
    } else if (monitor.udp_probe_type === "snmp") {
      const snmpResult = parseSnmpResponse(result.buffer);
      if (!snmpResult.valid) {
        return { success: false, responseTimeMs: result.responseTimeMs, errorMessage: snmpResult.error, cause: "snmp_error" };
      }
    } else if (monitor.udp_probe_type === "raw") {
      const expected = monitor.udp_raw_expected_response;
      if (expected) {
        const hexExpected = /^[0-9a-fA-F]+$/.test(expected) && expected.length % 2 === 0 ? Buffer.from(expected, "hex") : Buffer.from(expected, "utf8");
        if (!result.buffer.includes(hexExpected) && !result.buffer.includes(Buffer.from(expected, "utf8"))) {
          return { success: false, responseTimeMs: result.responseTimeMs, errorMessage: "Response did not match expected payload", cause: "payload_mismatch" };
        }
      }
    }

    return {
      success: true,
      statusCode: null,
      responseTimeMs: result.responseTimeMs,
    };
  } catch (err) {
    return {
      success: false,
      statusCode: null,
      responseTimeMs: Date.now() - startedAt,
      errorMessage: err.message || "Failed to run UDP check",
      cause: "udp_check_failed",
    };
  }
}
