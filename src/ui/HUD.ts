import { Vector3, Scene, Matrix, Viewport } from '@babylonjs/core';
import { PlayerController } from '../player/PlayerController';
import { ClassSystem } from '../classes/ClassSystem';
import { TargetDummy } from '../combat/TargetDummy';
import type { FloatingText } from '../combat/CombatSystem';

export class HUD {
  private container: HTMLElement;
  private hitmarkerTimer: number = 0;
  private parryFlashTimer: number = 0;
  private screenDamageTimer: number = 0;

  // DOM Elements
  private healthValueEl!: HTMLElement;
  private healthBarFillEl!: HTMLElement;
  private hitmarkerEl!: HTMLElement;
  private dashCooldownEl!: HTMLElement;
  private dashStatusEl!: HTMLElement;
  private parryCooldownEl!: HTMLElement;
  private parryStatusEl!: HTMLElement;
  private secondaryCooldownEl!: HTMLElement;
  private secondaryNameEl!: HTMLElement;
  private slideStatusEl!: HTMLElement;
  private speedMeterEl!: HTMLElement;
  private movementStateBadgeEl!: HTMLElement;
  private classNameEl!: HTMLElement;
  private classHintEl!: HTMLElement;
  private floatingContainerEl!: HTMLElement;
  private parryFlashEl!: HTMLElement;
  private screenDamageEl!: HTMLElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'hud-root';
    this.container.className = 'hud-root';
    this.buildDOM();
    document.body.appendChild(this.container);
  }

  private buildDOM(): void {
    this.container.innerHTML = `
      <!-- Parry Success Screen Flash -->
      <div id="parry-flash" class="parry-flash"></div>

      <!-- Damage Vignette -->
      <div id="screen-damage" class="screen-damage"></div>

      <!-- 3D Floating Combat Text Overlay -->
      <div id="floating-container" class="floating-container"></div>

      <!-- Center Crosshair & Hitmarkers -->
      <div id="crosshair-container" class="crosshair-container">
        <div class="crosshair-dot"></div>
        <div class="crosshair-ring"></div>
        <div class="crosshair-line top"></div>
        <div class="crosshair-line bottom"></div>
        <div class="crosshair-line left"></div>
        <div class="crosshair-line right"></div>
        <div id="hitmarker" class="hitmarker">
          <div class="hm-line tl"></div>
          <div class="hm-line tr"></div>
          <div class="hm-line bl"></div>
          <div class="hm-line br"></div>
        </div>
      </div>

      <!-- Center Movement & Speed HUD -->
      <div class="movement-hud">
        <div id="speed-meter" class="speed-meter">14.0 m/s</div>
        <div id="movement-state-badge" class="movement-state-badge">NORMAL</div>
      </div>

      <!-- Top Center: Target Dummy Boss/Inspection Bar -->
      <div id="dummy-hud" class="dummy-hud">
        <div class="dummy-header">
          <span class="dummy-title">ALVO DE TREINAMENTO</span>
          <span id="dummy-weight-badge" class="dummy-weight-badge">PESO: 1 (LEVE)</span>
        </div>
        <div class="dummy-bar-bg">
          <div id="dummy-bar-fill" class="dummy-bar-fill" style="width: 100%;"></div>
        </div>
        <div class="dummy-stats">
          <span id="dummy-hp-text">500 / 500 HP</span>
          <span id="dummy-dmg-text">Dano Total: 0 | Acertos: 0</span>
        </div>
        <div class="dummy-quick-actions">
          <button id="btn-toggle-weight" class="hud-pill-btn" title="Alternar Peso">[K] Peso: 1</button>
          <button id="btn-fire-projectile" class="hud-pill-btn accent" title="Disparar Projétil">[G] Disparar Projétil</button>
          <button id="btn-reset-dummy" class="hud-pill-btn" title="Resetar">[R] Reset Alvo</button>
        </div>
      </div>

      <!-- Top Left: Active Class Badge & Tips -->
      <div class="class-badge-container">
        <div class="class-header">
          <span class="class-label">CLASSE ATIVA</span>
          <span id="hud-class-name" class="class-name">COWBOY</span>
        </div>
        <div id="hud-class-hint" class="class-hint">
          M1: Disparo Duplo | M2: Moeda
        </div>
      </div>

      <!-- Top Right: Quick Controls / Helper -->
      <div class="controls-guide">
        <div class="guide-row"><kbd>ESC</kbd> <span>Pausar / Menu</span></div>
        <div class="guide-row"><kbd>C</kbd> <span>Slide (Deslizar)</span></div>
        <div class="guide-row"><kbd>Espaço</kbd> <span>Pulo / Walljump / Bhop</span></div>
        <div class="guide-row"><kbd>Shift</kbd> <span>Dash Rápido</span></div>
        <div class="guide-row"><kbd>F</kbd> <span>Parry Defensivo</span></div>
        <div class="guide-row"><kbd>G</kbd> <span>Projétil de Treino</span></div>
        <div class="guide-row"><kbd>K</kbd> <span>Alternar Peso Dummy</span></div>
      </div>

      <!-- Bottom Left: Health & Status -->
      <div class="bottom-left-panel">
        <div class="health-container">
          <div class="health-meta">
            <span class="health-title">INTEGRIDADE</span>
            <span id="health-value" class="health-value">100</span>
          </div>
          <div class="health-bar-bg">
            <div id="health-bar-fill" class="health-bar-fill" style="width: 100%;"></div>
          </div>
        </div>

        <!-- Ability / Input Slots Bar (including Q, E, X placeholders) -->
        <div class="action-slots">
          <!-- Movement Dash -->
          <div class="action-slot">
            <div class="slot-key">SHIFT</div>
            <div class="slot-icon">DASH</div>
            <div class="slot-cooldown-overlay" id="dash-cooldown-overlay"></div>
            <div class="slot-status" id="dash-status">PRONTO</div>
          </div>

          <!-- Movement Slide -->
          <div class="action-slot slide-slot">
            <div class="slot-key">C</div>
            <div class="slot-icon">SLIDE</div>
            <div class="slot-status" id="slide-status">PRONTO</div>
          </div>

          <!-- Global Parry F -->
          <div class="action-slot parry-slot">
            <div class="slot-key">F</div>
            <div class="slot-icon">PARRY</div>
            <div class="slot-cooldown-overlay" id="parry-cooldown-overlay"></div>
            <div class="slot-status" id="parry-status">PRONTO</div>
          </div>

          <!-- Secondary M2 -->
          <div class="action-slot">
            <div class="slot-key">M2</div>
            <div class="slot-icon" id="secondary-slot-name">HABILIDADE</div>
            <div class="slot-cooldown-overlay" id="secondary-cooldown-overlay"></div>
            <div class="slot-status" id="secondary-status">PRONTO</div>
          </div>

          <!-- Mandatory Placeholders: Q, E, X -->
          <div class="action-slot placeholder-slot" title="Espaço Reservado (Placeholder)">
            <div class="slot-key">Q</div>
            <div class="slot-icon">BLOQ</div>
            <div class="slot-status locked">—</div>
          </div>

          <div class="action-slot placeholder-slot" title="Espaço Reservado (Placeholder)">
            <div class="slot-key">E</div>
            <div class="slot-icon">BLOQ</div>
            <div class="slot-status locked">—</div>
          </div>

          <div class="action-slot placeholder-slot ult-slot" title="Espaço Reservado Supremo (Placeholder)">
            <div class="slot-key">X</div>
            <div class="slot-icon">ULT</div>
            <div class="slot-status locked">—</div>
          </div>
        </div>
      </div>
    `;

    this.healthValueEl = this.container.querySelector('#health-value')!;
    this.healthBarFillEl = this.container.querySelector('#health-bar-fill')!;
    this.hitmarkerEl = this.container.querySelector('#hitmarker')!;
    this.dashCooldownEl = this.container.querySelector('#dash-cooldown-overlay')!;
    this.dashStatusEl = this.container.querySelector('#dash-status')!;
    this.parryCooldownEl = this.container.querySelector('#parry-cooldown-overlay')!;
    this.parryStatusEl = this.container.querySelector('#parry-status')!;
    this.secondaryCooldownEl = this.container.querySelector('#secondary-cooldown-overlay')!;
    this.secondaryNameEl = this.container.querySelector('#secondary-slot-name')!;
    this.slideStatusEl = this.container.querySelector('#slide-status')!;
    this.speedMeterEl = this.container.querySelector('#speed-meter')!;
    this.movementStateBadgeEl = this.container.querySelector('#movement-state-badge')!;
    this.classNameEl = this.container.querySelector('#hud-class-name')!;
    this.classHintEl = this.container.querySelector('#hud-class-hint')!;
    this.floatingContainerEl = this.container.querySelector('#floating-container')!;
    this.parryFlashEl = this.container.querySelector('#parry-flash')!;
    this.screenDamageEl = this.container.querySelector('#screen-damage')!;
  }

  public triggerHitmarker(): void {
    this.hitmarkerTimer = 0.12;
    this.hitmarkerEl.classList.add('active');
  }

  public triggerParryFlash(): void {
    this.parryFlashTimer = 0.25;
    this.parryFlashEl.classList.add('active');
  }

  public triggerDamageVignette(): void {
    this.screenDamageTimer = 0.3;
    this.screenDamageEl.classList.add('active');
  }

  public bindDummyButtons(
    onToggleWeight: () => void,
    onFireProjectile: () => void,
    onResetDummy: () => void
  ): void {
    this.container.querySelector('#btn-toggle-weight')?.addEventListener('click', (e) => {
      e.stopPropagation();
      onToggleWeight();
    });
    this.container.querySelector('#btn-fire-projectile')?.addEventListener('click', (e) => {
      e.stopPropagation();
      onFireProjectile();
    });
    this.container.querySelector('#btn-reset-dummy')?.addEventListener('click', (e) => {
      e.stopPropagation();
      onResetDummy();
    });
  }

  public update(
    dt: number,
    scene: Scene,
    player: PlayerController,
    classSystem: ClassSystem,
    primaryDummy: TargetDummy,
    floatingTexts: FloatingText[]
  ): void {
    // Timers
    if (this.hitmarkerTimer > 0) {
      this.hitmarkerTimer -= dt;
      if (this.hitmarkerTimer <= 0) {
        this.hitmarkerEl.classList.remove('active');
      }
    }

    if (this.parryFlashTimer > 0) {
      this.parryFlashTimer -= dt;
      if (this.parryFlashTimer <= 0) {
        this.parryFlashEl.classList.remove('active');
      }
    }

    if (this.screenDamageTimer > 0) {
      this.screenDamageTimer -= dt;
      if (this.screenDamageTimer <= 0) {
        this.screenDamageEl.classList.remove('active');
      }
    }

    // 1. Player Health
    const hp = Math.round(player.getHealth());
    this.healthValueEl.textContent = `${hp}`;
    this.healthBarFillEl.style.width = `${Math.max(0, hp)}%`;
    if (hp <= 30) {
      this.healthBarFillEl.classList.add('low-hp');
    } else {
      this.healthBarFillEl.classList.remove('low-hp');
    }

    // 2. Dash Cooldown
    const dashRatio = player.dashSystem.getCooldownRatio();
    this.dashCooldownEl.style.height = `${dashRatio * 100}%`;
    if (player.dashSystem.getIsDashing()) {
      this.dashStatusEl.textContent = 'DASH!';
      this.dashStatusEl.className = 'slot-status active';
    } else if (player.dashSystem.isReady()) {
      this.dashStatusEl.textContent = 'PRONTO';
      this.dashStatusEl.className = 'slot-status ready';
    } else {
      this.dashStatusEl.textContent = 'RECARGA';
      this.dashStatusEl.className = 'slot-status';
    }

    // 2b. Movement Speedometer & State Badge
    const speed = player.getHorizontalSpeed();
    this.speedMeterEl.textContent = `${speed.toFixed(1)} m/s`;

    if (player.getIsSliding()) {
      this.slideStatusEl.textContent = 'SLIDE!';
      this.slideStatusEl.className = 'slot-status active';
      this.movementStateBadgeEl.textContent = 'SLIDE';
      this.movementStateBadgeEl.className = 'movement-state-badge slide';
    } else {
      this.slideStatusEl.textContent = 'PRONTO';
      this.slideStatusEl.className = 'slot-status ready';

      if (player.getIsWallriding()) {
        this.movementStateBadgeEl.textContent = 'WALLRIDE';
        this.movementStateBadgeEl.className = 'movement-state-badge wallride';
      } else if (player.getBhopChain() > 0) {
        this.movementStateBadgeEl.textContent = `BHOP x${player.getBhopChain()}`;
        this.movementStateBadgeEl.className = 'movement-state-badge bhop';
      } else if (player.dashSystem.getIsDashing()) {
        this.movementStateBadgeEl.textContent = 'DASH';
        this.movementStateBadgeEl.className = 'movement-state-badge dash';
      } else if (!player.getIsGrounded()) {
        this.movementStateBadgeEl.textContent = 'NO AR';
        this.movementStateBadgeEl.className = 'movement-state-badge air';
      } else {
        this.movementStateBadgeEl.textContent = speed > 1.0 ? 'CORRENDO' : 'PARADO';
        this.movementStateBadgeEl.className = 'movement-state-badge';
      }
    }

    // 3. Parry Cooldown & Window
    const parryRatio = player.parrySystem.getCooldownRatio();
    this.parryCooldownEl.style.height = `${parryRatio * 100}%`;
    if (player.parrySystem.isWindowActive()) {
      this.parryStatusEl.textContent = 'PARRY!';
      this.parryStatusEl.className = 'slot-status active-parry';
    } else if (player.parrySystem.isReady()) {
      this.parryStatusEl.textContent = 'PRONTO';
      this.parryStatusEl.className = 'slot-status ready';
    } else {
      this.parryStatusEl.textContent = 'RECARGA';
      this.parryStatusEl.className = 'slot-status';
    }

    // 4. Weapon / Secondary Cooldown
    const weaponState = classSystem.getController().getWeaponState();
    this.secondaryCooldownEl.style.height = `${weaponState.secondaryCooldownRatio * 100}%`;
    this.secondaryNameEl.textContent = weaponState.secondaryName.toUpperCase();
    const secStatus = this.container.querySelector('#secondary-status')!;
    if (weaponState.secondaryReady) {
      secStatus.textContent = 'PRONTO';
      secStatus.className = 'slot-status ready';
    } else {
      secStatus.textContent = 'RECARGA';
      secStatus.className = 'slot-status';
    }

    // Class metadata
    const meta = classSystem.getCurrentMetadata();
    this.classNameEl.textContent = meta.name.toUpperCase();
    this.classHintEl.textContent = weaponState.hintText;

    // 5. Target Dummy UI
    if (primaryDummy) {
      const dummyHp = Math.round(primaryDummy.getHealth());
      const maxHp = primaryDummy.getMaxHealth();
      const pct = (dummyHp / maxHp) * 100;

      const barFill = this.container.querySelector('#dummy-bar-fill') as HTMLElement;
      if (barFill) barFill.style.width = `${Math.max(0, pct)}%`;

      const hpText = this.container.querySelector('#dummy-hp-text')!;
      hpText.textContent = `${dummyHp} / ${maxHp} HP`;

      const dmgText = this.container.querySelector('#dummy-dmg-text')!;
      dmgText.textContent = `Dano Total: ${Math.round(primaryDummy.getTotalDamage())} | Acertos: ${primaryDummy.getHitCount()}`;

      const weightBadge = this.container.querySelector('#dummy-weight-badge')!;
      const btnWeight = this.container.querySelector('#btn-toggle-weight')!;
      const weight = primaryDummy.getWeight();
      if (weight === 1) {
        weightBadge.textContent = 'PESO: 1 (LEVE - PUXÁVEL)';
        weightBadge.className = 'dummy-weight-badge light';
        btnWeight.textContent = '[K] Peso: 1 (Leve)';
      } else {
        weightBadge.textContent = 'PESO: 5 (PESADO - ANCORA)';
        weightBadge.className = 'dummy-weight-badge heavy';
        btnWeight.textContent = '[K] Peso: 5 (Pesado)';
      }
    }

    // 6. 3D to 2D Floating Text update
    this.renderFloatingTexts(scene, floatingTexts);
  }

  private renderFloatingTexts(scene: Scene, texts: FloatingText[]): void {
    this.floatingContainerEl.innerHTML = '';
    const engine = scene.getEngine();
    const renderWidth = engine.getRenderWidth();
    const renderHeight = engine.getRenderHeight();
    const viewport = new Viewport(0, 0, renderWidth, renderHeight);
    const transformMatrix = scene.getTransformMatrix();
    const identityMatrix = Matrix.IdentityReadOnly;

    for (const item of texts) {
      const screenPos = Vector3.Project(
        item.worldPos,
        identityMatrix,
        transformMatrix,
        viewport
      );

      // Check if in front of camera
      if (screenPos.z > 0 && screenPos.z < 1) {
        const el = document.createElement('div');
        el.className = `floating-text ${item.isCrit ? 'crit' : ''}`;
        el.style.left = `${screenPos.x}px`;
        el.style.top = `${screenPos.y}px`;
        el.style.color = item.color;
        el.textContent = item.text;
        el.style.opacity = `${item.lifetime / item.maxLifetime}`;
        this.floatingContainerEl.appendChild(el);
      }
    }
  }

  public setVisible(visible: boolean): void {
    this.container.style.display = visible ? 'block' : 'none';
  }
}
