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
  private cameraRoll: number = 0; // z rotation for wallride / slide tilt
  private targetCameraRoll: number = 0;
  private mouseSensitivity: number = GameConfig.player.defaultSensitivity;
  private isPointerLocked: boolean = false;

  // Key states
  private keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    slide: false,
  };

  // Basic State
  private isGrounded: boolean = false;
  private health: number = GameConfig.player.maxHealth;
  private defaultFov: number = GameConfig.player.defaultFov;
  private targetFov: number = GameConfig.player.defaultFov;

  // Camera Height (Crouch / Slide transition)
  private currentEyeHeight: number = GameConfig.player.cameraHeight;
  private targetEyeHeight: number = GameConfig.player.cameraHeight;

  // Bunny Hopping State
  private jumpBufferTimer: number = 0;
  private bhopChainCount: number = 0;
  private groundGraceTimer: number = 0;

  // Slide State (Key C)
  private isSliding: boolean = false;
  private slideDurationTimer: number = 0;

  // Wallride & Walljump State
  private isWallriding: boolean = false;
  private wallrideTimer: number = 0;
  private currentWallNormal: Vector3 = Vector3.Zero();
  private lastWallNormal: Vector3 = Vector3.Zero();
  private walljumpGraceTimer: number = 0;

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

    // Keyboard down
    window.addEventListener('keydown', (e) => {
      const code = e.code;
      if (code === 'KeyW') this.keys.forward = true;
      if (code === 'KeyS') this.keys.backward = true;
      if (code === 'KeyA') this.keys.left = true;
      if (code === 'KeyD') this.keys.right = true;

      // Space: Jump, Walljump, Bhop, Slide-Jump
      if (code === 'Space') {
        this.handleJumpPress();
        this.keys.jump = true;
      }

      // C: Slide
      if (code === 'KeyC') {
        if (!this.keys.slide) {
          this.handleSlidePress();
        }
        this.keys.slide = true;
      }

      // Shift: Dash
      if (code === 'ShiftLeft' || code === 'ShiftRight') {
        this.performDash();
      }
    });

    // Keyboard up
    window.addEventListener('keyup', (e) => {
      const code = e.code;
      if (code === 'KeyW') this.keys.forward = false;
      if (code === 'KeyS') this.keys.backward = false;
      if (code === 'KeyA') this.keys.left = false;
      if (code === 'KeyD') this.keys.right = false;
      if (code === 'Space') this.keys.jump = false;
      if (code === 'KeyC') {
        this.keys.slide = false;
        // Optionally release slide when C is released if player isn't in a combo
        if (this.isSliding && this.isGrounded) {
          this.stopSlide();
        }
      }
    });
  }

  private updateCameraRotation(): void {
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.z = this.cameraRoll;
  }

  private handleJumpPress(): void {
    // Jumping cancels grapple pull
    if (this.isGrappling) {
      this.cancelGrapple();
    }

    // 1. Walljump check (prioritized if touching or recently touched a wall in mid-air)
    if (!this.isGrounded && (this.isWallriding || this.walljumpGraceTimer > 0)) {
      this.performWalljump();
      return;
    }

    // 2. Slide-jump check
    if (this.isSliding && this.isGrounded) {
      this.performSlideJump();
      return;
    }

    // 3. Ground jump / buffer
    if (this.isGrounded) {
      this.performJump();
    } else {
      // Set jump buffer for bunny hopping on landing
      this.jumpBufferTimer = GameConfig.bhop.jumpBufferMs / 1000;
    }
  }

  public performJump(): void {
    this.velocity.y = GameConfig.player.jumpForce;
    this.isGrounded = false;
    sounds.playJump();
  }

  public performSlideJump(): void {
    // Preserves 100% of horizontal slide velocity into airborne state for bunny hopping!
    this.velocity.y = GameConfig.player.jumpForce;
    this.isGrounded = false;
    this.stopSlide();
    sounds.playJump();
  }

  public performWalljump(): void {
    const wallNorm = this.lastWallNormal.lengthSquared() > 0.01 
      ? this.lastWallNormal 
      : this.currentWallNormal;

    const outForce = wallNorm.scale(GameConfig.wall.jumpForceOut);
    const fwdForce = this.getHorizontalForward().scale(GameConfig.wall.jumpForceOut * 0.4);

    this.velocity.x = outForce.x + fwdForce.x;
    this.velocity.z = outForce.z + fwdForce.z;
    this.velocity.y = GameConfig.wall.jumpForceUp;

    this.isWallriding = false;
    this.walljumpGraceTimer = 0;
    this.targetCameraRoll = 0;
    this.isGrounded = false;

    sounds.playWalljump();
  }

  private handleSlidePress(): void {
    if (this.isSliding) {
      this.stopSlide();
    } else {
      this.startSlide();
    }
  }

  public startSlide(): void {
    this.isSliding = true;
    this.slideDurationTimer = 0;
    this.targetEyeHeight = GameConfig.slide.cameraHeight;

    if (this.isGrounded) {
      const inputDir = this.getInputDirectionWorld();
      const slideDir = inputDir.lengthSquared() > 0.01 ? inputDir : this.getHorizontalForward();
      const currentHSpd = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);

      // Boost speed if below boost threshold, or preserve higher momentum (e.g. from dash or bhop)
      const targetSlideSpeed = Math.max(currentHSpd, GameConfig.slide.boostSpeed);
      this.velocity.x = slideDir.x * targetSlideSpeed;
      this.velocity.z = slideDir.z * targetSlideSpeed;

      sounds.playSlideStart();
    }
  }

  public stopSlide(): void {
    this.isSliding = false;
    this.slideDurationTimer = 0;
    this.targetEyeHeight = GameConfig.player.cameraHeight;
  }

  public performDash(): boolean {
    const moveDir = this.getInputDirectionWorld();
    const camForward = this.getHorizontalForward();

    const success = this.dashSystem.tryDash(moveDir, camForward, () => {
      this.targetFov = this.defaultFov + GameConfig.dash.fovKick;
      // If sliding while dashing or dash-sliding, maintain slide stance
      if (this.velocity.y < 0) this.velocity.y = 0;
    });

    return success;
  }

  public startGrapplePull(target: Vector3): void {
    this.isGrappling = true;
    this.grapplePullTarget = target.clone();
    this.stopSlide();
    this.isWallriding = false;
  }

  public cancelGrapple(): void {
    this.isGrappling = false;
    this.grapplePullTarget = null;
  }

  public isGrapplingActive(): boolean {
    return this.isGrappling;
  }

  public update(dt: number, arenaColliders: Mesh[]): void {
    // 1. Timers
    if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer -= dt;
    }
    if (this.walljumpGraceTimer > 0) {
      this.walljumpGraceTimer -= dt;
    }
    if (this.groundGraceTimer > 0) {
      this.groundGraceTimer -= dt;
      if (this.groundGraceTimer <= 0 && this.isGrounded) {
        this.bhopChainCount = 0;
      }
    }

    // 2. Dash update & FOV recovery
    this.dashSystem.update(dt);
    if (this.dashSystem.getIsDashing()) {
      this.targetFov = this.defaultFov + GameConfig.dash.fovKick;
    } else {
      this.targetFov = this.defaultFov;
    }
    this.camera.fov += (this.targetFov - this.camera.fov) * Math.min(1, dt * 14);

    // 3. Camera Eye Height (Slide transition)
    this.currentEyeHeight += (this.targetEyeHeight - this.currentEyeHeight) * Math.min(1, dt * 16);

    // 4. Camera Roll (Wallride tilt)
    this.cameraRoll += (this.targetCameraRoll - this.cameraRoll) * Math.min(1, dt * 10);
    this.updateCameraRotation();

    // 5. Check Wallride & Wall contact when airborne
    this.checkWallContact(arenaColliders);

    // 6. Movement physics resolution
    if (this.isGrappling && this.grapplePullTarget) {
      // Grapple pull physics
      const toTarget = this.grapplePullTarget.subtract(this.position);
      const dist = toTarget.length();

      if (dist < GameConfig.enforcer.hook.stopDistance) {
        this.cancelGrapple();
      } else {
        const pullDir = toTarget.normalize();
        this.velocity = pullDir.scale(GameConfig.enforcer.hook.pullPlayerSpeed);
      }
    } else if (this.dashSystem.getIsDashing()) {
      // Dash overrides horizontal velocity
      const dashVel = this.dashSystem.getDashVelocity();
      this.velocity.x = dashVel.x;
      this.velocity.z = dashVel.z;
      this.velocity.y = Math.max(this.velocity.y, -2.0);
    } else if (this.isSliding && this.isGrounded) {
      // SLIDE PHYSICS: ultra-low friction, steering, and speed timeout
      this.slideDurationTimer += dt;
      const currentHSpd = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);

      if (currentHSpd < GameConfig.slide.minSpeed || this.slideDurationTimer > (GameConfig.slide.maxDurationMs / 1000)) {
        this.stopSlide();
      } else {
        // Friction deceleration
        const friction = GameConfig.slide.friction;
        this.velocity.x += (0 - this.velocity.x) * Math.min(1, friction * dt);
        this.velocity.z += (0 - this.velocity.z) * Math.min(1, friction * dt);

        // Gentle steering while sliding
        const inputDir = this.getInputDirectionWorld();
        if (inputDir.lengthSquared() > 0.01) {
          const currentDir = new Vector3(this.velocity.x, 0, this.velocity.z).normalize();
          const steeredDir = Vector3.Lerp(currentDir, inputDir, Math.min(1, dt * 3.5)).normalize();
          const spd = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
          this.velocity.x = steeredDir.x * spd;
          this.velocity.z = steeredDir.z * spd;
        }
      }

      // Normal gravity on ground/slopes
      this.velocity.y -= GameConfig.player.gravity * dt;
    } else if (this.isWallriding) {
      // WALLRIDE PHYSICS: reduced downward gravity, maintain wall tangent momentum
      this.wallrideTimer += dt;
      if (this.wallrideTimer > (GameConfig.wall.maxRideDurationMs / 1000)) {
        this.isWallriding = false;
        this.targetCameraRoll = 0;
      } else {
        // Reduced falling speed (glide)
        if (this.velocity.y < -GameConfig.wall.rideGravity) {
          this.velocity.y += ((-GameConfig.wall.rideGravity) - this.velocity.y) * Math.min(1, dt * 10);
        } else {
          this.velocity.y -= GameConfig.wall.rideGravity * dt;
        }
      }
    } else if (!this.isGrounded) {
      // AIRBORNE & BUNNY HOPPING PHYSICS:
      // ZERO air friction so accumulated momentum is 100% preserved!
      const inputDir = this.getInputDirectionWorld();
      const currentHSpd = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
      const targetSpeed = GameConfig.player.walkSpeed;

      if (inputDir.lengthSquared() > 0.001) {
        if (currentHSpd > targetSpeed) {
          // High-speed air strafe steering:
          // Smoothly redirect momentum vector towards inputDir without clamping speed!
          const currentDir = new Vector3(this.velocity.x, 0, this.velocity.z).normalize();
          const blendedDir = Vector3.Lerp(currentDir, inputDir, Math.min(1, dt * 4.5)).normalize();
          this.velocity.x = blendedDir.x * currentHSpd;
          this.velocity.z = blendedDir.z * currentHSpd;
        } else {
          // Standard air acceleration
          const accel = GameConfig.player.acceleration * GameConfig.player.airControl;
          const desiredVelX = inputDir.x * targetSpeed;
          const desiredVelZ = inputDir.z * targetSpeed;
          this.velocity.x += (desiredVelX - this.velocity.x) * Math.min(1, accel * dt / targetSpeed);
          this.velocity.z += (desiredVelZ - this.velocity.z) * Math.min(1, accel * dt / targetSpeed);
        }
      }

      // Normal gravity
      this.velocity.y -= GameConfig.player.gravity * dt;
      if (this.velocity.y < -40) this.velocity.y = -40;
    } else {
      // STANDARD GROUND MOVEMENT
      const inputDir = this.getInputDirectionWorld();
      const accel = GameConfig.player.acceleration;
      const targetSpeed = GameConfig.player.walkSpeed;

      if (inputDir.lengthSquared() > 0.001) {
        const desiredVelX = inputDir.x * targetSpeed;
        const desiredVelZ = inputDir.z * targetSpeed;

        this.velocity.x += (desiredVelX - this.velocity.x) * Math.min(1, accel * dt / targetSpeed);
        this.velocity.z += (desiredVelZ - this.velocity.z) * Math.min(1, accel * dt / targetSpeed);
      } else {
        // Normal ground friction
        const friction = GameConfig.player.friction;
        this.velocity.x += (0 - this.velocity.x) * Math.min(1, friction * dt);
        this.velocity.z += (0 - this.velocity.z) * Math.min(1, friction * dt);
      }

      this.velocity.y -= GameConfig.player.gravity * dt;
    }

    // 7. Kinematic move & collision resolution
    this.resolveKinematicMove(dt, arenaColliders);

    // 8. Sync camera position
    this.camera.position.copyFrom(this.position);
  }

  private checkWallContact(colliders: Mesh[]): void {
    if (this.isGrounded || this.isGrappling || this.dashSystem.getIsDashing()) {
      if (this.isWallriding) {
        this.isWallriding = false;
        this.targetCameraRoll = 0;
      }
      return;
    }

    // Raycast in 6 horizontal directions around the player's torso
    const chestY = this.position.y - this.currentEyeHeight + 0.9;
    const origin = new Vector3(this.position.x, chestY, this.position.z);
    const maxDist = GameConfig.wall.detectionDistance;

    const camFwd = this.getHorizontalForward();
    const camRight = this.getHorizontalRight();

    const probeDirs = [
      camRight,
      camRight.scale(-1),
      camFwd,
      camRight.add(camFwd).normalize(),
      camRight.scale(-1).add(camFwd).normalize(),
    ];

    let foundWall = false;

    for (const dir of probeDirs) {
      const ray = new Ray(origin, dir, maxDist);
      const hit = this.scene.pickWithRay(ray, (m) => {
        return colliders.includes(m as Mesh) && (!!m.metadata?.isWall || !!m.metadata?.isObstacle || !!m.metadata?.isRicochet);
      });

      if (hit && hit.hit && hit.pickedPoint) {
        const normal = hit.getNormal(true);
        if (normal && Math.abs(normal.y) < 0.35) {
          // Valid vertical wall found!
          foundWall = true;
          this.currentWallNormal.copyFrom(normal);
          this.lastWallNormal.copyFrom(normal);
          this.walljumpGraceTimer = 0.25; // 250ms grace window for walljump

          if (!this.isWallriding) {
            this.isWallriding = true;
            this.wallrideTimer = 0;
            sounds.playWallrideStart();
          }

          // Camera roll tilt based on which side the wall is
          const crossY = Vector3.Cross(camFwd, normal).y;
          this.targetCameraRoll = crossY > 0 ? -GameConfig.wall.cameraTilt : GameConfig.wall.cameraTilt;

          // Push slightly away from wall penetration to glide smoothly
          const dot = this.velocity.x * normal.x + this.velocity.z * normal.z;
          if (dot < 0) {
            this.velocity.x -= dot * normal.x;
            this.velocity.z -= dot * normal.z;
          }
          break;
        }
      }
    }

    if (!foundWall && this.isWallriding) {
      this.isWallriding = false;
      this.targetCameraRoll = 0;
    }
  }

  private resolveKinematicMove(dt: number, colliders: Mesh[]): void {
    const radius = GameConfig.player.radius;
    const height = this.isSliding ? 1.0 : GameConfig.player.height;
    const { width, depth, height: arenaHeight } = GameConfig.arena;
    const halfW = width / 2 - radius - 0.2;
    const halfD = depth / 2 - radius - 0.2;

    // Proposed new position
    const nextPos = this.position.add(this.velocity.scale(dt));

    // Ground check via downward raycast
    const feetPos = new Vector3(this.position.x, this.position.y - this.currentEyeHeight + 0.2, this.position.z);
    const downRay = new Ray(feetPos, new Vector3(0, -1, 0), 0.45);
    const hit = this.scene.pickWithRay(downRay, (m) => colliders.includes(m as Mesh));

    if (hit && hit.hit && hit.pickedPoint && this.velocity.y <= 0) {
      const groundY = hit.pickedPoint.y;
      if (nextPos.y - this.currentEyeHeight <= groundY + 0.15) {
        nextPos.y = groundY + this.currentEyeHeight;
        this.velocity.y = 0;

        // Transition from air to ground
        if (!this.isGrounded) {
          // BUNNY HOPPING CHECK: Did player buffer a jump or is holding Space?
          if (this.jumpBufferTimer > 0 || this.keys.jump) {
            // Consecutive Bunny Hop executed!
            this.jumpBufferTimer = 0;
            this.bhopChainCount++;
            
            // Add slight speed boost on successful bhop
            const currentHSpd = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
            const newHSpd = Math.min(GameConfig.bhop.maxBhopSpeed, currentHSpd + GameConfig.bhop.speedBoostPerHop);
            if (currentHSpd > 0.1) {
              const hDir = new Vector3(this.velocity.x, 0, this.velocity.z).normalize();
              this.velocity.x = hDir.x * newHSpd;
              this.velocity.z = hDir.z * newHSpd;
            }

            this.velocity.y = GameConfig.player.jumpForce;
            this.isGrounded = false;
            sounds.playBhop(this.bhopChainCount);
          } else {
            // Landed without bhop
            this.isGrounded = true;
            this.groundGraceTimer = 0.1; // short window before combo drops
            this.isWallriding = false;
            this.targetCameraRoll = 0;

            // If player was holding C while airborne, immediately enter slide upon landing!
            if (this.keys.slide && !this.isSliding) {
              this.startSlide();
            }
          }
        } else {
          this.isGrounded = true;
        }
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

    // Arena boundary clamp
    nextPos.x = Math.max(-halfW, Math.min(halfW, nextPos.x));
    nextPos.z = Math.max(-halfD, Math.min(halfD, nextPos.z));

    // Obstacle horizontal resolution (pillars)
    for (const collider of colliders) {
      if (collider.metadata?.isObstacle) {
        const bounds = collider.getBoundingInfo().boundingBox;
        const minX = bounds.minimumWorld.x - radius;
        const maxX = bounds.maximumWorld.x + radius;
        const minZ = bounds.minimumWorld.z - radius;
        const maxZ = bounds.maximumWorld.z + radius;
        const minY = bounds.minimumWorld.y;
        const maxY = bounds.maximumWorld.y;

        const playerFeet = nextPos.y - this.currentEyeHeight;
        const playerHead = playerFeet + height;

        if (
          nextPos.x >= minX &&
          nextPos.x <= maxX &&
          nextPos.z >= minZ &&
          nextPos.z <= maxZ &&
          playerHead >= minY &&
          playerFeet <= maxY
        ) {
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
    this.stopSlide();
    this.isWallriding = false;
    this.targetCameraRoll = 0;
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

  public getIsSliding(): boolean {
    return this.isSliding;
  }

  public getIsWallriding(): boolean {
    return this.isWallriding;
  }

  public getBhopChain(): number {
    return this.bhopChainCount;
  }

  public getHorizontalSpeed(): number {
    return Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
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
