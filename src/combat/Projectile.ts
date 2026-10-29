import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Mesh,
} from '@babylonjs/core';

export class Projectile {
  public mesh: Mesh;
  public velocity: Vector3;
  public radius: number;
  public damage: number;
  public isFriendly: boolean;
  public isReflected: boolean = false;
  public isAlive: boolean = true;
  private lifetime: number;
  private material: StandardMaterial;

  constructor(
    scene: Scene,
    startPos: Vector3,
    direction: Vector3,
    speed: number,
    damage: number,
    radius: number,
    lifetimeSeconds: number,
    isFriendly: boolean = false
  ) {
    this.velocity = direction.normalize().scale(speed);
    this.damage = damage;
    this.radius = radius;
    this.lifetime = lifetimeSeconds;
    this.isFriendly = isFriendly;

    // Create glowing sphere
    this.mesh = MeshBuilder.CreateSphere('projectile', { diameter: radius * 2, segments: 12 }, scene);
    this.mesh.position = startPos.clone();

    this.material = new StandardMaterial('projMat', scene);
    if (this.isFriendly) {
      this.material.diffuseColor = new Color3(0, 0.9, 1);
      this.material.emissiveColor = new Color3(0, 0.8, 1);
    } else {
      // Training/enemy projectile: glowing red/orange
      this.material.diffuseColor = new Color3(1, 0.2, 0.1);
      this.material.emissiveColor = new Color3(1, 0.3, 0.1);
    }
    this.mesh.material = this.material;
  }

  public markAsReflected(newDirection: Vector3, newSpeed: number, newDamage: number): void {
    this.isReflected = true;
    this.isFriendly = true;
    this.damage = newDamage;
    this.velocity = newDirection.normalize().scale(newSpeed);

    // Turn into glorious bright parry color (electric cyan / gold)
    this.material.diffuseColor = new Color3(0.1, 1, 0.9);
    this.material.emissiveColor = new Color3(0.2, 1, 0.9);
    this.lifetime = 4.0; // reset lifetime so it can hit dummy
  }

  public update(dt: number): void {
    if (!this.isAlive) return;

    this.lifetime -= dt;
    if (this.lifetime <= 0) {
      this.destroy();
      return;
    }

    this.mesh.position.addInPlace(this.velocity.scale(dt));
  }

  public destroy(): void {
    if (!this.isAlive) return;
    this.isAlive = false;
    this.mesh.dispose();
  }
}
