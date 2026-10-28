/**
 * Placement / victory overlay (S5). Thin DOM adapter; copy comes from matchSetup.
 */
import { localPlacementLine, localSquadWon } from './matchSetup';
import type { SquadId, SquadMatchState } from './types';

export class PlacementScreen {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly sub: HTMLDivElement;
  private visible = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'squad-placement';
    Object.assign(this.root.style, {
      position: 'absolute',
      inset: '0',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: '10px',
      background: 'rgba(4,8,14,0.62)',
      color: '#f4f7f4',
      fontFamily: 'system-ui, sans-serif',
      zIndex: '30',
      pointerEvents: 'none',
      textAlign: 'center',
      textShadow: '0 2px 8px #000',
    } satisfies Partial<CSSStyleDeclaration>);
    this.title = document.createElement('div');
    this.title.style.cssText = 'font-size:42px;font-weight:700;letter-spacing:0.02em';
    this.sub = document.createElement('div');
    this.sub.style.cssText = 'font-size:16px;opacity:0.9';
    const hint = document.createElement('div');
    hint.style.cssText = 'margin-top:12px;font-size:13px;opacity:0.7';
    hint.textContent = 'Left / Right cycle spectate · Esc closes';
    this.root.append(this.title, this.sub, hint);
    parent.appendChild(this.root);
  }

  /**
   * Show when the local squad is wiped or has won. Hide while the squad is still in.
   */
  update(state: SquadMatchState, localSquad: SquadId): void {
    const squad = state.squads[localSquad];
    if (!squad) {
      this.hide();
      return;
    }
    const won = localSquadWon(state, localSquad);
    const wiped = squad.eliminated;
    if (!won && !wiped) {
      this.hide();
      return;
    }
    const line = localPlacementLine(squad.placement, state.squadsAlive, won);
    this.title.textContent = won ? 'Victory' : 'Squad eliminated';
    this.sub.textContent = line ?? (wiped ? `Placement #${squad.placement}` : '');
    this.root.style.display = 'flex';
    this.visible = true;
  }

  isVisible(): boolean {
    return this.visible;
  }

  hide(): void {
    this.root.style.display = 'none';
    this.visible = false;
  }

  dispose(): void {
    this.root.remove();
  }
}
