# FPS Roguelike Web — Sandbox de Combate

Protótipo 3D em primeira pessoa para navegador com movimentação fluida (referência ULTRAKILL), arena fechada, seleção dinâmica de classes e mecânicas de combate independentes.

Desenvolvido com **Babylon.js**, **TypeScript**, **Vite** e interface nativa em **HTML5/CSS3**.

---

## ⚡ Inicialização Rápida

```bash
# Instalar dependências
npm install

# Iniciar servidor de desenvolvimento
npm run dev

# Gerar build de produção
npm run build

# Pré-visualizar build de produção
npm run preview
```

Servidor padrão acessível em: `http://localhost:5173/`

---

## 🎮 Controles

| Entrada | Ação |
|---|---|
| **W, A, S, D** | Movimentação horizontal rápida |
| **Mouse** | Câmera FPS em primeira pessoa (Pointer Lock) |
| **Espaço** | Pulo com controle aéreo |
| **Shift** | Dash direcional (com FOV kick e cooldown) |
| **F** | Parry defensivo (intercepta e reflete projéteis para a mira) |
| **Mouse 1** | Ataque Primário da classe |
| **Mouse 2** | Ataque Secundário da classe |
| **G** | Dispara projétil de treino do Alvo em direção ao jogador (para teste de Parry) |
| **K** | Alterna peso do Alvo (Peso 1: Puxável / Peso 5: Pesado) |
| **R** | Restaura vida e zera contador de dano do Alvo |
| **T** | Restaura posição inicial do Alvo |
| **Esc** | Pausa o jogo, libera o cursor do mouse e abre menu |
| **Q, E, X** | *Placeholders visuais na HUD* |

---

## 🥋 Classes e Combate

### 1. Cowboy
- **Primário (M1) — Disparo Duplo**: 2 balas hitscan sequenciais (1º imediato, 2º a 100ms) com 500ms de cooldown.
- **Secundário (M2) — Moeda**: Arremessa uma moeda giratória ao ar. Atirar na moeda faz ela emitir um som cristalino e redirecionar a bala para o alvo mais próximo com **130 de dano crítico**!

### 2. Enforcer
- **Primário (M1) — Escopeta**: 10 pellets em cone com dispersão angular e cálculo de impacto individual por pellet.
- **Secundário (M2) — Gancho de Tração**:
  - **Superfícies**: Dispara em paredes/teto/chão e puxa o jogador continuamente (cancelável com pulo ou M2).
  - **Alvos**: Disparado no Alvo de Teste. Se o alvo tiver **Peso 1**, o gancho puxa o alvo suavemente até o jogador. Se tiver **Peso 5**, puxa o jogador até ele!

### 3. Recon
- **Primário (M1) — Sniper Penetrante**: Disparo hitscan de altíssima precisão e dano elevado (115 dano) que perfura múltiplos alvos e realiza 1 ricochete em painéis azuis da arena até distância configurável.
- **Secundário (M2) — Disparo Explosivo**: Disparo hitscan que gera detonação radial de 7 metros no ponto de impacto com redução progressiva de dano por distância.

---

## 🎯 Objeto de Teste (Target Dummy)

Alvo de treino interativo com:
- Barra de vida e cálculo em tempo real de dano acumulado e total de acertos.
- Hitbox com headshot diferenciado (área superior).
- Botões de restauração de vida (`R`) e posição (`T`).
- Alternância de peso (`K`) para validação dos dois comportamentos do gancho.
- Emissor de projéteis de treino (`G`) para validação do sistema de Parry (`F`).

---

## 🧱 Arquitetura dos Módulos

```
src/
├── config/
│   └── GameConfig.ts           # Parâmetros centrais de balanceamento (velocidades, danos, cooldowns)
├── audio/
│   └── SoundSystem.ts          # Síntese de efeitos sonoros procedural via Web Audio API
├── arena/
│   └── Arena.ts                # Geometria 3D da arena, limites, iluminação e painéis de ricochete
├── player/
│   ├── PlayerController.ts     # Movimentação cinemática FPS, câmera, gravidade e colisões
│   ├── DashSystem.ts           # Mecânica e cooldown do dash
│   └── ParrySystem.ts          # Janela de parry e reflexão direcional
├── combat/
│   ├── CombatSystem.ts         # Raycasting, projéteis, números flutuantes e hitmarkers
│   ├── TargetDummy.ts          # Alvo de treino 3D interativo
│   └── Projectile.ts           # Projétil hostil e refletido
├── classes/
│   ├── ClassSystem.ts          # Gerenciador de classes e troca dinâmica sem reload
│   ├── BaseClassController.ts  # Contrato base de armas e habilidades
│   ├── CowboyController.ts     # Lógica do Cowboy (Disparo duplo e Moeda)
│   ├── EnforcerController.ts   # Lógica do Enforcer (Escopeta e Gancho de Tração)
│   └── ReconController.ts      # Lógica do Recon (Sniper penetrante e Explosivo)
├── ui/
│   ├── HUD.ts                  # HUD (vida, crosshair, cooldowns, painel do dummy, placeholders Q/E/X)
│   └── GameMenu.ts             # Seleção de classes, menu de pausa e configurações
├── core/
│   └── Game.ts                 # Loop principal unificado e orquestração do Babylon.js
├── style.css                   # Estilização arcade/cyberpunk minimalista
└── main.ts                     # Ponto de entrada da aplicação
```
