import ConnectedAccount from '../../models/ConnectedAccount.js';
import { decryptSecret } from '../../utils/encryption.js';

export const getCloudflareToken = async (userId) => {
  const account = await ConnectedAccount.findOne({ userId, provider: 'cloudflare', status: 'connected' });
  if (!account) return null;
  return decryptSecret(account.accessTokenEncrypted);
};

export const cloudflareAPI = async (token, method, endpoint, body = null) => {
  const url = 'https://api.cloudflare.com/client/v4';
  
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${url}${endpoint}`, options);
  const text = await response.text();
  
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    if (!response.ok) {
      throw new Error(`Cloudflare API HTTP ${response.status}: ${text.substring(0, 100)}`);
    }
    return text;
  }
  
  if (!data.success) {
    const errMessage = data.errors?.map(e => e.message).join(', ') || `Cloudflare API Error ${response.status}`;
    throw new Error(errMessage);
  }
  
  return data.result;
};

export const validateCloudflareToken = async (token) => {
  try {
    const data = await cloudflareAPI(token, 'GET', '/user/tokens/verify');
    return data && data.status === 'active';
  } catch (error) {
    console.error("Cloudflare token validation error:", error);
    return false;
  }
};

export const getCloudflareZones = async (token) => {
  return cloudflareAPI(token, 'GET', '/zones?per_page=50');
};

export const findZoneByDomain = async (token, rootDomain) => {
  const zones = await cloudflareAPI(token, 'GET', `/zones?name=${rootDomain}`);
  return zones && zones.length > 0 ? zones[0] : null;
};

export const getDnsRecords = async (token, zoneId, params = '') => {
  const query = params ? `?${params}&per_page=100` : '?per_page=100';
  return cloudflareAPI(token, 'GET', `/zones/${zoneId}/dns_records${query}`);
};

export const createDnsRecord = async (token, zoneId, recordData) => {
  return cloudflareAPI(token, 'POST', `/zones/${zoneId}/dns_records`, recordData);
};

export const updateDnsRecord = async (token, zoneId, recordId, recordData) => {
  return cloudflareAPI(token, 'PUT', `/zones/${zoneId}/dns_records/${recordId}`, recordData);
};
