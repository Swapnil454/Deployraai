import dns from 'dns/promises';

function isPrivateIPv4(ip: string) {
  const parts = ip.split('.').map(Number);
  const [a, b] = parts;

  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a === 0
  );
}

function isBlockedHostname(hostname: string) {
  const h = hostname.toLowerCase();
  return h === 'localhost' || h.endsWith('.localhost') || h === '0.0.0.0';
}

export async function validateWebhookUrl(rawUrl: string): Promise<string> {
  const url = new URL(rawUrl);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP/HTTPS webhook URLs are allowed');
  }

  if (isBlockedHostname(url.hostname)) {
    throw new Error('Localhost webhook URLs are not allowed');
  }

  const records = await dns.lookup(url.hostname, { all: true });
  
  if (records.length === 0) {
    throw new Error('Could not resolve hostname');
  }

  // Find the first valid IPv4 or IPv6 address that is not private
  let safeIp: string | null = null;

  for (const record of records) {
    if (record.family === 4) {
      if (isPrivateIPv4(record.address)) {
        throw new Error('Private IP webhook targets are not allowed');
      }
      if (!safeIp) safeIp = record.address;
    }

    if (record.family === 6) {
      const ip = record.address.toLowerCase();
      if (
        ip === '::1' ||
        ip.startsWith('fc') ||
        ip.startsWith('fd') ||
        ip.startsWith('fe80')
      ) {
        throw new Error('Private IPv6 webhook targets are not allowed');
      }
      if (!safeIp) safeIp = `[${record.address}]`; // Wrap IPv6 in brackets for URL
    }
  }
  
  if (!safeIp) {
    throw new Error('No valid public IP found for webhook target');
  }

  return safeIp;
}
