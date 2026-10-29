import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  HemisphericLight,
  PointLight,
  Vector3,
  Mesh,
  DynamicTexture,
} from '@babylonjs/core';
import { GameConfig } from '../config/GameConfig';

export class Arena {
  private scene: Scene;
  private colliders: Mesh[] = [];
  private ricochetSurfaces: Mesh[] = [];

  constructor(scene: Scene) {
    this.scene = scene;
    this.setupLighting();
    this.buildGeometry();
  }

  private setupLighting(): void {
    // Hemispheric ambient light
    const hemiLight = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), this.scene);
    hemiLight.intensity = 0.85;
    hemiLight.diffuse = new Color3(0.9, 0.92, 0.96);
    hemiLight.groundColor = new Color3(0.2, 0.22, 0.28);

    // Subtle center accent point light
    const pointLight = new PointLight('centerLight', new Vector3(0, 10, 0), this.scene);
    pointLight.intensity = 0.5;
    pointLight.diffuse = new Color3(0.4, 0.8, 1.0);
  }

  private buildGeometry(): void {
    const { width, depth, height } = GameConfig.arena;

    // Materials
    const floorMat = new StandardMaterial('floorMat', this.scene);
    floorMat.diffuseColor = new Color3(0.12, 0.13, 0.16);
    floorMat.specularColor = new Color3(0.1, 0.1, 0.1);

    // Subtle grid texture on floor for movement reference
    const gridTex = new DynamicTexture('gridTexture', 512, this.scene, false);
    const ctx = gridTex.getContext();
    ctx.fillStyle = '#171920';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#2b3142';
    ctx.lineWidth = 4;
    const step = 64;
    for (let x = 0; x <= 512; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }
    for (let y = 0; y <= 512; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }
    gridTex.update();
    gridTex.uScale = 15;
    gridTex.vScale = 15;
    floorMat.diffuseTexture = gridTex;

    const wallMat = new StandardMaterial('wallMat', this.scene);
    wallMat.diffuseColor = new Color3(0.18, 0.2, 0.25);
    wallMat.specularColor = new Color3(0.1, 0.1, 0.1);

    const ceilingMat = new StandardMaterial('ceilingMat', this.scene);
    ceilingMat.diffuseColor = new Color3(0.1, 0.11, 0.14);

    const pillarMat = new StandardMaterial('pillarMat', this.scene);
    pillarMat.diffuseColor = new Color3(0.24, 0.27, 0.35);

    const platformMat = new StandardMaterial('platformMat', this.scene);
    platformMat.diffuseColor = new Color3(0.2, 0.24, 0.32);

    const ricochetMat = new StandardMaterial('ricochetMat', this.scene);
    ricochetMat.diffuseColor = new Color3(0.0, 0.8, 1.0);
    ricochetMat.emissiveColor = new Color3(0.1, 0.5, 0.8);
    ricochetMat.specularColor = new Color3(1, 1, 1);

    // Floor
    const floor = MeshBuilder.CreateBox('floor', { width, depth, height: 1 }, this.scene);
    floor.position.y = -0.5;
    floor.material = floorMat;
    floor.checkCollisions = true;
    floor.metadata = { isGround: true, isArenaBoundary: true };
    this.colliders.push(floor);

    // Ceiling
    const ceiling = MeshBuilder.CreateBox('ceiling', { width, depth, height: 1 }, this.scene);
    ceiling.position.y = height + 0.5;
    ceiling.material = ceilingMat;
    ceiling.checkCollisions = true;
    ceiling.metadata = { isCeiling: true, isArenaBoundary: true };
    this.colliders.push(ceiling);

    // Walls
    const halfW = width / 2;
    const halfD = depth / 2;
    const halfH = height / 2;

    const northWall = MeshBuilder.CreateBox('wallNorth', { width, height, depth: 1 }, this.scene);
    northWall.position.set(0, halfH, halfD + 0.5);
    northWall.material = wallMat;
    northWall.checkCollisions = true;
    northWall.metadata = { isWall: true, isArenaBoundary: true };
    this.colliders.push(northWall);

    const southWall = MeshBuilder.CreateBox('wallSouth', { width, height, depth: 1 }, this.scene);
    southWall.position.set(0, halfH, -halfD - 0.5);
    southWall.material = wallMat;
    southWall.checkCollisions = true;
    southWall.metadata = { isWall: true, isArenaBoundary: true };
    this.colliders.push(southWall);

    const eastWall = MeshBuilder.CreateBox('wallEast', { width: 1, height, depth }, this.scene);
    eastWall.position.set(halfW + 0.5, halfH, 0);
    eastWall.material = wallMat;
    eastWall.checkCollisions = true;
    eastWall.metadata = { isWall: true, isArenaBoundary: true };
    this.colliders.push(eastWall);

    const westWall = MeshBuilder.CreateBox('wallWest', { width: 1, height, depth }, this.scene);
    westWall.position.set(-halfW - 0.5, halfH, 0);
    westWall.material = wallMat;
    westWall.checkCollisions = true;
    westWall.metadata = { isWall: true, isArenaBoundary: true };
    this.colliders.push(westWall);

    // Ricochet Panels (Specially marked surfaces for Recon Sniper ricochets)
    // Panel 1: North wall center
    const rPanelNorth = MeshBuilder.CreateBox('ricochetPanelNorth', { width: 16, height: 6, depth: 0.2 }, this.scene);
    rPanelNorth.position.set(0, 4, halfD - 0.05);
    rPanelNorth.material = ricochetMat;
    rPanelNorth.checkCollisions = true;
    rPanelNorth.metadata = { isRicochet: true, isWall: true, name: 'Painel Ricochete Norte' };
    this.ricochetSurfaces.push(rPanelNorth);
    this.colliders.push(rPanelNorth);

    // Panel 2: East wall
    const rPanelEast = MeshBuilder.CreateBox('ricochetPanelEast', { width: 0.2, height: 6, depth: 16 }, this.scene);
    rPanelEast.position.set(halfW - 0.05, 4, 0);
    rPanelEast.material = ricochetMat;
    rPanelEast.checkCollisions = true;
    rPanelEast.metadata = { isRicochet: true, isWall: true, name: 'Painel Ricochete Leste' };
    this.ricochetSurfaces.push(rPanelEast);
    this.colliders.push(rPanelEast);

    // Panel 3: West wall
    const rPanelWest = MeshBuilder.CreateBox('ricochetPanelWest', { width: 0.2, height: 6, depth: 16 }, this.scene);
    rPanelWest.position.set(-halfW + 0.05, 4, 0);
    rPanelWest.material = ricochetMat;
    rPanelWest.checkCollisions = true;
    rPanelWest.metadata = { isRicochet: true, isWall: true, name: 'Painel Ricochete Oeste' };
    this.ricochetSurfaces.push(rPanelWest);
    this.colliders.push(rPanelWest);

    // Arena Interior Obstacles / Cover / Pillars for Grapple & Line of Sight testing
    const pillarPositions = [
      new Vector3(-14, 4, -14),
      new Vector3(14, 4, -14),
      new Vector3(-14, 4, 14),
      new Vector3(14, 4, 14),
    ];

    pillarPositions.forEach((pos, idx) => {
      const pillar = MeshBuilder.CreateBox(`pillar_${idx}`, { width: 3, height: 8, depth: 3 }, this.scene);
      pillar.position = pos;
      pillar.material = pillarMat;
      pillar.checkCollisions = true;
      pillar.metadata = { isObstacle: true, isGrappleTarget: true };
      this.colliders.push(pillar);
    });

    // Elevated platform in the middle-back
    const platform = MeshBuilder.CreateBox('platformCenter', { width: 12, height: 1.2, depth: 8 }, this.scene);
    platform.position.set(0, 3.5, 12);
    platform.material = platformMat;
    platform.checkCollisions = true;
    platform.metadata = { isPlatform: true, isGround: true };
    this.colliders.push(platform);

    // Ramp / low blocks
    const block1 = MeshBuilder.CreateBox('block1', { width: 4, height: 2, depth: 4 }, this.scene);
    block1.position.set(-8, 1, 0);
    block1.material = platformMat;
    block1.checkCollisions = true;
    this.colliders.push(block1);

    const block2 = MeshBuilder.CreateBox('block2', { width: 4, height: 2, depth: 4 }, this.scene);
    block2.position.set(8, 1, 0);
    block2.material = platformMat;
    block2.checkCollisions = true;
    this.colliders.push(block2);
  }

  public getColliders(): Mesh[] {
    return this.colliders;
  }

  public getRicochetSurfaces(): Mesh[] {
    return this.ricochetSurfaces;
  }
}
