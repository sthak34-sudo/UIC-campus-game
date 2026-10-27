/**
 * Practice combat: shooting, dummies, loot, and the combat HUD.
 * Wired from main.ts. Damage numbers stay in the pure modules next to this file.
 *
 * Optional `squad` bridge (S3): routes player damage through applyDamage so a lethal
 * hit knocks instead of killing when a teammate is alive. Downed players cannot fire.
 */
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { World } from '../core/world';
import type { Player } from '../player';
import { COMBAT } from './balance';
import { PracticeDummies } from './dummy';
import { CombatHud } from './hud';
import { canFire, canReload } from './damage';
import {
  addArmor, createCombatant, healCombatant, isDown, takeDirectDamage, type Combatant,
} from './health';
import {
  finishReload, grantLoot, lootLabel, pickupPrompt, pullMedkit, spendRound, startingInventory, type Inventory,
} from './inventory';
import { LootField } from './loot';
import { practiceLayout } from './range';
import { castHitscan, WeaponFx } from './weapon';
import { yawFromDirection } from '../player/math';

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
}

export function mountCombat(opts: {
  world: World;
  player: Player | null;
  camera: THREE.PerspectiveCamera;
  dom: HTMLElement;
  /** Extra loot crates (building glb markers). Appended after the practice-range spots. */
  extraLoot?: import('./range').LootSpot[];
}): CombatMount {
  const yaw = opts.world.spawnYaw ?? 0;
  const spawn = { x: opts.world.spawn.x, y: opts.world.spawn.y, z: opts.world.spawn.z };
  const layout = practiceLayout(spawn, yaw);
  const faceYaw = yawFromDirection(spawn.x - layout.dummies[1]!.x, spawn.z - layout.dummies[1]!.z);

  const physics: RAPIER.World | null = opts.player ? opts.player.rapier.world : null;
  const dummies = new PracticeDummies(opts.world.scene, layout.dummies, faceYaw, physics);
  const allLoot = opts.extraLoot?.length
    ? [...layout.loot, ...opts.extraLoot]
    : layout.loot;
  const loot = new LootField(opts.world.scene, allLoot);
  if (physics) physics.step();

  opts.world.addViewpoint('combat-range', {
    position: new THREE.Vector3(layout.camera.x, layout.camera.y, layout.camera.z),
    target: new THREE.Vector3(layout.lookAt.x, layout.lookAt.y, layout.lookAt.z),
    fov: 48,
    hour: 15,
  });

  const fx = new WeaponFx(opts.world.scene);
  let inventory: Inventory = startingInventory();
  let vitals: Combatant = createCombatant();
  let lastShotAt = -1;
  let reloading = false;
  let reloadReadyAt = 0;
  let clock = 0;
  let squad: CombatSquadBridge | null = null;

  const hudParent = document.getElementById('hud') ?? opts.dom;
  const hud = opts.player
    ? new CombatHud(hudParent, () => respawn())
    : null;

  const now = () => performance.now() / 1000;

  const playerDowned = () => (squad ? squad.isDowned() : false);
  const playerDead = () => (squad ? squad.isDead() : isDown(vitals));
  const playerBlocked = () => playerDowned() || playerDead();

  const syncHud = () => {
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
      hasGun: inventory.hasGun,
      reloading,
      reloadLeft: reloading ? Math.max(0, reloadReadyAt - now()) : 0,
      prompt: near ? pickupPrompt(near.kind) : '',
    });
  };

  const killPlayer = () => {
    opts.player?.setControlsEnabled(false);
    hud?.showDeath(true);
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

  const applyLocalDamage = (amount: number, attackerId: string | null) => {
    if (!opts.player || amount <= 0) return;
    if (squad) {
      if (squad.isDead()) return;
      // While downed, zone / finish damage is handled by the squad adapter via applyDownedDamage.
      if (squad.isDowned()) return;
      const r = squad.applyPlayerDamage(amount, attackerId);
      vitals = r.combatant;
      if (r.dead) killPlayer();
      syncHud();
      return;
    }
    if (isDown(vitals)) return;
    const r = takeDirectDamage(vitals, amount);
    vitals = r.combatant;
    if (r.died) killPlayer();
    syncHud();
  };

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
    const dir = new THREE.Vector3();
    opts.camera.getWorldDirection(dir);
    const origin = opts.camera.position;
    const hit = castHitscan(
      player.rapier.world,
      { x: origin.x, y: origin.y, z: origin.z },
      { x: dir.x, y: dir.y, z: dir.z },
      COMBAT.maxRange,
      player.rapier.playerCollider,
    );
    lastShotAt = now();
    inventory = spendRound(inventory);
    const muzzle = player.position.clone();
    muzzle.y += 1.4;
    muzzle.addScaledVector(dir, 0.4);
    fx.muzzle(muzzle);
    if (hit) {
      const target = dummies.lookup(hit.colliderHandle);
      if (target) {
        const outcome = dummies.damage(target.index, target.zone, hit.distance, player.rapier.world);
        if (outcome) hud.flashCrosshair(outcome.headshot ? 'head' : 'hit');
      } else {
        fx.decal(hit.point, hit.normal);
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
    syncHud();
  };

  const hurt = () => {
    applyLocalDamage(COMBAT.debugHurt, null);
  };

  const useMedkit = () => {
    if (!opts.player || playerBlocked()) return;
    if (inventory.medkits <= 0) {
      hud?.flashHint('No med kit');
      return;
    }
    const healed = healCombatant(vitals, COMBAT.medkitHeal);
    if (healed.healed <= 0) {
      hud?.flashHint('Already at full health');
      return;
    }
    const pulled = pullMedkit(inventory);
    inventory = pulled.inventory;
    vitals = healed.combatant;
    squad?.setCombatant(vitals);
    hud?.flashHint(`Med kit +${healed.healed}`);
    syncHud();
  };

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
    offs.push(opts.player.events.on('interact', onInteract));
  }

  const onUpdate = (dt: number) => {
    clock += dt;
    if (reloading && now() >= reloadReadyAt) {
      inventory = finishReload(inventory);
      reloading = false;
    }
    fx.update(dt);
    dummies.update(dt, opts.camera, physics);
    loot.update(clock);
    hud?.tick(dt);
    syncHud();
  };
  opts.world.onUpdate(onUpdate);
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
    dispose() {
      for (const off of offs) off();
      hud?.dispose();
      fx.dispose();
      dummies.dispose(opts.world.scene, physics);
      loot.dispose(opts.world.scene);
    },
  };
}
