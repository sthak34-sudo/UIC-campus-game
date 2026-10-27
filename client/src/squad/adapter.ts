/**
 * Squad wiring (S3 + S4 HUD). Owns match state, bot capsule bodies, crawl/revive
 * input, debug keys, combat bridge, team panel / markers / pings. Pure rules stay
 * in the other squad modules.
 */
import * as THREE from 'three';
import type { CombatMount, CombatSquadBridge } from '../combat';
import { createCombatant, takeDirectDamage, type Combatant } from '../combat/health';
import type { World } from '../core/world';
import type { Player } from '../player';
import { PLAYER_CONFIG } from '../player/config';
import type { ZoneMount } from '../zone';
import { DOWN } from './balance';
import { botIntent, stepToward } from './bots';
import { applyDamage } from './downed';
import { canDamage } from './friendlyFire';
import { SquadHud } from './hud';
import { placePing, tickPings, type Ping } from './pings';
import { createMatch } from './roster';
import { step, type PlayerInput } from './step';
import type { PlayerId, SquadEvent, SquadMatchState } from './types';

export type SquadMode = 'bots' | 'solo';

export interface SquadMount {
  dispose(): void;
  getState(): SquadMatchState;
  getMode(): SquadMode;
}

export function parseSquadOptions(search: string): { mode: SquadMode; bleedFast: boolean } {
  const q = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  // Default solo (main behavior). Only an explicit ?squad=bots turns bots on.
  const raw = (q.get('squad') ?? 'solo').toLowerCase();
  const mode: SquadMode = raw === 'bots' ? 'bots' : 'solo';
  const bleed = q.get('bleedFast');
  return { mode, bleedFast: bleed === '1' || bleed === 'true' };
}

const BOT_COLORS = [0xe8a317, 0x3b82f6, 0x22c55e];
const CRAWL_EYE = 0.5;
const CRAWL_PIVOT = 0.45;
const NORMAL_EYE = PLAYER_CONFIG.eyeHeight;
const NORMAL_PIVOT = PLAYER_CONFIG.camPivotHeight;
const CRAWL_SCALE = DOWN.crawlSpeed / PLAYER_CONFIG.walkSpeed;

interface BotBody {
  id: PlayerId;
  root: THREE.Group;
}

/**
 * Mount squad mode. Default / missing / `?squad=solo` is a no-op (main behavior).
 * Only `?squad=bots` spawns 3 bot teammates that follow and revive.
 * Combat damage goes through applyDamage.
 */
