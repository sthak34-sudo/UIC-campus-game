/**
 * Tiny typed event emitter for player events. Other modules listen with
 *   const off = player.events.on('interact', (e) => { ... });   // off() to unsubscribe
 */
export interface PlayerEvents {
  /** E pressed. `position` = feet, `facing` = unit XZ vector the camera looks along. */
  interact: { position: { x: number; y: number; z: number }; facing: { x: number; z: number } };
  /** Left the ground with a jump. */
  jump: { position: { x: number; y: number; z: number } };
  /** Touched the ground after being airborne. `fallSpeed` m/s (positive). */
  land: { position: { x: number; y: number; z: number }; fallSpeed: number };
  /** Camera mode switched (V). */
  cameraMode: { mode: 'third' | 'first' };
}

type Handler<T> = (e: T) => void;

export class Emitter<M extends object> {
  private handlers = new Map<keyof M, Set<Handler<never>>>();

  on<K extends keyof M>(type: K, fn: Handler<M[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => this.off(type, fn);
  }

  off<K extends keyof M>(type: K, fn: Handler<M[K]>): void {
    this.handlers.get(type)?.delete(fn as Handler<never>);
  }

  emit<K extends keyof M>(type: K, e: M[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        (fn as Handler<M[K]>)(e);
      } catch (err) {
        console.error(`player event "${String(type)}" handler failed`, err);
      }
    }
  }
}
