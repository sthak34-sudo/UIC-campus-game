/**
 * Squad wiring (S3 + S4 HUD + S5 enemy squads / spectate / placement). Owns match
 * state, bot capsule bodies, crawl/revive input, debug keys, combat bridge, team
 * panel / markers / pings, enemy squads, placement screen, spectate cycling.
 * Pure rules stay in the other squad modules.
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { CombatMount, CombatSquadBridge } from '../combat';
import { createCombatant, takeDirectDamage, type Combatant } from '../combat/health';
import type { World } from '../core/world';
import type { Player } from '../player';
import { PLAYER_CONFIG } from '../player/config';
import { createAvatar, peekCharacterAssets, type CharacterVisual } from '../player/characterLoader';
import { snapBotY } from './botBody';
import type { GroundProbe } from '../player/characterLoader';
import type { ZoneMount } from '../zone';
import { DOWN } from './balance';
import { botIntent, stepToward } from './bots';
import { applyDamage } from './downed';
import { checkWipe } from './elimination';
import { canDamage } from './friendlyFire';
import { SquadHud } from './hud';
import { offlineRoster } from './matchSetup';
import { placePing, tickPings, type Ping } from './pings';
import { PlacementScreen } from './placementScreen';
import { createMatch } from './roster';
import { nextTarget, spectateTargets } from './spectate';
import { step, type PlayerInput } from './step';
import type { PlayerId, SquadEvent, SquadMatchState } from './types';


/** Downward Rapier ray probe. `skip` excludes colliders (e.g. the local player's capsule). */
function rapierDownProbe(world: RAPIER.World, skip: RAPIER.Collider | null): GroundProbe {
  return {
    sample(x, yFrom, z, maxDrop) {
      const hit = world.castRay(
        new RAPIER.Ray({ x, y: yFrom, z }, { x: 0, y: -1, z: 0 }),
        maxDrop, true, undefined, undefined, skip ?? undefined,
      );
      return hit ? yFrom - hit.timeOfImpact : null;
    },
  };
}


export type SquadMode = 'bots' | 'solo';

export interface SquadMount {
  dispose(): void;
  getState(): SquadMatchState;
  getMode(): SquadMode;
}

export function parseSquadOptions(search: string): {
  mode: SquadMode;
  bleedFast: boolean;
  /** Enemy bot squads (0..4). Only used when mode is bots. Default 0. */
  enemySquads: number;
} {
  const q = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  // Default solo (main behavior). Only an explicit ?squad=bots turns bots on.
  const raw = (q.get('squad') ?? 'solo').toLowerCase();
  const mode: SquadMode = raw === 'bots' ? 'bots' : 'solo';
  const bleed = q.get('bleedFast');
  const esRaw = q.get('enemySquads');
  let enemySquads = 0;
  if (esRaw != null && esRaw !== '') {
    const n = Number(esRaw);
    if (Number.isFinite(n)) enemySquads = Math.max(0, Math.min(4, Math.floor(n)));
  }
  return { mode, bleedFast: bleed === '1' || bleed === 'true', enemySquads };
}

const BOT_COLORS = [0xe8a317, 0x3b82f6, 0x22c55e];
const ENEMY_COLORS = [0xc43838, 0xa855f7, 0xf97316, 0xe11d48];
const CRAWL_EYE = 0.5;
const CRAWL_PIVOT = 0.45;
const NORMAL_EYE = PLAYER_CONFIG.eyeHeight;
const NORMAL_PIVOT = PLAYER_CONFIG.camPivotHeight;
const CRAWL_SCALE = DOWN.crawlSpeed / PLAYER_CONFIG.walkSpeed;

interface BotBody {
  id: PlayerId;
  root: THREE.Group;
  enemy: boolean;
  /** Animated character with its starter rifle, or null (capsule fallback). */
  avatar: CharacterVisual | null;
  last: { x: number; z: number };
}

