"use client";

// Tiny client gate: hide the chat widget on auth-pre routes (/login, /pending-access)
// so it doesn't render before the user has access to the app's data.
import { usePathname } from "next/navigation";
import { ChatWidget } from "./ChatWidget";

const HIDDEN_PATHS = ["/login", "/pending-access"];

export function ChatWidgetGate() {
  const pathname = usePathname();
  if (!pathname || HIDDEN_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }
  return <ChatWidget />;
}
