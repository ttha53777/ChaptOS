/**
 * supabase-js makes the PKCE verifier with crypto.getRandomValues and hashes it
 * with crypto.subtle.digest. Hermes has neither, and without them supabase-js
 * silently falls back to the weaker "plain" PKCE method. expo-crypto (in Expo
 * Go) provides both natively; install them only where they're missing.
 */
import * as ExpoCrypto from "expo-crypto";

type CryptoLike = {
  getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T;
  subtle?: { digest?: (algorithm: AlgorithmIdentifier, data: BufferSource) => Promise<ArrayBuffer> };
};

const g = globalThis as unknown as { crypto?: CryptoLike };
const target: CryptoLike = g.crypto ?? {};

if (!target.getRandomValues) {
  target.getRandomValues = <T extends ArrayBufferView | null>(array: T): T => {
    if (array) ExpoCrypto.getRandomValues(array as unknown as Uint8Array);
    return array;
  };
}

if (!target.subtle?.digest) {
  const digest = async (algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> => {
    const name = (typeof algorithm === "string" ? algorithm : algorithm.name).toUpperCase();
    if (name !== "SHA-256") throw new Error(`crypto shim: ${name} is not supported`);
    return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, data);
  };
  target.subtle = { ...(target.subtle ?? {}), digest };
}

// A browser's `crypto` is a getter-only global (assigning it throws); its methods were
// patched in place above if they were missing, which they aren't on the web.
if (!g.crypto) g.crypto = target;
