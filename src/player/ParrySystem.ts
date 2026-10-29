import { Vector3 } from '@babylonjs/core';
import { GameConfig } from '../config/GameConfig';
import { sounds } from '../audio/SoundSystem';
import { Projectile } from '../combat/Projectile';

export class ParrySystem {
  private isParryActive: boolean = false;
  private parryTimer: number = 0;
  private cooldownTimer: number = 0;
  private onParrySuccessCallback?: () => void;

  public setOnParrySuccess(cb: () => void): void {
    this.onParrySuccessCallback = cb;
  }

  public triggerParry(
    playerPosition: Vector3,
    cameraForward: Vector3,
    projectiles: Projectile[]
  ): boolean {
    if (this.cooldownTimer > 0) {
      return false;
    }

    this.isParryActive = true;
    this.parryTimer = GameConfig.parry.windowMs / 1000;
    this.cooldownTimer = GameConfig.parry.cooldownMs / 1000;

    // Check immediately for any projectile currently in range
    const intercepted = this.checkInterceptions(playerPosition, cameraForward, projectiles);
    if (!intercepted) {
      sounds.playParryMiss();
    }

    return true;
  }

  public update(
    dt: number,
    playerPosition: Vector3,
    cameraForward: Vector3,
    projectiles: Projectile[]
  ): void {
    if (this.cooldownTimer > 0) {
      this.cooldownTimer = Math.max(0, this.cooldownTimer - dt);
    }

    if (this.isParryActive) {
      this.parryTimer -= dt;
      if (this.parryTimer <= 0) {
        this.isParryActive = false;
      } else {
        // Continue checking during the active window
        this.checkInterceptions(playerPosition, cameraForward, projectiles);
      }
    }
  }

  private checkInterceptions(
    playerPosition: Vector3,
    cameraForward: Vector3,
    projectiles: Projectile[]
  ): boolean {
    let anyIntercepted = false;
    const forwardNorm = cameraForward.clone().normalize();

    for (const proj of projectiles) {
      if (!proj.isAlive || proj.isFriendly || proj.isReflected) {
        continue;
      }

      const toProj = proj.mesh.position.subtract(playerPosition);
      const dist = toProj.length();

      if (dist <= GameConfig.parry.reachDistance) {
        const toProjDir = toProj.normalize();
        const dot = Vector3.Dot(forwardNorm, toProjDir);

        // Within forward cone (or very close proximity <= 2m)
        if (dot >= GameConfig.parry.reachAngleCos || dist <= 2.2) {
          // Parry successful!
          proj.mesh.position = playerPosition.add(forwardNorm.scale(1.2));
          proj.markAsReflected(
            forwardNorm,
            GameConfig.parry.reflectedSpeed,
            GameConfig.parry.reflectedDamage
          );

          sounds.playParryClang();
          this.onParrySuccessCallback?.();
          anyIntercepted = true;
        }
      }
    }

    return anyIntercepted;
  }

  public isWindowActive(): boolean {
    return this.isParryActive;
  }

  public isReady(): boolean {
    return this.cooldownTimer <= 0;
  }

  public getCooldownRatio(): number {
    const total = GameConfig.parry.cooldownMs / 1000;
    if (this.cooldownTimer <= 0) return 0;
    return this.cooldownTimer / total;
  }

  public reset(): void {
    this.isParryActive = false;
    this.parryTimer = 0;
    this.cooldownTimer = 0;
  }
}
