import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

export const MEMBER_DEVICE_COOKIE = "member_device";
const OTP_STEP_SECONDS = 30;

function getOtpEncryptionKey(): Buffer {
  const value = process.env.OTP_ENCRYPTION_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error("OTP_ENCRYPTION_KEY must be a 64-character hexadecimal key.");
  }
  return Buffer.from(value, "hex");
}

export function encryptOtpSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getOtpEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptOtpSecret(value: string): string {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("저장된 OTP 비밀키 형식이 올바르지 않습니다.");
  const decipher = createDecipheriv("aes-256-gcm", getOtpEncryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

function base32Decode(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of value.replace(/[=\s-]/g, "").toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index === -1) throw new Error("유효하지 않은 OTP 비밀키입니다.");
    bits += index.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

export function getTotp(secret: string, now = Date.now()): string {
  const counter = Math.floor(now / 1000 / OTP_STEP_SECONDS);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, "0");
}

export function verifyTotp(secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  return [-1, 0, 1].some((window) => {
    const expected = getTotp(secret, Date.now() + window * OTP_STEP_SECONDS * 1000);
    return timingSafeEqual(Buffer.from(code), Buffer.from(expected));
  });
}

export function createMemberDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashMemberDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
