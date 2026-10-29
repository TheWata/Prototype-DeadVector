import type { ClassType } from '../config/GameConfig';
import { CLASS_DEFINITIONS } from '../classes/ClassSystem';
import type { ClassMetadata } from '../classes/ClassSystem';
import { sounds } from '../audio/SoundSystem';

export class GameMenu {
  private container: HTMLElement;
  private isPaused: boolean = false;
  private isClassSelectOpen: boolean = true;

  // Callbacks
  private onSelectClassCallback?: (cls: ClassType) => void;
  private onResumeCallback?: () => void;
  private onResetArenaCallback?: () => void;
  private onSensitivityChangeCallback?: (val: number) => void;
  private onFovChangeCallback?: (val: number) => void;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'menu-root';
    this.container.className = 'menu-root';
    this.buildDOM();
    document.body.appendChild(this.container);
  }

  private buildDOM(): void {
    this.container.innerHTML = `
      <!-- CLASS SELECTION SCREEN -->
      <div id="class-select-screen" class="menu-screen active">
        <div class="menu-header">
          <h1 class="game-title">ROGUE SHOOTER // COMBAT SANDBOX</h1>
          <p class="game-subtitle">PROTÓTIPO DE MOVIMENTAÇÃO RÁPIDA & COMBATE INDEPENDENTE</p>
        </div>

        <div class="class-cards-container">
          ${this.renderClassCard(CLASS_DEFINITIONS.cowboy)}
          ${this.renderClassCard(CLASS_DEFINITIONS.enforcer)}
          ${this.renderClassCard(CLASS_DEFINITIONS.recon)}
        </div>

        <div class="menu-footer">
          <span>Selecione uma classe para entrar na arena. Você poderá trocar a qualquer momento pelo menu de pausa (ESC).</span>
        </div>
      </div>

      <!-- PAUSE SCREEN -->
      <div id="pause-screen" class="menu-screen">
        <div class="pause-box">
          <h2 class="pause-title">JOGO PAUSADO</h2>
          <div class="pause-actions">
            <button id="btn-resume" class="menu-btn primary">RETOMAR COMBATE</button>
            <button id="btn-switch-class" class="menu-btn">TROCAR DE CLASSE</button>
            <button id="btn-reset-arena" class="menu-btn">REINICIAR ARENA & ALVOS</button>
          </div>

          <div class="settings-box">
            <h3 class="settings-title">AJUSTES RÁPIDOS</h3>
            
            <div class="setting-item">
              <label for="slider-sens">Sensibilidade do Mouse</label>
              <div class="setting-ctrl">
                <input id="slider-sens" type="range" min="0.0008" max="0.005" step="0.0002" value="0.0022" />
                <span id="label-sens">2.2</span>
              </div>
            </div>

            <div class="setting-item">
              <label for="slider-fov">Campo de Visão (FOV)</label>
              <div class="setting-ctrl">
                <input id="slider-fov" type="range" min="1.1" max="1.7" step="0.05" value="1.35" />
                <span id="label-fov">77°</span>
              </div>
            </div>

            <div class="setting-item">
              <label for="slider-vol">Volume dos Efeitos Sonoros</label>
              <div class="setting-ctrl">
                <input id="slider-vol" type="range" min="0" max="1" step="0.05" value="0.6" />
                <span id="label-vol">60%</span>
              </div>
            </div>
          </div>

          <div class="pause-footer">
            Pressione <kbd>ESC</kbd> para retomar imediatamente.
          </div>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  private renderClassCard(meta: ClassMetadata): string {
    return `
      <div class="class-card" data-class="${meta.id}">
        <div class="class-card-icon">${meta.iconSvg}</div>
        <h2 class="class-card-name">${meta.name}</h2>
        <p class="class-card-desc">${meta.description}</p>
        
        <div class="class-card-attacks">
          <div class="attack-block">
            <span class="attack-label">${meta.primaryName}</span>
            <span class="attack-desc">${meta.primaryDesc}</span>
          </div>
          <div class="attack-block">
            <span class="attack-label">${meta.secondaryName}</span>
            <span class="attack-desc">${meta.secondaryDesc}</span>
          </div>
        </div>

        <button class="select-class-btn" data-class="${meta.id}">ESCOLHER ${meta.name.toUpperCase()}</button>
      </div>
    `;
  }

  private attachEvents(): void {
    // Class selection buttons
    const classButtons = this.container.querySelectorAll('.select-class-btn, .class-card');
    classButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const clsId = (btn.getAttribute('data-class') || '') as ClassType;
        if (clsId) {
          e.stopPropagation();
          this.onSelectClassCallback?.(clsId);
        }
      });
    });

    // Pause Resume
    this.container.querySelector('#btn-resume')?.addEventListener('click', () => {
      this.onResumeCallback?.();
    });

    // Pause Switch Class
    this.container.querySelector('#btn-switch-class')?.addEventListener('click', () => {
      this.showClassSelection();
    });

    // Pause Reset Arena
    this.container.querySelector('#btn-reset-arena')?.addEventListener('click', () => {
      this.onResetArenaCallback?.();
      this.onResumeCallback?.();
    });

    // Settings: Sens
    const sensInput = this.container.querySelector('#slider-sens') as HTMLInputElement;
    const sensLabel = this.container.querySelector('#label-sens') as HTMLElement;
    sensInput?.addEventListener('input', () => {
      const val = parseFloat(sensInput.value);
      sensLabel.textContent = (val * 1000).toFixed(1);
      this.onSensitivityChangeCallback?.(val);
    });

    // Settings: FOV
    const fovInput = this.container.querySelector('#slider-fov') as HTMLInputElement;
    const fovLabel = this.container.querySelector('#label-fov') as HTMLElement;
    fovInput?.addEventListener('input', () => {
      const val = parseFloat(fovInput.value);
      const deg = Math.round((val * 180) / Math.PI);
      fovLabel.textContent = `${deg}°`;
      this.onFovChangeCallback?.(val);
    });

    // Settings: Volume
    const volInput = this.container.querySelector('#slider-vol') as HTMLInputElement;
    const volLabel = this.container.querySelector('#label-vol') as HTMLElement;
    volInput?.addEventListener('input', () => {
      const val = parseFloat(volInput.value);
      volLabel.textContent = `${Math.round(val * 100)}%`;
      sounds.setVolume(val);
    });
  }

  public setCallbacks(cbs: {
    onSelectClass: (cls: ClassType) => void;
    onResume: () => void;
    onResetArena: () => void;
    onSensitivityChange: (val: number) => void;
    onFovChange: (val: number) => void;
  }): void {
    this.onSelectClassCallback = cbs.onSelectClass;
    this.onResumeCallback = cbs.onResume;
    this.onResetArenaCallback = cbs.onResetArena;
    this.onSensitivityChangeCallback = cbs.onSensitivityChange;
    this.onFovChangeCallback = cbs.onFovChange;
  }

  public showClassSelection(): void {
    this.isClassSelectOpen = true;
    this.isPaused = false;
    this.container.style.display = 'flex';
    this.container.querySelector('#class-select-screen')?.classList.add('active');
    this.container.querySelector('#pause-screen')?.classList.remove('active');
  }

  public showPauseMenu(): void {
    this.isPaused = true;
    this.isClassSelectOpen = false;
    this.container.style.display = 'flex';
    this.container.querySelector('#class-select-screen')?.classList.remove('active');
    this.container.querySelector('#pause-screen')?.classList.add('active');
  }

  public hideAll(): void {
    this.isPaused = false;
    this.isClassSelectOpen = false;
    this.container.style.display = 'none';
  }

  public isOpen(): boolean {
    return this.isPaused || this.isClassSelectOpen;
  }
}