export function mountSquad(opts: {
  world: World;
  player: Player | null;
  camera: THREE.PerspectiveCamera;
  combat: CombatMount;
  search: string;
  /** Optional zone mount so teammate / ping dots land on the minimap (S4). */
  zone?: ZoneMount | null;
}): SquadMount | null {
  const { mode, bleedFast } = parseSquadOptions(opts.search);
  if (mode === 'solo') return null;

  const player = opts.player;
  let state = createMatch(
    [{ id: 'A', names: ['You', 'Bot1', 'Bot2', 'Bot3'], bots: [false, true, true, true] }],
    1,
  );
  const playerId: PlayerId = 'p0';
  const botIds = state.squads.A!.members.filter((id) => id !== playerId);

  // Place bots near the player (or world spawn for viewpoint screenshots).
  const spawn = (player ? player.position : opts.world.spawn).clone();
  const offsets = [
    { x: 3, z: 2 },
    { x: -3, z: 2 },
    { x: 0, z: 4 },
  ];
  for (let i = 0; i < botIds.length; i++) {
    const id = botIds[i]!;
    const o = offsets[i] ?? { x: 2 + i, z: 2 };
    const m = state.members[id]!;
    state = {
      ...state,
      members: {
        ...state.members,
        [id]: { ...m, pos: { x: spawn.x + o.x, y: spawn.y, z: spawn.z + o.z } },
      },
    };
  }
  // Sync player pos.
  state = {
    ...state,
    members: {
      ...state.members,
      [playerId]: {
        ...state.members[playerId]!,
        pos: { x: spawn.x, y: spawn.y, z: spawn.z },
      },
    },
  };

  const bots: BotBody[] = [];
  const bodyGeom = new THREE.CapsuleGeometry(0.28, 0.9, 4, 8);
  const headGeom = new THREE.SphereGeometry(0.18, 12, 10);
  for (let i = 0; i < botIds.length; i++) {
    const id = botIds[i]!;
    const m = state.members[id]!;
    const root = new THREE.Group();
    root.name = `squad-bot-${id}`;
    const suit = new THREE.MeshStandardMaterial({
      color: BOT_COLORS[i % BOT_COLORS.length]!,
      roughness: 0.85,
      metalness: 0,
    });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc4a574, roughness: 0.7, metalness: 0 });
    const body = new THREE.Mesh(bodyGeom, suit);
    body.position.y = 0.95;
    body.castShadow = true;
    const head = new THREE.Mesh(headGeom, skin);
    head.position.y = 1.7;
    head.castShadow = true;
    root.add(body, head);
    root.position.set(m.pos.x, m.pos.y, m.pos.z);
    opts.world.scene.add(root);
    bots.push({ id, root });
  }

  // Viewpoint for screenshots (no player). Camera looks at the three bot capsules.
  {
    const n = Math.max(1, bots.length);
    let mx = 0, my = 0, mz = 0;
    for (const b of bots) {
      mx += b.root.position.x;
      my += b.root.position.y;
      mz += b.root.position.z;
    }
    mx /= n; my /= n; mz /= n;
    opts.world.addViewpoint('s3-squad', {
      position: new THREE.Vector3(mx + 6, my + 2.2, mz + 8),
      target: new THREE.Vector3(mx, my + 1.2, mz),
      fov: 50,
      hour: 14,
    });
    // Wider framing for the S4 HUD screenshot (panel + markers + minimap dots).
    opts.world.addViewpoint('s4-squad-hud', {
      position: new THREE.Vector3(mx + 7.5, my + 2.6, mz + 9.5),
      target: new THREE.Vector3(mx, my + 1.3, mz),
      fov: 52,
      hour: 14,
    });
  }

  let holdRevive = false;
  let wasDowned = false;
  const eventsLog: SquadEvent[] = [];
  let pings: Ping[] = [];
  let feedCursor = 0;

  // S4: for viewpoint screenshots, knock Bot1 and drop a ping so markers/feed show.
  if (!player) {
    const bot = botIds[0];
    if (bot) {
      const m = state.members[bot]!;
      const outcome = takeDirectDamage(m.combatant, 999);
      const r = applyDamage(state, bot, 'debug', outcome);
      state = r.state;
      eventsLog.push(...r.events);
    }
    const leader = state.members[playerId]!;
    pings = placePing(pings, playerId, { x: leader.pos.x + 2, y: leader.pos.y, z: leader.pos.z + 3 }, state.t);
  }

  const hudParent = document.getElementById('hud') ?? document.body;
  const squadHud = new SquadHud({
    parent: hudParent,
    camera: opts.camera,
    localId: playerId,
  });
  // Seed names for the kill feed.
  const memberNames: Record<PlayerId, string> = {};
  for (const m of Object.values(state.members)) memberNames[m.id] = m.name;

  const syncPlayerCombatant = (c: Combatant) => {
    const m = state.members[playerId]!;
    state = {
      ...state,
      members: {
        ...state.members,
        [playerId]: { ...m, combatant: { ...c } },
      },
    };
  };

  const bridge: CombatSquadBridge = {
    isDowned: () => state.members[playerId]?.life === 'downed',
    isDead: () => state.members[playerId]?.life === 'dead',
    getCombatant: () => ({ ...state.members[playerId]!.combatant }),
    setCombatant(c: Combatant) {
      syncPlayerCombatant(c);
      opts.combat.setVitals(c);
    },
    applyPlayerDamage(amount: number, attackerId: string | null) {
      if (amount <= 0) {
        return { combatant: bridge.getCombatant(), dead: bridge.isDead() };
      }
      const before = state.members[playerId]!;
      if (before.life === 'dead') {
        return { combatant: before.combatant, dead: true };
      }
      if (before.life === 'downed') {
        // Finish / zone-on-downed goes through applyDownedDamage in the tick path.
        return { combatant: before.combatant, dead: false };
      }
      const outcome = takeDirectDamage(before.combatant, amount);
      const r = applyDamage(state, playerId, attackerId, outcome);
      state = r.state;
      eventsLog.push(...r.events);
      const after = state.members[playerId]!;
      opts.combat.setVitals(after.combatant);
      return { combatant: after.combatant, dead: after.life === 'dead' };
    },
  };
  if (player) opts.combat.setSquadBridge(bridge);

  const applyDownedPresentation = (downed: boolean) => {
    if (!player) return;
    if (downed === wasDowned) return;
    wasDowned = downed;
    if (downed) {
      player.setSpeedScale(CRAWL_SCALE);
      player.setAllowRun(false);
      player.setEyeHeight(CRAWL_EYE);
      player.setCamPivotHeight(CRAWL_PIVOT);
    } else {
      player.setSpeedScale(1);
      player.setAllowRun(true);
      player.setEyeHeight(NORMAL_EYE);
      player.setCamPivotHeight(NORMAL_PIVOT);
    }
  };

  // Debug keys K / J / L (and track F for revive). H stays combat practice hurt.
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.code === 'KeyF') holdRevive = true;
    if (e.code === 'KeyK') {
      // Knock yourself.
      const m = state.members[playerId]!;
      if (m.life !== 'alive') return;
      const outcome = takeDirectDamage(m.combatant, 999);
      const r = applyDamage(state, playerId, 'debug', outcome);
      state = r.state;
      eventsLog.push(...r.events);
      opts.combat.setVitals(state.members[playerId]!.combatant);
    } else if (e.code === 'KeyJ') {
      const bot = botIds[0];
      if (!bot) return;
      const m = state.members[bot]!;
      if (m.life !== 'alive') return;
      const outcome = takeDirectDamage(m.combatant, 999);
      const r = applyDamage(state, bot, 'debug', outcome);
      state = r.state;
      eventsLog.push(...r.events);
    } else if (e.code === 'KeyL') {
      // Heal all squadmates (L = life; H is combat practice hurt).
      const next = { ...state, members: { ...state.members } };
      for (const id of Object.keys(next.members)) {
        const m = next.members[id]!;
        next.members[id] = {
          ...m,
          life: 'alive',
          combatant: createCombatant(),
          downHp: 0,
          downedAt: null,
          reviving: null,
          killedBy: null,
        };
      }
      state = next;
      opts.combat.setVitals(state.members[playerId]!.combatant);
      applyDownedPresentation(false);
      player?.setControlsEnabled(true);
    } else if (e.code === 'KeyP') {
      // Ping (P). Q stays combat medkit; design doc said Q but that key is taken.
      const feet = player?.position ?? state.members[playerId]!.pos;
      pings = placePing(
        pings,
        playerId,
        { x: feet.x, y: typeof feet.y === 'number' ? feet.y : 0, z: feet.z },
        state.t,
      );
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'KeyF') holdRevive = false;
  };
  if (player) {
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
  }

  // Small key hint under the S4 team panel (K/J/L/P/F).
  const panel = document.createElement('div');
  panel.id = 'squad-debug';
  panel.style.cssText =
    'position:absolute;left:12px;bottom:48px;color:#e8e8e8;font:11px/1.35 ui-monospace,monospace;' +
    'background:rgba(0,0,0,.4);padding:6px 8px;border-radius:6px;pointer-events:none;z-index:20;white-space:pre';
  hudParent.appendChild(panel);

  const botSpeed = PLAYER_CONFIG.walkSpeed * 1.05;

  const onUpdate = (dt: number) => {
    if (!player) {
      // Viewpoint / screenshot demo: keep bot meshes posed, no match stepping.
      // Still drive the S4 HUD so markers / panel / feed show up in screenshots.
      pings = tickPings(pings, state.t);
      if (feedCursor < eventsLog.length) {
        squadHud.pushEvents(eventsLog.slice(feedCursor), memberNames, performance.now());
        feedCursor = eventsLog.length;
      }
      squadHud.update({ state, pings, dt, nowMs: performance.now(), forceMarkers: true });
      opts.zone?.setSquadMarks(squadHud.getMapMarks());
      panel.textContent =
        `Squad HUD demo (J knock · L heal · P ping · hold F revive)\n` +
        `Pings: ${pings.length}`;
      // Pose downed bot lower.
      for (const body of bots) {
        const m = state.members[body.id]!;
        body.root.position.set(m.pos.x, m.pos.y, m.pos.z);
        body.root.visible = m.life !== 'dead';
        if (m.life === 'downed') body.root.scale.set(1, 0.45, 1);
        else body.root.scale.set(1, 1, 1);
      }
      return;
    }
    const feet = player.position;
    // Sync player position into state.
    {
      const m = state.members[playerId]!;
      state = {
        ...state,
        members: {
          ...state.members,
          [playerId]: { ...m, pos: { x: feet.x, y: feet.y, z: feet.z } },
        },
      };
    }

    // Bot intents + simple locomotion (no physics capsules for S3).
    const inputs: PlayerInput[] = [
      {
        id: playerId,
        holdRevive: holdRevive || player.holdingRevive(),
        pos: { x: feet.x, y: feet.y, z: feet.z },
      },
    ];

    for (const body of bots) {
      const member = state.members[body.id]!;
      if (member.life === 'dead') {
        body.root.visible = false;
        inputs.push({ id: body.id, holdRevive: false, pos: { ...member.pos } });
        continue;
      }
      body.root.visible = true;
      const intent = botIntent(state, body.id, {
        leaderId: playerId,
        enemyVisible: false,
        nearestEnemyId: null,
        inZoneDanger: false,
        zoneCenter: { x: feet.x, z: feet.z },
      });

      let pos = { ...member.pos };
      let hold = false;
      if (member.life === 'downed') {
        // Crawl in place for now.
      } else if (intent.type === 'follow') {
        const leader = state.members[intent.target]!;
        const stepped = stepToward(
          { x: pos.x, z: pos.z },
          { x: leader.pos.x, z: leader.pos.z },
          botSpeed,
          dt,
          intent.spacing,
        );
        pos = { x: stepped.x, y: pos.y, z: stepped.z };
      } else if (intent.type === 'moveTo') {
        const stepped = stepToward(
          { x: pos.x, z: pos.z },
          { x: intent.x, z: intent.z },
          botSpeed,
          dt,
          0.4,
        );
        pos = { x: stepped.x, y: pos.y, z: stepped.z };
      } else if (intent.type === 'revive') {
        hold = true;
      }

      body.root.position.set(pos.x, pos.y, pos.z);
      if (intent.type === 'follow' || intent.type === 'moveTo') {
        const tx = intent.type === 'follow' ? state.members[intent.target]!.pos.x : intent.x;
        const tz = intent.type === 'follow' ? state.members[intent.target]!.pos.z : intent.z;
        body.root.rotation.y = Math.atan2(tx - pos.x, tz - pos.z);
      }

      state = {
        ...state,
        members: {
          ...state.members,
          [body.id]: { ...state.members[body.id]!, pos },
        },
      };
      inputs.push({ id: body.id, holdRevive: hold, pos, reviveTarget: intent.type === 'revive' ? intent.target : null });
    }

    const bleedDt = bleedFast ? dt * 10 : dt;
    const r = step(state, inputs, bleedDt);
    state = r.state;
    eventsLog.push(...r.events);

    const life = state.members[playerId]!.life;
    applyDownedPresentation(life === 'downed');
    if (life === 'dead') {
      player.setControlsEnabled(false);
    }

    // Keep combat HUD vitals in sync after revive.
    opts.combat.setVitals(state.members[playerId]!.combatant);

    // Expire pings, push new kill-feed lines, refresh HUD + minimap dots.
    pings = tickPings(pings, state.t);
    if (feedCursor < eventsLog.length) {
      squadHud.pushEvents(eventsLog.slice(feedCursor), memberNames, performance.now());
      feedCursor = eventsLog.length;
    }
    squadHud.update({ state, pings, dt, nowMs: performance.now() });
    opts.zone?.setSquadMarks(squadHud.getMapMarks());

    // Downed bot mesh squash.
    for (const body of bots) {
      const m = state.members[body.id]!;
      if (m.life === 'downed') body.root.scale.set(1, 0.45, 1);
      else body.root.scale.set(1, 1, 1);
    }

    panel.textContent =
      `K knock you · J knock Bot1 · L heal · P ping · hold F revive` +
      (bleedFast ? ' · bleedFast' : '') +
      (pings.length ? ` · ping×${pings.length}` : '');
  };

  opts.world.onUpdate(onUpdate);

  // canDamage is used when enemy squads land (S5); keep the import live for the bridge path.
  void canDamage;

  return {
    getState: () => state,
    getMode: () => mode,
    dispose() {
      if (player) {
        opts.combat.setSquadBridge(null);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('keyup', onKeyUp);
      }
      applyDownedPresentation(false);
      opts.zone?.setSquadMarks([]);
      squadHud.dispose();
      panel.remove();
      for (const b of bots) {
        opts.world.scene.remove(b.root);
        b.root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.geometry?.dispose();
            const mat = mesh.material;
            if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
            else (mat as THREE.Material | undefined)?.dispose?.();
          }
        });
      }
    },
  };
}

