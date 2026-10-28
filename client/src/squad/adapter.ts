/**
 * Squad wiring (S3 + S4 HUD + S5 enemy squads / spectate / placement). Owns match
 * state, bot capsule bodies, crawl/revive input, debug keys, combat bridge, team
 * panel / markers / pings, enemy squads, placement screen, spectate cycling.
 * Pure rules stay in the other squad modules.
 */
import { ENEMY_SPAWN, inSpawnGrace, memberOffset, pickEnemySquadSpots } from './enemySpawn';
import * as THREE from 'three';
import type { CombatMount, CombatSquadBridge } from '../combat';
import { COMBAT } from '../combat/balance';
import { createCombatant, takeDirectDamage, type Combatant } from '../combat/health';
import type { World } from '../core/world';
import type { Player } from '../player';
import { PLAYER_CONFIG } from '../player/config';
import { createAvatar, peekCharacterAssets, type CharacterVisual } from '../player/characterLoader';
import { snapBotY } from './botBody';
import { createBotBodies } from '../player/botBodies';
import { createBotGun } from '../player/botGun';
import { createBotSight } from '../player/botSight';
import { createMuzzleFlashes } from '../render/muzzleFlashes';
import { chestY, EYE_Y, muzzlePoint, pickVisibleTarget, shotOrigin } from './botTarget';
import { canSeeFoe, stepFoeMemory, type FoeMemory } from './foeMemory';
import { BOT_AIM, botAimPoint, botTrigger } from './botAim';
import type { ZoneMount } from '../zone';
import { DOWN } from './balance';
import { botIntent, stepToward } from './bots';
import { BOT_LOOT, botCanShoot, botDry, botSafe, maybeStartReload, spendRound, stepBotReload, botWants, canGrab, grantBotLoot, leaveForHuman, lootInReach, shouldBandage, starterKit, type BotKit } from './botLoot';
import { healAmount, startHeal, stepHeal, type HealChannel } from '../combat/heal';
import { steerStep } from './steer';
import { avoidWalls } from './wallSteer';
import { createTracers } from '../render/tracers';
import { createGunSound } from '../audio/gunSound';
import { createImpacts } from '../render/impacts';
import { createImpactSound } from '../audio/impactSound';
import { createWallProbe } from '../player/wallProbe';
import { applyDamage } from './downed';
import { botZoneDamage, botZoneGoal } from './botZone';
import { shootBot } from './botHits';
import { checkWipe } from './elimination';
import { canDamage } from './friendlyFire';
import { SquadHud } from './hud';
import { localSquadWon, offlineRoster } from './matchSetup';
import { MatchEndScreen } from '../match/matchEndScreen';
import { addDamage, addKills, damageBetween, finish, killsBy, newStats, summarize } from '../match/matchStats';
import { placePing, tickPings, type Ping } from './pings';
import { createMatch } from './roster';
import { nextTarget, spectateCamera, spectateLabel, spectateTargets, type Vec3 } from './spectate';
import { allowKey, debugKeysEnabled } from '../debug/debugKeys';
import { step, type PlayerInput } from './step';
import type { PlayerId, SquadEvent, SquadMatchState } from './types';
import { followRoute, newRouteState, planRoute, type RouteState } from './routePlan';


export type SquadMode = 'bots' | 'solo';

export interface SquadMount {
  dispose(): void;
  getState(): SquadMatchState;
  getMode(): SquadMode;
}

/** Enemy bot squads on ?squad=bots when ?enemySquads is not given. */
export const DEFAULT_ENEMY_SQUADS = 3;

