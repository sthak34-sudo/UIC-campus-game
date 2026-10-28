/**
 * Practice combat: shooting, dummies, loot, and the combat HUD.
 * Wired from main.ts. Damage numbers stay in the pure modules next to this file.
 *
 * Optional `squad` bridge (S3): routes player damage through applyDamage so a lethal
 * hit knocks instead of killing when a teammate is alive. Downed players cannot fire.
 */
import { MatchEndScreen } from '../match/matchEndScreen';
import { addDamage, addKills, finish, newStats, summarize } from '../match/matchStats';
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { World } from '../core/world';
import type { Player } from '../player';
import type { LootKind } from './inventory';
import { COMBAT } from './balance';
import { PracticeDummies } from './dummy';
import { CombatHud } from './hud';
import { canFire, canReload } from './damage';
import {
  addArmor, createCombatant, healCombatant, isDown, takeDirectDamage, type Combatant,
} from './health';
import {
  finishReload, grantLoot, lootLabel, pickupPrompt, pullBandage, pullMedkit, spendRound, emptyInventory, type Inventory,
} from './inventory';
import { LootField } from './loot';
import { channelLabel, healAmount, healBlocked, startHeal, stepHeal, type HealChannel, type HealItem } from './heal';
import { practiceLayout, starterRifleSpot } from './range';
import { castAimedShot, muzzlePoint, WeaponFx } from './weapon';
import { createTracers } from '../render/tracers';
import { createGunSound } from '../audio/gunSound';
import { createAvatar, loadCharacterAssets, peekCharacterAssets } from '../player/characterLoader';
import { yawFromDirection } from '../player/math';
import { createImpacts } from '../render/impacts';
import { createImpactSound } from '../audio/impactSound';

/** Thin hooks the squad adapter installs so combat stays free of squad imports. */
export interface CombatSquadBridge {
  /** True while the local player is knocked (crawl, no fire). */
  isDowned(): boolean;
  /** True after the local player is fully dead (death screen). */
  isDead(): boolean;
  /**
   * Apply raw damage to the local player through squad rules.
   * Returns the synced combatant and whether they are now dead (not merely downed).
   */
  applyPlayerDamage(amount: number, attackerId: string | null): { combatant: Combatant; dead: boolean };
  /** Pull the latest combatant snapshot from the squad match. */
  getCombatant(): Combatant;
  /** Write combatant back (medkit / heal-all). */
  setCombatant(c: Combatant): void;
  /**
   * The player's shot hit this collider. Returns null when it is not a squad bot; otherwise
   * whether team rules blocked it and whether it was a head shot.
   */
  shootBot?(
    colliderHandle: number,
    hitY: number,
    distance: number,
    dir: { x: number; y: number; z: number },
  ): { blocked: boolean; headshot: boolean } | null;
}

export interface CombatMount {
  dispose(): void;
  /** Safe-zone damage. Ignores armor. Does nothing if the player is already down / dead. */
  applyZoneDamage(amount: number): void;
  /** Install or clear the squad bridge (called by mountSquad). */
  setSquadBridge(bridge: CombatSquadBridge | null): void;
  /** Current vitals (for squad sync / debug). */
  getVitals(): Combatant;
  /** Replace vitals after a revive / heal-all. */
  setVitals(c: Combatant): void;
  /** Nearest pickup a bot could walk to (`accept` filters kinds), or null. */
  lootNear(
    at: { x: number; y: number; z: number },
    radius: number,
    accept: (kind: LootKind, at: { x: number; y: number; z: number }) => boolean,
  ): { index: number; kind: LootKind; position: { x: number; y: number; z: number } } | null;
  /** A bot picks up loot `index`. Returns its kind, or null if it was already taken. */
  takeLoot(index: number): LootKind | null;
  /** True once the player carries a rifle (teammate bots leave rifles for them until then). */
  playerHasGun(): boolean;
}

