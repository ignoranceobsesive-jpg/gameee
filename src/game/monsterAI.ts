import { clamp, resolveWorldCollisions } from './collision';
import {
  CardinalDirection,
  GameWorld,
  Monster,
  MonsterType,
  Structure,
  Vec2,
} from './types';
import { formatGameTime } from './worldGen';

let monsterSeq = 1;

export function getDirectionVector(dir: CardinalDirection): Vec2 {
  if (dir === 'N') return { x: 0, y: -1 };
  if (dir === 'E') return { x: 1, y: 0 };
  if (dir === 'S') return { x: 0, y: 1 };
  return { x: -1, y: 0 };
}

export function getDirectionLabel(dir: CardinalDirection): string {
  if (dir === 'N') return 'NORTH';
  if (dir === 'E') return 'EAST';
  if (dir === 'S') return 'SOUTH';
  return 'WEST';
}

export function getWaveSpawnPosition(world: GameWorld, dir: CardinalDirection, spread = 240): Vec2 {
  const v = getDirectionVector(dir);
  const dist = 560 + Math.random() * 140;
  const perp = (Math.random() - 0.5) * 2 * spread;
  const x = world.villageCenter.x + v.x * dist - v.y * perp;
  const y = world.villageCenter.y + v.y * dist + v.x * perp;
  return {
    x: clamp(x, 120, world.worldWidth - 120),
    y: clamp(y, 120, world.worldHeight - 120),
  };
}

export function igniteMonster(world: GameWorld, m: Monster, duration = 5.5): void {
  if (m.state === 'DYING') return;
  const wasBurning = (m.burningTimer ?? 0) > 0;
  m.burningTimer = Math.max(m.burningTimer ?? 0, duration);
  m.tarredTimer = 0;
  if (!wasBurning) {
    world.audioQueue.push({ kind: 'fire_ignite' });
    world.floatingNotices.push({
      id: `fn-burn-${Math.random().toString(36).slice(2, 6)}`,
      x: m.x,
      y: m.y - 34,
      text: 'IGNITED!',
      color: '#ff9f43',
      ttl: 1.2,
    });
  }
}

export function spawnMonster(world: GameWorld, type: MonsterType, x: number, y: number): Monster {
  const scale = 1 + (world.day - 1) * 0.13;
  const specs: Record<
    MonsterType,
    {
      name: string;
      hp: number;
      speed: number;
      damage: number;
      radius: number;
      detect: number;
      hear: number;
      telegraph: number;
      isBoss?: boolean;
    }
  > = {
    CRAWLER: {
      name: 'Shadow Crawler',
      hp: Math.round(44 * scale),
      speed: 152,
      damage: Math.round(12 * scale),
      radius: 13,
      detect: 360,
      hear: 440,
      telegraph: 0.28,
    },
    STALKER: {
      name: 'Gloom Stalker',
      hp: Math.round(68 * scale),
      speed: 138,
      damage: Math.round(20 * scale),
      radius: 15,
      detect: 430,
      hear: 360,
      telegraph: 0.36,
    },
    BRUTE: {
      name: 'Timber Brute',
      hp: Math.round(185 * scale),
      speed: 74,
      damage: Math.round(32 * scale),
      radius: 24,
      detect: 380,
      hear: 480,
      telegraph: 0.68,
    },
    HOWLER: {
      name: 'Banshee Howler',
      hp: Math.round(80 * scale),
      speed: 112,
      damage: Math.round(14 * scale),
      radius: 16,
      detect: 470,
      hear: 520,
      telegraph: 0.55,
    },
    MIMIC: {
      name: 'Hollow Mimic',
      hp: Math.round(96 * scale),
      speed: 126,
      damage: Math.round(24 * scale),
      radius: 15,
      detect: 310,
      hear: 300,
      telegraph: 0.34,
    },
    WATCHER: {
      name: 'The Watcher',
      hp: Math.round(260 * scale),
      speed: 88,
      damage: Math.round(26 * scale),
      radius: 18,
      detect: 650,
      hear: 500,
      telegraph: 0.6,
    },
    UNKNOWN: {
      name: 'The Unknown',
      hp: Math.round(420 * scale),
      speed: 102,
      damage: Math.round(36 * scale),
      radius: 24,
      detect: 600,
      hear: 620,
      telegraph: 0.68,
    },
    PALE_STAG: {
      name: 'The Pale Stag',
      hp: Math.round(620 + world.day * 55),
      speed: 116,
      damage: Math.round(32 + world.day * 2.5),
      radius: 30,
      detect: 900,
      hear: 900,
      telegraph: 0.72,
      isBoss: true,
    },
    ROOTBOUND_WARDEN: {
      name: 'The Rootbound Warden',
      hp: Math.round(760 + world.day * 62),
      speed: 76,
      damage: Math.round(36 + world.day * 2.8),
      radius: 34,
      detect: 900,
      hear: 900,
      telegraph: 0.8,
      isBoss: true,
    },
  };

  const s = specs[type];
  const monster: Monster = {
    id: `mon-${monsterSeq++}`,
    type,
    name: s.name,
    x: clamp(x, 80, world.worldWidth - 80),
    y: clamp(y, 80, world.worldHeight - 80),
    vx: 0,
    vy: 0,
    facing: 1,
    radius: s.radius,
    hp: s.hp,
    maxHp: s.hp,
    speed: s.speed,
    damage: s.damage,
    detectionRange: s.detect,
    hearingRange: s.hear,
    state: type === 'MIMIC' ? 'DISGUISED' : type === 'WATCHER' ? 'OBSERVE' : 'PATROL',
    stateTimer: s.isBoss ? 3.5 : 0,
    telegraphDuration: s.telegraph,
    attackCooldown: 0.45,
    targetId: null,
    targetKind: null,
    lastKnownPos: null,
    patrolOrigin: { x, y },
    hitFlash: 0,
    animPhase: Math.random() * Math.PI * 2,
    deathTimer: 0,
    mimicDisguiseName: type === 'MIMIC' ? 'Lost Survivor' : undefined,
    mimicRevealed: type !== 'MIMIC',
    hasAttackToken: false,
    visibility: type === 'STALKER' ? 0.22 : 1,
    tarredTimer: 0,
    burningTimer: 0,
    stunTimer: 0,
    buffTimer: 0,
    slowedByLight: false,
    isBoss: Boolean(s.isBoss),
    bossPhase: s.isBoss ? 1 : undefined,
    bossAbilityTimer: s.isBoss ? 4.2 : undefined,
    chargeDir: null,
  };

  world.monsters.push(monster);
  return monster;
}

