import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hireColonist,
  placeStructure,
  stepGameWorld,
  upgradeVillage,
} from './engine';
import { spawnMonster, startNightWaveTelegraph } from './monsterAI';
import { getVillageUpgradeCost, HIRE_UNIT_COST, STRUCTURE_BLUEPRINT_MAP } from './recipes';
import { InputState } from './types';
import { createInitialWorld } from './worldGen';

function idleInput(): InputState {
  return {
    moveX: 0,
    moveY: 0,
    sprint: false,
    aimWorldX: 1600,
    aimWorldY: 1200,
    aimActive: false,
    attackPressed: false,
    attackHeld: false,
    interactPressed: false,
    dodgePressed: false,
    quickEquipPressed: false,
  };
}

test('unified Gold economy validates costs for towers, walls, hiring, and village upgrades', () => {
  const world = createInitialWorld(42);
  assert.equal(world.gold, 85);
  assert.equal(STRUCTURE_BLUEPRINT_MAP.watchtower.goldCost, 30);
  assert.equal(STRUCTURE_BLUEPRINT_MAP.brazier_beacon.goldCost, 50);
  assert.equal(STRUCTURE_BLUEPRINT_MAP.barricade.goldCost, 20);
  assert.equal(HIRE_UNIT_COST, 40);
  assert.equal(getVillageUpgradeCost(1), 100);

  const cx = world.villageCenter.x;
  const cy = world.villageCenter.y;

  // Place Arrow Tower (30g) -> 55g remaining, starts as unbuilt blueprint (buildProgress = 0)
  const r1 = placeStructure(world, 'watchtower', cx + 112, cy + 96);
  assert.equal(r1.ok, true);
  assert.equal(world.gold, 55);
  assert.equal(r1.structure?.buildProgress, 0);

  // Place Barricade Wall (20g) -> 35g remaining
  const r2 = placeStructure(world, 'barricade', cx - 112, cy - 160);
  assert.equal(r2.ok, true);
  assert.equal(world.gold, 35);

  // Cannot afford Flame Tower (50g) with 35g
  const rFail = placeStructure(world, 'brazier_beacon', cx + 144, cy - 64);
  assert.equal(rFail.ok, false);
  assert.equal(world.gold, 35);

  // Hire alternates Worker -> Guard at 40g each
  world.gold = 90;
  const beforeCount = world.villagers.length;
  assert.equal(world.nextHireKind, 'WORKER');
  const h1 = hireColonist(world);
  assert.equal(h1.ok, true);
  assert.equal(world.villagers.length, beforeCount + 1);
  assert.equal(world.nextHireKind, 'GUARD');
  assert.equal(world.gold, 50);

  const h2 = hireColonist(world);
  assert.equal(h2.ok, true);
  assert.equal(world.villagers.length, beforeCount + 2);
  assert.equal(world.nextHireKind, 'WORKER');
  assert.equal(world.gold, 10);
});

test('autonomous workers chop trees, haul wood logs to Village Core, and deposit +Gold', () => {
  const world = createInitialWorld(99);
  const startGold = world.gold;
  const input = idleInput();

  // Step 12 seconds of daytime: workers should drop off logs and generate multiple +5 Gold deposits!
  for (let i = 0; i < 240; i++) {
    stepGameWorld(world, input, 0.05);
  }

  assert.ok(
    world.gold >= startGold + 15,
    `Expected autonomous workers to generate >= +15 Gold over 12s, got +${world.gold - startGold}`
  );
});

test('placed tower blueprint is built by workers and auto-fires only once completed', () => {
  const world = createInitialWorld(77);
  const cx = world.villageCenter.x;
  const cy = world.villageCenter.y;
  // Move player away so only autonomous workers build the blueprint
  world.player.x = cx - 260;
  world.player.y = cy + 200;

  const placed = placeStructure(world, 'watchtower', cx + 64, cy + 80);
  assert.equal(placed.ok, true);
  const tower = placed.structure!;
  assert.equal(tower.buildProgress, 0);

  // Spawn monster inside range while tower is still a blueprint — tower must NOT fire yet!
  const mob = spawnMonster(world, 'BRUTE', tower.x + 120, tower.y);
  const initialMobHp = mob.hp;
  stepGameWorld(world, idleInput(), 0.05);
  assert.equal(tower.buildProgress! < 1, true);
  assert.equal(world.projectiles.filter((p) => p.owner === 'turret').length, 0);

  // Move monster briefly out of worker path while workers hammer blueprint to 100%
  mob.x = cx + 600;
  mob.y = cy + 600;
  for (let i = 0; i < 160; i++) {
    stepGameWorld(world, idleInput(), 0.05);
    if ((tower.buildProgress ?? 0) >= 1) break;
  }
  assert.equal(tower.buildProgress, 1, 'Autonomous workers must complete blueprint to 100%');

  // Now bring monster into completed Arrow Tower range — tower must auto-fire and deal damage!
  mob.x = tower.x + 110;
  mob.y = tower.y;
  for (let i = 0; i < 60; i++) {
    stepGameWorld(world, idleInput(), 0.05);
  }
  assert.ok(mob.hp < initialMobHp, `Completed Arrow Tower must auto-fire & damage monster (${mob.hp} < ${initialMobHp})`);
});

test('Upgrade Village raises Village Level, Core Max HP, and tower power', () => {
  const world = createInitialWorld(55);
  world.gold = 150;
  world.coreHp = 180;

  const placed = placeStructure(world, 'watchtower', world.villageCenter.x + 96, world.villageCenter.y + 80);
  assert.equal(placed.ok, true);
  const tower = placed.structure!;
  const baseDmg = tower.attackDamage;

  const up = upgradeVillage(world);
  assert.equal(up.ok, true);
  assert.equal(world.villageLevel, 2);
  assert.equal(world.coreMaxHp, 500);
  assert.ok(world.coreHp > 180, 'Upgrading village should heal Village Core HP');
  assert.ok(tower.attackDamage > baseDmg, 'Upgrading village should empower towers');
  assert.equal(getVillageUpgradeCost(2), 160);
});

test('Do Nothing = Lose: unbuilt village core is destroyed by escalating night waves', () => {
  const world = createInitialWorld(303);
  const input = idleInput();
  // Move player aside so player is idle and spends 0 Gold
  world.player.x = world.villageCenter.x - 320;
  world.player.y = world.villageCenter.y + 240;

  // Trigger Night Wave 2 directly with zero towers built
  world.day = 2;
  world.phase = 'NIGHT';
  world.dayTimeRemaining = 0;
  startNightWaveTelegraph(world, 'W');

  let steps = 0;
  while (!world.gameOver && steps < 1800) {
    stepGameWorld(world, input, 0.05);
    steps++;
  }

  assert.equal(world.gameOver, true, 'Idle village with zero towers must lose when overrun');
  assert.equal(world.coreHp, 0, 'Village Core HP must drop to 0 on defeat');
  assert.equal(world.gameOverReason, 'core_destroyed');
});
