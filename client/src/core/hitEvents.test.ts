import { describe, expect, it } from 'vitest';
import { EventBus } from './hitEvents';

describe('EventBus', () => {
  it('delivers events to every subscriber', () => {
    const bus = new EventBus<number>();
    const a: number[] = [];
    const b: number[] = [];
    bus.on((n) => a.push(n));
    bus.on((n) => b.push(n * 2));
    bus.emit(3);
    expect(a).toEqual([3]);
    expect(b).toEqual([6]);
  });

  it('unsubscribe stops delivery and frees the listener', () => {
    const bus = new EventBus<number>();
    const seen: number[] = [];
    const off = bus.on((n) => seen.push(n));
    bus.emit(1);
    off();
    bus.emit(2);
    expect(seen).toEqual([1]);
    expect(bus.count).toBe(0);
  });

  it('a listener may unsubscribe itself while an event is being delivered', () => {
    const bus = new EventBus<number>();
    const seen: number[] = [];
    const off = bus.on((n) => {
      seen.push(n);
      off();
    });
    bus.on((n) => seen.push(n + 10));
    bus.emit(1);
    bus.emit(2);
    expect(seen).toEqual([1, 11, 12]);
  });
});
