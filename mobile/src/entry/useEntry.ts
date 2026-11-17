/**
 * Which part of the app someone may be in, from their session and what the
 * server says about them. The root layout guards each route group with it.
 *
 *   signed out                         → sign-in
 *   terms not accepted                 → terms wall (hard: no "not now")
 *   on no roster, a request pending    → awaiting approval
 *   on no roster, nothing pending      → paste your invite link
 *   otherwise                          → tabs
 */
import type { MeResponse, OwnJoinRequest } from "@/lib/api-types";
import { useAuth } from "~/auth";
import { useJoinRequests, useMe } from "~/data/hooks";

export type Entry =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "error"; error: Error; retry: () => void }
  | { kind: "terms"; me: MeResponse }
  | { kind: "join"; requests: OwnJoinRequest[] }
  | { kind: "awaiting"; request: OwnJoinRequest; requests: OwnJoinRequest[] }
  | { kind: "ready"; me: MeResponse };

export function useEntry(): Entry {
  const auth = useAuth();
  const signedIn = auth.status === "signedIn";
  const me = useMe(signedIn);
  const noRoster = signedIn && me.isSuccess && me.data === null;
  const requests = useJoinRequests(noRoster);

  if (auth.status === "loading") return { kind: "loading" };
  if (auth.status === "signedOut") return { kind: "signedOut" };

  // Last-known data (the persisted cache) keeps the app usable offline; an
  // error only stops someone when there's nothing to show.
  if (me.data) {
    const { terms } = me.data;
    if (terms.acceptedVersion !== terms.version) return { kind: "terms", me: me.data };
    return { kind: "ready", me: me.data };
  }
  if (me.isError) return { kind: "error", error: me.error, retry: () => void me.refetch() };
  if (!noRoster) return { kind: "loading" };

  if (requests.data) {
    const pending = requests.data.find(r => r.status === "pending");
    return pending ? { kind: "awaiting", request: pending, requests: requests.data } : { kind: "join", requests: requests.data };
  }
  if (requests.isError) return { kind: "error", error: requests.error, retry: () => void requests.refetch() };
  return { kind: "loading" };
}
