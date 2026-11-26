/**
 * Settings → Identity as words and rules: the vocabulary groups and suggestions, the
 * Instagram handle rule, the icon limits, and every sentence the page says. Pure,
 * shared by the web section (app/org/[slug]/settings/sections/IdentitySection.tsx)
 * and the native app (mobile/src/settings/Identity.tsx).
 */
import { DEFAULT_LABELS, VOCAB_KEYS, type VocabKey, type VocabOverrides } from "@/lib/vocab-keys";

export type WordTone = "lilac" | "mint" | "butter";

export const WORD_GROUPS: { label: string; tone: WordTone; keys: VocabKey[] }[] = [
  { label: "People", tone: "lilac",  keys: ["Member", "Admin", "Role"] },
  { label: "Pages",  tone: "mint",   keys: ["Treasury", "Meetings", "Service", "Dues", "Attendance", "Announcement", "Doc"] },
  { label: "Time",   tone: "butter", keys: ["Period", "Event"] },
];

export const PICKS: Record<VocabKey, string[]> = {
  Member: ["Brother", "Sister", "Sibling", "Player"], Admin: ["Officer", "Exec", "Board"], Role: ["Position", "Office", "Chair"],
  Treasury: ["Finances", "Budget"], Dues: ["Fees", "Contributions"], Meetings: ["Chapter", "Sessions", "Board"],
  Service: ["Philanthropy", "Volunteering"], Attendance: ["Check-in", "Roll call"], Announcement: ["Bulletin", "Update"],
  Doc: ["File", "Resource"], Period: ["Term", "Quarter", "Season"], Event: ["Session", "Practice"],
};

// Only the keys whose reach isn't obvious from the word itself.
export const WHERE: Partial<Record<VocabKey, string>> = {
  Member: "Sidebar, roster, member cards",
  Treasury: "Sidebar & page title",
  Meetings: "Sidebar & page title",
  Service: "Sidebar & page title",
};

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const WORD_MAX = 40;
export const HANDLE_MAX = 31;
export const cleanHandle = (h: string) => h.trim().replace(/^@+/, "");
export const handleOk = (h: string) => /^[A-Za-z0-9._]{0,30}$/.test(h);

/** The badge shows the draft handle to an editor (it's a live preview) and the
 *  saved one to everyone else. Empty or invalid reads as none. */
export function savedOrDraftHandle(editing: boolean, draft: string, saved: string): string {
  const h = editing ? draft : saved;
  return h && handleOk(h) ? h : "";
}

/** The draft's words with blanks dropped: what the previews read, and what Save sends. */
export function liveWordsOf(words: VocabOverrides): VocabOverrides {
  const o: VocabOverrides = {};
  for (const k of VOCAB_KEYS) { const v = (words[k] ?? "").trim(); if (v) o[k] = v; }
  return o;
}

/** The keys whose word differs from what's saved. */
export function changedWordsOf(words: VocabOverrides, saved: VocabOverrides): VocabKey[] {
  return VOCAB_KEYS.filter(k => (words[k] ?? "").trim() !== (saved[k] ?? "").trim());
}

/** The save bar's list: "new icon", "Instagram", "“Sister”" or "3 words". */
export function changesOf(o: {
  logo: "same" | "new" | "removed"; savedLogo: boolean; handleChanged: boolean; changedWords: VocabKey[]; words: VocabOverrides;
}): string[] {
  const changes: string[] = [];
  if (o.logo === "new") changes.push("new icon");
  if (o.logo === "removed" && o.savedLogo) changes.push("icon removed");
  if (o.handleChanged) changes.push("Instagram");
  const n = o.changedWords.length;
  if (n === 1) { const k = o.changedWords[0]!; changes.push(`“${(o.words[k] ?? "").trim() || DEFAULT_LABELS[k]}”`); }
  else if (n > 1) changes.push(`${n} words`);
  return changes;
}

export const IDENTITY_COPY = {
  readOnly: "You can see how your chapter is set up. Officers with Org settings can change it.",
  nameNote: "The name and web address were set when the chapter was created and can't be changed here yet.",
  noInstagram: "No Instagram",
  iconTitle: "Your icon",
  iconSub: "The little picture people recognize your chapter by. Without one we use your initials.",
  iconHint: ["Drop an image here", "or click to choose", "Square works best · PNG, JPG or SVG · up to 2 MB"],
  showsUpIn: "Shows up in",
  places: [
    { title: "The sidebar", sub: "Top left, for everyone" },
    { title: "Sign-in & invites", sub: "The first thing new people see" },
    { title: "Chapter switcher", sub: "For people in more than one" },
  ],
  anotherChapter: "Another chapter",
  igTitle: "Instagram",
  igSub: "The account your Media page plans posts for. Leave it empty if you don't have one.",
  igLabel: "Account handle",
  igPlaceholder: "yourchapter",
  igHelp: "Letters, numbers, dots and underscores.",
  igBad: "Only letters, numbers, dots and underscores, up to 30.",
  igPreviewKicker: "On your Media page",
  igHidden: "Hidden — no account linked",
  wordsTitle: "Your words",
  wordsSubEdit: "Call things what your chapter calls them. Type your own or tap a suggestion. Empty means we use our word.",
  wordsSubRead: "What this chapter calls things across the app.",
  alsoKicker: "Also in here",
  saved: "Saved — the whole chapter sees it now.",
  forbidden: "You need the Org settings permission to change this.",
  failed: "Couldn't save your changes. Try again.",
  iconFailed: "Couldn't save the icon. Try again.",
  notImage: "That isn't an image. Try a PNG, JPG or SVG.",
  tooBig: "That image is over 2 MB. Try a smaller one.",
  refreshed: "Refreshed.",
  refreshFailed: "Couldn't refresh. Check your connection and try again.",
} as const;

/** "1 change" / "3 changes". */
export const changeCount = (n: number) => (n === 1 ? "1 change" : `${n} changes`);
