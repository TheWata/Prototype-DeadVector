// Centralized balance parameters for Combat Sandbox

export const GameConfig = {
  player: {
    maxHealth: 100,
    walkSpeed: 14.0,
    acceleration: 80.0,
    friction: 12.0,
    airControl: 0.6,
    jumpForce: 11.0,
    gravity: 28.0,
    height: 1.8,
    radius: 0.5,
    cameraHeight: 1.65,
    defaultSensitivity: 0.0022,
    defaultFov: 1.35, // ~77 degrees in radians
  },

  dash: {
    speed: 32.0,
    durationMs: 150,
    cooldownMs: 800,
    fovKick: 0.12,
  },

  parry: {
    windowMs: 280,
    cooldownMs: 1000,
    reachDistance: 4.5,
    reachAngleCos: 0.5, // ~60 deg cone in front of camera
    reflectedSpeed: 30.0,
    reflectedDamage: 120,
  },

  cowboy: {
    primary: {
      bulletCount: 2,
      delayBetweenShotsMs: 100,
      cooldownMs: 500,
      damagePerShot: 35,
      range: 150,
    },
    coin: {
      cooldownMs: 1800,
      tossForwardSpeed: 11.0,
      tossUpwardSpeed: 9.5,
      gravity: 18.0,
      lifetimeMs: 3000,
      radius: 0.35,
      redirectDamage: 130,
    },
  },

  enforcer: {
    primary: {
      pelletCount: 10,
      spreadRad: 0.075,
      damagePerPellet: 14,
      cooldownMs: 700,
      range: 80,
    },
    hook: {
      cooldownMs: 1200,
      maxDistance: 50,
      travelSpeed: 30.0,
      pullPlayerSpeed: 26.0,
      pullTargetSpeed: 22.0,
      stopDistance: 2.0,
    },
  },

  recon: {
    primary: {
      damage: 115,
      cooldownMs: 900,
      maxPierces: 5,
      maxRicochetDist: 40,
      range: 200,
    },
    explosive: {
      damageMax: 95,
      radius: 7.0,
      cooldownMs: 1600,
      range: 150,
    },
  },

  dummy: {
    maxHealth: 500,
    lightWeight: 1,
    heavyWeight: 5,
    projectileSpeed: 11.0,
    projectileRadius: 0.45,
    projectileLifetimeMs: 5000,
  },

  arena: {
    width: 60,
    depth: 60,
    height: 14,
  },
} as const;

export type ClassType = 'cowboy' | 'enforcer' | 'recon';
