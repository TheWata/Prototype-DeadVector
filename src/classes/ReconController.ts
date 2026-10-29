import {
  Scene,
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Ray,
  Mesh,
} from '@babylonjs/core';
import { BaseClassController } from './BaseClassController';
import type { ClassWeaponState } from './BaseClassController';
import { GameConfig } from '../config/GameConfig';
import { sounds } from '../audio/SoundSystem';
import { TargetDummy } from '../combat/TargetDummy';
import { CombatSystem } from '../combat/CombatSystem';

interface ActiveExplosionEffect {
  mesh: Mesh;
  material: StandardMaterial;
  lifetime: number;
  maxLifetime: number;
  maxRadius: number;
}

export class ReconController extends BaseClassController {
  public readonly className = 'Recon';
  public readonly secondaryName = 'Tiro Explosivo';

  private scene: Scene;
  private combatSystem: CombatSystem;
  private getDummies: () => TargetDummy[];

  // Primary state
  private primaryCooldownTimer: number = 0;

  // Secondary explosive state
  private secondaryCooldownTimer: number = 0;
  private activeExplosions: ActiveExplosionEffect[] = [];

  constructor(scene: Scene, combatSystem: CombatSystem, getDummies: () => TargetDummy[]) {
    super();
    this.scene = scene;
    this.combatSystem = combatSystem;
    this.getDummies = getDummies;
  }

  public tryPrimaryAttack(origin: Vector3, forward: Vector3): boolean {
    if (this.primaryCooldownTimer > 0) {
      return false;
    }

    this.firePiercingSniper(origin, forward);
    this.primaryCooldownTimer = GameConfig.recon.primary.cooldownMs / 1000;
    return true;
  }

  private firePiercingSniper(startOrigin: Vector3, startDir: Vector3): void {
    sounds.playSniper();

    const range = GameConfig.recon.primary.range;
    const damage = GameConfig.recon.primary.damage;
    const maxRicochetDist = GameConfig.recon.primary.maxRicochetDist;

    const hitDummiesSet = new Set<TargetDummy>();

    // Initial ray
    let currentOrigin = startOrigin.clone();
    let currentDir = startDir.normalize().clone();
    let remainingRange: number = range;
    let hasRicocheted = false;

    // Segment processing
    while (remainingRange > 1) {
      const ray = new Ray(currentOrigin, currentDir, remainingRange);

      const pick = this.scene.pickWithRay(ray, (mesh) => {
        return (
          !!mesh.metadata?.isTargetDummy ||
          !!mesh.metadata?.isArenaBoundary ||
          !!mesh.metadata?.isObstacle ||
          !!mesh.metadata?.isRicochet
        );
      });

      if (!pick || !pick.hit || !pick.pickedPoint) {
        // Traveled full remaining distance without hit
        const endPoint = currentOrigin.add(currentDir.scale(remainingRange));
        this.combatSystem.createTracer(currentOrigin, endPoint, new Color3(0, 0.9, 1), 0.18);
        break;
      }

      const hitPoint = pick.pickedPoint;
      const hitMesh = pick.pickedMesh;
      const distToHit = Vector3.Distance(currentOrigin, hitPoint);

      // Create tracer for this segment
      this.combatSystem.createTracer(currentOrigin, hitPoint, new Color3(0, 0.9, 1), 0.18);

      if (hitMesh && hitMesh.metadata?.isTargetDummy && hitMesh.metadata.dummyInstance) {
        const dummy = hitMesh.metadata.dummyInstance as TargetDummy;
        const isHead = !!hitMesh.metadata.isHeadshot;

        // Ensure each target is damaged at most once per shot
        if (!hitDummiesSet.has(dummy)) {
          hitDummiesSet.add(dummy);
          const dmg = isHead ? damage * 1.5 : damage;
          dummy.takeDamage(dmg, isHead);
          this.combatSystem.spawnFloatingDamage(dmg, isHead, hitPoint);
          this.combatSystem.spawnFloatingMessage('PENETRAÇÃO!', '#00e5ff', hitPoint);
        }

        // Piercing: continue ray past this dummy
        currentOrigin = hitPoint.add(currentDir.scale(0.35));
        remainingRange -= (distToHit + 0.35);
        continue;
      }

      // Check if it's a designated ricochet panel and we haven't ricocheted yet
      if (hitMesh && hitMesh.metadata?.isRicochet && !hasRicocheted) {
        hasRicocheted = true;
        const normal = pick.getNormal(true);

        if (normal) {
          // Reflection: R = D - 2*(D . N)*N
          const dot = Vector3.Dot(currentDir, normal);
          const reflectDir = currentDir.subtract(normal.scale(2 * dot)).normalize();

          this.combatSystem.spawnFloatingMessage('RICOCHETE!', '#00ffff', hitPoint);

          // Cast ricochet segment up to maxRicochetDist
          currentOrigin = hitPoint.add(reflectDir.scale(0.2));
          currentDir = reflectDir;
          remainingRange = Math.min(remainingRange, maxRicochetDist);
          continue;
        }
      }

      // Hit a standard solid wall / floor / ceiling / obstacle: ray stops
      break;
    }
  }

