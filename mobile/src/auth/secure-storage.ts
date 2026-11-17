/**
 * Supabase session storage on the device keychain / keystore.
 *
 * A Supabase session (access + refresh token + user) runs past the ~2 KB that
 * SecureStore is meant to hold per item, so values are split into chunks under
 * `<key>.0`, `<key>.1`, … with the chunk count under `<key>`. Keys are sanitised
 * to what SecureStore accepts ([A-Za-z0-9._-]).
 */
import * as SecureStore from "expo-secure-store";

const CHUNK = 1800;
const safe = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, "_");
const OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

async function removeChunks(key: string, from = 0) {
  const count = Number(await SecureStore.getItemAsync(key, OPTS)) || 0;
  for (let i = from; i < count; i++) await SecureStore.deleteItemAsync(`${key}.${i}`, OPTS);
}

export const secureStorage = {
  async getItem(raw: string): Promise<string | null> {
    const key = safe(raw);
    const count = Number(await SecureStore.getItemAsync(key, OPTS));
    if (!count) return null;
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`, OPTS);
      if (part == null) return null; // torn write: treat as signed out
      parts.push(part);
    }
    return parts.join("");
  },
  async setItem(raw: string, value: string): Promise<void> {
    const key = safe(raw);
    const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, "g")) ?? [""];
    await removeChunks(key, parts.length);
    for (let i = 0; i < parts.length; i++) await SecureStore.setItemAsync(`${key}.${i}`, parts[i]!, OPTS);
    await SecureStore.setItemAsync(key, String(parts.length), OPTS);
  },
  async removeItem(raw: string): Promise<void> {
    const key = safe(raw);
    await removeChunks(key);
    await SecureStore.deleteItemAsync(key, OPTS);
  },
};
