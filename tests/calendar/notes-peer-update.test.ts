import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { applyPeerUpdate } from "@/app/lib/collaboration/notes-peer-update";
import { loadNotes } from "@/lib/collaboration/notes-document";

describe("untrusted peer updates", () => {
  it("rejects embedded content without poisoning the live document", () => {
    const live = new Y.Doc();
    const peer = new Y.Doc();
    live.getText("notes").insert(0, "Safe minutes");
    peer.getText("notes").insertEmbed(0, { html: "unsafe" });
    expect(() => applyPeerUpdate(live, Y.encodeStateAsUpdate(peer), "peer")).toThrow();
    expect(live.getText("notes").toString()).toBe("Safe minutes");
    live.destroy(); peer.destroy();
  });

  it("rejects map data disguised as the notes root on client and server", () => {
    const live = new Y.Doc();
    const peer = new Y.Doc();
    peer.getMap("notes").set("hidden", "payload");
    const update = Y.encodeStateAsUpdate(peer);
    expect(() => applyPeerUpdate(live, update, "peer")).toThrow();
    expect(() => loadNotes(update)).toThrow("plain text");
    live.destroy(); peer.destroy();
  });

  it("accepts causal deltas out of order but requires complete HTTP snapshots", () => {
    const live = new Y.Doc(); live.getText("notes");
    const peer = new Y.Doc();
    peer.getText("notes").insert(0, "First ");
    const first = Y.encodeStateAsUpdate(peer);
    const vector = Y.encodeStateVector(peer);
    peer.getText("notes").insert(6, "second");
    const second = Y.encodeStateAsUpdate(peer, vector);
    expect(() => loadNotes(second)).toThrow("Incomplete");
    applyPeerUpdate(live, second, "peer");
    applyPeerUpdate(live, first, "peer");
    expect(live.getText("notes").toString()).toBe("First second");
    live.destroy(); peer.destroy();
  });
});
