/**
 * The app's push deep links (mobile/src/push/links.ts): every path the server
 * sends (lib/events/handlers/push.ts) maps to a real app screen in the right org.
 */
import { describe, expect, it } from "vitest";
import { pushTarget } from "../../mobile/src/push/links";
import { pushUrl } from "@/lib/push/queue";

describe("pushTarget", () => {
  it("maps each server path to its screen", () => {
    const at = (path: string) => pushTarget(pushUrl("ok-today", path));
    expect(at("checkin")).toEqual({ slug: "ok-today", href: "/checkin" });
    expect(at("tasks/12")).toEqual({ slug: "ok-today", href: "/more/tasks?open=12" });
    expect(at("polls/4")).toEqual({ slug: "ok-today", href: "/more/tasks?poll=4" });
    expect(at("dues")).toEqual({ slug: "ok-today", href: "/more/dues" });
    expect(at("excuses")).toEqual({ slug: "ok-today", href: "/more/excuses" });
    expect(at("requests")).toEqual({ slug: "ok-today", href: "/members" });
    expect(at("today")).toEqual({ slug: "ok-today", href: "/today" });
  });

  it("falls back safely on odd input", () => {
    expect(pushTarget("https://evil.example/org/x/checkin")).toBeNull();
    expect(pushTarget(42)).toBeNull();
    expect(pushTarget("chaptos://org/ok-today/tasks/abc")).toEqual({ slug: "ok-today", href: "/more/tasks" });
    expect(pushTarget("chaptos://org/ok-today/whatever")).toEqual({ slug: "ok-today", href: "/today" });
  });
});
