import { afterEach, describe, expect, it, vi } from "vitest";
import { NotesSaveQueue } from "@/app/lib/collaboration/notes-save-queue";

afterEach(() => vi.useRealTimers());
describe("notes save queue", () => {
  it("does not acknowledge typing that arrived while a save was in flight", async () => {
    let finish!: () => void;
    const save = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockResolvedValue(undefined);
    const queue = new NotesSaveQueue(save, vi.fn());
    queue.changed(); const saving = queue.flush(); queue.changed();
    expect(queue.acknowledged).toBe(0);
    finish(); await saving;
    expect(save.mock.calls.map(args => args[0])).toEqual([1, 2]);
    expect(queue.pending).toBe(false); queue.dispose();
  });
  it("retries a transient failure without another edit", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockRejectedValueOnce(new Error("Network")).mockResolvedValue(undefined);
    const queue = new NotesSaveQueue(save, vi.fn());
    queue.changed(); await expect(queue.flush()).rejects.toThrow("Network");
    await vi.advanceTimersByTimeAsync(1500);
    expect(save).toHaveBeenCalledTimes(2); expect(queue.pending).toBe(false); queue.dispose();
  });
  it("keeps a permanent rejection dirty without a retry loop", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
    const queue = new NotesSaveQueue(save, vi.fn()); queue.changed();
    await expect(queue.flush()).rejects.toThrow(); await vi.advanceTimersByTimeAsync(60_000);
    expect(save).toHaveBeenCalledTimes(1); expect(queue.pending).toBe(true); queue.dispose();
  });
});
