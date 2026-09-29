import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

function key(): Buffer {
  const value = process.env.CALENDAR_FEED_KEY;
  if (!value || !/^[a-f\d]{64}$/i.test(value)) throw new Error("CALENDAR_FEED_KEY must be a 32-byte hex encryption key");
  return Buffer.from(value, "hex");
}
export function digestToken(token: string): string { return createHash("sha256").update(token).digest("hex"); }
export function tokenMatches(token: string, digest: string | null): boolean {
  const actual = Buffer.from(digestToken(token), "hex");
  const expected = Buffer.from(digest && /^[a-f\d]{64}$/i.test(digest) ? digest : "0".repeat(64), "hex");
  return timingSafeEqual(actual, expected) && digest !== null;
}
export function createCredential(publicId: string) {
  const token = randomBytes(32).toString("base64url");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(publicId));
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return { tokenDigest: digestToken(token), tokenCiphertext: ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".") };
}
export function decryptCredential(publicId: string, ciphertext: string): string {
  const [version, iv, tag, encrypted] = ciphertext.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Invalid credential format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(publicId));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