export function getMonsterGoldBounty(m: Monster): number {
  if (m.isBoss) return 60;
  if (m.type === 'BRUTE') return 15;
  if (m.type === 'STALKER' || m.type === 'HOWLER' || m.type === 'MIMIC') return 8;
  return 5;
}

export function awardMonsterKill(world: GameWorld, m: Monster): void {
  if (m.state === 'DYING') return;
  m.state = 'DYING';
  m.deathTimer = 0.38;
  world.monstersSlain++;
  const bounty = getMonsterGoldBounty(m);
  world.gold += bounty;
  world.floatingNotices.push({
    id: `fn-gold-${Math.random().toString(36).slice(2, 6)}`,
    x: m.x,
    y: m.y - 26,
    text: `+${bounty} Gold`,
    color: '#ffd166',
    ttl: 1.4,
  });
  if (m.isBoss) {
    if (!world.bossesDefeated.includes(m.name)) {
      world.bossesDefeated.push(m.name);
    }
    world.wave.bossActive = false;
    world.wave.bossId = null;
    world.celebrationTimer = 6;
  }
}

export function startNightWaveTelegraph(world: GameWorld, forcedDir?: CardinalDirection): void {
  const dirs: CardinalDirection[] = ['N', 'E', 'S', 'W'];
  const dir = forcedDir ?? dirs[(world.day - 1) % 4];
  const isBossNight = world.day % 5 === 0;
  const bossType: MonsterType = world.day % 10 === 0 ? 'ROOTBOUND_WARDEN' : 'PALE_STAG';
  const bossLabel = bossType === 'ROOTBOUND_WARDEN' ? 'The Rootbound Warden' : 'The Pale Stag';

  // Escalating wave size: Night 1 (8), Night 2 (13), Night 3 (17)... overwhelms an unbuilt village!
  const baseCount = Math.min(34, 4 + world.day * 4);

  world.wave = {
    waveNumber: world.day,
    phase: 'TELEGRAPH',
    direction: dir,
    telegraphTimer: 2.8,
    remainingToSpawn: baseCount,
    bossActive: isBossNight,
    bossName: isBossNight ? bossLabel : null,
    bossId: null,
  };
  world.alarmActive = true;
  world.alarmTimer = 24;

  const vDir = getDirectionVector(dir);
  for (let i = 0; i < 6; i++) {
    const startX = world.villageCenter.x + vDir.x * 420 + (Math.random() - 0.5) * 240;
    const startY = world.villageCenter.y + vDir.y * 420 + (Math.random() - 0.5) * 240;
    world.fleeingBirds.push({
      x: startX,
      y: startY,
      vx: -vDir.x * (185 + Math.random() * 60),
      vy: -vDir.y * (185 + Math.random() * 60),
      flap: Math.random() * Math.PI * 2,
      ttl: 4.0,
    });
  }

  world.audioQueue.push({ kind: isBossNight ? 'boss_roar' : 'howl' });
  addLog(
    world,
    isBossNight
      ? `Boss Wave ${world.day}: ${bossLabel} approaches from the ${getDirectionLabel(dir)}!`
      : `Night Wave ${world.day} approaching from the ${getDirectionLabel(dir)}.`,
    'horror'
  );
}

function addLog(world: GameWorld, text: string, severity: 'info' | 'warning' | 'horror' | 'combat'): void {
  world.eventLog.unshift({
    id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    day: world.day,
    timeText: formatGameTime(world.minuteOfDay),
    text,
    severity,
  });
  if (world.eventLog.length > 45) world.eventLog.pop();
}

