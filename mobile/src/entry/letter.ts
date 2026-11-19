/**
 * The letter that's "in the post" while a join request waits. The awaiting screen
 * remembers it on this phone; the first time the app is ready with a roster row in that
 * chapter (approved while open, or opened later), the root layout takes it and plays
 * "Join approved" once. Remembered locally on purpose: it's this phone's moment, and a
 * phone that never saw the envelope has nothing to open.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "chaptos.awaitingLetter";

export interface Letter {
  slug: string;
  name: string;
  logoUrl: string | null;
  /** YYYY-MM-DD or ISO. */
  requestedAt: string;
  submittedName: string;
}

export function rememberLetter(l: Letter): void {
  AsyncStorage.setItem(KEY, JSON.stringify(l)).catch(() => {});
}

export function forgetLetter(): void {
  AsyncStorage.removeItem(KEY).catch(() => {});
}

/** The remembered letter when one of `slugs` is its chapter (and forget it), else null. A letter for a chapter I'm not in stays. */
export async function takeLetter(slugs: string[]): Promise<Letter | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const l = JSON.parse(raw) as Letter;
    if (!slugs.includes(l.slug)) return null;
    await AsyncStorage.removeItem(KEY);
    return l;
  } catch {
    return null;
  }
}
