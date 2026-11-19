import { clamp, resolveWorldCollisions } from './collision';
import { awardMonsterKill } from './monsterAI';
import { GameWorld, Monster, Structure, Villager } from './types';
import { formatGameTime } from './worldGen';

function addLog(
  world: GameWorld,
  text: string,
  severity: 'info' | 'warning' | 'horror' | 'combat' = 'info'
): void {
  world.eventLog.unshift({
    id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    day: world.day,
    timeText: formatGameTime(world.minuteOfDay),
    text,
    severity,
  });
  if (world.eventLog.length > 40) world.eventLog.pop();
}

function addFloatingNotice(world: GameWorld, x: number, y: number, text: string, color = '#ffd166'): void {
  world.floatingNotices.push({
    id: `fn-${Math.random().toString(36).slice(2, 7)}`,
    x,
    y,
    text,
    color,
    ttl: 1.45,
  });
  if (world.floatingNotices.length > 32) world.floatingNotices.shift();
}

function isCombatRole(role: Villager['role']): boolean {
  return role === 'GUARD' || role === 'SHARPSHOOTER' || role === 'SCOUT';
}

function findNearestThreat(world: GameWorld, x: number, y: number, maxRange: number): Monster | null {
  let best: Monster | null = null;
  let bestDist = maxRange;
  for (const m of world.monsters) {
    if (m.state === 'DYING') continue;
    if (m.type === 'MIMIC' && !m.mimicRevealed) continue;
    if (m.type === 'WATCHER' && m.state === 'OBSERVE') continue;
    const d = Math.hypot(m.x - x, m.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  return best;
}

function findNearestBlueprint(world: GameWorld, x: number, y: number): Structure | null {
  let best: Structure | null = null;
  let bestDist = 850;
  for (const s of world.structures) {
    if (s.destroyed) continue;
    if ((s.buildProgress ?? 1) >= 1) continue;
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

function findNearestDamagedDefense(world: GameWorld, x: number, y: number): Structure | null {
  let best: Structure | null = null;
  let bestScore = Infinity;
  for (const s of world.structures) {
    if (s.destroyed || s.type === 'campfire' || (s.buildProgress ?? 1) < 1) continue;
    if (s.hp >= s.maxHp) continue;
    if (s.type !== 'watchtower' && s.type !== 'brazier_beacon' && s.type !== 'barricade' && s.type !== 'wooden_wall') {
      continue;
    }
    const d = Math.hypot(s.x - x, s.y - y);
    if (d > 700) continue;
    const score = d - (1 - s.hp / s.maxHp) * 200;
    if (score < bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

function findNearestTimberOrRock(world: GameWorld, x: number, y: number): { id: string; x: number; y: number; name: string } | null {
  let best: { id: string; x: number; y: number; name: string } | null = null;
  let bestDist = 760;
  for (const n of world.resourceNodes) {
    if (n.depleted) continue;
    if (n.kind !== 'pine_tree' && n.kind !== 'dead_tree' && n.kind !== 'stone_boulder' && n.kind !== 'metal_vein') {
      continue;
    }
    const d = Math.hypot(n.x - x, n.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = { id: n.id, x: n.x, y: n.y, name: n.name };
    }
  }
  return best;
}

function moveVillagerToward(world: GameWorld, v: Villager, tx: number, ty: number, speed: number, dt: number): number {
  const dx = tx - v.x;
  const dy = ty - v.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) {
    v.vx = 0;
    v.vy = 0;
    return dist;
  }

  const nx = dx / dist;
  const ny = dy / dist;
  v.vx = nx * speed;
  v.vy = ny * speed;
  if (Math.abs(nx) > 0.12) v.facing = nx >= 0 ? 1 : -1;

  const nextPos = { x: v.x + v.vx * dt, y: v.y + v.vy * dt };
  resolveWorldCollisions(world, nextPos, v.radius, true);

  const moved = Math.hypot(nextPos.x - v.x, nextPos.y - v.y);
  if (moved < speed * dt * 0.25) {
    const altPos = { x: v.x - ny * speed * dt * 0.95, y: v.y + nx * speed * dt * 0.95 };
    resolveWorldCollisions(world, altPos, v.radius, true);
    v.x = altPos.x;
    v.y = altPos.y;
  } else {
    v.x = nextPos.x;
    v.y = nextPos.y;
  }

  v.walkCycle += moved * 0.14;
  return Math.hypot(tx - v.x, ty - v.y);
}

/**
 * Clean Colony-Defense Autonomous AI:
 * - Workers: Priority 1 = Sprint to cyan blueprints & hammer them to 100%;
 *            Priority 2 = Repair damaged towers/walls;
 *            Priority 3 = Chop nearby timber/stone, carry log bundles to Village Core, and deposit +Gold!
 * - Guards:  Patrol the perimeter and automatically shoot/fight approaching monsters.
 */
export function chooseVillagerUtilityTask(world: GameWorld, v: Villager): void {
  const coreX = world.villageCenter.x;
  const coreY = world.villageCenter.y + 36;
  const combatUnit = isCombatRole(v.role);
  const villageThreat = findNearestThreat(world, coreX, coreY, 640);
  const localThreat = findNearestThreat(world, v.x, v.y, combatUnit ? 520 : 145);

  if (villageThreat && !world.alarmActive) {
    world.alarmActive = true;
    world.alarmTimer = 14;
    world.audioQueue.push({ kind: 'alarm' });
    addLog(world, `Monsters spotted at the perimeter!`, 'combat');
  }

  // --- GUARD / SHARPSHOOTER AI ---
  if (combatUnit) {
    const target = localThreat ?? villageThreat;
    if (target) {
      v.task = 'FIGHTING';
      v.intentLabel = `Engaging ${target.name}`;
      v.targetPos = { x: target.x, y: target.y };
      v.targetEntityId = target.id;
      return;
    }

    const idx = parseInt(v.id.replace(/\D/g, ''), 10) || 1;
    const patrolAngle = (idx * 2.15 + world.minuteOfDay * 0.014) % (Math.PI * 2);
    const radius = v.role === 'SHARPSHOOTER' ? 185 : 225;
    v.task = 'PATROLLING';
    v.intentLabel = 'Patrolling perimeter';
    v.targetPos = {
      x: coreX + Math.cos(patrolAngle) * radius,
      y: coreY + Math.sin(patrolAngle) * radius * 0.8,
    };
    v.targetEntityId = null;
    return;
  }

  // --- AUTONOMOUS WORKER AI (BUILDER / FORAGER) ---
  // 1. Dodge away briefly if a monster is right on top of the worker
  if (localThreat && Math.hypot(localThreat.x - v.x, localThreat.y - v.y) < 110) {
    v.task = 'FLEEING';
    v.intentLabel = 'Evading monster';
    v.targetEntityId = localThreat.id;
    v.targetPos = { x: coreX, y: coreY };
    return;
  }

  // 2. Highest priority: Construct any newly placed blueprint!
  const blueprint = findNearestBlueprint(world, v.x, v.y);
  if (blueprint) {
    v.task = 'BUILDING';
    v.intentLabel = `Building ${blueprint.name}`;
    v.targetEntityId = blueprint.id;
    v.targetPos = { x: blueprint.x, y: blueprint.y + blueprint.height * 0.5 + 16 };
    return;
  }

  // 3. If carrying wood logs, haul them directly back to the Village Core for +Gold!
  if (v.carryingLogs) {
    v.task = 'GATHERING';
    v.intentLabel = 'Hauling logs to Village Core';
    v.targetEntityId = 'core_dropoff';
    v.targetPos = { x: coreX, y: coreY };
    return;
  }

  // 4. Repair damaged defenses when safe
  const damaged = !localThreat ? findNearestDamagedDefense(world, v.x, v.y) : null;
  if (damaged) {
    v.task = 'REPAIRING';
    v.intentLabel = `Repairing ${damaged.name}`;
    v.targetEntityId = damaged.id;
    v.targetPos = { x: damaged.x, y: damaged.y + damaged.height * 0.5 + 16 };
    return;
  }

  // 5. Autonomous Gold Generation: walk to nearest tree/boulder, chop/mine, haul logs back!
  const node = findNearestTimberOrRock(world, v.x, v.y);
  if (node) {
    v.task = 'GATHERING';
    v.intentLabel = `Chopping ${node.name}`;
    v.targetEntityId = node.id;
    v.targetPos = { x: node.x, y: node.y + 22 };
    return;
  }

  v.task = 'IDLE';
  v.intentLabel = 'Awaiting orders';
  v.targetPos = { x: coreX + ((parseInt(v.id.replace(/\D/g, ''), 10) || 1) % 3 - 1) * 60, y: coreY + 34 };
  v.targetEntityId = null;
}

export function stepVillagers(world: GameWorld, dt: number): void {
  const coreX = world.villageCenter.x;
  const coreY = world.villageCenter.y + 36;
  const dmgScale = 1 + (world.villageLevel - 1) * 0.25;
  const goldYield = 5 + (world.villageLevel - 1) * 3;

  for (const v of world.villagers) {
    if (!v.alive) continue;

    v.hitFlash = Math.max(0, v.hitFlash - dt);
    v.attackCooldown = Math.max(0, v.attackCooldown - dt);
    v.decisionCooldown = Math.max(0, v.decisionCooldown - dt);
    v.fear = clamp(v.fear - dt * 2.5, 0, 100);
    v.hunger = 100;

    if (v.bubble) {
      v.bubble.ttl -= dt;
      if (v.bubble.ttl <= 0) v.bubble = undefined;
    }

    // Gentle daytime recovery
    if (world.phase === 'DAY' && v.hp < v.maxHp) {
      v.hp = Math.min(v.maxHp, v.hp + dt * 4.5);
    }

    if (v.decisionCooldown <= 0) {
      chooseVillagerUtilityTask(world, v);
      v.decisionCooldown = v.task === 'FIGHTING' || v.task === 'FLEEING' ? 0.35 : 0.75;
    }

    // --- FIGHTING (Guards & Sharpshooters) ---
    if (v.task === 'FIGHTING' && v.targetEntityId) {
      const m = world.monsters.find((mon) => mon.id === v.targetEntityId && mon.state !== 'DYING');
      if (!m) {
        v.decisionCooldown = 0;
        continue;
      }
      if (v.role === 'SHARPSHOOTER') {
        const dist = Math.hypot(m.x - v.x, m.y - v.y);
        if (dist > 235) {
          moveVillagerToward(world, v, m.x, m.y, 120, dt);
        } else if (v.attackCooldown <= 0) {
          const ang = Math.atan2(m.y - v.y, m.x - v.x);
          v.facing = Math.cos(ang) >= 0 ? 1 : -1;
          world.projectiles.push({
            id: `proj-guard-${Math.random().toString(36).slice(2, 6)}`,
            owner: 'villager',
            x: v.x,
            y: v.y - 16,
            vx: Math.cos(ang) * 580,
            vy: Math.sin(ang) * 580,
            damage: Math.round(16 * dmgScale),
            ttl: 0.85,
            color: '#f5d89a',
            radius: 4,
            isFire: false,
          });
          v.attackCooldown = 1.05;
          world.audioQueue.push({ kind: 'bow' });
        }
        continue;
      }

      const dist = moveVillagerToward(world, v, m.x, m.y, 124, dt);
      if (dist <= 44 && v.attackCooldown <= 0) {
        const dmg = Math.round(14 * dmgScale);
        m.hp -= dmg;
        m.hitFlash = 0.14;
        v.attackCooldown = 0.9;
        world.audioQueue.push({ kind: 'hit_flesh' });
        addFloatingNotice(world, m.x, m.y - 24, `-${dmg}`, '#f5d89a');
        if (m.hp <= 0) {
          awardMonsterKill(world, m);
        }
      }
      continue;
    }

    // --- FLEEING (Worker dodging monster) ---
    if (v.task === 'FLEEING' && v.targetEntityId) {
      const m = world.monsters.find((mon) => mon.id === v.targetEntityId && mon.state !== 'DYING');
      if (m) {
        const awayX = v.x - m.x;
        const awayY = v.y - m.y;
        const d = Math.hypot(awayX, awayY) || 1;
        moveVillagerToward(world, v, v.x + (awayX / d) * 140, v.y + (awayY / d) * 140, 128, dt);
      } else {
        v.decisionCooldown = 0;
      }
      continue;
    }

    // --- BUILDING BLUEPRINTS & REPAIRING ---
    if ((v.task === 'BUILDING' || v.task === 'REPAIRING') && v.targetEntityId) {
      const s = world.structures.find((st) => st.id === v.targetEntityId && !st.destroyed);
      if (!s || (v.task === 'BUILDING' && (s.buildProgress ?? 1) >= 1) || (v.task === 'REPAIRING' && s.hp >= s.maxHp)) {
        v.hammerAnim = 0;
        v.decisionCooldown = 0;
        continue;
      }
      const reach = Math.max(s.width, s.height) * 0.55 + 26;
      const dist = moveVillagerToward(world, v, s.x, s.y + s.height * 0.45 + 14, 134, dt);
      if (dist <= reach) {
        v.facing = s.x >= v.x ? 1 : -1;
        v.hammerAnim = (v.hammerAnim ?? 0) + dt * 15;
        v.workTimer += dt;

        if ((s.buildProgress ?? 1) < 1) {
          const buildRate = 0.36 + (world.villageLevel - 1) * 0.06;
          s.buildProgress = Math.min(1, (s.buildProgress ?? 0) + dt * buildRate);
          if (Math.random() < dt * 7) {
            world.smokePuffs.push({
              x: s.x + (Math.random() - 0.5) * s.width * 0.7,
              y: s.y - 8,
              vx: (Math.random() - 0.5) * 38,
              vy: -24 - Math.random() * 18,
              size: 4 + Math.random() * 3,
              alpha: 0.72,
              color: Math.random() < 0.5 ? '#72f2ff' : '#ffd166',
              ttl: 0.4,
            });
          }
          if (v.workTimer >= 0.55) {
            v.workTimer = 0;
            world.audioQueue.push({ kind: 'build' });
          }
          if (s.buildProgress >= 1) {
            s.buildProgress = 1;
            addFloatingNotice(world, s.x, s.y - 34, `${s.name} Built!`, '#8ef6e4');
            world.audioQueue.push({ kind: 'build' });
            v.hammerAnim = 0;
            v.decisionCooldown = 0;
          }
        } else if (s.hp < s.maxHp) {
          if (v.workTimer >= 0.75) {
            v.workTimer = 0;
            const repairAmt = 26 + (world.villageLevel - 1) * 8;
            s.hp = Math.min(s.maxHp, s.hp + repairAmt);
            addFloatingNotice(world, s.x, s.y - 22, `+${repairAmt} Repair`, '#8ef6e4');
            world.audioQueue.push({ kind: 'build' });
          }
        }
      }
      continue;
    }

    // --- AUTONOMOUS GOLD GATHERING (Chop Tree/Rock -> Carry Logs -> Deposit +Gold at Campfire) ---
    if (v.task === 'GATHERING') {
      if (v.carryingLogs || v.targetEntityId === 'core_dropoff') {
        v.hammerAnim = 0;
        const dist = moveVillagerToward(world, v, coreX, coreY, 108, dt);
        if (dist <= 54) {
          v.carryingLogs = false;
          world.gold += goldYield;
          world.audioQueue.push({ kind: 'pickup' });
          addFloatingNotice(world, coreX + (Math.random() - 0.5) * 28, coreY - 26, `+${goldYield} Gold`, '#ffd166');
          v.decisionCooldown = 0;
        }
        continue;
      }

      if (v.targetPos) {
        const dist = moveVillagerToward(world, v, v.targetPos.x, v.targetPos.y, 104, dt);
        if (dist <= 44) {
          v.hammerAnim = (v.hammerAnim ?? 0) + dt * 13;
          v.workTimer += dt;
          if (Math.random() < dt * 3.5) {
            world.smokePuffs.push({
              x: v.targetPos.x + (Math.random() - 0.5) * 16,
              y: v.targetPos.y - 12,
              vx: (Math.random() - 0.5) * 26,
              vy: -18,
              size: 4,
              alpha: 0.55,
              color: '#c9b38c',
              ttl: 0.35,
            });
          }
          if (v.workTimer >= 2.2) {
            v.workTimer = 0;
            v.hammerAnim = 0;
            v.carryingLogs = true;
            v.targetEntityId = 'core_dropoff';
            v.targetPos = { x: coreX, y: coreY };
            v.intentLabel = 'Hauling logs to Village Core';
            world.audioQueue.push({ kind: 'hit_wood' });
          }
        }
        continue;
      }
    }

    v.hammerAnim = 0;
    if (v.targetPos) {
      moveVillagerToward(world, v, v.targetPos.x, v.targetPos.y, 88, dt);
    }
  }
}