function moveMonsterToward(
  world: GameWorld,
  m: Monster,
  tx: number,
  ty: number,
  speed: number,
  dt: number
): number {
  const dx = tx - m.x;
  const dy = ty - m.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) {
    m.vx = 0;
    m.vy = 0;
    return dist;
  }

  const nx = dx / dist;
  const ny = dy / dist;
  m.vx = nx * speed;
  m.vy = ny * speed;
  if (Math.abs(nx) > 0.12) m.facing = nx >= 0 ? 1 : -1;

  const nextPos: Vec2 = { x: m.x + m.vx * dt, y: m.y + m.vy * dt };
  resolveWorldCollisions(world, nextPos, m.radius, false);

  const moved = Math.hypot(nextPos.x - m.x, nextPos.y - m.y);
  if (moved < speed * dt * 0.25 && m.type !== 'BRUTE' && !m.isBoss) {
    // Shadow Crawlers & Stalkers intelligently probe left/right gaps around barricades!
    const sign = parseInt(m.id.replace(/\D/g, ''), 10) % 2 === 0 ? 1 : -1;
    const sidestepA: Vec2 = {
      x: m.x - ny * speed * dt * 1.15 * sign,
      y: m.y + nx * speed * dt * 1.15 * sign,
    };
    resolveWorldCollisions(world, sidestepA, m.radius, false);
    const movedA = Math.hypot(sidestepA.x - m.x, sidestepA.y - m.y);
    if (movedA > speed * dt * 0.2) {
      m.x = sidestepA.x;
      m.y = sidestepA.y;
    } else {
      const sidestepB: Vec2 = {
        x: m.x + ny * speed * dt * 1.15 * sign,
        y: m.y - nx * speed * dt * 1.15 * sign,
      };
      resolveWorldCollisions(world, sidestepB, m.radius, false);
      m.x = sidestepB.x;
      m.y = sidestepB.y;
    }
  } else {
    m.x = nextPos.x;
    m.y = nextPos.y;
  }

  m.animPhase += moved * 0.16 + dt * 2.4;
  return Math.hypot(tx - m.x, ty - m.y);
}

