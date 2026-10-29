import {
  Scene,
  UniversalCamera,
  Vector3,
  Ray,
  Mesh,
} from '@babylonjs/core';
import { GameConfig } from '../config/GameConfig';
import { DashSystem } from './DashSystem';
import { ParrySystem } from './ParrySystem';
import { sounds } from '../audio/SoundSystem';

export class PlayerController {
  public camera: UniversalCamera;
  public dashSystem: DashSystem;
  public parrySystem: ParrySystem;

  private scene: Scene;
  private canvas: HTMLCanvasElement;
  private position: Vector3;
  private velocity: Vector3 = Vector3.Zero();

  // Mouse / Camera rotation
  private yaw: number = 0; // horizontal rotation in radians
  private pitch: number = 0; // vertical rotation in radians
  private mouseSensitivity: number = GameConfig.player.defaultSensitivity;
  private isPointerLocked: boolean = false;

  // Key states
  private keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
  };

  // State
  private isGrounded: boolean = false;
  private health: number = GameConfig.player.maxHealth;
  private defaultFov: number = GameConfig.player.defaultFov;
  private targetFov: number = GameConfig.player.defaultFov;

  // Grapple state (when Enforcer pulls player)
  private grapplePullTarget: Vector3 | null = null;
  private isGrappling: boolean = false;

  constructor(scene: Scene, canvas: HTMLCanvasElement) {
    this.scene = scene;
    this.canvas = canvas;

    this.position = new Vector3(0, GameConfig.player.cameraHeight, -16);
    this.camera = new UniversalCamera('playerCamera', this.position.clone(), this.scene);
    this.camera.fov = this.defaultFov;
    this.camera.minZ = 0.1;
    this.camera.maxZ = 300;

    // Detach Babylon default camera inputs so we handle FPS mouse/keys cleanly
    this.camera.inputs.clear();

    this.dashSystem = new DashSystem();
    this.parrySystem = new ParrySystem();

    this.setupInputs();
  }

  private setupInputs(): void {
    // Pointer lock on canvas click
    this.canvas.addEventListener('click', () => {
      if (!this.isPointerLocked) {
        this.canvas.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.canvas;
    });

    // Mouse movement
    window.addEventListener('mousemove', (e) => {
      if (!this.isPointerLocked) return;

      this.yaw += e.movementX * this.mouseSensitivity;
      this.pitch += e.movementY * this.mouseSensitivity;

      // Limit pitch to prevent flipping
      const maxPitch = (Math.PI / 2) - 0.02;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));

      this.updateCameraRotation();
    });

    // Keyboard
    window.addEventListener('keydown', (e) => {
      const code = e.code;
      if (code === 'KeyW') this.keys.forward = true;
      if (code === 'KeyS') this.keys.backward = true;
      if (code === 'KeyA') this.keys.left = true;
      if (code === 'KeyD') this.keys.right = true;

      if (code === 'Space') {
        if (!this.keys.jump && this.isGrounded) {
          this.jump();
        }
        // Jumping cancels grapple pull
        if (this.isGrappling) {
          this.cancelGrapple();
        }
        this.keys.jump = true;
      }

      if (code === 'ShiftLeft' || code === 'ShiftRight') {
        this.performDash();
      }
    });

    window.addEventListener('keyup', (e) => {
      const code = e.code;
      if (code === 'KeyW') this.keys.forward = false;
      if (code === 'KeyS') this.keys.backward = false;
      if (code === 'KeyA') this.keys.left = false;
      if (code === 'KeyD') this.keys.right = false;
      if (code === 'Space') this.keys.jump = false;
    });
  }

  private updateCameraRotation(): void {
    // Babylon camera rotation: x is pitch, y is yaw
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.z = 0;
  }

  public jump(): void {
    this.velocity.y = GameConfig.player.jumpForce;
    this.isGrounded = false;
    sounds.playJump();
  }

  public performDash(): boolean {
    const moveDir = this.getInputDirectionWorld();
    const camForward = this.getHorizontalForward();

    const success = this.dashSystem.tryDash(moveDir, camForward, () => {
      this.targetFov = this.defaultFov + GameConfig.dash.fovKick;
      // Slight upward nudge to make dash smooth across ground seams
      if (this.velocity.y < 0) this.velocity.y = 0;
    });

    return success;
  }

  public startGrapplePull(target: Vector3): void {
    this.isGrappling = true;
    this.grapplePullTarget = target.clone();
  }

  public cancelGrapple(): void {
    this.isGrappling = false;
    this.grapplePullTarget = null;
  }

  public isGrapplingActive(): boolean {
    return this.isGrappling;
  }

  public update(dt: number, arenaColliders: Mesh[]): void {
    // 1. Dash update
    this.dashSystem.update(dt);

    // FOV recovery
    if (this.dashSystem.getIsDashing()) {
      this.targetFov = this.defaultFov + GameConfig.dash.fovKick;
    } else {
      this.targetFov = this.defaultFov;
    }
    this.camera.fov += (this.targetFov - this.camera.fov) * Math.min(1, dt * 14);

    // 2. Grapple pull physics
    if (this.isGrappling && this.grapplePullTarget) {
      const toTarget = this.grapplePullTarget.subtract(this.position);
      const dist = toTarget.length();

      if (dist < GameConfig.enforcer.hook.stopDistance) {
        this.cancelGrapple();
      } else {
        const pullDir = toTarget.normalize();
        this.velocity = pullDir.scale(GameConfig.enforcer.hook.pullPlayerSpeed);
      }
    } else if (this.dashSystem.getIsDashing()) {
      // 3. Dash movement overrides horizontal velocity
      const dashVel = this.dashSystem.getDashVelocity();
      this.velocity.x = dashVel.x;
      this.velocity.z = dashVel.z;
      // Dash resists downward gravity slightly
      this.velocity.y = Math.max(this.velocity.y, -2.0);
    } else {
      // 4. Standard FPS WASD movement
      const inputDir = this.getInputDirectionWorld();
      const accel = this.isGrounded ? GameConfig.player.acceleration : GameConfig.player.acceleration * GameConfig.player.airControl;
      const targetSpeed = GameConfig.player.walkSpeed;

      if (inputDir.lengthSquared() > 0.001) {
        const desiredVelX = inputDir.x * targetSpeed;
        const desiredVelZ = inputDir.z * targetSpeed;

        this.velocity.x += (desiredVelX - this.velocity.x) * Math.min(1, accel * dt / targetSpeed);
        this.velocity.z += (desiredVelZ - this.velocity.z) * Math.min(1, accel * dt / targetSpeed);
      } else {
        // Friction
        const friction = this.isGrounded ? GameConfig.player.friction : GameConfig.player.friction * 0.2;
        this.velocity.x += (0 - this.velocity.x) * Math.min(1, friction * dt);
        this.velocity.z += (0 - this.velocity.z) * Math.min(1, friction * dt);
      }

      // Gravity
      this.velocity.y -= GameConfig.player.gravity * dt;
      if (this.velocity.y < -40) this.velocity.y = -40; // clamp terminal velocity
    }

    // 5. Kinematic movement step & collision resolution
    this.resolveKinematicMove(dt, arenaColliders);

    // 6. Sync camera position
    this.camera.position.copyFrom(this.position);
  }

  private resolveKinematicMove(dt: number, colliders: Mesh[]): void {
    const radius = GameConfig.player.radius;
    const height = GameConfig.player.height;
    const { width, depth, height: arenaHeight } = GameConfig.arena;
    const halfW = width / 2 - radius - 0.2;
    const halfD = depth / 2 - radius - 0.2;

    // Proposed new position
    const nextPos = this.position.add(this.velocity.scale(dt));

    // Ground check via downward raycast
    const feetPos = new Vector3(this.position.x, this.position.y - GameConfig.player.cameraHeight + 0.2, this.position.z);
    const downRay = new Ray(feetPos, new Vector3(0, -1, 0), 0.45);
    const hit = this.scene.pickWithRay(downRay, (m) => colliders.includes(m as Mesh));

    if (hit && hit.hit && hit.pickedPoint && this.velocity.y <= 0) {
      const groundY = hit.pickedPoint.y;
      if (nextPos.y - GameConfig.player.cameraHeight <= groundY + 0.15) {
        nextPos.y = groundY + GameConfig.player.cameraHeight;
        this.velocity.y = 0;
        this.isGrounded = true;
      }
    } else {
      this.isGrounded = false;
    }

    // Ceiling clamp
    const maxHeadY = arenaHeight - 0.3;
    if (nextPos.y > maxHeadY) {
      nextPos.y = maxHeadY;
      if (this.velocity.y > 0) this.velocity.y = 0;
    }

    // Arena boundary clamp (never clip outside walls)
    nextPos.x = Math.max(-halfW, Math.min(halfW, nextPos.x));
    nextPos.z = Math.max(-halfD, Math.min(halfD, nextPos.z));

    // Obstacle horizontal resolution (simple bounding box pushing for pillars)
    for (const collider of colliders) {
      if (collider.metadata?.isObstacle) {
        const bounds = collider.getBoundingInfo().boundingBox;
        const minX = bounds.minimumWorld.x - radius;
        const maxX = bounds.maximumWorld.x + radius;
        const minZ = bounds.minimumWorld.z - radius;
        const maxZ = bounds.maximumWorld.z + radius;
        const minY = bounds.minimumWorld.y;
        const maxY = bounds.maximumWorld.y;

        const playerFeet = nextPos.y - GameConfig.player.cameraHeight;
        const playerHead = playerFeet + height;

        if (
          nextPos.x >= minX &&
          nextPos.x <= maxX &&
          nextPos.z >= minZ &&
          nextPos.z <= maxZ &&
          playerHead >= minY &&
          playerFeet <= maxY
        ) {
          // Push out in the direction of least penetration
          const pushLeft = nextPos.x - minX;
          const pushRight = maxX - nextPos.x;
          const pushDown = nextPos.z - minZ;
          const pushUp = maxZ - nextPos.z;

          const minPush = Math.min(pushLeft, pushRight, pushDown, pushUp);
          if (minPush === pushLeft) nextPos.x = minX;
          else if (minPush === pushRight) nextPos.x = maxX;
          else if (minPush === pushDown) nextPos.z = minZ;
          else nextPos.z = maxZ;
        }
      }
    }

    this.position.copyFrom(nextPos);
  }

  public getInputDirectionWorld(): Vector3 {
    let forwardInput = 0;
    let rightInput = 0;

    if (this.keys.forward) forwardInput += 1;
    if (this.keys.backward) forwardInput -= 1;
    if (this.keys.right) rightInput += 1;
    if (this.keys.left) rightInput -= 1;

    if (forwardInput === 0 && rightInput === 0) {
      return Vector3.Zero();
    }

    const camFwd = this.getHorizontalForward();
    const camRight = this.getHorizontalRight();

    const worldDir = camFwd.scale(forwardInput).add(camRight.scale(rightInput));
    return worldDir.normalize();
  }

  public getHorizontalForward(): Vector3 {
    return new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).normalize();
  }

  public getHorizontalRight(): Vector3 {
    return new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
  }

  public getCameraForward(): Vector3 {
    // 3D forward vector accounting for pitch and yaw
    return new Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      -Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    ).normalize();
  }

  public getPosition(): Vector3 {
    return this.position;
  }

  public setPosition(pos: Vector3): void {
    this.position.copyFrom(pos);
    this.velocity = Vector3.Zero();
    this.camera.position.copyFrom(pos);
  }

  public getHealth(): number {
    return this.health;
  }

  public takeDamage(amount: number): void {
    this.health = Math.max(0, this.health - amount);
  }

  public resetHealth(): void {
    this.health = GameConfig.player.maxHealth;
  }

  public getIsGrounded(): boolean {
    return this.isGrounded;
  }

  public getIsPointerLocked(): boolean {
    return this.isPointerLocked;
  }

  public lockPointer(): void {
    if (!this.isPointerLocked) {
      this.canvas.requestPointerLock();
    }
  }

  public unlockPointer(): void {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  public setMouseSensitivity(val: number): void {
    this.mouseSensitivity = val;
  }

  public getMouseSensitivity(): number {
    return this.mouseSensitivity;
  }

  public setFov(fovRadians: number): void {
    this.defaultFov = fovRadians;
    this.targetFov = fovRadians;
    this.camera.fov = fovRadians;
  }

  public getFov(): number {
    return this.defaultFov;
  }
}
