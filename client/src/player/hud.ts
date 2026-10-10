/**
 * F3 debug line (position, grounded, speed, FPS, physics cost). Sits under the #help line of index.html.
 */
export class PlayerHud {
  private readonly debugEl: HTMLDivElement;
  private fpsFrames = 0;
  private fpsTime = 0;
  fps = 0;
  debugVisible: boolean;

  constructor(parent: HTMLElement, debugVisible: boolean) {
    this.debugVisible = debugVisible;
    this.debugEl = document.createElement('div');
    this.debugEl.id = 'player-debug';
    Object.assign(this.debugEl.style, {
      position: 'absolute', left: '8px', top: '34px', padding: '3px 7px', zIndex: '20',
      font: '12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', color: '#e8f0e8',
      background: 'rgba(0,0,0,0.55)', borderRadius: '4px', pointerEvents: 'none', whiteSpace: 'pre',
    } satisfies Partial<CSSStyleDeclaration>);
    this.debugEl.style.display = debugVisible ? 'block' : 'none';

    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    parent.appendChild(this.debugEl);
  }

  toggleDebug(): void {
    this.debugVisible = !this.debugVisible;
    this.debugEl.style.display = this.debugVisible ? 'block' : 'none';
  }

  tick(dt: number): void {
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
  }

  setDebugText(text: string): void {
    if (this.debugVisible) this.debugEl.textContent = text;
  }

  dispose(): void {
    this.debugEl.remove();
  }
}
