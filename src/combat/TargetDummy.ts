import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Mesh,
} from '@babylonjs/core';
import { GameConfig } from '../config/GameConfig';
import { Projectile } from './Projectile';
import { sounds } from '../audio/SoundSystem';

export class TargetDummy {
  public rootMesh: Mesh;
  public colliders: Mesh[] = [];
  public name: string;

  private scene: Scene;
  private spawnPosition: Vector3;
  private health: number = GameConfig.dummy.maxHealth;
  private maxHealth: number = GameConfig.dummy.maxHealth;
  private weight: number = GameConfig.dummy.lightWeight; // 1 = light (pullable), 5 = heavy
  private hitCount: number = 0;
  private totalDamageTaken: number = 0;

  // Visual materials
  private bodyMat: StandardMaterial;
  private headMat: StandardMaterial;
  private accentMat: StandardMaterial;
  private flashTimer: number = 0;

  // Grapple pull state (when Enforcer pulls dummy)
  private isBeingPulled: boolean = false;
  private pullTargetPos: Vector3 | null = null;

  // Floating damage indicators callback
  private onDamageCallback?: (damage: number, isCrit: boolean, pos: Vector3) => void;

  constructor(scene: Scene, position: Vector3, name: string = 'Alvo de Treinamento') {
    this.scene = scene;
    this.spawnPosition = position.clone();
    this.name = name;

    this.rootMesh = new Mesh(`dummyRoot_${name}`, scene);
    this.rootMesh.position = position.clone();

    // Materials
    this.bodyMat = new StandardMaterial(`dummyBodyMat_${name}`, scene);
    this.bodyMat.diffuseColor = new Color3(0.85, 0.25, 0.2); // Bold red-orange
    this.bodyMat.specularColor = new Color3(0.2, 0.2, 0.2);

    this.headMat = new StandardMaterial(`dummyHeadMat_${name}`, scene);
    this.headMat.diffuseColor = new Color3(0.9, 0.8, 0.2); // Yellow/gold head

    this.accentMat = new StandardMaterial(`dummyAccentMat_${name}`, scene);
    this.accentMat.diffuseColor = new Color3(0.15, 0.15, 0.18); // Dark metallic joints

    this.buildMeshes();
  }

  private buildMeshes(): void {
    // Base pedestal
    const base = MeshBuilder.CreateCylinder(`dummyBase_${this.name}`, { diameter: 1.4, height: 0.2 }, this.scene);
    base.parent = this.rootMesh;
    base.position.y = 0.1;
    base.material = this.accentMat;

    // Torso / Body cylinder
    const torso = MeshBuilder.CreateCylinder(`dummyTorso_${this.name}`, { diameterTop: 0.9, diameterBottom: 0.8, height: 1.4, tessellation: 16 }, this.scene);
    torso.parent = this.rootMesh;
    torso.position.y = 1.0;
    torso.material = this.bodyMat;
    torso.metadata = { isTargetDummy: true, dummyInstance: this };
    this.colliders.push(torso);

    // Target rings / cross emblem on chest
    const chestPlate = MeshBuilder.CreateBox(`dummyChest_${this.name}`, { width: 0.6, height: 0.6, depth: 0.95 }, this.scene);
    chestPlate.parent = this.rootMesh;
    chestPlate.position.y = 1.1;
    chestPlate.material = this.headMat;
    chestPlate.metadata = { isTargetDummy: true, dummyInstance: this };
    this.colliders.push(chestPlate);

    // Head
    const head = MeshBuilder.CreateSphere(`dummyHead_${this.name}`, { diameter: 0.65, segments: 12 }, this.scene);
    head.parent = this.rootMesh;
    head.position.y = 2.0;
    head.material = this.headMat;
    head.metadata = { isTargetDummy: true, dummyInstance: this, isHeadshot: true };
    this.colliders.push(head);
  }

  public setOnDamageCallback(cb: (damage: number, isCrit: boolean, pos: Vector3) => void): void {
    this.onDamageCallback = cb;
  }

  public takeDamage(amount: number, isCrit: boolean = false): void {
    this.health = Math.max(0, this.health - amount);
    this.hitCount++;
    this.totalDamageTaken += amount;

    // Trigger visual hit flash
    this.flashTimer = 0.08;
    this.bodyMat.emissiveColor = new Color3(1, 1, 1);
    this.headMat.emissiveColor = new Color3(1, 1, 0.8);

    sounds.playHitmarker();

    const worldPos = this.rootMesh.position.clone().add(new Vector3(0, 1.8, 0));
    this.onDamageCallback?.(amount, isCrit, worldPos);
  }

  public startBeingPulled(target: Vector3): void {
    if (this.weight === 1) {
      this.isBeingPulled = true;
      this.pullTargetPos = target.clone();
    }
  }

  public stopBeingPulled(): void {
    this.isBeingPulled = false;
    this.pullTargetPos = null;
  }

  public update(dt: number): void {
    // Recover flash color
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.bodyMat.emissiveColor = Color3.Black();
        this.headMat.emissiveColor = Color3.Black();
      }
    }

    // Grapple pull smooth movement
    if (this.isBeingPulled && this.pullTargetPos) {
      const toTarget = this.pullTargetPos.subtract(this.rootMesh.position);
      toTarget.y = 0; // keep on ground plane
      const dist = toTarget.length();

      if (dist < 1.8) {
        this.stopBeingPulled();
      } else {
        const moveDir = toTarget.normalize();
        const step = moveDir.scale(GameConfig.enforcer.hook.pullTargetSpeed * dt);
        this.rootMesh.position.addInPlace(step);
      }
    }
  }

  public fireTrainingProjectile(playerPos: Vector3): Projectile {
    const origin = this.rootMesh.position.clone().add(new Vector3(0, 1.6, 0));
    const target = playerPos.clone();
    const dir = target.subtract(origin).normalize();

    sounds.playTrainingProjectileLaunch();

    return new Projectile(
      this.scene,
      origin,
      dir,
      GameConfig.dummy.projectileSpeed,
      25,
      GameConfig.dummy.projectileRadius,
      GameConfig.dummy.projectileLifetimeMs / 1000,
      false // enemy/hostile projectile until parried!
    );
  }

  public toggleWeight(): number {
    this.weight = this.weight === GameConfig.dummy.lightWeight 
      ? GameConfig.dummy.heavyWeight 
      : GameConfig.dummy.lightWeight;
    return this.weight;
  }

  public setWeight(w: number): void {
    this.weight = w;
  }

  public getWeight(): number {
    return this.weight;
  }

  public resetHealth(): void {
    this.health = this.maxHealth;
    this.totalDamageTaken = 0;
    this.hitCount = 0;
  }

  public resetPosition(): void {
    this.stopBeingPulled();
    this.rootMesh.position.copyFrom(this.spawnPosition);
  }

  public getHealth(): number {
    return this.health;
  }

  public getMaxHealth(): number {
    return this.maxHealth;
  }

  public getHitCount(): number {
    return this.hitCount;
  }

  public getTotalDamage(): number {
    return this.totalDamageTaken;
  }

  public getPosition(): Vector3 {
    return this.rootMesh.position;
  }
}