  public trySecondaryAttack(origin: Vector3, forward: Vector3): boolean {
    if (this.secondaryCooldownTimer > 0) {
      return false;
    }

    this.fireExplosiveShot(origin, forward);
    this.secondaryCooldownTimer = GameConfig.recon.explosive.cooldownMs / 1000;
    return true;
  }

  private fireExplosiveShot(origin: Vector3, forward: Vector3): void {
    const range = GameConfig.recon.explosive.range;
    const ray = new Ray(origin, forward.normalize(), range);

    const pick = this.scene.pickWithRay(ray, (mesh) => {
      return (
        !!mesh.metadata?.isTargetDummy ||
        !!mesh.metadata?.isArenaBoundary ||
        !!mesh.metadata?.isObstacle ||
        !!mesh.metadata?.isRicochet
      );
    });

    let impactPoint: Vector3;
    if (pick && pick.hit && pick.pickedPoint) {
      impactPoint = pick.pickedPoint;
    } else {
      impactPoint = origin.add(forward.scale(range));
    }

    // Tracer to impact point
    this.combatSystem.createTracer(origin, impactPoint, new Color3(1, 0.4, 0.1), 0.15);

    // Trigger radial explosion at impact point
    this.triggerExplosion(impactPoint);
  }

  private triggerExplosion(center: Vector3): void {
    sounds.playExplosion();

    const maxDamage = GameConfig.recon.explosive.damageMax;
    const radius = GameConfig.recon.explosive.radius;

    // Visual expanding shockwave sphere
    const sphere = MeshBuilder.CreateSphere('explosionSphere', { diameter: 1.0, segments: 14 }, this.scene);
    sphere.position.copyFrom(center);

    const mat = new StandardMaterial('explosionMat', this.scene);
    mat.diffuseColor = new Color3(1, 0.4, 0.1);
    mat.emissiveColor = new Color3(1, 0.5, 0.1);
    mat.alpha = 0.85;
    sphere.material = mat;

    this.activeExplosions.push({
      mesh: sphere,
      material: mat,
      lifetime: 0.28,
      maxLifetime: 0.28,
      maxRadius: radius,
    });

    // Check damage on all dummies within blast radius
    const dummies = this.getDummies();
    for (const dummy of dummies) {
      const dummyPos = dummy.getPosition().add(new Vector3(0, 1.2, 0));
      const dist = Vector3.Distance(center, dummyPos);

      if (dist <= radius) {
        // Falloff: max at center, decreases linearly towards edge
        const falloff = 1 - (dist / radius);
        const damage = Math.round(maxDamage * Math.max(0.15, falloff));

        dummy.takeDamage(damage, false);
        this.combatSystem.spawnFloatingDamage(damage, false, dummyPos);
      }
    }

    this.combatSystem.spawnFloatingMessage('EXPLOSÃO!', '#ff6b35', center);
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

    // Update active explosion visuals
    for (let i = this.activeExplosions.length - 1; i >= 0; i--) {
      const exp = this.activeExplosions[i];
      exp.lifetime -= dt;

      if (exp.lifetime <= 0) {
        exp.mesh.dispose();
        exp.material.dispose();
        this.activeExplosions.splice(i, 1);
        continue;
      }

      // Expand sphere and fade alpha
      const progress = 1 - (exp.lifetime / exp.maxLifetime);
      const currentScale = Math.max(0.5, progress * exp.maxRadius * 2);
      exp.mesh.scaling.set(currentScale, currentScale, currentScale);
      exp.material.alpha = (1 - progress) * 0.8;
    }
  }

  public getWeaponState(): ClassWeaponState {
    const primaryTotal = GameConfig.recon.primary.cooldownMs / 1000;
    const secondaryTotal = GameConfig.recon.explosive.cooldownMs / 1000;

    return {
      primaryReady: this.primaryCooldownTimer <= 0,
      primaryCooldownRatio: this.primaryCooldownTimer > 0 ? this.primaryCooldownTimer / primaryTotal : 0,
      secondaryReady: this.secondaryCooldownTimer <= 0,
      secondaryCooldownRatio: this.secondaryCooldownTimer > 0 ? this.secondaryCooldownTimer / secondaryTotal : 0,
      secondaryName: this.secondaryName,
      hintText: 'M1: Sniper Penetrante (Ricocheteia em painéis azuis) | M2: Tiro Explosivo (Área)',
    };
  }

  public reset(): void {
    this.primaryCooldownTimer = 0;
    this.secondaryCooldownTimer = 0;
    for (const exp of this.activeExplosions) {
      exp.mesh.dispose();
      exp.material.dispose();
    }
    this.activeExplosions = [];
  }

  public dispose(): void {
    this.reset();
  }
}
