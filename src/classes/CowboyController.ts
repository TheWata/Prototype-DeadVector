import {
  Scene,
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
  Ray,
} from '@babylonjs/core';
import { BaseClassController } from './BaseClassController';
import type { ClassWeaponState } from './BaseClassController';
import { GameConfig } from '../config/GameConfig';
import { sounds } from '../audio/SoundSystem';
import { TargetDummy } from '../combat/TargetDummy';
import { CombatSystem } from '../combat/CombatSystem';

interface ActiveCoin {
  mesh: Mesh;
  velocity: Vector3;
  lifetime: number;
  maxLifetime: number;
}

export class CowboyController extends BaseClassController {
  public readonly className = 'Cowboy';
  public readonly secondaryName = 'Moeda';

  private scene: Scene;
  private combatSystem: CombatSystem;
  private getDummies: () => TargetDummy[];

  // Primary burst state
  private primaryCooldownTimer: number = 0;
  private queuedSecondShotTimer: number = -1;
  private pendingShotOrigin: Vector3 = Vector3.Zero();
  private pendingShotForward: Vector3 = Vector3.Zero();

  // Secondary coin state
  private secondaryCooldownTimer: number = 0;
  private activeCoins: ActiveCoin[] = [];
  private coinMaterial: StandardMaterial;

  constructor(scene: Scene, combatSystem: CombatSystem, getDummies: () => TargetDummy[]) {
    super();
    this.scene = scene;
    this.combatSystem = combatSystem;
    this.getDummies = getDummies;

    this.coinMaterial = new StandardMaterial('coinMat', scene);
    this.coinMaterial.diffuseColor = new Color3(1, 0.85, 0.1);
    this.coinMaterial.emissiveColor = new Color3(0.5, 0.4, 0.05);
    this.coinMaterial.specularColor = new Color3(1, 1, 0.8);
  }

  public tryPrimaryAttack(origin: Vector3, forward: Vector3): boolean {
    if (this.primaryCooldownTimer > 0 || this.queuedSecondShotTimer >= 0) {
      return false;
    }

    // First shot immediate
    this.fireSingleRevolverBullet(origin, forward);

    // Queue second shot at 100ms
    this.queuedSecondShotTimer = GameConfig.cowboy.primary.delayBetweenShotsMs / 1000;
    this.pendingShotOrigin.copyFrom(origin);
    this.pendingShotForward.copyFrom(forward);

    // Set burst cooldown
    this.primaryCooldownTimer = (GameConfig.cowboy.primary.cooldownMs + GameConfig.cowboy.primary.delayBetweenShotsMs) / 1000;
    return true;
  }

  public trySecondaryAttack(origin: Vector3, forward: Vector3): boolean {
    if (this.secondaryCooldownTimer > 0) {
      return false;
    }

    this.tossCoin(origin, forward);
    this.secondaryCooldownTimer = GameConfig.cowboy.coin.cooldownMs / 1000;
    return true;
  }

  private tossCoin(origin: Vector3, forward: Vector3): void {
    // Spawn coin slightly ahead and above eye level
    const spawnPos = origin.clone().add(forward.scale(1.2)).add(new Vector3(0, 0.3, 0));

    const coinMesh = MeshBuilder.CreateCylinder('coin', {
      diameter: GameConfig.cowboy.coin.radius * 2,
      height: 0.08,
      tessellation: 16,
    }, this.scene);
    coinMesh.position.copyFrom(spawnPos);
    coinMesh.material = this.coinMaterial;

    // Upward + forward velocity for arc
    const tossVel = forward.scale(GameConfig.cowboy.coin.tossForwardSpeed);
    tossVel.y = GameConfig.cowboy.coin.tossUpwardSpeed;

    const lifetime = GameConfig.cowboy.coin.lifetimeMs / 1000;
    this.activeCoins.push({
      mesh: coinMesh,
      velocity: tossVel,
      lifetime,
      maxLifetime: lifetime,
    });

    sounds.playCoinToss();
    this.combatSystem.spawnFloatingMessage('MOEDA LANÇADA!', '#ffd700', spawnPos);
  }

