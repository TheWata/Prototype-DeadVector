import {
  Scene,
  Vector3,
  MeshBuilder,
  Color3,
  Ray,
  LinesMesh,
} from '@babylonjs/core';
import { BaseClassController } from './BaseClassController';
import type { ClassWeaponState } from './BaseClassController';
import { GameConfig } from '../config/GameConfig';
import { sounds } from '../audio/SoundSystem';
import { TargetDummy } from '../combat/TargetDummy';
import { CombatSystem } from '../combat/CombatSystem';
import { PlayerController } from '../player/PlayerController';

export class EnforcerController extends BaseClassController {
  public readonly className = 'Enforcer';
  public readonly secondaryName = 'Gancho';

  private scene: Scene;
  private combatSystem: CombatSystem;
  private player: PlayerController;

  // Primary state
  private primaryCooldownTimer: number = 0;

  // Secondary hook state
  private secondaryCooldownTimer: number = 0;
  private isHookActive: boolean = false;
  private hookTargetDummy: TargetDummy | null = null;
  private hookAnchorPoint: Vector3 | null = null;
  private cableLine: LinesMesh | null = null;

  constructor(
    scene: Scene,
    combatSystem: CombatSystem,
    player: PlayerController
  ) {
    super();
    this.scene = scene;
    this.combatSystem = combatSystem;
    this.player = player;
  }

  public tryPrimaryAttack(origin: Vector3, forward: Vector3): boolean {
    if (this.primaryCooldownTimer > 0) {
      return false;
    }

    this.fireShotgun(origin, forward);
    this.primaryCooldownTimer = GameConfig.enforcer.primary.cooldownMs / 1000;
    return true;
  }

  private fireShotgun(origin: Vector3, forward: Vector3): void {
    sounds.playShotgun();

    const pelletCount = GameConfig.enforcer.primary.pelletCount;
    const spreadRad = GameConfig.enforcer.primary.spreadRad;
    const range = GameConfig.enforcer.primary.range;
    const damagePerPellet = GameConfig.enforcer.primary.damagePerPellet;

    // Track damage per dummy to aggregate
    const dummyHits = new Map<TargetDummy, { count: number; totalDmg: number; isCrit: boolean }>();

    for (let i = 0; i < pelletCount; i++) {
      // Generate random angular offset within cone
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * spreadRad;
      const offsetX = Math.cos(angle) * radius;
      const offsetY = Math.sin(angle) * radius;

      // Compute right and up relative to forward
      let right = Vector3.Cross(forward, Vector3.Up());
      if (right.lengthSquared() < 0.001) {
        right = Vector3.Cross(forward, new Vector3(0, 0, 1));
      }
      right.normalize();
      const up = Vector3.Cross(right, forward).normalize();

      const pelletDir = forward.add(right.scale(offsetX)).add(up.scale(offsetY)).normalize();
      const ray = new Ray(origin, pelletDir, range);

      const pick = this.scene.pickWithRay(ray, (mesh) => {
        return (
          !!mesh.metadata?.isTargetDummy ||
          !!mesh.metadata?.isArenaBoundary ||
          !!mesh.metadata?.isObstacle
        );
      });

      if (pick && pick.hit && pick.pickedPoint) {
        const hitPoint = pick.pickedPoint;
        this.combatSystem.createTracer(origin, hitPoint, new Color3(1, 0.45, 0.1), 0.06);

        const hitMesh = pick.pickedMesh;
        if (hitMesh && hitMesh.metadata?.isTargetDummy && hitMesh.metadata.dummyInstance) {
          const dummy = hitMesh.metadata.dummyInstance as TargetDummy;
          const isHead = !!hitMesh.metadata.isHeadshot;
          const pelletDmg = isHead ? damagePerPellet * 1.5 : damagePerPellet;

          const current = dummyHits.get(dummy) || { count: 0, totalDmg: 0, isCrit: false };
          current.count++;
          current.totalDmg += pelletDmg;
          if (isHead) current.isCrit = true;
          dummyHits.set(dummy, current);
        }
      } else {
        const endPoint = origin.add(pelletDir.scale(range));
        this.combatSystem.createTracer(origin, endPoint, new Color3(1, 0.45, 0.1), 0.06);
      }
    }

    // Apply accumulated hits per dummy
    dummyHits.forEach((hit, dummy) => {
      dummy.takeDamage(hit.totalDmg, hit.isCrit);
    });
  }

  public trySecondaryAttack(origin: Vector3, forward: Vector3): boolean {
    // If hook is already active, pressing M2 cancels it
    if (this.isHookActive) {
      this.cancelHook();
      return true;
    }

    if (this.secondaryCooldownTimer > 0) {
      return false;
    }

    this.launchHook(origin, forward);
    return true;
  }

