import type { MoveInput } from './math';

export interface InputActions {
  onToggleView(): void;
  onToggleDebug(): void;
  onInteract(): void;
  onReload(): void;
  onDebugHurt(): void;
  onUseMedkit(): void;
}

const MOVE_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight',
]);

/**
 * Keyboard + mouse. Click the game to capture the mouse (pointer lock); Esc releases it (browser).
 * Without pointer lock, dragging with the left button also looks around.
 * Tests can bypass the keyboard with `setOverride()`.
 */
export class InputController {
  private readonly keys = new Set<string>();
  private override: MoveInput | null = null;
  private jumpQueued = false;
  private fireQueued = false;
  /** When false, movement, look, and combat keys are ignored (death screen). */
  private controlsOn = true;
  private lookX = 0;
  private lookY = 0;
  private wheel = 0;
  private dragging = false;
  private readonly off: (() => void)[] = [];

  constructor(private readonly dom: HTMLElement, private readonly actions: InputActions) {
    const on = <K extends keyof WindowEventMap>(t: EventTarget, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      this.off.push(() => t.removeEventListener(type, fn as EventListener, opts));
    };
    on(window, 'keydown', (e) => this.keyDown(e));
    on(window, 'keyup', (e) => this.keys.delete(e.code));
    on(window, 'blur', () => this.keys.clear());
    on(dom, 'click', () => {
      if (document.pointerLockElement !== dom) {
        try {
          const r = dom.requestPointerLock?.() as unknown;
          if (r instanceof Promise) r.catch(() => {});
        } catch {
          /* pointer lock unavailable (e.g. sandboxed iframe): drag-to-look still works */
        }
      }
    });
    on(dom, 'mousedown', (e) => {
      if (e.button === 0) {
        this.dragging = true;
        if (this.controlsOn) this.fireQueued = true;
      }
    });
    on(window, 'mouseup', () => (this.dragging = false));
    on(window, 'mousemove', (e) => {
      if (document.pointerLockElement === dom || this.dragging) {
        this.lookX += e.movementX;
        this.lookY += e.movementY;
      }
    });
    on(dom, 'wheel', (e) => {
      this.wheel += e.deltaY;
      e.preventDefault();
    }, { passive: false });
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.dom;
  }

  get enabled(): boolean {
    return this.controlsOn;
  }

  /** Death screen turns controls off. Respawning turns them back on. */
  setEnabled(on: boolean): void {
    this.controlsOn = on;
    if (!on) {
      this.keys.clear();
      this.fireQueued = false;
      this.jumpQueued = false;
    }
  }

  /** Drops mouse and jump input accumulated while controls are off. */
  discardFrame(): void {
    this.fireQueued = false;
    this.jumpQueued = false;
    this.lookX = 0;
    this.lookY = 0;
    this.wheel = 0;
  }

  private keyDown(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (!this.controlsOn) return;
    if (MOVE_KEYS.has(e.code)) e.preventDefault(); // no page scrolling with space/arrows
    if (e.repeat) {
      this.keys.add(e.code);
      return;
    }
    this.keys.add(e.code);
    switch (e.code) {
      case 'Space':
        this.jumpQueued = true;
        break;
      case 'KeyV':
        this.actions.onToggleView();
        break;
      case 'F3':
        e.preventDefault();
        this.actions.onToggleDebug();
        break;
      case 'KeyE':
        this.actions.onInteract();
        break;
      case 'KeyR':
        this.actions.onReload();
        break;
      case 'KeyH':
        this.actions.onDebugHurt();
        break;
      case 'KeyQ':
        this.actions.onUseMedkit();
        break;
    }
  }

  /** Test hook: replaces the keyboard until `setOverride(null)`. `jump: true` triggers one jump. */
  setOverride(input: Partial<MoveInput> | null): void {
    if (!input) {
      this.override = null;
      return;
    }
    const base = this.override ?? { forward: 0, right: 0, run: false, jump: false };
    this.override = { ...base, ...input, jump: false };
    if (input.jump) this.jumpQueued = true;
  }

  /** Current movement intent. */
  read(): MoveInput {
    if (!this.controlsOn) return { forward: 0, right: 0, run: false, jump: false };
    if (this.override) return { ...this.override };
    const k = this.keys;
    const forward = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const right = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    return { forward, right, run: k.has('ShiftLeft') || k.has('ShiftRight'), jump: k.has('Space') };
  }

  /** Returns true once per jump press (consumed by the physics step). */
  consumeJump(): boolean {
    const j = this.jumpQueued && this.controlsOn;
    this.jumpQueued = false;
    return j;
  }

  /** True while F is held (revive). Works even when movement is disabled for downed crawl. */
  holdingRevive(): boolean {
    return this.keys.has('KeyF');
  }

  /** Raw key peek for adapters (debug / revive). */
  isKeyDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** True once per left click. Combat applies the fire-rate limit. */
  consumeFire(): boolean {
    const f = this.fireQueued && this.controlsOn;
    this.fireQueued = false;
    return f;
  }

  /** Accumulated mouse movement since the last call (pixels). */
  consumeLook(): { dx: number; dy: number } {
    const r = { dx: this.lookX, dy: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return r;
  }

  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off.length = 0;
  }
}