export async function mountCombat(opts: {
  world: World;
  player: Player | null;
  camera: THREE.PerspectiveCamera;
  dom: HTMLElement;
  /** Extra loot crates (building glb markers). Appended after the practice-range spots. */
  extraLoot?: import('./range').LootSpot[];
}): Promise<CombatMount> {
  const yaw = opts.world.spawnYaw ?? 0;
  const spawn = { x: opts.world.spawn.x, y: opts.world.spawn.y, z: opts.world.spawn.z };
  const layout = practiceLayout(spawn, yaw);
  const faceYaw = yawFromDirection(spawn.x - layout.dummies[1]!.x, spawn.z - layout.dummies[1]!.z);

  const physics: RAPIER.World | null = opts.player ? opts.player.rapier.world : null;
  if (!peekCharacterAssets()) await loadCharacterAssets();
  const bodies = peekCharacterAssets();
  const dummies = new PracticeDummies(
    opts.world.scene,
    layout.dummies,
    faceYaw,
    physics,
    bodies ? () => createAvatar(bodies) : null,
  );
  // The starter rifle goes in front of where the player really stands (the safe-spawn search can
  // move them off the marked spawn), so it is on screen at load in every mode, ?squad=bots included.
  const feet = opts.player ? opts.player.position : spawn;
  const startLoot = layout.loot.map((l) =>
    l.kind === 'gun' ? { kind: l.kind, position: starterRifleSpot({ x: feet.x, y: feet.y, z: feet.z }, yaw) } : l,
  );
  const allLoot = opts.extraLoot?.length
    ? [...startLoot, ...opts.extraLoot]
    : startLoot;
  const loot = new LootField(opts.world.scene, allLoot, bodies?.rifle ?? null);
  if (physics) physics.step();

  opts.world.addViewpoint('combat-range', {
    position: new THREE.Vector3(layout.camera.x, layout.camera.y, layout.camera.z),
    target: new THREE.Vector3(layout.lookAt.x, layout.lookAt.y, layout.lookAt.z),
    fov: 48,
    hour: 15,
  });

  const fx = new WeaponFx(opts.world.scene);
  // The player's own shots get the same tracers and gunshot as the bots'.
  const tracers = createTracers(opts.world.scene);
  const gunSound = createGunSound(import.meta.env.BASE_URL);
  const earEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  // PUBG-style: the player starts empty-handed and loots a rifle (one lies on the ground by the spawn).
  let inventory: Inventory = emptyInventory();
  let vitals: Combatant = createCombatant();
  let lastShotAt = -1;
  let reloading = false;
  let reloadReadyAt = 0;
  let clock = 0;
  let squad: CombatSquadBridge | null = null;
  // Bandage / med kit being applied (channelled; damage, firing or going down cancels it).
  let healing: HealChannel | null = null;
  const cancelHeal = (why: string) => {
    if (!healing) return;
    healing = null;
    hud?.flashHint(why);
  };

  const hudParent = document.getElementById('hud') ?? opts.dom;
  const hud = opts.player
    ? new CombatHud(hudParent, () => respawn())
    : null;

  const now = () => performance.now() / 1000;
  // Solo match-end screen (squads have their own in the squad adapter).
  let soloStats = newStats(now());
  // Created on first solo death only, so squad mode has a single #match-end.
  let soloEnd: MatchEndScreen | null = null;

  const playerDowned = () => (squad ? squad.isDowned() : false);
  const playerDead = () => (squad ? squad.isDead() : isDown(vitals));
  const playerBlocked = () => playerDowned() || playerDead();

  const syncHud = () => {
    opts.player?.setArmed(inventory.hasGun);
    if (!hud || !opts.player) return;
    if (squad) vitals = squad.getCombatant();
    const feet = opts.player.position;
    const near = playerBlocked() ? null : loot.nearest({ x: feet.x, y: feet.y, z: feet.z }, clock);
    hud.setState({
      health: vitals.health,
      maxHealth: vitals.maxHealth,
      armor: vitals.armor,
      mag: inventory.mag,
      reserve: inventory.reserve,
      medkits: inventory.medkits,
      bandages: inventory.bandages,
      hasGun: inventory.hasGun,
      reloading,
      reloadLeft: reloading ? Math.max(0, reloadReadyAt - now()) : 0,
      prompt: healing ? channelLabel(healing) : near ? pickupPrompt(near.kind) : '',
    });
  };

  const killPlayer = () => {
    opts.player?.setControlsEnabled(false);
    if (!squad && opts.player) {
      soloEnd ??= new MatchEndScreen(hudParent);
      soloStats = finish(soloStats, now());
      soloEnd.show(summarize(soloStats, now(), 'died', null, 1));
      console.info(`[match] solo death: kills ${soloStats.kills}, damage ${Math.round(soloStats.damage)}`);
    } else {
      hud?.showDeath(true);
    }
    reloading = false;
  };

  const respawn = () => {
    if (!opts.player) return;
    vitals = createCombatant();
    reloading = false;
    opts.player.teleport(opts.world.spawn.clone());
    opts.player.setControlsEnabled(true);
    hud?.showDeath(false);
    syncHud();
  };

  const flinchFrom = (from: { x: number; y: number; z: number } | null) => {
    if (!opts.player) return;
    if (!from) {
      opts.player.flinch();
      return;
    }
    const p = opts.player.position;
    opts.player.flinch({ x: p.x - from.x, y: p.y - from.y, z: p.z - from.z });
  };

  const applyLocalDamage = (amount: number, attackerId: string | null, from: { x: number; y: number; z: number } | null = null) => {
    if (!opts.player || amount <= 0) return;
    cancelHeal('Healing interrupted');
    if (squad) {
      if (squad.isDead()) return;
      // While downed, zone / finish damage is handled by the squad adapter via applyDownedDamage.
      if (squad.isDowned()) return;
      const r = squad.applyPlayerDamage(amount, attackerId);
      vitals = r.combatant;
      if (r.dead) killPlayer();
      else flinchFrom(from);
      syncHud();
      return;
    }
    if (isDown(vitals)) return;
    const r = takeDirectDamage(vitals, amount);
    vitals = r.combatant;
    if (r.died) killPlayer();
    else flinchFrom(from);
    syncHud();
  };

  // Sparks and dust where the player's bullets hit walls and the ground.
  const impactSound = createImpactSound(import.meta.env.BASE_URL);
  const impactEar = new THREE.Euler(0, 0, 0, 'YXZ');
  const impacts = createImpacts(opts.world.scene, Math.random, (p, kind) => {
    impactEar.setFromQuaternion(opts.camera.quaternion);
    impactSound.play(p, kind, opts.camera.position, impactEar.y);
  });

  const fire = () => {
    const player = opts.player;
    if (!player || !hud) return;
    const alive = !playerDead();
    const downed = playerDowned();
    if (!canFire({
      now: now(), lastShotAt, mag: inventory.mag, reloading, hasGun: inventory.hasGun, alive, downed,
    })) {
      if (alive && !downed && inventory.hasGun && !reloading && inventory.mag <= 0) {
        hud.flashHint(inventory.reserve > 0 ? 'Empty — press R to reload' : 'Out of ammo');
      }
      return;
    }
    cancelHeal('Healing cancelled');
    const dir = new THREE.Vector3();
    opts.camera.getWorldDirection(dir);
    const origin = opts.camera.position;
    const muzzle = muzzlePoint(player.position, dir);
    const shot = castAimedShot(
      player.rapier.world,
      { x: origin.x, y: origin.y, z: origin.z },
      { x: dir.x, y: dir.y, z: dir.z },
      muzzle,
      COMBAT.maxRange,
      player.rapier.playerCollider,
    );
    const hit = shot.hit;
    // Damage direction is the bullet's real path (muzzle -> aim point), not the camera's.
    dir.set(shot.aimPoint.x - muzzle.x, shot.aimPoint.y - muzzle.y, shot.aimPoint.z - muzzle.z).normalize();
    lastShotAt = now();
    inventory = spendRound(inventory);
    player.playFire();
    fx.muzzle(muzzle);
    // Tracer from the barrel to where the bullet stopped (what it hit, or the crosshair point).
    const gunTip = player.getMuzzleWorld(new THREE.Vector3()) ?? null;
    const from = gunTip ? { x: gunTip.x, y: gunTip.y, z: gunTip.z } : muzzle;
    tracers.add(from, hit ? hit.point : shot.aimPoint);
    earEuler.setFromQuaternion(opts.camera.quaternion);
    gunSound.play(from, opts.camera.position, earEuler.y);
    hud.setMuzzleBlocked(shot.blocked);
    if (hit) {
      const target = dummies.lookup(hit.colliderHandle);
      if (target) {
        const outcome = dummies.damage(target.index, target.zone, hit.distance, player.rapier.world, { x: dir.x, y: dir.y, z: dir.z });
        if (outcome) {
          hud.flashCrosshair(outcome.headshot ? 'head' : 'hit');
          if (!squad) soloStats = addKills(addDamage(soloStats, outcome.dealt), outcome.died ? 1 : 0);
        }
      } else {
        const bot = squad?.shootBot?.(hit.colliderHandle, hit.point.y, hit.distance, { x: dir.x, y: dir.y, z: dir.z });
        if (bot) {
          if (!bot.blocked) hud.flashCrosshair(bot.headshot ? 'head' : 'hit');
        } else {
          fx.decal(hit.point, hit.normal);
          impacts.spawn(hit.point, hit.normal);
        }
      }
    }
    syncHud();
  };

  const reload = () => {
    if (!opts.player || playerBlocked() || reloading) return;
    if (!canReload(inventory.mag, inventory.reserve)) {
      hud?.flashHint(inventory.mag >= COMBAT.magSize ? 'Magazine full' : 'No ammo left');
      return;
    }
    reloading = true;
    reloadReadyAt = now() + COMBAT.reloadTime;
    opts.player.playReload(COMBAT.reloadTime);
    syncHud();
  };

  const hurt = () => {
    // Invent a hit coming from ahead of the camera so the procedural flinch reads clearly.
    const from = opts.camera.position.clone();
    const ahead = new THREE.Vector3();
    opts.camera.getWorldDirection(ahead);
    from.addScaledVector(ahead, 2);
    applyLocalDamage(COMBAT.debugHurt, null, from);
  };

  // Q / B start a channelled heal; it lands in onUpdate when the timer runs out.
  const beginHeal = (item: HealItem) => {
    if (!opts.player || playerBlocked()) return;
    if (healing) {
      hud?.flashHint('Already healing');
      return;
    }
    if (squad) vitals = squad.getCombatant();
    const why = healBlocked(item, vitals.health, item === 'bandage' ? inventory.bandages : inventory.medkits);
    if (why) {
      hud?.flashHint(why);
      return;
    }
    healing = startHeal(item);
    syncHud();
  };
  const finishHeal = (item: HealItem) => {
    if (squad) vitals = squad.getCombatant();
    const pulled = item === 'bandage' ? pullBandage(inventory) : pullMedkit(inventory);
    if (!pulled.ok) return;
    const amount = healAmount(item, vitals.health, vitals.maxHealth);
    const healed = healCombatant(vitals, amount);
    inventory = pulled.inventory;
    vitals = healed.combatant;
    squad?.setCombatant(vitals);
    hud?.flashHint(`${item === 'bandage' ? 'Bandage' : 'Med kit'} +${healed.healed}`);
    syncHud();
  };
  const useMedkit = () => beginHeal('medkit');
  const useBandage = () => beginHeal('bandage');

  const onInteract = (e: { position: { x: number; y: number; z: number } }) => {
    if (!opts.player || playerBlocked()) return;
    const near = loot.nearest(e.position, clock);
    if (!near) return;
    const kind = loot.take(near.index, clock);
    if (!kind) return;
    if (kind === 'armor') {
      vitals = addArmor(vitals, COMBAT.armorPickup);
    } else {
      inventory = grantLoot(inventory, kind);
    }
    hud?.flashHint(`Picked up ${lootLabel(kind).toLowerCase()}`);
    syncHud();
  };

  const offs: (() => void)[] = [];
  if (opts.player) {
    offs.push(opts.player.events.on('fire', () => fire()));
    offs.push(opts.player.events.on('reload', () => reload()));
    offs.push(opts.player.events.on('debugHurt', () => hurt()));
    offs.push(opts.player.events.on('useMedkit', () => useMedkit()));
    offs.push(opts.player.events.on('useBandage', () => useBandage()));
    offs.push(opts.player.events.on('interact', onInteract));
  }

  const onUpdate = (dt: number) => {
    clock += dt;
    if (healing) {
      if (playerBlocked()) {
        healing = null;
      } else {
        const r = stepHeal(healing, dt);
        const item = healing.item;
        healing = r.channel;
        if (r.done) finishHeal(item);
        else syncHud();
      }
    }
    if (reloading && now() >= reloadReadyAt) {
      inventory = finishReload(inventory);
      reloading = false;
    }
    fx.update(dt);
    tracers.update(dt);
    if (hud && opts.player && !playerDead()) {
      // Subtle cue: crosshair dims when the muzzle can't reach what it points at.
      const dir = new THREE.Vector3();
      opts.camera.getWorldDirection(dir);
      const o = opts.camera.position;
      const s = castAimedShot(opts.player.rapier.world, { x: o.x, y: o.y, z: o.z }, { x: dir.x, y: dir.y, z: dir.z },
        muzzlePoint(opts.player.position, dir), COMBAT.maxRange, opts.player.rapier.playerCollider);
      hud.setMuzzleBlocked(s.blocked);
    }
    impacts.update(dt);
    dummies.update(dt, opts.camera, physics);
    loot.update(clock, opts.player?.position ?? opts.camera.position);
    hud?.tick(dt);
    syncHud();
  };
  offs.push(opts.world.onUpdate(onUpdate));
  syncHud();

  return {
    applyZoneDamage(amount: number) {
      applyLocalDamage(amount, null);
    },
    setSquadBridge(bridge: CombatSquadBridge | null) {
      squad = bridge;
      if (bridge) vitals = bridge.getCombatant();
      syncHud();
    },
    getVitals: () => (squad ? squad.getCombatant() : vitals),
    setVitals(c: Combatant) {
      vitals = c;
      syncHud();
    },
    lootNear: (at, radius, accept) => loot.nearestWithin(at, radius, clock, accept),
    takeLoot: (index) => loot.take(index, clock),
    playerHasGun: () => inventory.hasGun,
    dispose() {
      for (const off of offs) off();
      hud?.dispose();
      soloEnd?.dispose();
      fx.dispose();
      tracers.dispose();
      dummies.dispose(opts.world.scene, physics);
      loot.dispose(opts.world.scene);
      impacts.dispose();
    },
  };
}