  private launchHook(origin: Vector3, forward: Vector3): void {
    const maxDist = GameConfig.enforcer.hook.maxDistance;
    const ray = new Ray(origin, forward.normalize(), maxDist);

    sounds.playGrappleFire();

    const pick = this.scene.pickWithRay(ray, (mesh) => {
      return (
        !!mesh.metadata?.isTargetDummy ||
        !!mesh.metadata?.isArenaBoundary ||
        !!mesh.metadata?.isObstacle ||
        !!mesh.metadata?.isRicochet
      );
    });

    if (pick && pick.hit && pick.pickedPoint) {
      const hitPoint = pick.pickedPoint;
      const hitMesh = pick.pickedMesh;

      sounds.playGrappleLatch();

      // Check if target is dummy
      if (hitMesh && hitMesh.metadata?.isTargetDummy && hitMesh.metadata.dummyInstance) {
        const dummy = hitMesh.metadata.dummyInstance as TargetDummy;
        const weight = dummy.getWeight();

        if (weight === 1) {
          // Weight 1: Pull target towards player!
          this.hookTargetDummy = dummy;
          this.hookAnchorPoint = null;
          dummy.startBeingPulled(origin);
          this.combatSystem.spawnFloatingMessage('PUXANDO ALVO (PESO 1)!', '#38ef7d', hitPoint);
        } else {
          // Weight > 1: Target too heavy, pulls player towards dummy!
          this.hookTargetDummy = null;
          this.hookAnchorPoint = hitPoint.clone();
          this.player.startGrapplePull(hitPoint);
          this.combatSystem.spawnFloatingMessage('ALVO PESADO! PUXANDO JOGADOR!', '#ffa07a', hitPoint);
        }
      } else {
        // Surface hook: Pull player toward anchor point!
        this.hookTargetDummy = null;
        this.hookAnchorPoint = hitPoint.clone();
        this.player.startGrapplePull(hitPoint);
        this.combatSystem.spawnFloatingMessage('GANCHO FIXADO!', '#00e5ff', hitPoint);
      }

      this.isHookActive = true;
      this.secondaryCooldownTimer = GameConfig.enforcer.hook.cooldownMs / 1000;
    } else {
      // Missed hook shot
      this.secondaryCooldownTimer = 0.4;
      const endPoint = origin.add(forward.scale(maxDist));
      this.combatSystem.createTracer(origin, endPoint, new Color3(0.5, 0.5, 0.5), 0.1);
    }
  }

  public cancelHook(): void {
    if (this.isHookActive) {
      if (this.hookTargetDummy) {
        this.hookTargetDummy.stopBeingPulled();
        this.hookTargetDummy = null;
      }
      if (this.hookAnchorPoint) {
        this.player.cancelGrapple();
        this.hookAnchorPoint = null;
      }
      this.isHookActive = false;
      this.disposeCable();
    }
  }

  private disposeCable(): void {
    if (this.cableLine) {
      this.cableLine.dispose();
      this.cableLine = null;
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

    // Update active hook cable and status
    if (this.isHookActive) {
      const playerHandPos = this.player.getPosition().add(new Vector3(0, -0.2, 0));
      let targetPos: Vector3 | null = null;

      if (this.hookTargetDummy) {
        // Pulling dummy
        targetPos = this.hookTargetDummy.getPosition().add(new Vector3(0, 1.2, 0));
        const dist = Vector3.Distance(playerHandPos, targetPos);
        if (dist < 2.5) {
          this.cancelHook();
        }
      } else if (this.hookAnchorPoint) {
        // Pulling player
        targetPos = this.hookAnchorPoint;
        if (!this.player.isGrapplingActive()) {
          this.cancelHook();
        }
      }

      // Draw or update dynamic cable line
      if (this.isHookActive && targetPos) {
        this.disposeCable();
        this.cableLine = MeshBuilder.CreateLines('hookCable', {
          points: [playerHandPos, targetPos],
          updatable: false,
        }, this.scene);
        this.cableLine.color = new Color3(0, 0.9, 1);
      }
    }
  }

  public getWeaponState(): ClassWeaponState {
    const primaryTotal = GameConfig.enforcer.primary.cooldownMs / 1000;
    const secondaryTotal = GameConfig.enforcer.hook.cooldownMs / 1000;

    let hint = 'M1: Escopeta (10 pellets) | M2: Gancho (Puxa superfícies ou alvos peso 1)';
    if (this.isHookActive) {
      hint = 'GANCHO ATIVO | Pressione M2 ou Espaço para soltar';
    }

    return {
      primaryReady: this.primaryCooldownTimer <= 0,
      primaryCooldownRatio: this.primaryCooldownTimer > 0 ? this.primaryCooldownTimer / primaryTotal : 0,
      secondaryReady: this.secondaryCooldownTimer <= 0 && !this.isHookActive,
      secondaryCooldownRatio: this.secondaryCooldownTimer > 0 ? this.secondaryCooldownTimer / secondaryTotal : 0,
      secondaryName: this.isHookActive ? 'Soltar Gancho' : this.secondaryName,
      hintText: hint,
    };
  }

  public reset(): void {
    this.primaryCooldownTimer = 0;
    this.secondaryCooldownTimer = 0;
    this.cancelHook();
  }

  public dispose(): void {
    this.reset();
  }
}
