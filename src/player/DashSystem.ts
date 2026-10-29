import { Vector3 } from '@babylonjs/core';
import { GameConfig } from '../config/GameConfig';
import { sounds } from '../audio/SoundSystem';

export class DashSystem {
  private isDashing: boolean = false;
  private dashTimeRemaining: number = 0;
  private cooldownTimer: number = 0;
  private dashDirection: Vector3 = Vector3.Zero();

  public tryDash(
    inputDirection: Vector3,
    cameraForwardHorizontal: Vector3,
    onDashStart?: () => void
  ): boolean {
    if (this.cooldownTimer > 0 || this.isDashing) {
      return false;
    }

    // Determine direction: input direction if moving, else camera forward
    if (inputDirection.lengthSquared() > 0.001) {
      this.dashDirection = inputDirection.clone().normalize();
    } else {
      this.dashDirection = cameraForwardHorizontal.clone().normalize();
    }

    // Ensure strictly horizontal dash
    this.dashDirection.y = 0;
    this.dashDirection.normalize();

    this.isDashing = true;
    this.dashTimeRemaining = GameConfig.dash.durationMs / 1000;
    this.cooldownTimer = GameConfig.dash.cooldownMs / 1000;

    sounds.playDash();
    onDashStart?.();
    return true;
  }

  public update(dt: number): void {
    if (this.cooldownTimer > 0) {
      this.cooldownTimer = Math.max(0, this.cooldownTimer - dt);
    }

    if (this.isDashing) {
      this.dashTimeRemaining -= dt;
      if (this.dashTimeRemaining <= 0) {
        this.isDashing = false;
      }
    }
  }

  public getIsDashing(): boolean {
    return this.isDashing;
  }

  public getDashVelocity(): Vector3 {
    if (!this.isDashing) return Vector3.Zero();
    return this.dashDirection.scale(GameConfig.dash.speed);
  }

  public getCooldownRatio(): number {
    const total = GameConfig.dash.cooldownMs / 1000;
    if (this.cooldownTimer <= 0) return 0;
    return this.cooldownTimer / total;
  }

  public isReady(): boolean {
    return this.cooldownTimer <= 0 && !this.isDashing;
  }

  public reset(): void {
    this.isDashing = false;
    this.dashTimeRemaining = 0;
    this.cooldownTimer = 0;
  }
}
