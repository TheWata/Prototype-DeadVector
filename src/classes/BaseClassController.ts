import { Vector3 } from '@babylonjs/core';

export interface ClassWeaponState {
  primaryReady: boolean;
  primaryCooldownRatio: number;
  secondaryReady: boolean;
  secondaryCooldownRatio: number;
  secondaryName: string;
  hintText: string;
}

export abstract class BaseClassController {
  public abstract readonly className: string;
  public abstract readonly secondaryName: string;

  public abstract tryPrimaryAttack(origin: Vector3, forward: Vector3): boolean;
  public abstract trySecondaryAttack(origin: Vector3, forward: Vector3): boolean;
  public abstract update(dt: number): void;
  public abstract getWeaponState(): ClassWeaponState;
  public abstract reset(): void;
  public abstract dispose(): void;
}
