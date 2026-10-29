import { Scene } from '@babylonjs/core';
import type { ClassType } from '../config/GameConfig';
import { BaseClassController } from './BaseClassController';
import { CowboyController } from './CowboyController';
import { EnforcerController } from './EnforcerController';
import { ReconController } from './ReconController';
import { CombatSystem } from '../combat/CombatSystem';
import { PlayerController } from '../player/PlayerController';
import { TargetDummy } from '../combat/TargetDummy';

export interface ClassMetadata {
  id: ClassType;
  name: string;
  iconSvg: string;
  description: string;
  primaryName: string;
  primaryDesc: string;
  secondaryName: string;
  secondaryDesc: string;
  combatTips: string[];
}

export const CLASS_DEFINITIONS: Record<ClassType, ClassMetadata> = {
  cowboy: {
    id: 'cowboy',
    name: 'Cowboy',
    iconSvg: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 34C10 32 18 32 24 32C30 32 38 32 42 34C44 34.6 42 38 38 38C28 38 20 38 10 38C6 38 4 34.6 6 34Z" fill="#ffb703" stroke="#ffd166" stroke-width="2"/>
      <path d="M14 32L17 18C17 15 20 14 24 14C28 14 31 15 31 18L34 32" fill="#fb8500" stroke="#ffd166" stroke-width="2"/>
      <circle cx="24" cy="22" r="3" fill="#023047"/>
      <path d="M20 28H28" stroke="#023047" stroke-width="2"/>
    </svg>`,
    description: 'Classe ágil baseada em rajadas duplas de alta cadência e manipulação espacial via arremesso e ricochete de moedas.',
    primaryName: 'Disparo Duplo (M1)',
    primaryDesc: '2 tiros hitscan sequenciais (1º imediato, 2º a 100ms) com 500ms de cooldown.',
    secondaryName: 'Moeda (M2)',
    secondaryDesc: 'Lança uma moeda ao ar. Atirar na moeda redireciona o tiro ao alvo com dano crítico!',
    combatTips: [
      'Dispare com M1 logo após M2 para acertar a moeda em pleno ar.',
      'O tiro refletido na moeda busca o alvo automaticamente com dano massivo.',
      'Use o Dash para reposicionar seu ângulo de tiro.',
    ],
  },
  enforcer: {
    id: 'enforcer',
    name: 'Enforcer',
    iconSvg: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="18" width="22" height="7" rx="2" fill="#ef233c" stroke="#ff758f" stroke-width="2"/>
      <rect x="6" y="25" width="8" height="11" rx="2" fill="#8d99ae" stroke="#edf2f4" stroke-width="2"/>
      <path d="M30 20L40 28L36 32L28 24" fill="#d90429" stroke="#ff758f" stroke-width="2"/>
      <path d="M34 14L42 10L38 18" stroke="#ffd166" stroke-width="2" stroke-linecap="round"/>
    </svg>`,
    description: 'Especialista em combate a curta distância, munido de escopeta devastadora e gancho com física interativa para alvos e superfícies.',
    primaryName: 'Escopeta (M1)',
    primaryDesc: 'Disparo de 10 pellets com dispersão angular cônica e cálculo de impacto independente.',
    secondaryName: 'Gancho (M2)',
    secondaryDesc: 'Puxa o jogador até superfícies ou puxa alvos leves (peso 1) diretamente até você!',
    combatTips: [
      'Alterne o peso do Alvo no painel (Peso 1 para puxar o alvo, Peso 5 para puxar você até ele).',
      'Pule ou pressione M2 para cancelar a puxada do gancho no ar.',
      'Combine o gancho com escopeta colada para máximo dano.',
    ],
  },
  recon: {
    id: 'recon',
    name: 'Recon',
    iconSvg: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="16" stroke="#00f5d4" stroke-width="2"/>
      <circle cx="24" cy="24" r="8" stroke="#00bbf9" stroke-width="1.5" stroke-dasharray="3 3"/>
      <line x1="24" y1="4" x2="24" y2="44" stroke="#00f5d4" stroke-width="2"/>
      <line x1="4" y1="24" x2="44" y2="24" stroke="#00f5d4" stroke-width="2"/>
      <circle cx="24" cy="24" r="2" fill="#fee440"/>
    </svg>`,
    description: 'Franco-atirador tático de precisão cirúrgica com projéteis perfurantes, ricochete em superfícies reflexivas e demolição em área.',
    primaryName: 'Sniper Penetrante (M1)',
    primaryDesc: 'Hitscan que perfura múltiplos alvos e rebate em painéis de ricochete azuis.',
    secondaryName: 'Disparo Explosivo (M2)',
    secondaryDesc: 'Detonação em área com raio de 7m e redução de dano por distância do centro.',
    combatTips: [
      'Atire nos painéis azuis da arena para acertar alvos fora da linha de visão direta.',
      'O disparo perfurante acerta alvos enfileirados em uma única rajada.',
      'O tiro secundário atinge alvos atrás de cobertura graças ao dano radial.',
    ],
  },
};

export class ClassSystem {
  private scene: Scene;
  private combatSystem: CombatSystem;
  private player: PlayerController;
  private getDummies: () => TargetDummy[];

  private currentClass: ClassType = 'cowboy';
  private currentController: BaseClassController;

  constructor(
    scene: Scene,
    combatSystem: CombatSystem,
    player: PlayerController,
    getDummies: () => TargetDummy[]
  ) {
    this.scene = scene;
    this.combatSystem = combatSystem;
    this.player = player;
    this.getDummies = getDummies;

    this.currentController = this.createController(this.currentClass);
  }

  public setClass(type: ClassType): void {
    if (this.currentClass === type && this.currentController) {
      return;
    }

    if (this.currentController) {
      this.currentController.dispose();
    }

    this.currentClass = type;
    this.currentController = this.createController(type);
  }

  private createController(type: ClassType): BaseClassController {
    switch (type) {
      case 'cowboy':
        return new CowboyController(this.scene, this.combatSystem, this.getDummies);
      case 'enforcer':
        return new EnforcerController(this.scene, this.combatSystem, this.player);
      case 'recon':
        return new ReconController(this.scene, this.combatSystem, this.getDummies);
    }
  }

  public getCurrentClass(): ClassType {
    return this.currentClass;
  }

  public getCurrentMetadata(): ClassMetadata {
    return CLASS_DEFINITIONS[this.currentClass];
  }

  public getController(): BaseClassController {
    return this.currentController;
  }

  public update(dt: number): void {
    this.currentController?.update(dt);
  }

  public reset(): void {
    this.currentController?.reset();
  }
}