function findBlockingOrDefenseStructure(world: GameWorld, x: number, y: number, radius: number): Structure | null {
  let best: Structure | null = null;
  let bestDist = radius;
  for (const s of world.structures) {
    if (s.destroyed || s.isCoreLandmark) continue;
    if (
      s.type !== 'wooden_wall' &&
      s.type !== 'stone_wall' &&
      s.type !== 'barricade' &&
      s.type !== 'gate' &&
      s.type !== 'turret' &&
      s.type !== 'watchtower' &&
      s.type !== 'brazier_beacon' &&
      s.type !== 'tesla_pylon'
    ) {
      continue;
    }
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

function findVillageCore(world: GameWorld): Structure | null {
  return world.structures.find((s) => s.id === 'lm-campfire' && !s.destroyed) ?? null;
}

function checkLightExposure(world: GameWorld, m: Monster): { inBrazier: boolean; inAnyLight: boolean } {
  let inBrazier = false;
  let inAnyLight = false;

  if (world.player.alive && world.player.lanternOn && world.player.lanternFuel > 0) {
    if (Math.hypot(world.player.x - m.x, world.player.y - m.y) < 215) {
      inAnyLight = true;
    }
  }

  for (const s of world.structures) {
    if (s.destroyed || s.lightRadius <= 0 || (s.buildProgress ?? 1) < 1) continue;
    const d = Math.hypot(s.x - m.x, s.y - m.y);
    if (d < s.lightRadius * 0.92) {
      inAnyLight = true;
      if (s.type === 'brazier_beacon' && (s.fuel ?? 100) > 0) {
        inBrazier = true;
      }
      if ((s.type === 'brazier_beacon' || s.type === 'campfire') && d < 88 && (m.tarredTimer ?? 0) > 0) {
        igniteMonster(world, m, 6.0);
      }
    }
  }

  return { inBrazier, inAnyLight };
}

function dropMonsterLoot(_world: GameWorld, _m: Monster): void {
  // Unified Gold currency is awarded immediately on kill via awardMonsterKill().
}

function stepBossBehavior(world: GameWorld, m: Monster, dt: number): boolean {
  const hpRatio = m.hp / m.maxHp;
  m.bossPhase = hpRatio <= 0.32 ? 3 : hpRatio <= 0.66 ? 2 : 1;
  m.bossAbilityTimer = (m.bossAbilityTimer ?? 4) - dt;

  // THE PALE STAG: Antler Charge -> Shadow Summon -> Darkness Surge -> Frenzied Charge
  if (m.type === 'PALE_STAG') {
    if (m.state === 'CHARGE' && m.chargeDir) {
      m.stateTimer -= dt;
      const chargeSpd = m.speed * (m.bossPhase === 3 ? 3.0 : 2.55);
      m.x = clamp(m.x + m.chargeDir.x * chargeSpd * dt, 90, world.worldWidth - 90);
      m.y = clamp(m.y + m.chargeDir.y * chargeSpd * dt, 90, world.worldHeight - 90);
      m.facing = m.chargeDir.x >= 0 ? 1 : -1;
      m.animPhase += dt * 16;

      // Smash through structures in its path!
      for (const s of world.structures) {
        if (s.destroyed || s.isCoreLandmark || !s.blocksMovement) continue;
        if (Math.hypot(s.x - m.x, s.y - m.y) < m.radius + Math.max(s.width, s.height) * 0.45) {
          s.hp -= Math.round(m.damage * 1.4);
          s.hitFlash = 0.2;
          world.cameraShake = Math.min(1, world.cameraShake + 0.4);
          world.audioQueue.push({ kind: 'hit_wood' });
          if (s.hp <= 0) s.destroyed = true;
          m.stateTimer = Math.min(m.stateTimer, 0.08);
        }
      }
      // Damage player if hit during charge
      if (
        world.player.alive &&
        world.player.invulnTimer <= 0 &&
        Math.hypot(world.player.x - m.x, world.player.y - m.y) < m.radius + world.player.radius + 10
      ) {
        world.player.hp = Math.max(0, world.player.hp - m.damage);
        world.player.invulnTimer = 0.6;
        world.player.hitFlash = 0.24;
        world.cameraShake = 0.6;
        world.audioQueue.push({ kind: 'hurt' });
        if (world.player.hp <= 0) world.player.alive = false;
      }

      if (m.stateTimer <= 0) {
        m.state = 'PURSUE';
        m.chargeDir = null;
        m.bossAbilityTimer = m.bossPhase === 3 ? 3.2 : 5.0;
      }
      return true;
    }

    if ((m.bossAbilityTimer ?? 0) <= 0) {
      const targetX = world.player.alive ? world.player.x : world.villageCenter.x;
      const targetY = world.player.alive ? world.player.y : world.villageCenter.y;
      const dist = Math.hypot(targetX - m.x, targetY - m.y) || 1;

      if (m.bossPhase >= 2 && Math.random() < 0.45) {
        // Darkness surge + summon Shadow Crawlers!
        world.darknessSurgeTimer = 8.5;
        world.soundWaves.push({
          x: m.x,
          y: m.y,
          radius: 18,
          maxRadius: 280,
          color: 'rgba(180, 210, 235, 0.7)',
          ttl: 0.9,
        });
        world.audioQueue.push({ kind: 'boss_roar' });
        world.horrorBanner = {
          text: 'The Pale Stag exhales chilling darkness and summons Shadow Crawlers!',
          ttl: 4.5,
        };
        if (world.monsters.length < 18) {
          spawnMonster(world, 'CRAWLER', m.x + 42, m.y - 26);
          spawnMonster(world, 'CRAWLER', m.x - 42, m.y + 26);
        }
        m.bossAbilityTimer = 6.5;
        return true;
      }

      // Antler Charge!
      m.state = 'CHARGE';
      m.stateTimer = 0.9;
      m.chargeDir = { x: (targetX - m.x) / dist, y: (targetY - m.y) / dist };
      world.audioQueue.push({ kind: 'boss_roar' });
      world.soundWaves.push({
        x: m.x,
        y: m.y,
        radius: 16,
        maxRadius: 150,
        color: 'rgba(235, 92, 82, 0.75)',
        ttl: 0.6,
      });
      return true;
    }
  }

  // THE ROOTBOUND WARDEN: Root Snare Zones + Underground Crawler Summon + Growth Regeneration
  if (m.type === 'ROOTBOUND_WARDEN') {
    // Phase 2+: Slow organic regeneration unless currently burning or recently hit
    if (m.bossPhase >= 2 && m.hitFlash <= 0 && (m.burningTimer ?? 0) <= 0) {
      m.hp = Math.min(m.maxHp, m.hp + dt * 5.5);
    }

    if ((m.bossAbilityTimer ?? 0) <= 0) {
      const targetX = world.player.alive ? world.player.x : world.villageCenter.x;
      const targetY = world.player.alive ? world.player.y : world.villageCenter.y;

      // Spawn dangerous Root Snare Zone under target!
      world.rootZones.push({
        id: `rz-${Math.random().toString(36).slice(2, 6)}`,
        x: targetX,
        y: targetY,
        radius: m.bossPhase === 3 ? 76 : 62,
        ttl: 6.0,
      });
      world.soundWaves.push({
        x: m.x,
        y: m.y,
        radius: 20,
        maxRadius: 210,
        color: 'rgba(118, 210, 128, 0.65)',
        ttl: 0.75,
      });
      world.audioQueue.push({ kind: 'boss_roar' });

      if (m.bossPhase >= 2 && world.monsters.length < 18) {
        spawnMonster(world, 'CRAWLER', m.x + (Math.random() - 0.5) * 90, m.y + 40);
      }

      m.bossAbilityTimer = m.bossPhase === 3 ? 3.8 : 5.6;
      return false;
    }
  }

  return false;
}

export function stepMonsters(world: GameWorld, dt: number): void {
  const maxActiveMonsters = Math.min(22, 6 + world.day * 2 + Math.floor(world.structuresBuilt / 4));

  // Dynamic Night Wave Telegraph -> Active Wave Spawning
  if (world.phase === 'NIGHT') {
    if (world.wave.phase === 'CALM' || world.wave.waveNumber !== world.day) {
      startNightWaveTelegraph(world);
    }

    if (world.wave.phase === 'TELEGRAPH') {
      world.wave.telegraphTimer -= dt;
      if (world.wave.telegraphTimer <= 0) {
        world.wave.phase = 'ACTIVE';
        world.nightSpawnTimer = 0.2;

        // Boss Night spawn!
        if (world.wave.bossActive && !world.wave.bossId) {
          const bossType: MonsterType = world.day % 10 === 0 ? 'ROOTBOUND_WARDEN' : 'PALE_STAG';
          const sp = getWaveSpawnPosition(world, world.wave.direction, 90);
          const boss = spawnMonster(world, bossType, sp.x, sp.y);
          world.wave.bossId = boss.id;
          world.audioQueue.push({ kind: 'boss_roar' });
          world.cameraShake = 0.55;
        }
      }
    } else if (world.wave.phase === 'ACTIVE') {
      world.nightSpawnTimer -= dt;
      if (world.nightSpawnTimer <= 0 && world.wave.remainingToSpawn > 0 && world.monsters.length < maxActiveMonsters) {
        world.nightSpawnTimer = Math.max(1.8, 3.6 - world.day * 0.22);
        const dirs: CardinalDirection[] = ['N', 'E', 'S', 'W'];
        // Spawn from primary wave direction + flank direction for exciting perimeter defense!
        const spawnDir =
          world.wave.remainingToSpawn % 3 === 0
            ? dirs[(dirs.indexOf(world.wave.direction) + 1) % 4]
            : world.wave.direction;
        const sp = getWaveSpawnPosition(world, spawnDir, 220);
        const roll = Math.random();

        if (world.day === 1) {
          if (world.wave.remainingToSpawn === 2) {
            spawnMonster(world, 'BRUTE', sp.x, sp.y);
            world.wave.remainingToSpawn--;
          } else if (roll < 0.78) {
            spawnMonster(world, 'CRAWLER', sp.x, sp.y);
            spawnMonster(world, 'CRAWLER', sp.x + 28, sp.y - 22);
            world.wave.remainingToSpawn = Math.max(0, world.wave.remainingToSpawn - 2);
          } else {
            spawnMonster(world, 'STALKER', sp.x, sp.y);
            world.wave.remainingToSpawn--;
          }
        } else {
          if (roll < 0.42) {
            spawnMonster(world, 'CRAWLER', sp.x, sp.y);
            spawnMonster(world, 'CRAWLER', sp.x + 28, sp.y - 22);
            world.wave.remainingToSpawn = Math.max(0, world.wave.remainingToSpawn - 2);
          } else if (roll < 0.62) {
            spawnMonster(world, 'STALKER', sp.x, sp.y);
            world.wave.remainingToSpawn--;
          } else if (roll < 0.86) {
            spawnMonster(world, 'BRUTE', sp.x, sp.y);
            world.wave.remainingToSpawn--;
          } else {
            spawnMonster(world, 'HOWLER', sp.x, sp.y);
            world.wave.remainingToSpawn--;
          }
        }
      }

      if (world.wave.remainingToSpawn <= 0 && world.monsters.every((m) => m.state === 'DYING' || m.type === 'WATCHER')) {
        world.wave.phase = 'CLEARED';
      }
    }
  } else if (world.phase === 'DAWN') {
    world.wave.phase = 'CALM';
    world.wave.bossActive = false;
    for (const m of world.monsters) {
      if (m.state !== 'DYING' && m.type !== 'WATCHER') {
        m.state = 'RETREAT';
      }
    }
  }

  // Count active melee attack tokens (max 4 concurrent attackers for fair combat)
  let usedTokens = 0;
  for (const m of world.monsters) {
    if (m.state === 'DYING') {
      m.hasAttackToken = false;
      continue;
    }
    if (m.hasAttackToken) usedTokens++;
  }

  const watchersEyePenalty = world.activeRelics.includes('watchers_eye') ? 1.4 : 1;

  for (let i = world.monsters.length - 1; i >= 0; i--) {
    const m = world.monsters[i];
    m.hitFlash = Math.max(0, m.hitFlash - dt);
    m.attackCooldown = Math.max(0, m.attackCooldown - dt);
    m.tarredTimer = Math.max(0, (m.tarredTimer ?? 0) - dt);
    m.buffTimer = Math.max(0, (m.buffTimer ?? 0) - dt);
    m.stunTimer = Math.max(0, (m.stunTimer ?? 0) - dt);

    // KO topple/dissolve transition
    if (m.state === 'DYING') {
      m.deathTimer -= dt;
      if (m.deathTimer <= 0) {
        dropMonsterLoot(world, m);
        world.monsters.splice(i, 1);
      }
      continue;
    }

    // Burning DoT & fire smoke particles!
    if ((m.burningTimer ?? 0) > 0) {
      m.burningTimer = Math.max(0, (m.burningTimer ?? 0) - dt);
      m.hp -= dt * 15;
      if (Math.random() < dt * 8) {
        world.smokePuffs.push({
          x: m.x + (Math.random() - 0.5) * 14,
          y: m.y - 14,
          vx: (Math.random() - 0.5) * 18,
          vy: -32 - Math.random() * 20,
          size: 4 + Math.random() * 4,
          alpha: 0.78,
          color: Math.random() < 0.55 ? '#ff9f43' : '#ffd166',
          ttl: 0.55,
        });
      }
      if (m.hp <= 0) {
        awardMonsterKill(world, m);
        continue;
      }
    }

    // Stunned by Tesla / Shard Pylon -> skip actions
    if ((m.stunTimer ?? 0) > 0) {
      m.vx = 0;
      m.vy = 0;
      if (m.state === 'TELEGRAPH') m.state = 'PURSUE';
      continue;
    }

    // Light exposure (Brazier Beacons reveal Gloom Stalkers & slow shadow creatures!)
    const { inBrazier, inAnyLight } = checkLightExposure(world, m);
    m.slowedByLight = inBrazier && (m.type === 'STALKER' || m.type === 'CRAWLER' || m.type === 'UNKNOWN');

    if (m.type === 'STALKER') {
      const revealed =
        inAnyLight ||
        world.activeRelics.includes('watchers_eye') ||
        m.state === 'TELEGRAPH' ||
        m.state === 'ATTACK' ||
        m.hitFlash > 0 ||
        (m.burningTimer ?? 0) > 0;
      const targetVis = revealed ? 1.0 : 0.2;
      m.visibility = (m.visibility ?? 0.22) + (targetVis - (m.visibility ?? 0.22)) * Math.min(1, dt * 8);
    } else {
      m.visibility = 1;
    }

    // Effective movement speed with Tar Trap, Brazier slow, and Banshee Howler buff
    let effectiveSpeed = m.speed;
    if ((m.tarredTimer ?? 0) > 0) effectiveSpeed *= 0.5;
    if (m.slowedByLight) effectiveSpeed *= 0.65;
    if ((m.buffTimer ?? 0) > 0) effectiveSpeed *= 1.35;

    // Leave subtle monster footprints occasionally
    if (Math.hypot(m.vx, m.vy) > 25 && Math.random() < dt * 1.3) {
      world.footprints.push({
        x: m.x,
        y: m.y + 6,
        angle: Math.atan2(m.vy, m.vx),
        kind: m.type === 'BRUTE' || m.isBoss ? 'claw' : 'monster',
        alpha: 0.42,
      });
      if (world.footprints.length > 90) world.footprints.shift();
    }

    // RETREAT at dawn
    if (m.state === 'RETREAT') {
      const awayX = m.x - world.villageCenter.x;
      const awayY = m.y - world.villageCenter.y;
      const d = Math.hypot(awayX, awayY) || 1;
      moveMonsterToward(world, m, m.x + (awayX / d) * 200, m.y + (awayY / d) * 200, effectiveSpeed * 1.15, dt);
      if (d > 860) {
        world.monsters.splice(i, 1);
      }
      continue;
    }

    // SPECIAL 1: THE WATCHER
    if (m.type === 'WATCHER') {
      const distP = Math.hypot(world.player.x - m.x, world.player.y - m.y);
      m.facing = world.player.x >= m.x ? 1 : -1;
      m.stateTimer += dt;
      if (distP < 185 || m.stateTimer > 28) {
        world.horrorBanner = { text: 'The Watcher slipped back into the treeline.', ttl: 4 };
        world.monsters.splice(i, 1);
      }
      continue;
    }

    // SPECIAL 2: HOLLOW MIMIC
    if (m.type === 'MIMIC' && !m.mimicRevealed) {
      const distP = Math.hypot(world.player.x - m.x, world.player.y - m.y);
      moveMonsterToward(world, m, world.player.x, world.player.y, 68, dt);
      if (distP < 115 || m.hp < m.maxHp) {
        m.mimicRevealed = true;
        m.state = 'PURSUE';
        world.audioQueue.push({ kind: 'howl' });
        world.soundWaves.push({
          x: m.x,
          y: m.y,
          radius: 10,
          maxRadius: 110,
          color: 'rgba(218, 72, 72, 0.7)',
          ttl: 0.45,
        });
        world.horrorBanner = { text: 'That was NOT a survivor — a Hollow Mimic transformed!', ttl: 4.5 };
        addLog(world, 'A Hollow Mimic dropped its disguise with a chilling screech!', 'horror');
      }
      continue;
    }

    // Check Ground Traps (Spike Traps + Tar Traps) underneath monster
    for (const st of world.structures) {
      if (st.destroyed || (st.buildProgress ?? 1) < 1) continue;
      const d = Math.hypot(st.x - m.x, st.y - m.y);
      if (st.type === 'tar_trap' && d < 36) {
        m.tarredTimer = Math.max(m.tarredTimer ?? 0, 7.5);
        if ((m.burningTimer ?? 0) > 0) {
          // Walking over tar while burning intensifies fire!
          m.burningTimer = Math.max(m.burningTimer ?? 0, 6.5);
        }
      } else if (st.type === 'spike_trap' && st.attackCooldown <= 0 && d < 32) {
        m.hp -= st.attackDamage;
        m.hitFlash = 0.16;
        m.tarredTimer = Math.max(m.tarredTimer ?? 0, 1.5);
        st.hp -= 10;
        st.attackCooldown = 1.4;
        world.audioQueue.push({ kind: 'hit_flesh' });
        if (st.hp <= 0) st.destroyed = true;
        if (m.hp <= 0) {
          m.state = 'DYING';
          m.deathTimer = 0.4;
          world.monstersSlain++;
        }
      }
    }
    if (m.state === 'DYING') continue;

    // Boss special multi-phase abilities
    if (m.isBoss && stepBossBehavior(world, m, dt)) {
      continue;
    }

    // TELEGRAPH -> ATTACK phase
    if (m.state === 'TELEGRAPH') {
      m.stateTimer -= dt;
      m.vx = 0;
      m.vy = 0;
      if (m.stateTimer <= 0) {
        const dmgMult = (m.buffTimer ?? 0) > 0 ? 1.25 : 1;
        const strikeDamage = Math.round(m.damage * dmgMult);

        if (m.targetKind === 'player' && world.player.alive) {
          const d = Math.hypot(world.player.x - m.x, world.player.y - m.y);
          if (d <= m.radius + world.player.radius + 32 && world.player.invulnTimer <= 0) {
            world.player.hp = Math.max(0, world.player.hp - strikeDamage);
            world.player.hitFlash = 0.2;
            world.player.invulnTimer = 0.45;
            world.cameraShake = Math.min(1, world.cameraShake + 0.45);
            world.hitstopTimer = Math.max(world.hitstopTimer, 0.045);
            world.audioQueue.push({ kind: 'hurt' });
            const ang = Math.atan2(world.player.y - m.y, world.player.x - m.x);
            world.player.x += Math.cos(ang) * 18;
            world.player.y += Math.sin(ang) * 18;
            resolveWorldCollisions(world, world.player, world.player.radius, true);
            if (world.player.hp <= 0) world.player.alive = false;
          }
        } else if (m.targetKind === 'villager' && m.targetId) {
          const v = world.villagers.find((u) => u.id === m.targetId && u.alive);
          if (v && Math.hypot(v.x - m.x, v.y - m.y) <= m.radius + v.radius + 34) {
            v.hp -= strikeDamage;
            v.hitFlash = 0.2;
            v.fear = clamp(v.fear + 26, 0, 100);
            world.audioQueue.push({ kind: 'hit_flesh' });
            if (v.hp <= 0) {
              v.alive = false;
              addLog(world, `${v.name} fell to ${m.name} during the attack.`, 'combat');
              world.horrorBanner = { text: `${v.name} was slain in the dark.`, ttl: 5 };
            }
          }
        } else if (m.targetKind === 'structure' && m.targetId) {
          const s = world.structures.find((st) => st.id === m.targetId && !st.destroyed);
          if (s && Math.hypot(s.x - m.x, s.y - m.y) <= Math.max(s.width, s.height) * 0.65 + m.radius + 32) {
            const siegeMult = s.type === 'campfire' ? (m.type === 'BRUTE' || m.isBoss ? 1.5 : 1.0) : m.type === 'BRUTE' || m.isBoss ? 2.2 : 1;
            const dmgDealt = Math.round(strikeDamage * siegeMult);
            s.hitFlash = 0.22;

            if (s.type === 'campfire') {
              world.coreHp = Math.max(0, world.coreHp - dmgDealt);
              s.hp = world.coreHp;
              world.cameraShake = Math.min(1, world.cameraShake + 0.35);
              world.audioQueue.push({ kind: 'hurt' });
              world.floatingNotices.push({
                id: `fn-core-${Math.random().toString(36).slice(2, 6)}`,
                x: s.x,
                y: s.y - 30,
                text: `-${dmgDealt} Core`,
                color: '#ff6b6b',
                ttl: 1.2,
              });
              if (world.coreHp <= 0) {
                s.destroyed = true;
                world.gameOver = true;
                world.gameOverReason = 'core_destroyed';
              }
            } else {
              s.hp -= dmgDealt;
              world.audioQueue.push({ kind: 'hit_wood' });
              if (s.type === 'barricade' && s.attackDamage > 0) {
                m.hp -= s.attackDamage;
                m.hitFlash = 0.14;
                if (m.hp <= 0) {
                  awardMonsterKill(world, m);
                }
              }
              if (s.hp <= 0) {
                s.destroyed = true;
                addLog(world, `${m.name} destroyed ${s.name}!`, 'warning');
                world.cameraShake = Math.min(1, world.cameraShake + 0.3);
              }
            }
          }
        }

        m.state = 'PURSUE';
        m.attackCooldown = m.type === 'CRAWLER' ? 0.85 : m.type === 'BRUTE' ? 1.45 : 1.1;
        m.hasAttackToken = false;
      }
      continue;
    }

    // Target selection per archetype
    const distPlayer = world.player.alive ? Math.hypot(world.player.x - m.x, world.player.y - m.y) : Infinity;
    const detectRange = m.detectionRange * watchersEyePenalty;
    const heardPlayer =
      world.player.alive && distPlayer < m.hearingRange * watchersEyePenalty * (0.45 + world.player.noiseLevel * 0.01);

    let nearestVillager = null;
    let nearestVilDist = detectRange;
    for (const v of world.villagers) {
      if (!v.alive || v.task === 'MANNING_TOWER') continue;
      const d = Math.hypot(v.x - m.x, v.y - m.y);
      if (d < nearestVilDist) {
        nearestVilDist = d;
        nearestVillager = v;
      }
    }

    // TIMBER BRUTE prioritizes smashing perimeter walls, barricades, braziers & towers first
    if (m.type === 'BRUTE') {
      const targetStruct = findBlockingOrDefenseStructure(world, m.x, m.y, 480);
      if (targetStruct) {
        m.state = 'SIEGE';
        m.targetId = targetStruct.id;
        m.targetKind = 'structure';
        const d = moveMonsterToward(world, m, targetStruct.x, targetStruct.y, effectiveSpeed, dt);
        if (d <= Math.max(targetStruct.width, targetStruct.height) * 0.55 + m.radius + 16 && m.attackCooldown <= 0) {
          m.state = 'TELEGRAPH';
          m.stateTimer = m.telegraphDuration;
        }
        continue;
      }
    }

    // BANSHEE HOWLER stays back, emits visible red soundwave rings, buffs nearby monsters & summons Crawlers!
    if (m.type === 'HOWLER' && (distPlayer < 380 || nearestVilDist < 380)) {
      m.stateTimer -= dt;
      // Keep distance outside immediate melee range
      if (distPlayer < 165 && world.player.alive) {
        const ang = Math.atan2(m.y - world.player.y, m.x - world.player.x);
        moveMonsterToward(world, m, m.x + Math.cos(ang) * 140, m.y + Math.sin(ang) * 140, effectiveSpeed, dt);
      }
      if (m.stateTimer <= 0) {
        m.state = 'HOWL';
        m.stateTimer = 7.5;
        world.audioQueue.push({ kind: 'howl' });
        world.soundWaves.push({
          x: m.x,
          y: m.y,
          radius: 16,
          maxRadius: 270,
          color: 'rgba(232, 72, 72, 0.82)',
          ttl: 0.85,
        });
        for (const other of world.monsters) {
          if (other.id !== m.id && other.state !== 'DYING' && Math.hypot(other.x - m.x, other.y - m.y) < 380) {
            other.buffTimer = 5.5;
            other.lastKnownPos = { x: world.villageCenter.x, y: world.villageCenter.y };
            if (other.state === 'PATROL') other.state = 'PURSUE';
          }
        }
        for (const v of world.villagers) {
          if (v.alive && Math.hypot(v.x - m.x, v.y - m.y) < 420) {
            v.fear = clamp(v.fear + 22, 0, 100);
          }
        }
        // Summon a reinforcement Shadow Crawler if below cap!
        if (world.monsters.length < maxActiveMonsters) {
          spawnMonster(world, 'CRAWLER', m.x + (Math.random() - 0.5) * 48, m.y + 24);
        }
        addLog(world, 'A Banshee Howler shrieked — nearby monsters surged faster!', 'horror');
      }
      continue;
    }

    // GLOOM STALKER avoids brightly lit zones unless already close/revealed, circling for unlit flanks
    if (m.type === 'STALKER' && world.player.alive && distPlayer < 360 && distPlayer > 110) {
      const toStalkerAngle = Math.atan2(m.y - world.player.y, m.x - world.player.x);
      const angleDiff = Math.abs(
        Math.atan2(Math.sin(toStalkerAngle - world.player.aimAngle), Math.cos(toStalkerAngle - world.player.aimAngle))
      );
      if (angleDiff < 0.65 && world.player.lanternOn && !inBrazier) {
        m.state = 'STALK';
        const perpX = world.player.x + Math.cos(toStalkerAngle + 0.55) * 190;
        const perpY = world.player.y + Math.sin(toStalkerAngle + 0.55) * 190;
        moveMonsterToward(world, m, perpX, perpY, effectiveSpeed * 0.94, dt);
        continue;
      }
    }

    // Choose combat target: relentless march toward the Village Core, smashing blockers & defenders in their path!
    const core = findVillageCore(world);
    let goalX = core ? core.x : world.villageCenter.x;
    let goalY = core ? core.y : world.villageCenter.y + 36;
    let attackReach = m.radius + 36;
    const blockingDefense = findBlockingOrDefenseStructure(world, m.x, m.y, 135);
    const distCore = Math.hypot(goalX - m.x, goalY - m.y);

    if (blockingDefense) {
      m.targetKind = 'structure';
      m.targetId = blockingDefense.id;
      goalX = blockingDefense.x;
      goalY = blockingDefense.y;
      attackReach = Math.max(blockingDefense.width, blockingDefense.height) * 0.55 + m.radius + 16;
      m.state = 'SIEGE';
    } else if (distCore < 95 && core) {
      // Right at the Village Core — prioritize destroying the Core!
      m.targetKind = 'structure';
      m.targetId = core.id;
      goalX = core.x;
      goalY = core.y;
      attackReach = Math.max(core.width, core.height) * 0.55 + m.radius + 18;
      m.state = 'SIEGE';
    } else if (nearestVillager && nearestVilDist < 170) {
      m.targetKind = 'villager';
      m.targetId = nearestVillager.id;
      goalX = nearestVillager.x;
      goalY = nearestVillager.y;
      attackReach = m.radius + nearestVillager.radius + 16;
      m.state = 'PURSUE';
    } else if (world.player.alive && distPlayer < 165) {
      m.targetKind = 'player';
      m.targetId = 'player';
      goalX = world.player.x;
      goalY = world.player.y;
      attackReach = m.radius + world.player.radius + 16;
      m.state = 'PURSUE';
    } else if (core) {
      m.targetKind = 'structure';
      m.targetId = core.id;
      goalX = core.x;
      goalY = core.y;
      attackReach = Math.max(core.width, core.height) * 0.55 + m.radius + 18;
      m.state = 'PURSUE';
    } else {
      m.targetKind = null;
      m.targetId = null;
    }

    const dist = moveMonsterToward(world, m, goalX, goalY, effectiveSpeed, dt);

    if (m.targetKind && dist <= attackReach && m.attackCooldown <= 0) {
      if (usedTokens < 5 || m.targetKind === 'structure' || m.isBoss) {
        m.hasAttackToken = m.targetKind !== 'structure';
        if (m.hasAttackToken) usedTokens++;
        m.state = 'TELEGRAPH';
        m.stateTimer = m.telegraphDuration;
      }
    }
  }
}