/**
 * Mount squad mode. Default / missing / `?squad=solo` is a no-op (main behavior).
 * Only `?squad=bots` spawns 3 bot teammates that follow and revive.
 * `?enemySquads=N` (0..4) adds enemy bot squads (S5). Combat damage goes through applyDamage.
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
  const { mode, bleedFast, enemySquads } = parseSquadOptions(opts.search);
  if (mode === 'solo') return null;

  const player = opts.player;
  let state = createMatch(offlineRoster(enemySquads), 1);
  const playerId: PlayerId = 'p0';
  const localSquad = state.members[playerId]!.squad;
  const botIds = Object.values(state.members)
    .filter((m) => m.isBot)
    .map((m) => m.id);
  const allyBotIds = state.squads[localSquad]!.members.filter((id) => id !== playerId);

  // Place ally bots near the player; enemy squads in a ring farther out.
  const spawn = (player ? player.position : opts.world.spawn).clone();
  const allyOffsets = [
    { x: 3, z: 2 },
    { x: -3, z: 2 },
    { x: 0, z: 4 },
  ];
  let allySlot = 0;
  const enemySquadOrder = Object.keys(state.squads).filter((id) => id !== localSquad).sort();
  for (const id of botIds) {
    const m = state.members[id]!;
    let ox: number;
    let oz: number;
    if (m.squad === localSquad) {
      const o = allyOffsets[allySlot++] ?? { x: 2 + allySlot, z: 2 };
      ox = o.x;
      oz = o.z;
    } else {
      const si = enemySquadOrder.indexOf(m.squad);
      const angle = (si * 2 + m.slot) * 0.55 + si * 1.2;
      const radius = 14 + si * 6 + m.slot * 1.2;
      ox = Math.cos(angle) * radius;
      oz = Math.sin(angle) * radius;
    }
    state = {
      ...state,
      members: {
        ...state.members,
        [id]: { ...m, pos: { x: spawn.x + ox, y: spawn.y, z: spawn.z + oz } },
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
  const assets = peekCharacterAssets();
  // Feet and body height come from the same downward ray the player uses (skipping the player capsule).
  const probe = player ? rapierDownProbe(player.rapier.world, player.rapier.playerCollider) : null;
  const bodyGeom = new THREE.CapsuleGeometry(0.28, 0.9, 4, 8);
  const headGeom = new THREE.SphereGeometry(0.18, 12, 10);
  let allyColorIdx = 0;
  let enemyColorIdx = 0;
  for (let i = 0; i < botIds.length; i++) {
    const id = botIds[i]!;
    const m = state.members[id]!;
    const enemy = m.squad !== localSquad;
    const root = new THREE.Group();
    root.name = enemy ? `squad-enemy-${id}` : `squad-bot-${id}`;
    const color = enemy
      ? ENEMY_COLORS[enemyColorIdx++ % ENEMY_COLORS.length]!
      : BOT_COLORS[allyColorIdx++ % BOT_COLORS.length]!;
    const suit = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      metalness: 0,
    });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc4a574, roughness: 0.7, metalness: 0 });
    let avatar: CharacterVisual | null = null;
    if (assets) {
      avatar = createAvatar(assets);
      if (probe) avatar.setGroundProbe(probe);
      root.add(avatar.root);
      // Team colour as a flat ring at the feet (the character itself is shared).
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 24), new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide,
      }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      root.add(ring);
      skin.dispose();
    } else {
      const body = new THREE.Mesh(bodyGeom, suit);
      body.position.y = 0.95;
      body.castShadow = true;
      const head = new THREE.Mesh(headGeom, skin);
      head.position.y = 1.7;
      head.castShadow = true;
      root.add(body, head);
    }
    const y0 = snapBotY(probe, m.pos.x, m.pos.y, m.pos.z);
    root.position.set(m.pos.x, y0, m.pos.z);
    opts.world.scene.add(root);
    bots.push({ id, root, enemy, avatar, last: { x: m.pos.x, z: m.pos.z } });
  }

  // Viewpoints for screenshots (no player).
  {
    const allies = bots.filter((b) => !b.enemy);
    const enemies = bots.filter((b) => b.enemy);
    const focusBots = allies.length ? allies : bots;
    const n = Math.max(1, focusBots.length);
    let mx = 0, my = 0, mz = 0;
    for (const b of focusBots) {
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
    opts.world.addViewpoint('s4-squad-hud', {
      position: new THREE.Vector3(mx + 7.5, my + 2.6, mz + 9.5),
      target: new THREE.Vector3(mx, my + 1.3, mz),
      fov: 52,
      hour: 14,
    });
    if (enemies.length) {
      let ex = 0, ey = 0, ez = 0;
      for (const b of enemies) {
        ex += b.root.position.x;
        ey += b.root.position.y;
        ez += b.root.position.z;
      }
      ex /= enemies.length; ey /= enemies.length; ez /= enemies.length;
      opts.world.addViewpoint('s5-enemy-squads', {
        position: new THREE.Vector3(ex + 16, ey + 9, ez + 18),
        target: new THREE.Vector3(ex, ey + 1.0, ez),
        fov: 58,
        hour: 14,
      });
    }
    opts.world.addViewpoint('s5-placement', {
      position: new THREE.Vector3(mx + 6, my + 2.2, mz + 8),
      target: new THREE.Vector3(mx, my + 1.2, mz),
      fov: 50,
      hour: 14,
    });
  }

  let holdRevive = false;
  let wasDowned = false;
  const eventsLog: SquadEvent[] = [];
  let pings: Ping[] = [];
  let feedCursor = 0;
  let spectateId: PlayerId | null = null;
  let placementDismissed = false;

  // S4/S5: for viewpoint screenshots, knock Bot1 and drop a ping so markers/feed show.
  // s5-placement seeds a wiped local squad so the placement overlay is visible.
  if (!player) {
    const params = new URLSearchParams(opts.search.startsWith('?') ? opts.search : `?${opts.search}`);
    const viewName = params.get('view') ?? '';
    if (viewName === 's5-placement' || params.get('s5Placement') === '1') {
      // Wipe every local-squad member so checkWipe assigns placement.
      for (const id of state.squads[localSquad]!.members) {
        const m = state.members[id]!;
        if (m.life === 'dead') continue;
        const outcome = takeDirectDamage(m.combatant, 999);
        const r = applyDamage(state, id, 'debug', outcome);
        state = r.state;
        eventsLog.push(...r.events);
      }
      // Force all local members dead/downed then wipe via step of zero.
      {
        const members = { ...state.members };
        for (const id of state.squads[localSquad]!.members) {
          const m = members[id]!;
          members[id] = {
            ...m,
            life: 'dead',
            downHp: 0,
            downedAt: null,
            reviving: null,
            combatant: { ...m.combatant, health: 0 },
          };
        }
        state = { ...state, members };
      }
      {
        const w = checkWipe(state);
        state = w.state;
        eventsLog.push(...w.events);
      }
    } else {
      const bot = allyBotIds[0];
      if (bot) {
        const m = state.members[bot]!;
        const outcome = takeDirectDamage(m.combatant, 999);
        const r = applyDamage(state, bot, 'debug', outcome);
        state = r.state;
        eventsLog.push(...r.events);
      }
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
  const placementUi = new PlacementScreen(hudParent);
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
      const bot = allyBotIds[0];
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
    } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      const targets = spectateTargets(state, playerId);
      const dir = e.code === 'ArrowLeft' ? -1 : 1;
      spectateId = nextTarget(targets, spectateId, dir);
    } else if (e.code === 'Escape') {
      placementDismissed = true;
      placementUi.hide();
    } else if (e.code === 'KeyO') {
      // Debug: wipe the local squad so placement / spectate can be tested.
      const members = { ...state.members };
      for (const id of state.squads[localSquad]!.members) {
        const m = members[id]!;
        members[id] = {
          ...m,
          life: 'dead',
          downHp: 0,
          downedAt: null,
          reviving: null,
          combatant: { ...m.combatant, health: 0 },
          killedBy: m.killedBy ?? 'debug',
        };
      }
      state = { ...state, members };
      const w = checkWipe(state);
      state = w.state;
      eventsLog.push(...w.events);
      opts.combat.setVitals(state.members[playerId]!.combatant);
      player?.setControlsEnabled(false);
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

  const poseBot = (body: BotBody, life: string, dt: number) => {
    if (!body.avatar) {
      if (life === 'downed') body.root.scale.set(1, 0.45, 1);
      else body.root.scale.set(1, 1, 1);
      return;
    }
    const p = body.root.position;
    const speed = dt > 0 ? Math.hypot(p.x - body.last.x, p.z - body.last.z) / dt : 0;
    body.last.x = p.x;
    body.last.z = p.z;
    body.avatar.setFlags({ crouch: life === 'downed', dead: life === 'dead' });
    body.avatar.update(dt, speed, true, null, opts.camera.position.distanceTo(p));
  };

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
      if (!placementDismissed) placementUi.update(state, localSquad);
      panel.textContent =
        `Squad HUD demo (J knock · L heal · P ping · hold F revive · O wipe)\n` +
        `Pings: ${pings.length}` +
        (enemySquads ? ` · enemySquads=${enemySquads}` : '');
      // Pose downed bot lower.
      for (const body of bots) {
        const m = state.members[body.id]!;
        body.root.position.set(m.pos.x, m.pos.y, m.pos.z);
        body.root.visible = m.life !== 'dead';
        poseBot(body, m.life, dt);
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

      // Visibility: nearest living foe within 28 m (no Rapier ray yet).
      let nearestEnemyId: PlayerId | null = null;
      let nearestDist = 28;
      for (const other of Object.values(state.members)) {
        if (other.id === body.id) continue;
        if (other.life === 'dead') continue;
        if (!canDamage(state, body.id, other.id)) continue;
        const d = Math.hypot(other.pos.x - member.pos.x, other.pos.z - member.pos.z);
        if (d < nearestDist) {
          nearestDist = d;
          nearestEnemyId = other.id;
        }
      }
      const leaderId = body.enemy
        ? (state.squads[member.squad]!.members.find((id) => state.members[id]?.life === 'alive') ?? body.id)
        : playerId;
      const intent = botIntent(state, body.id, {
        leaderId,
        enemyVisible: nearestEnemyId != null,
        nearestEnemyId,
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
      } else if (intent.type === 'shoot' && nearestEnemyId) {
        // Walk toward the target; deal a small tick of damage when close.
        const foe = state.members[nearestEnemyId]!;
        const stepped = stepToward(
          { x: pos.x, z: pos.z },
          { x: foe.pos.x, z: foe.pos.z },
          botSpeed * 0.85,
          dt,
          4,
        );
        pos = { x: stepped.x, y: pos.y, z: stepped.z };
        body.root.rotation.y = Math.atan2(foe.pos.x - pos.x, foe.pos.z - pos.z);
        if (nearestDist < 8 && canDamage(state, body.id, nearestEnemyId)) {
          const outcome = takeDirectDamage(foe.combatant, 18 * dt);
          const r = applyDamage(state, nearestEnemyId, body.id, outcome);
          state = r.state;
          eventsLog.push(...r.events);
          if (nearestEnemyId === playerId) {
            opts.combat.setVitals(state.members[playerId]!.combatant);
          }
        }
      }

      pos = { ...pos, y: snapBotY(probe, pos.x, pos.y, pos.z) };
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
      const targets = spectateTargets(state, playerId);
      if (targets.length) {
        if (!spectateId || !targets.includes(spectateId)) {
          spectateId = targets[0]!;
        }
        const tpos = state.members[spectateId]!.pos;
        opts.camera.position.set(tpos.x + 4.5, tpos.y + 2.4, tpos.z + 5.5);
        opts.camera.lookAt(tpos.x, tpos.y + 1.2, tpos.z);
      } else if (state.squads[localSquad]!.eliminated) {
        // Squad wiped: after placement, peek at the nearest living enemy bot.
        let best: PlayerId | null = null;
        let bestD = Infinity;
        const me = state.members[playerId]!.pos;
        for (const m of Object.values(state.members)) {
          if (m.squad === localSquad || m.life === 'dead') continue;
          const d = Math.hypot(m.pos.x - me.x, m.pos.z - me.z);
          if (d < bestD) {
            bestD = d;
            best = m.id;
          }
        }
        if (best) {
          const tpos = state.members[best]!.pos;
          opts.camera.position.set(tpos.x + 5, tpos.y + 2.6, tpos.z + 6);
          opts.camera.lookAt(tpos.x, tpos.y + 1.2, tpos.z);
        }
      }
    } else {
      spectateId = null;
    }

    if (!placementDismissed) placementUi.update(state, localSquad);

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

    // Downed bots: crouch the character (or squash the capsule fallback).
    for (const body of bots) {
      const m = state.members[body.id]!;
      poseBot(body, m.life, dt);
    }

    const specHint = spectateId ? ` · spectate ${state.members[spectateId]?.name ?? spectateId}` : '';
    panel.textContent =
      `K knock you · J knock Bot1 · L heal · P ping · hold F revive · O wipe` +
      (bleedFast ? ' · bleedFast' : '') +
      (enemySquads ? ` · enemy×${enemySquads}` : '') +
      (pings.length ? ` · ping×${pings.length}` : '') +
      specHint;
  };

  opts.world.onUpdate(onUpdate);

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
      placementUi.dispose();
      panel.remove();
      for (const b of bots) {
        opts.world.scene.remove(b.root);
        if (b.avatar) {
          // Shared character geometry: let the avatar release its own clone, not the template.
          b.root.remove(b.avatar.root);
          b.avatar.dispose();
        }
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

