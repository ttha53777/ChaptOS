"use client";

// Tiny client gate: the chat widget needs an org context (it calls the
// cookie-scoped /api/ai/chat). Render it only when the user is signed in AND
// resolved into an org — i.e. inside the /[slug] app. This keeps it off every
// platform/pre-org route (/login, /welcome, /pending-access, the root redirect)
// without maintaining a denylist that drifts as routes are added.
import { useChapter } from "../context/ChapterContext";
import { ChatWidget } from "./ChatWidget";

export function ChatWidgetGate() {
  const { currentUser } = useChapter();
  if (!currentUser?.org) return null;
  return <ChatWidget />;
}
