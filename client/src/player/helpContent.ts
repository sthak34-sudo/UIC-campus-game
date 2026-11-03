/**
 * New-player help (UI-07 / UI-22). Pure text so it can be tested; the DOM lives in startHelp.ts.
 */

/** Three lines that say what the game is: shown at the start, fades after the first click or 15 s. */
export const START_CARD: readonly string[] = [
  'Loot up: grab a rifle, armor and meds',
  'Stay inside the circle',
  'Last squad standing wins',
];
export const START_CARD_SECONDS = 15;

/** Short top line. The full list is one key away. */
export const SHORT_HELP = 'WASD move · Mouse look · Left click shoot · E pick up · ? all controls';

/** Seconds after the player starts before the top line fades down. */
export const HELP_FADE_AFTER_S = 12;
export const HELP_FADED_OPACITY = 0.35;

const CONTROLS: readonly (readonly [string, string, boolean?])[] = [
  ['WASD', 'move'],
  ['Shift', 'sprint'],
  ['C', 'crouch'],
  ['Space', 'jump'],
  ['Mouse', 'look (click to capture)'],
  ['Left click', 'shoot'],
  ['Right click', 'aim (zoom)'],
  ['R', 'reload'],
  ['E', 'pick up'],
  ['Q', 'med kit'],
  ['B', 'bandage'],
  ['V', 'first / third person'],
  ['P', 'ping where you aim'],
  ['Hold F', 'revive a downed teammate'],
  ['← →', 'switch view while spectating'],
  ['?', 'show / hide this list'],
  ['H', 'hurt yourself (practice)', true],
  ['Z', 'skip zone', true],
  ['F3', 'debug line', true],
];

/** Full controls list; debug-only keys (H, Z, F3) only when debug keys are on. */
export function controlsList(debug: boolean): [string, string][] {
  return CONTROLS.filter((c) => debug || !c[2]).map((c) => [c[0], c[1]]);
}
