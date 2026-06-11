import crypto from "crypto";

// Ensure the secret is exactly 32 bytes (256 bits) for aes-256-cbc.
// If SERVER_SECRET_KEY is not set or not 32 bytes, we throw or pad/truncate it in production.
// For MVP, we'll hash whatever is provided to guarantee 32 bytes.
const getSecretKey = () => {
  const secret = process.env.SERVER_SECRET_KEY || "fallback_secret_for_local_dev_only";
  return crypto.createHash("sha256").update(String(secret)).digest("base64").substr(0, 32);
};

const ENCRYPTION_KEY = getSecretKey();
const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;

export const encryptSecret = (text) => {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
};

export const decryptSecret = (text) => {
  if (!text) return null;
  const textParts = text.split(":");
  const iv = Buffer.from(textParts.shift(), "hex");
  const encryptedText = Buffer.from(textParts.join(":"), "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
};