  private fireSingleRevolverBullet(origin: Vector3, forward: Vector3): void {
    sounds.playRevolverShot();

    const range = GameConfig.cowboy.primary.range;
    const ray = new Ray(origin, forward.normalize(), range);

    // 1. Check if hit active coin first!
    let hitCoinIdx = -1;
    let closestCoinDist = Infinity;

    for (let i = 0; i < this.activeCoins.length; i++) {
      const coin = this.activeCoins[i];
      const coinPos = coin.mesh.position;
      const toCoin = coinPos.subtract(origin);
      const projDist = Vector3.Dot(toCoin, forward);

      if (projDist > 0 && projDist < range) {
        const closestPointOnRay = origin.add(forward.scale(projDist));
        const distToRay = Vector3.Distance(closestPointOnRay, coinPos);

        // Generous hitbox for coin ricochet satisfying feel
        if (distToRay <= GameConfig.cowboy.coin.radius + 0.35 && projDist < closestCoinDist) {
          closestCoinDist = projDist;
          hitCoinIdx = i;
        }
      }
    }

    if (hitCoinIdx !== -1) {
      // Hit coin!
      const coin = this.activeCoins[hitCoinIdx];
      const coinPos = coin.mesh.position.clone();

      // Tracer from gun to coin
      this.combatSystem.createTracer(origin, coinPos, new Color3(1, 0.9, 0.2), 0.12);

      // Play coin hit sound
      sounds.playCoinHit();

      // Remove coin
      coin.mesh.dispose();
      this.activeCoins.splice(hitCoinIdx, 1);

      // Find nearest Target Dummy to redirect bullet
      const dummies = this.getDummies();
      let bestDummy: TargetDummy | null = null;
      let bestDist = Infinity;

      for (const dummy of dummies) {
        const dummyCenter = dummy.getPosition().add(new Vector3(0, 1.4, 0));
        const d = Vector3.Distance(coinPos, dummyCenter);
        if (d < bestDist) {
          bestDist = d;
          bestDummy = dummy;
        }
      }

      if (bestDummy) {
        const targetPos = bestDummy.getPosition().add(new Vector3(0, 1.4, 0));
        // Tracer from coin to dummy
        this.combatSystem.createTracer(coinPos, targetPos, new Color3(1, 0.8, 0.1), 0.25);
        // Deal critical damage!
        bestDummy.takeDamage(GameConfig.cowboy.coin.redirectDamage, true);
        this.combatSystem.spawnFloatingDamage(GameConfig.cowboy.coin.redirectDamage, true, targetPos);
        this.combatSystem.spawnFloatingMessage('RICOCHETE NA MOEDA!', '#ffd700', coinPos);
      } else {
        // No dummy found, tracer shoots forward
        const endPos = coinPos.add(forward.scale(30));
        this.combatSystem.createTracer(coinPos, endPos, new Color3(1, 0.8, 0.1), 0.15);
      }
      return;
    }

    // 2. Normal hitscan shot against world & dummies
    const pickInfo = this.scene.pickWithRay(ray, (mesh) => {
      return (
        !!mesh.metadata?.isTargetDummy ||
        !!mesh.metadata?.isArenaBoundary ||
        !!mesh.metadata?.isObstacle
      );
    });

    if (pickInfo && pickInfo.hit && pickInfo.pickedPoint) {
      const hitPoint = pickInfo.pickedPoint;
      this.combatSystem.createTracer(origin, hitPoint, new Color3(1, 0.8, 0.3), 0.08);

      const hitMesh = pickInfo.pickedMesh;
      if (hitMesh && hitMesh.metadata?.isTargetDummy && hitMesh.metadata.dummyInstance) {
        const dummy = hitMesh.metadata.dummyInstance as TargetDummy;
        const isHeadshot = !!hitMesh.metadata.isHeadshot;
        const damage = isHeadshot 
          ? GameConfig.cowboy.primary.damagePerShot * 1.5 
          : GameConfig.cowboy.primary.damagePerShot;

        dummy.takeDamage(damage, isHeadshot);
      }
    } else {
      // Miss into distance
      const endPoint = origin.add(forward.scale(range));
      this.combatSystem.createTracer(origin, endPoint, new Color3(1, 0.8, 0.3), 0.08);
    }
  }

  public update(dt: number): void {
    // Primary cooldown
    if (this.primaryCooldownTimer > 0) {
      this.primaryCooldownTimer = Math.max(0, this.primaryCooldownTimer - dt);
    }

    // Secondary cooldown
    if (this.secondaryCooldownTimer > 0) {
      this.secondaryCooldownTimer = Math.max(0, this.secondaryCooldownTimer - dt);
    }

    // Queued second shot
    if (this.queuedSecondShotTimer >= 0) {
      this.queuedSecondShotTimer -= dt;
      if (this.queuedSecondShotTimer <= 0) {
        this.queuedSecondShotTimer = -1;
        this.fireSingleRevolverBullet(this.pendingShotOrigin, this.pendingShotForward);
      }
    }

    // Update active coins
    for (let i = this.activeCoins.length - 1; i >= 0; i--) {
      const coin = this.activeCoins[i];
      coin.lifetime -= dt;

      if (coin.lifetime <= 0) {
        coin.mesh.dispose();
        this.activeCoins.splice(i, 1);
        continue;
      }

      // Physics: gravity + position step
      coin.velocity.y -= GameConfig.cowboy.coin.gravity * dt;
      coin.mesh.position.addInPlace(coin.velocity.scale(dt));

      // Fast rotation
      coin.mesh.rotation.x += dt * 12;
      coin.mesh.rotation.y += dt * 18;

      // Floor bounce or despawn if hitting floor
      if (coin.mesh.position.y <= 0.1) {
        coin.mesh.dispose();
        this.activeCoins.splice(i, 1);
      }
    }
  }

  public getWeaponState(): ClassWeaponState {
    const primaryTotal = (GameConfig.cowboy.primary.cooldownMs + GameConfig.cowboy.primary.delayBetweenShotsMs) / 1000;
    const secondaryTotal = GameConfig.cowboy.coin.cooldownMs / 1000;

    return {
      primaryReady: this.primaryCooldownTimer <= 0 && this.queuedSecondShotTimer < 0,
      primaryCooldownRatio: this.primaryCooldownTimer > 0 ? this.primaryCooldownTimer / primaryTotal : 0,
      secondaryReady: this.secondaryCooldownTimer <= 0,
      secondaryCooldownRatio: this.secondaryCooldownTimer > 0 ? this.secondaryCooldownTimer / secondaryTotal : 0,
      secondaryName: this.secondaryName,
      hintText: 'M1: Disparo Duplo (100ms) | M2: Moeda (atire nela para ricochetear!)',
    };
  }

  public reset(): void {
    this.primaryCooldownTimer = 0;
    this.secondaryCooldownTimer = 0;
    this.queuedSecondShotTimer = -1;
    for (const c of this.activeCoins) {
      c.mesh.dispose();
    }
    this.activeCoins = [];
  }

  public dispose(): void {
    this.reset();
    this.coinMaterial.dispose();
  }
}
