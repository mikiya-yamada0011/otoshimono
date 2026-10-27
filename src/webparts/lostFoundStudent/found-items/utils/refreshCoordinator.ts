/** Share simultaneous reads, and discard results started before a save. */
export class RefreshCoordinator<T> {
  private generation = 0;
  private pending?: Promise<void>;

  public constructor(private read: () => Promise<T>, private apply: (value: T) => void) {}

  public refresh(): Promise<void> {
    if (this.pending) return this.pending;
    const generation = this.generation;
    const pending = this.read().then(value => {
      if (generation === this.generation) this.apply(value);
    }).finally(() => {
      if (this.pending === pending) this.pending = undefined;
    });
    this.pending = pending;
    return pending;
  }

  public invalidate(): void {
    this.generation++;
    this.pending = undefined;
  }
}