export function parseSquadOptions(search: string): {
  mode: SquadMode;
  bleedFast: boolean;
  /** Enemy bot squads (0..4). Only used when mode is bots. Default 3 on bots, 0 on solo. */
  enemySquads: number;
} {
  const q = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  // Default solo (main behavior). Only an explicit ?squad=bots turns bots on.
  const raw = (q.get('squad') ?? 'solo').toLowerCase();
  const mode: SquadMode = raw === 'bots' ? 'bots' : 'solo';
  const bleed = q.get('bleedFast');
  const esRaw = q.get('enemySquads');
  // Bots mode defaults to 3 enemy squads of 4 so the match has opponents; ?enemySquads=N overrides.
  let enemySquads = mode === 'bots' ? DEFAULT_ENEMY_SQUADS : 0;
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
  /** Id in the bot physics bodies, or -1 without a Rapier world. */
  phys: number;
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

  let matchElapsed = 0;
  const bots: BotBody[] = [];
  const assets = peekCharacterAssets();
  // Feet and body height come from the same downward ray the player uses (skipping the player capsule).
  // Each bot also gets a solid kinematic capsule so the player can't walk through it; the probe skips
  // the player and every bot capsule, so bots never stand on each other.
  const physBodies = player ? createBotBodies(player.rapier.world, player.rapier.playerCollider) : null;
  // Wall look-ahead for bot steering; people are skipped (steerStep handles them).
  const wallProbe =
    player && physBodies
      ? createWallProbe(
          player.rapier.world,
          (h) => h === player.rapier.playerCollider.handle || physBodies.lookup(h) != null,
        )
      : null;
  const wallSide = new Map<PlayerId, 1 | -1>();
  const routes = new Map<PlayerId, RouteState>();
  const probe = physBodies?.probe ?? null;
  // Bot rifles flash at the muzzle when they fire.
  const botFlashes = createMuzzleFlashes(opts.world.scene);
  // Bot shots draw a tracer and play a gunshot (quieter and panned by where it came from).
  const tracers = createTracers(opts.world.scene);
  const gunSound = createGunSound(import.meta.env.BASE_URL);
  const earEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  // Impact sounds: a crack on walls, a thud on the ground, heard from the camera.
  const impactSound = createImpactSound(import.meta.env.BASE_URL);
  const impactEar = new THREE.Euler(0, 0, 0, 'YXZ');
  const impacts = createImpacts(opts.world.scene, Math.random, (p, kind) => {
    impactEar.setFromQuaternion(opts.camera.quaternion);
    impactSound.play(p, kind, opts.camera.position, impactEar.y);
  });
  const onBotShot = (from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, normal?: { x: number; y: number; z: number }) => {
    tracers.add(from, to);
    if (normal) impacts.spawn(to, normal);
    earEuler.setFromQuaternion(opts.camera.quaternion);
    gunSound.play(from, opts.camera.position, earEuler.y);
    botFlashes.spawn(from, to);
  };
  // Bot rifles use the same Rapier world, hitboxes and damage rules as the player's shots.
  const botGun =
    player && physBodies
      ? createBotGun(player.rapier.world, physBodies, player.rapier.playerCollider, () => player.position.y, onBotShot)
      : null;
  const triggerCooldown = new Map<PlayerId, number>();
  const foeMemory = new Map<PlayerId, FoeMemory>();
  // Per-bot loot kit, bandage channel, last health seen, and seconds since a foe was seen.
  const kits = new Map<PlayerId, BotKit>();
  const healing = new Map<PlayerId, HealChannel>();
  const lastHp = new Map<PlayerId, number>();
  const sinceFoeS = new Map<PlayerId, number>();
  // Line of sight: walls and buildings block it, people do not.
  const botSight =
    player && physBodies
      ? createBotSight(player.rapier.world, (h) => h === player.rapier.playerCollider.handle || physBodies.lookup(h) != null)
      : null;
  // Place ally bots near the player; enemy squads in a ring farther out.
  const spawn = (player ? player.position : opts.world.spawn).clone();
  const allyOffsets = [
    { x: 3, z: 2 },
    { x: -3, z: 2 },
    { x: 0, z: 4 },
  ];
  let allySlot = 0;
  const enemySquadOrder = Object.keys(state.squads).filter((id) => id !== localSquad).sort();
  const enemySpots = enemySquadOrder.length
    ? pickEnemySquadSpots({ x: spawn.x, y: spawn.y, z: spawn.z }, enemySquadOrder.length, {
        // First surface straight down from well above: roofs and walls come back too high and are rejected.
        groundAt: (x, z) => (probe ? probe.sample(x, spawn.y + 40, z, 80) : spawn.y),
        blocked: (a, b) => (botSight ? !botSight.clear(a, b) : true),
        zone: opts.zone?.safeCircle?.() ?? null,
      })
    : [];
  if (enemySquadOrder.length)
    console.info(`[squad] enemy spawns ${enemySpots.length}/${enemySquadOrder.length}: ${enemySpots.map((p) => `${Math.round(Math.hypot(p.x - spawn.x, p.z - spawn.z))}m`).join(', ')}`);
  for (const id of botIds) {
    const m = state.members[id]!;
    let ox: number;
    let oz: number;
    if (m.squad === localSquad) {
      const o = allyOffsets[allySlot++] ?? { x: 2 + allySlot, z: 2 };
      ox = o.x;
      oz = o.z;
    } else {
      // Enemy squads start far away, out of sight, on walkable ground inside the zone.
      const si = enemySquadOrder.indexOf(m.squad);
      const spot = enemySpots[si];
      const off = memberOffset(m.slot);
      if (spot) {
        state = {
          ...state,
          members: { ...state.members, [id]: { ...m, pos: { x: spot.x + off.x, y: spot.y, z: spot.z + off.z } } },
        };
        continue;
      }
      // No valid spot found: still keep them at least the minimum distance away.
      const angle = (si / Math.max(1, enemySquadOrder.length)) * Math.PI * 2;
      ox = Math.cos(angle) * (ENEMY_SPAWN.minDistM + 20) + off.x;
      oz = Math.sin(angle) * (ENEMY_SPAWN.minDistM + 20) + off.z;
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
    const phys = physBodies ? physBodies.add(m.pos.x, y0, m.pos.z) : -1;
    bots.push({ id, root, enemy, avatar, phys, last: { x: m.pos.x, z: m.pos.z } });
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
  // Match-end screen: on win or when your squad is wiped.
  const endUi = new MatchEndScreen(hudParent);
  // Spectate banner: shown while you're dead and a teammate is still up.
  const specBanner = document.createElement('div');
  specBanner.id = 'spectate-banner';
  Object.assign(specBanner.style, {
    position: 'absolute', top: '64px', left: '50%', transform: 'translateX(-50%)',
    padding: '8px 16px', background: '#0b0f14', color: '#e8eef5', border: '1px solid #2a3542',
    borderRadius: '8px', font: '600 15px system-ui, sans-serif', display: 'none', zIndex: '40',
    pointerEvents: 'none',
  });
  hudParent.appendChild(specBanner);
  let stats = newStats(performance.now() / 1000);
  let statsCursor = 0;
  const checkEnd = () => {
    if (statsCursor < eventsLog.length) {
      stats = addKills(stats, killsBy(eventsLog.slice(statsCursor), playerId));
      statsCursor = eventsLog.length;
    }
    if (endUi.isShown()) return;
    const squad = state.squads[localSquad];
    if (!squad) return;
    const won = localSquadWon(state, localSquad);
    if (!won && !squad.eliminated) return;
    const nowS = performance.now() / 1000;
    stats = finish(stats, nowS);
    const squads = Object.keys(state.squads).length;
    const sum = summarize(stats, nowS, won ? 'won' : 'wiped', squad.placement, squads);
    endUi.show(sum);
    console.info(`[match] end: ${sum.title} ${sum.placement}, kills ${sum.kills}, damage ${sum.damage}, survived ${sum.survival}`);
  };
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
    shootBot(handle, hitY, distance, dir) {
      const hit = physBodies?.lookup(handle, hitY);
      if (!hit) return null;
      const body = bots.find((b) => b.phys === hit.id);
      if (!body) return null;
      const before = state.members[body.id]!;
      const r = shootBot(state, playerId, body.id, hit.zone, distance);
      if (r.result === 'blocked') return { blocked: true, headshot: false };
      const after = r.state.members[body.id]!;
      stats = addDamage(stats, damageBetween({ ...before.combatant, downHp: before.downHp }, { ...after.combatant, downHp: after.downHp }));
      state = r.state;
      eventsLog.push(...r.events);
      if (r.result === 'hit') body.avatar?.flinch(dir);
      return { blocked: false, headshot: r.headshot };
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
  // Cheat keys (K/J/L/O) only with ?debug or in a dev build.
  const debugKeys = debugKeysEnabled(opts.search);
  // Spectate camera: pulled in by the same sphere sweep as the follow camera, so walls never clip it.
  const sweepFrom = new THREE.Vector3();
  const sweepDir = new THREE.Vector3();
  const camSweep = (from: Vec3, dir: Vec3, max: number) =>
    player ? player.sweepCamera(sweepFrom.set(from.x, from.y, from.z), sweepDir.set(dir.x, dir.y, dir.z), max) : null;
  let camFor: PlayerId | null = null;
  let camArm: number | null = null;
  const placeSpectateCam = (id: PlayerId, tpos: Vec3, offset: Vec3, dt: number) => {
    if (camFor !== id) camArm = null; // new target: snap, no ease from the old arm
    camFor = id;
    const c = spectateCamera(tpos, offset, camSweep, camArm, dt);
    camArm = c.arm;
    opts.camera.position.set(c.pos.x, c.pos.y, c.pos.z);
    opts.camera.lookAt(c.look.x, c.look.y, c.look.z);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (!allowKey(e.code, debugKeys)) return;
    if (e.code === 'KeyF') holdRevive = true;
    if (e.code === 'KeyK') {
      // Knock yourself; K again while downed finishes you (to test spectate).
      const m = state.members[playerId]!;
      if (m.life === 'downed') {
        state = {
          ...state,
          members: {
            ...state.members,
            [playerId]: {
              ...m, life: 'dead', downHp: 0, downedAt: null, reviving: null,
              combatant: { ...m.combatant, health: 0 }, killedBy: m.killedBy ?? 'debug',
            },
          },
        };
        const w = checkWipe(state);
        state = w.state;
        eventsLog.push(...w.events);
        opts.combat.setVitals(state.members[playerId]!.combatant);
        return;
      }
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
      // The match-end screen stays up; Play again restarts.
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

  // Small key hint (K/J/L/P/F), bottom left *above* the health / ammo stack so it never covers 'No rifle'.
  const panel = document.createElement('div');
  panel.id = 'squad-debug';
  panel.style.cssText =
    `position:absolute;left:12px;bottom:${SQUAD_HINT_BOTTOM_PX}px;color:#e8e8e8;font:11px/1.35 ui-monospace,monospace;` +
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
    matchElapsed += dt;
    botFlashes.update(dt, opts.camera);
    tracers.update(dt);
    impacts.update(dt);
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
      checkEnd();
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
        physBodies?.move(body.phys, member.pos.x, member.pos.y, member.pos.z, false);
        body.root.visible = false;
        inputs.push({ id: body.id, holdRevive: false, pos: { ...member.pos } });
        continue;
      }
      body.root.visible = true;

      // Visibility: nearest living foe within 28 m that the bot has a clear line of sight to.
      const foes: { id: PlayerId; dist: number }[] = [];
      for (const other of Object.values(state.members)) {
        if (other.id === body.id) continue;
        if (other.life === 'dead') continue;
        if (!canDamage(state, body.id, other.id)) continue;
        const d = Math.hypot(other.pos.x - member.pos.x, other.pos.z - member.pos.z);
        if (d < 28) foes.push({ id: other.id, dist: d });
      }
      const eyeAt = { x: member.pos.x, y: member.pos.y + EYE_Y, z: member.pos.z };
      const seen = pickVisibleTarget(foes, (f) => {
        if (!botSight) return true;
        const o = state.members[f.id]!;
        return canSeeFoe(eyeAt, o.pos, o.life === 'downed', chestY, (a, b) => botSight.clear(a, b));
      });
      // Remember where the last foe was seen, so the bot goes to look instead of forgetting it.
      const memory = stepFoeMemory(
        foeMemory.get(body.id) ?? null,
        seen ? { id: seen.id, pos: state.members[seen.id]!.pos } : null,
        member.pos,
        dt,
        (id) => (state.members[id]?.life !== 'alive' && state.members[id]?.life !== 'downed') || !canDamage(state, body.id, id),
      );
      if (memory) foeMemory.set(body.id, memory);
      else foeMemory.delete(body.id);
      const nearestEnemyId: PlayerId | null = seen?.id ?? null;
      const nearestDist = seen?.dist ?? 28;
      const leaderId = body.enemy
        ? (state.squads[member.squad]!.members.find((id) => state.members[id]?.life === 'alive') ?? body.id)
        : playerId;
      const zoneView = opts.zone?.snapshot?.() ?? null;
      const zoneGoal = member.life === 'alive' ? botZoneGoal(zoneView, member.pos) : null;
      const zoneHurt = inSpawnGrace(matchElapsed) ? 0 : botZoneDamage(zoneView, member.pos, dt, DOWN.zoneDamageMult);
      if (zoneHurt > 0) {
        const r = applyDamage(state, body.id, 'zone', takeDirectDamage(member.combatant, zoneHurt));
        state = r.state;
        eventsLog.push(...r.events);
      }
      let intent = botIntent(state, body.id, {
        leaderId,
        enemyVisible: nearestEnemyId != null,
        nearestEnemyId,
        inZoneDanger: zoneGoal != null,
        zoneCenter: zoneGoal ?? { x: feet.x, z: feet.z },
      });
      if (memory && !seen && (intent.type === 'follow' || intent.type === 'idle')) {
        // Lost sight of a foe: go check its last-seen spot, facing it, ready to shoot.
        intent = { type: 'moveTo', x: memory.x, z: memory.z };
        body.root.rotation.y = Math.atan2(memory.x - member.pos.x, memory.z - member.pos.z);
      }

      // Loot and bandages: only when calm (alive, following or idle, no foe seen for a while).
      const sinceFoe = seen || memory ? 0 : (sinceFoeS.get(body.id) ?? BOT_LOOT.safeS) + dt;
      sinceFoeS.set(body.id, sinceFoe);
      let kit = kits.get(body.id) ?? starterKit();
      const hpNow = member.combatant.health;
      const calm = member.life === 'alive' && botSafe(sinceFoe) && (intent.type === 'follow' || intent.type === 'idle');
      let channel = healing.get(body.id) ?? null;
      if (channel && (!calm || hpNow < (lastHp.get(body.id) ?? hpNow))) {
        channel = null;
        console.info(`[squad] ${member.name} bandage interrupted`);
      }
      lastHp.set(body.id, hpNow);
      if (calm && !channel && shouldBandage(hpNow, kit, sinceFoe)) {
        channel = startHeal('bandage');
        console.info(`[squad] ${member.name} bandaging at ${Math.round(hpNow)} HP`);
      }
      if (channel) {
        const st = stepHeal(channel, dt);
        channel = st.channel;
        if (st.done) {
          const add = healAmount('bandage', hpNow, member.combatant.maxHealth);
          kit = { ...kit, bandages: kit.bandages - 1 };
          const m = state.members[body.id]!;
          state = { ...state, members: { ...state.members, [body.id]: { ...m, combatant: { ...m.combatant, health: hpNow + add } } } };
          lastHp.set(body.id, hpNow + add);
          console.info(`[squad] ${member.name} bandaged ${Math.round(hpNow)} -> ${Math.round(hpNow + add)} HP (${kit.bandages} left)`);
        }
        // Stand still while bandaging.
        intent = { type: 'idle' };
      } else if (calm) {
        const leaderPos = leaderId !== body.id ? (state.members[leaderId]?.pos ?? null) : null;
        const human = body.enemy ? null : { pos: feet, hasGun: opts.combat.playerHasGun() };
        const want = opts.combat.lootNear(member.pos, BOT_LOOT.seekM, (k, at) => botWants(k, kit) && !leaveForHuman(k, at, human));
        if (want && lootInReach(member.pos, want.position, leaderPos)) {
          if (canGrab(member.pos, want.position)) {
            const got = opts.combat.takeLoot(want.index);
            if (got) {
              kit = grantBotLoot(kit, got);
              console.info(`[squad] ${member.name} picked up ${got} (rifles ${kit.rifles}, mag ${kit.mag}, spare ${kit.ammo}, bandages ${kit.bandages})`);
            }
          } else {
            intent = { type: 'moveTo', x: want.position.x, z: want.position.z };
          }
        }
      }
      // Reload: always when empty, topping up when calm. Same reload time as the player.
      const wasReloading = kit.reloading > 0;
      kit = maybeStartReload(kit, calm);
      if (!wasReloading && kit.reloading > 0) console.info(`[squad] ${member.name} reloading (${kit.mag} in mag, ${kit.ammo} spare)`);
      const rl = stepBotReload(kit, dt);
      kit = rl.kit;
      kits.set(body.id, kit);
      if (channel) healing.set(body.id, channel);
      else healing.delete(body.id);

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
        // Walk toward the target and shoot at it with a real hitscan.
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
        const gunKit = kits.get(body.id) ?? starterKit();
        const armed = botGun != null && botCanShoot(gunKit);
        const trig = botTrigger(triggerCooldown.get(body.id) ?? 0, dt, armed, nearestDist, Math.random);
        triggerCooldown.set(body.id, trig.cooldown);
        if (trig.fire && botGun && !inSpawnGrace(matchElapsed)) {
          const spent = spendRound(gunKit);
          kits.set(body.id, spent);
          if (botDry(spent)) console.info(`[squad] ${member.name} is out of ammo`);
          // Bullets leave the rifle barrel (or the eye if the barrel is poking into a wall).
          const eye = { x: pos.x, y: pos.y + EYE_Y, z: pos.z };
          const muzzle = muzzlePoint(pos, body.root.rotation.y);
          const origin = botSight ? shotOrigin(eye, muzzle, (a, b) => botSight.clear(a, b)) : muzzle;
          const aim = botAimPoint(foe.pos, nearestDist, foe.life === 'downed', Math.random);
          const shot = botGun.fire(body.phys, origin, aim, BOT_AIM.range + 5);
          const victimId =
            shot?.kind === 'player' ? playerId : shot?.kind === 'bot' ? bots.find((b) => b.phys === shot.id)?.id : undefined;
          if (shot && shot.kind !== 'world' && victimId) {
            const r = shootBot(state, body.id, victimId, shot.zone, shot.distance, COMBAT.baseDamage * BOT_AIM.damageScale);
            if (r.result !== 'blocked') {
              state = r.state;
              eventsLog.push(...r.events);
              if (victimId === playerId) opts.combat.setVitals(state.members[playerId]!.combatant);
              else if (r.result === 'hit') bots.find((b) => b.id === victimId)?.avatar?.flinch();
            }
          }
        }
      }

      if (member.life !== 'downed') {
        // Keep personal space from the other bots and the player; slide around anyone in the way.
        const others: { x: number; z: number }[] = [{ x: feet.x, z: feet.z }];
        for (const o of Object.values(state.members)) {
          if (o.id === body.id || o.id === playerId || o.life === 'dead') continue;
          others.push(o.pos);
        }
        const steered = steerStep(member.pos, pos, others, Math.max(0.02, botSpeed * dt * 1.5));
        pos = { x: steered.x, y: pos.y, z: steered.z };
        if (wallProbe) {
          const from = member.pos;
          // Stuck (e.g. in a dead end)? Plan a short route round and follow its waypoints.
          const goal =
            intent.type === 'follow' ? state.members[intent.target]!.pos
              : intent.type === 'moveTo' ? { x: intent.x, z: intent.z }
                : intent.type === 'shoot' && nearestEnemyId ? state.members[nearestEnemyId]!.pos
                  : null;
          if (goal) {
            const f = followRoute(routes.get(body.id) ?? newRouteState(), from, pos, goal, dt, (a, b) =>
              planRoute(a, b, (x, z) => wallProbe.free(x, from.y, z)),
            );
            routes.set(body.id, f.rs);
            pos = { x: f.to.x, y: pos.y, z: f.to.z };
          }
          // Turn away from walls and buildings ahead.
          const w = avoidWalls(from, pos, (dx, dz, max) => wallProbe.clear(from.x, from.y, from.z, dx, dz, max), wallSide.get(body.id) ?? 1);
          wallSide.set(body.id, w.side);
          pos = { x: w.x, y: pos.y, z: w.z };
        }
      }
      pos = { ...pos, y: snapBotY(probe, pos.x, pos.y, pos.z) };
      body.root.position.set(pos.x, pos.y, pos.z);
      physBodies?.move(body.phys, pos.x, pos.y, pos.z, member.life === 'downed' ? 'downed' : 'stand');
      if (intent.type === 'follow' || intent.type === 'moveTo') {
        const tx = intent.type === 'follow' ? state.members[intent.target]!.pos.x : intent.x;
        const tz = intent.type === 'follow' ? state.members[intent.target]!.pos.z : intent.z;
        body.root.rotation.y = Math.atan2(tx - pos.x, tz - pos.z);
      }
      physBodies?.setYaw(body.phys, body.root.rotation.y);

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
        const label = spectateLabel(state.members[spectateId]!.name, targets.indexOf(spectateId), targets.length);
        if (specBanner.textContent !== label) specBanner.textContent = label;
        specBanner.style.display = 'block';
        placeSpectateCam(spectateId, tpos, { x: 4.5, y: 2.4, z: 5.5 }, dt);
      } else if (state.squads[localSquad]!.eliminated) {
        specBanner.style.display = 'none';
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
          placeSpectateCam(best, tpos, { x: 5, y: 2.6, z: 6 }, dt);
        }
      }
    } else {
      spectateId = null;
      specBanner.style.display = 'none';
    }

    checkEnd();

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
      (debugKeys ? `K knock/finish you · J knock Bot1 · L heal · P ping · hold F revive · O wipe` : `P ping · hold F revive`) +
      (bleedFast ? ' · bleedFast' : '') +
      (enemySquads ? ` · enemy×${enemySquads}` : '') +
      (pings.length ? ` · ping×${pings.length}` : '') +
      specHint;
  };

  const offUpdate = opts.world.onUpdate(onUpdate);

  return {
    getState: () => state,
    getMode: () => mode,
    dispose() {
      offUpdate();
      if (player) {
        opts.combat.setSquadBridge(null);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('keyup', onKeyUp);
      }
      applyDownedPresentation(false);
      opts.zone?.setSquadMarks([]);
      squadHud.dispose();
      endUi.dispose();
      panel.remove();
      botFlashes.dispose();
      physBodies?.dispose();
      tracers.dispose();
      impacts.dispose();
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

/** Bottom offset (px) of the squad key hint: clears the combat HUD stack (bottom 28 px, ~100 px tall). */
export const SQUAD_HINT_BOTTOM_PX = 140;
