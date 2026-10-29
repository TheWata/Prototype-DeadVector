import { Engine, Scene, Vector3 } from '@babylonjs/core';
import { Arena } from '../arena/Arena';
import { PlayerController } from '../player/PlayerController';
import { CombatSystem } from '../combat/CombatSystem';
import { ClassSystem } from '../classes/ClassSystem';
import { TargetDummy } from '../combat/TargetDummy';
import { HUD } from '../ui/HUD';
import { GameMenu } from '../ui/GameMenu';
import type { ClassType } from '../config/GameConfig';

export class Game {
  private canvas: HTMLCanvasElement;
  private engine: Engine;
  private scene: Scene;

  // Systems & Entities
  private arena: Arena;
  private player: PlayerController;
  private combatSystem: CombatSystem;
  private classSystem: ClassSystem;
  private dummies: TargetDummy[] = [];
  private primaryDummy!: TargetDummy;

  // UI
  private hud: HUD;
  private menu: GameMenu;

  // Timing
  private lastTime: number = performance.now();
  private isGameRunning: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: false,
      stencil: false,
      powerPreference: 'high-performance',
    });

    this.scene = new Scene(this.engine);
    this.scene.clearColor.set(0.08, 0.09, 0.12, 1);

    // 1. Arena
    this.arena = new Arena(this.scene);

    // 2. Combat System
    this.combatSystem = new CombatSystem(this.scene);

    // 3. Player
    this.player = new PlayerController(this.scene, this.canvas);

    // 4. Target Dummies
    this.setupDummies();

    // 5. Class System
    this.classSystem = new ClassSystem(
      this.scene,
      this.combatSystem,
      this.player,
      () => this.dummies
    );

    // 6. UI
    this.hud = new HUD();
    this.menu = new GameMenu();

    this.setupInteractions();
    this.setupWindowResize();

    // Start in Class Selection Menu
    this.menu.showClassSelection();
    this.hud.setVisible(false);

    // Start engine loop
    this.engine.runRenderLoop(() => {
      this.mainLoop();
    });
  }

  private setupDummies(): void {
    // Primary dummy at center-front
    this.primaryDummy = new TargetDummy(this.scene, new Vector3(0, 0, 5), 'Alvo Alfa');
    this.dummies.push(this.primaryDummy);

    // Secondary dummy in line for testing Recon piercing sniper
    const secondDummy = new TargetDummy(this.scene, new Vector3(0, 0, 14), 'Alvo Bravo');
    this.dummies.push(secondDummy);

    // Third dummy near side pillar for flank/angle testing
    const thirdDummy = new TargetDummy(this.scene, new Vector3(-8, 0, 6), 'Alvo Charlie');
    this.dummies.push(thirdDummy);

    // Connect damage reporting to CombatSystem
    for (const dummy of this.dummies) {
      dummy.setOnDamageCallback((dmg, isCrit, pos) => {
        this.hud.triggerHitmarker();
        this.combatSystem.spawnFloatingDamage(dmg, isCrit, pos);
      });
    }

    // Connect CombatSystem callbacks
    this.combatSystem.setCallbacks(
      () => this.hud.triggerHitmarker(),
      (_dmg) => this.hud.triggerDamageVignette()
    );

    // Connect Parry success callback
    this.player.parrySystem.setOnParrySuccess(() => {
      this.hud.triggerParryFlash();
      const pos = this.player.getPosition().add(this.player.getCameraForward().scale(2));
      this.combatSystem.spawnFloatingMessage('PARRY!', '#00f5d4', pos);
    });
  }

  private setupInteractions(): void {
    // Mouse Attack inputs (M1 & M2)
    window.addEventListener('mousedown', (e) => {
      if (!this.player.getIsPointerLocked() || this.menu.isOpen()) return;

      const origin = this.player.getPosition().clone().add(new Vector3(0, -0.15, 0));
      const forward = this.player.getCameraForward();

      if (e.button === 0) {
        // M1: Primary Attack
        this.classSystem.getController().tryPrimaryAttack(origin, forward);
      } else if (e.button === 2) {
        // M2: Secondary Attack
        this.classSystem.getController().trySecondaryAttack(origin, forward);
      }
    });

    // Prevent context menu on right click
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    // Keyboard keys for Combat & Sandbox utilities
    window.addEventListener('keydown', (e) => {
      const code = e.code;

      // ESC: Pause / Menu
      if (code === 'Escape') {
        if (this.menu.isOpen()) {
          this.resumeGame();
        } else {
          this.pauseGame();
        }
        return;
      }

      if (!this.player.getIsPointerLocked() || this.menu.isOpen()) return;

      // F: Global Parry
      if (code === 'KeyF') {
        const origin = this.player.getPosition();
        const forward = this.player.getCameraForward();
        this.player.parrySystem.triggerParry(
          origin,
          forward,
          this.combatSystem.getProjectiles()
        );
      }

      // G: Fire training projectile from dummy to player
      if (code === 'KeyG') {
        this.fireTrainingProjectile();
      }

      // K: Toggle dummy weight (for Enforcer grapple testing)
      if (code === 'KeyK') {
        this.togglePrimaryDummyWeight();
      }

      // R: Reset dummy health & damage counter
      if (code === 'KeyR') {
        this.resetDummies();
      }

      // T: Reset dummy position
      if (code === 'KeyT') {
        this.primaryDummy.resetPosition();
      }
    });

    // HUD dummy button bindings
    this.hud.bindDummyButtons(
      () => this.togglePrimaryDummyWeight(),
      () => this.fireTrainingProjectile(),
      () => this.resetDummies()
    );

    // Menu callbacks
    this.menu.setCallbacks({
      onSelectClass: (cls: ClassType) => {
        this.selectClassAndStart(cls);
      },
      onResume: () => {
        this.resumeGame();
      },
      onResetArena: () => {
        this.resetArenaAndPlayer();
      },
      onSensitivityChange: (val: number) => {
        this.player.setMouseSensitivity(val);
      },
      onFovChange: (val: number) => {
        this.player.setFov(val);
      },
    });
  }

  public selectClassAndStart(cls: ClassType): void {
    this.classSystem.setClass(cls);
    this.menu.hideAll();
    this.hud.setVisible(true);
    this.isGameRunning = true;
    this.player.lockPointer();
  }

  public pauseGame(): void {
    this.isGameRunning = false;
    this.player.unlockPointer();
    this.menu.showPauseMenu();
  }

  public resumeGame(): void {
    this.menu.hideAll();
    this.hud.setVisible(true);
    this.isGameRunning = true;
    this.player.lockPointer();
  }

  public fireTrainingProjectile(): void {
    const proj = this.primaryDummy.fireTrainingProjectile(this.player.getPosition());
    this.combatSystem.addProjectile(proj);
    this.combatSystem.spawnFloatingMessage('PROJÉTIL DISPARADO! USE F PARA PARRY', '#ff9f1c', this.primaryDummy.getPosition().add(new Vector3(0, 2.5, 0)));
  }

  public togglePrimaryDummyWeight(): void {
    const newWeight = this.primaryDummy.toggleWeight();
    const msg = newWeight === 1 ? 'ALVO: PESO 1 (LEVE - PUXÁVEL)' : 'ALVO: PESO 5 (PESADO - ÂNCORA)';
    this.combatSystem.spawnFloatingMessage(msg, '#ffffff', this.primaryDummy.getPosition().add(new Vector3(0, 2.5, 0)));
  }

  public resetDummies(): void {
    for (const d of this.dummies) {
      d.resetHealth();
      d.resetPosition();
    }
  }

  public resetArenaAndPlayer(): void {
    this.player.setPosition(new Vector3(0, 1.65, -16));
    this.player.resetHealth();
    this.player.dashSystem.reset();
    this.player.parrySystem.reset();
    this.combatSystem.clearAll();
    this.classSystem.reset();
    this.resetDummies();
  }

  private setupWindowResize(): void {
    window.addEventListener('resize', () => {
      this.engine.resize();
    });
  }

  private mainLoop(): void {
    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    // Clamp dt to avoid physics blowups on frame drops or tab switching
    const dt = Math.min(0.05, Math.max(0.001, rawDt));

    // Gameplay update
    if (this.isGameRunning && !this.menu.isOpen()) {
      // 1. Player movement & physics
      this.player.update(dt, this.arena.getColliders());

      // 2. Parry system check
      this.player.parrySystem.update(
        dt,
        this.player.getPosition(),
        this.player.getCameraForward(),
        this.combatSystem.getProjectiles()
      );

      // 3. Class weapon mechanics
      this.classSystem.update(dt);

      // 4. Combat system (projectiles & tracers)
      this.combatSystem.update(dt, this.dummies, this.player);

      // 5. Target Dummies
      for (const dummy of this.dummies) {
        dummy.update(dt);
      }
    }

    // Always update HUD presentation
    this.hud.update(
      dt,
      this.scene,
      this.player,
      this.classSystem,
      this.primaryDummy,
      this.combatSystem.getFloatingTexts()
    );

    // Render frame
    this.scene.render();
  }
}
