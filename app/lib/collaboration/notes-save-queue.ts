/** Serialized saves with generation-based acknowledgement and bounded backoff. */
export class NotesSaveQueue {
  generation = 0;
  acknowledged = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private maximum?: ReturnType<typeof setTimeout>;
  private running: Promise<void> | null = null;
  private failures = 0;
  private disposed = false;

  constructor(private save: (generation: number) => Promise<void>, private onError: (error: unknown) => void) {}
  get pending() { return this.generation > this.acknowledged; }

  changed(delay = 2000) {
    if (this.disposed) return;
    this.generation++;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush().catch(() => {}); }, delay);
    if (!this.maximum) this.maximum = setTimeout(() => { this.maximum = undefined; void this.flush().catch(() => {}); }, Math.max(5000, delay));
  }

  async flush(): Promise<void> {
    if (this.disposed) return;
    if (this.running) { await this.running; if (this.pending) await this.flush(); return; }
    clearTimeout(this.timer); clearTimeout(this.maximum); this.maximum = undefined;
    if (!this.pending) return;
    const generation = this.generation;
    this.running = this.save(generation).then(() => {
      this.acknowledged = generation; this.failures = 0;
    }).catch(error => {
      this.onError(error);
      const status = (error as { status?: number }).status;
      if (!this.disposed && (!status || status === 429 || status >= 500)) {
        const delay = Math.max((error as { retryAfter?: number }).retryAfter ?? 0, Math.min(30_000, 1000 * 2 ** this.failures++));
        this.timer = setTimeout(() => { void this.flush().catch(() => {}); }, delay + Math.random() * 300);
      }
      throw error;
    }).finally(() => { this.running = null; });
    await this.running;
    // An acknowledgement cannot clear changes made while the request ran.
    if (this.pending && !this.disposed) await this.flush();
  }

  dispose() { this.disposed = true; clearTimeout(this.timer); clearTimeout(this.maximum); }
}
