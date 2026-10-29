import {
  Scene,
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Ray,
  LinesMesh,
} from '@babylonjs/core';
import { Projectile } from './Projectile';
import { TargetDummy } from './TargetDummy';
import { PlayerController } from '../player/PlayerController';

export interface VisualTracer {
  mesh: LinesMesh;
  material?: StandardMaterial;
  lifetime: number;
  maxLifetime: number;
}

export interface FloatingText {
  id: number;
  text: string;
  worldPos: Vector3;
  color: string;
  isCrit: boolean;
  lifetime: number;
  maxLifetime: number;
}

export class CombatSystem {
  private scene: Scene;
  private projectiles: Projectile[] = [];
  private activeTracers: VisualTracer[] = [];
  private floatingTexts: FloatingText[] = [];
  private nextTextId: number = 0;

  // Callbacks
  private onHitmarker?: () => void;
  private onPlayerDamage?: (dmg: number) => void;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  public setCallbacks(onHitmarker: () => void, onPlayerDamage: (dmg: number) => void): void {
    this.onHitmarker = onHitmarker;
    this.onPlayerDamage = onPlayerDamage;
  }

  public addProjectile(proj: Projectile): void {
    this.projectiles.push(proj);
  }

  public getProjectiles(): Projectile[] {
    return this.projectiles;
  }

  public createTracer(start: Vector3, end: Vector3, color: Color3 = new Color3(1, 0.9, 0.4), duration: number = 0.08): void {
    const lineMesh = MeshBuilder.CreateLines('tracer', {
      points: [start, end],
      updatable: false,
    }, this.scene);
    lineMesh.color = color;

    this.activeTracers.push({
      mesh: lineMesh,
      lifetime: duration,
      maxLifetime: duration,
    });
  }

  public spawnFloatingDamage(damage: number, isCrit: boolean, pos: Vector3): void {
    const text = isCrit ? `CRIT ${Math.round(damage)}!` : `${Math.round(damage)}`;
    const color = isCrit ? '#ffd700' : '#ffffff';

    this.floatingTexts.push({
      id: this.nextTextId++,
      text,
      worldPos: pos.clone().add(new Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4)),
      color,
      isCrit,
      lifetime: 0.9,
      maxLifetime: 0.9,
    });
  }

  public spawnFloatingMessage(msg: string, color: string, pos: Vector3): void {
    this.floatingTexts.push({
      id: this.nextTextId++,
      text: msg,
      worldPos: pos.clone(),
      color,
      isCrit: true,
      lifetime: 1.2,
      maxLifetime: 1.2,
    });
  }

  public getFloatingTexts(): FloatingText[] {
    return this.floatingTexts;
  }

  public update(dt: number, dummies: TargetDummy[], player: PlayerController): void {
    // 1. Update visual tracers
    for (let i = this.activeTracers.length - 1; i >= 0; i--) {
      const tracer = this.activeTracers[i];
      tracer.lifetime -= dt;
      if (tracer.lifetime <= 0) {
        tracer.mesh.dispose();
        this.activeTracers.splice(i, 1);
      }
    }

    // 2. Update floating texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const text = this.floatingTexts[i];
      text.lifetime -= dt;
      // Drift upwards
      text.worldPos.y += dt * 1.5;
      if (text.lifetime <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // 3. Update projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      if (!proj.isAlive) {
        this.projectiles.splice(i, 1);
        continue;
      }

      const prevPos = proj.mesh.position.clone();
      proj.update(dt);
      const currPos = proj.mesh.position;

      // Check collision along trajectory
      const travelVec = currPos.subtract(prevPos);
      const travelDist = travelVec.length();

      if (travelDist > 0.001) {
        const moveRay = new Ray(prevPos, travelVec.normalize(), travelDist + proj.radius);

        // A) If hostile (training projectile not parried), check hit with player
        if (!proj.isFriendly) {
          const playerPos = player.getPosition();
          const distToPlayer = Vector3.Distance(currPos, playerPos);

          if (distToPlayer <= proj.radius + 0.7) {
            // Hit player!
            player.takeDamage(proj.damage);
            this.onPlayerDamage?.(proj.damage);
            proj.destroy();
            this.projectiles.splice(i, 1);
            continue;
          }
        }

        // B) If friendly / reflected, check hit with dummies
        if (proj.isFriendly || proj.isReflected) {
          let hitDummy = false;
          for (const dummy of dummies) {
            const dummyPos = dummy.getPosition().add(new Vector3(0, 1.2, 0));
            const distToDummy = Vector3.Distance(currPos, dummyPos);

            if (distToDummy <= proj.radius + 1.0) {
              dummy.takeDamage(proj.damage, true);
              this.onHitmarker?.();
              this.spawnFloatingDamage(proj.damage, true, dummyPos);
              proj.destroy();
              this.projectiles.splice(i, 1);
              hitDummy = true;
              break;
            }
          }
          if (hitDummy) continue;
        }

        // C) Arena wall / ground collision
        const hitResult = this.scene.pickWithRay(moveRay, (mesh) => {
          return !!mesh.metadata?.isArenaBoundary || !!mesh.metadata?.isObstacle;
        });

        if (hitResult && hitResult.hit) {
          proj.destroy();
          this.projectiles.splice(i, 1);
          continue;
        }
      }
    }
  }

  public clearAll(): void {
    for (const proj of this.projectiles) {
      proj.destroy();
    }
    this.projectiles = [];

    for (const t of this.activeTracers) {
      t.mesh.dispose();
    }
    this.activeTracers = [];
    this.floatingTexts = [];
  }
}
