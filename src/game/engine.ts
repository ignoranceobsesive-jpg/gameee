import { checkPlacementValid, clamp, resolveWorldCollisions } from './collision';
import { awardMonsterKill, igniteMonster, spawnMonster, startNightWaveTelegraph, stepMonsters } from './monsterAI';
import {
  CRAFTING_RECIPES,
  getVillageUpgradeCost,
  hasResources,
  HIRE_UNIT_COST,
  spendResources,
  STRUCTURE_BLUEPRINT_MAP,
  WEAPON_SPECS,
} from './recipes';
import {
  ConsumableId,
  DayPhase,
  GameWorld,
  InputState,
  Monster,
  ResourceKey,
  ResourceNode,
  Structure,
  StructureType,
  Vec2,
  Villager,
  WeaponId,
} from './types';
import { stepVillagers } from './villagerAI';
import { buildMerchantOffers, formatGameTime, getRegionAt, WORLD_CLUES } from './worldGen';

export interface InteractableTarget {
  kind: 'node' | 'structure' | 'villager' | 'merchant' | 'survivor' | 'shrine';
  id: string;
  x: number;
  y: number;
  label: string;
  dist: number;
}

const EERIE_CRT_TRANSMISSIONS = [
  'COUNT THE FACES TWICE',
  'SIGNAL 44.7 // STAY IN LIGHT',
  'IT STANDS BEYOND THE PINES',
  'WHO KNOCKED AT THE WEST GATE?',
  'NOT A NORMAL PEEP',
  'DO NOT FOLLOW THE VOICE',
];

const MASTERY_THRESHOLDS = [0, 40, 100, 180, 280];

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
  if (world.eventLog.length > 45) world.eventLog.pop();
}

function addNotice(world: GameWorld, x: number, y: number, text: string, color = '#e8f5ef'): void {
  world.floatingNotices.push({
    id: `fn-${Math.random().toString(36).slice(2, 7)}`,
    x,
    y,
    text,
    color,
    ttl: 1.45,
  });
  if (world.floatingNotices.length > 34) world.floatingNotices.shift();
}

function getPhaseFromMinute(minute: number): DayPhase {
  if (minute >= 330 && minute < 430) return 'DAWN';
  if (minute >= 430 && minute < 1050) return 'DAY';
  if (minute >= 1050 && minute < 1200) return 'EVENING';
  return 'NIGHT';
}

export function getWeaponMasteryLevel(world: GameWorld, weaponId: WeaponId): number {
  return world.player.weaponMastery?.[weaponId]?.level ?? 1;
}

export function awardWeaponMastery(world: GameWorld, weaponId: WeaponId, xpGain: number): void {
  if (!world.player.weaponMastery) world.player.weaponMastery = {};
  const entry = world.player.weaponMastery[weaponId] ?? { xp: 0, level: 1 };
  entry.xp += xpGain;
  let newLv = entry.level;
  for (let lv = 5; lv >= 1; lv--) {
    if (entry.xp >= MASTERY_THRESHOLDS[lv - 1]) {
      newLv = lv;
      break;
    }
  }
  if (newLv > entry.level) {
    entry.level = newLv;
    const spec = WEAPON_SPECS[weaponId];
    addNotice(
      world,
      world.player.x,
      world.player.y - 44,
      newLv === 3
        ? `${spec.name} Lv 3! ${spec.masteryPerk}`
        : `${spec.name} Mastery Lv ${newLv}!`,
      '#ffd166'
    );
    addLog(
      world,
      newLv === 3
        ? `${spec.name} reached Mastery Lv 3 — unlocked ${spec.masteryPerk}!`
        : `${spec.name} proficiency reached Level ${newLv}.`,
      'info'
    );
  }
  world.player.weaponMastery[weaponId] = entry;
}

export function findNearestInteractable(world: GameWorld): InteractableTarget | null {
  const p = world.player;
  let best: InteractableTarget | null = null;
  const maxDist = 88;

  // 0a. Traveling Night Merchant (highest priority when nearby)
  if (world.merchant.active) {
    const dm = Math.hypot(world.merchant.x - p.x, world.merchant.y - p.y);
    if (dm <= 96) {
      best = {
        kind: 'merchant',
        id: 'merchant',
        x: world.merchant.x,
        y: world.merchant.y,
        label: 'Trade with Night Merchant',
        dist: dm - 12,
      };
    }
  }

  // 0b. Trapped Survivors waiting to be rescued
  for (const surv of world.trappedSurvivors) {
    if (surv.state !== 'TRAPPED') continue;
    const d = Math.hypot(surv.x - p.x, surv.y - p.y);
    if (d <= 92 && (!best || d < best.dist)) {
      best = {
        kind: 'survivor',
        id: surv.id,
        x: surv.x,
        y: surv.y,
        label: `Rescue ${surv.name} (${surv.role})`,
        dist: d - 10,
      };
    }
  }

  // 0c. Ancient Cursed Shrines
  for (const sh of world.shrines) {
    if (sh.used) continue;
    const d = Math.hypot(sh.x - p.x, sh.y - p.y);
    if (d <= 92 && (!best || d < best.dist)) {
      best = {
        kind: 'shrine',
        id: sh.id,
        x: sh.x,
        y: sh.y,
        label: `Inspect ${sh.name}`,
        dist: d - 8,
      };
    }
  }

  // 1. Resource nodes, crates, clues
  for (const n of world.resourceNodes) {
    if (n.depleted) continue;
    const d = Math.hypot(n.x - p.x, n.y - p.y);
    if (d > maxDist) continue;
    let label = `Gather ${n.name}`;
    if (n.kind === 'pine_tree' || n.kind === 'dead_tree') label = `Chop ${n.name}`;
    else if (n.kind === 'stone_boulder' || n.kind === 'metal_vein' || n.kind === 'crystal_outcrop') {
      label = `Mine ${n.name}`;
    } else if (n.kind === 'supply_crate') label = `Search ${n.name}`;
    else if (n.kind === 'clue_monolith') label = `Inspect ${n.name}`;
    else if (n.kind === 'wild_deer') label = `Hunt ${n.name}`;

    if (!best || d < best.dist) {
      best = { kind: 'node', id: n.id, x: n.x, y: n.y, label, dist: d };
    }
  }

  // 2. Interactive structures
  for (const s of world.structures) {
    if (s.destroyed) continue;
    const d = Math.hypot(s.x - p.x, s.y - p.y) - Math.max(s.width, s.height) * 0.25;
    if (d > maxDist) continue;
    let label: string | null = null;
    if (s.type === 'gate') {
      label = s.isOpen ? `Close ${s.name}` : `Open ${s.name}`;
    } else if (s.hp < s.maxHp) {
      label = `Repair ${s.name} (2 Wood)`;
    } else if (s.type === 'brazier_beacon' && s.tier < 3 && (s.fuel ?? 100) < 60) {
      label = `Refuel ${s.name} (2 Wood)`;
    } else if (s.type === 'farm' && (s.storedFood ?? 0) > 0) {
      label = `Harvest Crops (+${s.storedFood} Food)`;
    } else if (s.type === 'medical_station' && p.hp < p.maxHp) {
      label = `Treat Wounds at ${s.name}`;
    } else if (s.type === 'crt_tv') {
      label = `Tune Broadcast CRT`;
    } else if (s.type === 'storage') {
      label = `Collect Village Supplies`;
    } else if (STRUCTURE_BLUEPRINT_MAP[s.type] && s.tier < 3) {
      label = `Upgrade ${s.name} (Tier ${s.tier + 1})`;
    }

    if (label && (!best || d < best.dist)) {
      best = { kind: 'structure', id: s.id, x: s.x, y: s.y, label, dist: d };
    }
  }

  // 3. Villagers
  for (const v of world.villagers) {
    if (!v.alive || v.task === 'MANNING_TOWER') continue;
    const d = Math.hypot(v.x - p.x, v.y - p.y);
    if (d > 68) continue;
    if (!best || d < best.dist) {
      best = { kind: 'villager', id: v.id, x: v.x, y: v.y, label: `Speak to ${v.name} (${v.role})`, dist: d };
    }
  }

  return best;
}

export function purchaseMerchantOffer(
  world: GameWorld,
  offerId: string
): { ok: boolean; message: string } {
  if (!world.merchant.active) return { ok: false, message: 'The merchant is not in the village.' };
  const offer = world.merchant.offers.find((o) => o.id === offerId);
  if (!offer) return { ok: false, message: 'Offer not found.' };
  if (offer.purchased) return { ok: false, message: 'Already traded.' };

  const p = world.player;
  if (!hasResources(p.resources, offer.cost)) {
    return { ok: false, message: 'Not enough resources to trade.' };
  }

  spendResources(p.resources, offer.cost);
  offer.purchased = true;

  if (offer.rewardResource) {
    p.resources[offer.rewardResource.key] =
      (p.resources[offer.rewardResource.key] ?? 0) + offer.rewardResource.amount;
  }
  if (offer.rewardConsumable) {
    p.consumables[offer.rewardConsumable.id] =
      (p.consumables[offer.rewardConsumable.id] ?? 0) + offer.rewardConsumable.amount;
  }
  if (offer.rewardWeapon) {
    const spec = WEAPON_SPECS[offer.rewardWeapon];
    const existing = p.weapons.find((w) => w.id === offer.rewardWeapon);
    if (existing) existing.durability = spec.maxDurability;
    else p.weapons.push({ id: offer.rewardWeapon, durability: spec.maxDurability, maxDurability: spec.maxDurability });
    p.equippedWeaponId = offer.rewardWeapon;
  }
  if (offer.unlockRecipeId && !p.unlockedRecipes.includes(offer.unlockRecipeId)) {
    p.unlockedRecipes.push(offer.unlockRecipeId);
  }

  world.audioQueue.push({ kind: 'merchant_bell' });
  addNotice(world, p.x, p.y - 32, `Traded: ${offer.name}`, '#ffd166');
  addLog(world, `Traded with the Traveling Night Merchant for ${offer.name}.`, 'info');
  return { ok: true, message: `Acquired ${offer.name}.` };
}

export function activateShrine(
  world: GameWorld,
  shrineId: string
): { ok: boolean; message: string } {
  const sh = world.shrines.find((s) => s.id === shrineId);
  if (!sh) return { ok: false, message: 'Shrine not found.' };
  if (sh.used) return { ok: false, message: 'This shrine has already claimed its pact.' };

  sh.used = true;
  if (!world.activeRelics.includes(sh.relicId)) {
    world.activeRelics.push(sh.relicId);
  }
  world.audioQueue.push({ kind: 'shrine' });
  world.cameraShake = Math.min(1, world.cameraShake + 0.45);
  world.soundWaves.push({
    x: sh.x,
    y: sh.y,
    radius: 16,
    maxRadius: 210,
    color: 'rgba(218, 92, 92, 0.72)',
    ttl: 0.85,
  });

  if (sh.relicId === 'blood_moon_pact') {
    if (world.wave.phase === 'TELEGRAPH' || world.wave.phase === 'ACTIVE') {
      world.wave.remainingToSpawn = Math.round(world.wave.remainingToSpawn * 1.85);
    }
    world.horrorBanner = {
      text: 'BLOOD MOON PACT SEALED: +50% Weapon Damage — Tonight’s wave swells!',
      ttl: 5.5,
    };
    addLog(world, 'Accepted the Blood Moon Pact (+50% weapon damage, heavier night waves).', 'horror');
    return { ok: true, message: 'Blood Moon Pact accepted (+50% damage).' };
  }

  if (sh.relicId === 'watchers_eye') {
    world.horrorBanner = {
      text: "WATCHER'S EYE OPENED: Hidden Stalkers & Shards revealed — beasts sense you farther.",
      ttl: 5.5,
    };
    addLog(world, "Accepted the Watcher's Eye pact. Hidden threats are now visible.", 'horror');
    return { ok: true, message: "Watcher's Eye accepted." };
  }

  // ashen_resurrection
  const fallen = world.villagers.find((v) => !v.alive);
  if (fallen) {
    fallen.alive = true;
    fallen.hp = fallen.maxHp;
    fallen.fear = 25;
    fallen.x = world.villageCenter.x + 28;
    fallen.y = world.villageCenter.y + 42;
    addLog(world, `${fallen.name} returned from the ash beside the Village Hearth!`, 'horror');
  } else {
    world.player.maxHp += 30;
    world.player.hp = world.player.maxHp;
    addLog(world, 'Ashen Resurrection fortified your vitality (+30 Max HP).', 'horror');
  }

  // Immediate ambush consequence!
  spawnMonster(world, 'BRUTE', sh.x + 95, sh.y - 45);
  spawnMonster(world, 'CRAWLER', sh.x - 85, sh.y + 55);
  world.horrorBanner = {
    text: fallen
      ? `ASHEN RESURRECTION: ${fallen.name} lives again — a Timber Brute ambushes you!`
      : 'ASHEN RESURRECTION: +30 Max HP — a Timber Brute erupts from the ridge!',
    ttl: 5.5,
  };
  return { ok: true, message: 'Ashen Resurrection sealed — ambush incoming!' };
}

function harvestNodeDamage(world: GameWorld, n: ResourceNode, power: number): void {
  const p = world.player;
  n.hitFlash = 0.14;

  if (n.kind === 'clue_monolith' && n.clueId) {
    const clue = WORLD_CLUES[n.clueId];
    if (clue && !world.discoveries.some((d) => d.id === n.clueId)) {
      world.discoveries.unshift({
        id: n.clueId,
        title: clue.title,
        region: clue.region,
        dayFound: world.day,
        body: clue.body,
      });
      world.horrorBanner = { text: `Discovery: ${clue.title}`, ttl: 5 };
      addLog(world, `Discovered clue: ${clue.title}`, 'horror');
      if (n.clueId === 'clue_homestead_log' && !p.unlockedRecipes.includes('craft_heavy_crossbow')) {
        p.unlockedRecipes.push('craft_heavy_crossbow');
        addNotice(world, n.x, n.y - 34, 'Unlocked: Heavy Crossbow!', '#8ef6e4');
      }
      if (n.clueId === 'clue_ruins_relay' && !p.unlockedRecipes.includes('craft_resonance_blade')) {
        p.unlockedRecipes.push('craft_resonance_blade');
        p.resources.artifact += 1;
        addNotice(world, n.x, n.y - 34, 'Unlocked: Resonance Blade +1 Artifact!', '#8ef6e4');
      }
    } else if (clue) {
      world.horrorBanner = { text: clue.body.slice(0, 96) + '...', ttl: 4.5 };
    }
    world.audioQueue.push({ kind: 'pickup' });
    return;
  }

  if (n.kind === 'supply_crate') {
    n.depleted = true;
    n.respawnTimer = 420;
    const wood = 4 + (world.day % 3);
    const metal = 2 + (world.day % 2);
    p.resources.wood += wood;
    p.resources.metal += metal;
    p.consumables.bandage += 1;
    p.consumables.cooked_ration += 1;
    addNotice(world, n.x, n.y - 24, `+${wood} Wood, +${metal} Metal, +1 Med`, '#8ef6e4');
    world.audioQueue.push({ kind: 'pickup' });
    return;
  }

  n.hp -= power;
  if (n.kind === 'pine_tree' || n.kind === 'dead_tree') {
    world.audioQueue.push({ kind: 'hit_wood' });
    p.noiseLevel = Math.min(100, p.noiseLevel + 18);
  } else if (n.kind === 'stone_boulder' || n.kind === 'metal_vein' || n.kind === 'crystal_outcrop') {
    world.audioQueue.push({ kind: 'hit_stone' });
    p.noiseLevel = Math.min(100, p.noiseLevel + 24);
  } else {
    world.audioQueue.push({ kind: 'hit_flesh' });
  }

  if (n.hp <= 0) {
    n.depleted = true;
    n.respawnTimer = n.kind === 'wild_deer' ? 140 : 210;
    p.xp += 12;
    if (p.xp >= p.level * 100) {
      p.xp -= p.level * 100;
      p.level++;
      p.maxHp += 10;
      p.hp = p.maxHp;
      addNotice(world, p.x, p.y - 36, `LEVEL ${p.level}! +10 Max HP`, '#8ef6e4');
    }

    if (n.kind === 'pine_tree' || n.kind === 'dead_tree') {
      const amt = n.kind === 'pine_tree' ? 5 : 4;
      p.resources.wood += amt;
      p.resources.fiber += 2;
      addNotice(world, n.x, n.y - 22, `+${amt} Wood, +2 Fiber`, '#d9d4c7');
    } else if (n.kind === 'stone_boulder') {
      p.resources.stone += 5;
      addNotice(world, n.x, n.y - 22, `+5 Stone`, '#d9d4c7');
    } else if (n.kind === 'metal_vein') {
      p.resources.metal += 3;
      p.resources.stone += 2;
      addNotice(world, n.x, n.y - 22, `+3 Metal, +2 Stone`, '#f5d89a');
    } else if (n.kind === 'crystal_outcrop') {
      p.resources.rare_shard += 2;
      p.resources.stone += 2;
      addNotice(world, n.x, n.y - 22, `+2 Ancient Shard`, '#8ef6e4');
    } else if (n.kind === 'berry_bush') {
      p.resources.food += 3;
      p.resources.fiber += 2;
      addNotice(world, n.x, n.y - 22, `+3 Food, +2 Fiber`, '#8ef6e4');
    } else if (n.kind === 'herb_patch') {
      p.resources.herbs += 3;
      p.resources.fiber += 1;
      addNotice(world, n.x, n.y - 22, `+3 Herbs`, '#8ef6e4');
    } else if (n.kind === 'wild_deer') {
      p.resources.food += 5;
      p.resources.fiber += 3;
      addNotice(world, n.x, n.y - 22, `+5 Raw Meat, +3 Hide`, '#f5d89a');
    }
    world.audioQueue.push({ kind: 'pickup' });
  } else {
    addNotice(world, n.x, n.y - 20, `-${Math.round(power)}`, '#d6d2c8');
  }
}

export function performInteract(world: GameWorld): string | null {
  const target = findNearestInteractable(world);
  if (!target) return null;
  const p = world.player;

  if (target.kind === 'merchant') {
    world.audioQueue.push({ kind: 'merchant_bell' });
    return 'Trading with Night Merchant';
  }

  if (target.kind === 'shrine') {
    return `Inspecting ${target.label}`;
  }

  if (target.kind === 'survivor') {
    const surv = world.trappedSurvivors.find((s) => s.id === target.id && s.state === 'TRAPPED');
    if (!surv) return null;
    surv.state = 'ESCORTING';
    world.audioQueue.push({ kind: 'rescue' });
    addNotice(world, surv.x, surv.y - 30, `${surv.name} follows you!`, '#ffd166');
    world.horrorBanner = {
      text: `Rescued ${surv.name} (${surv.role})! Escort them safely back to Ashen Village.`,
      ttl: 5.0,
    };
    addLog(world, `Freed trapped survivor ${surv.name} (${surv.role}). Escort them to the village.`, 'info');
    return `Rescued ${surv.name}`;
  }

  if (target.kind === 'node') {
    const n = world.resourceNodes.find((item) => item.id === target.id && !item.depleted);
    if (!n) return null;
    const spec = WEAPON_SPECS[p.equippedWeaponId];
    const mult =
      n.kind === 'pine_tree' || n.kind === 'dead_tree'
        ? spec.gatherWoodBonus
        : n.kind === 'stone_boulder' || n.kind === 'metal_vein'
          ? spec.gatherStoneBonus
          : 1.4;
    harvestNodeDamage(world, n, Math.max(18, spec.damage * mult));
    return target.label;
  }

  if (target.kind === 'structure') {
    const s = world.structures.find((st) => st.id === target.id && !st.destroyed);
    if (!s) return null;

    if (s.type === 'gate') {
      s.isOpen = !s.isOpen;
      s.blocksMovement = !s.isOpen;
      world.audioQueue.push({ kind: 'build' });
      addNotice(world, s.x, s.y - 24, s.isOpen ? 'Gate Opened' : 'Gate Locked', '#e8f5ef');
      return s.isOpen ? 'Opened gate' : 'Closed gate';
    }

    if (s.hp < s.maxHp) {
      if (p.resources.wood >= 2) {
        p.resources.wood -= 2;
        s.hp = Math.min(s.maxHp, s.hp + 70);
        world.audioQueue.push({ kind: 'build' });
        addNotice(world, s.x, s.y - 24, `+70 Repaired`, '#8ef6e4');
        return `Repaired ${s.name}`;
      }
      addNotice(world, s.x, s.y - 24, `Need 2 Wood`, '#f5d89a');
      return 'Need 2 Wood to repair';
    }

    if (s.type === 'brazier_beacon' && s.tier < 3 && (s.fuel ?? 100) < 60) {
      if (p.resources.wood >= 2) {
        p.resources.wood -= 2;
        s.fuel = 100;
        world.audioQueue.push({ kind: 'fire_ignite' });
        addNotice(world, s.x, s.y - 28, 'Brazier Refueled!', '#ffd166');
        return `Refueled ${s.name}`;
      }
      addNotice(world, s.x, s.y - 24, 'Need 2 Wood', '#f5d89a');
      return 'Need 2 Wood to refuel';
    }

    if (s.type === 'farm' && (s.storedFood ?? 0) > 0) {
      const qty = s.storedFood ?? 0;
      p.resources.food += qty;
      s.storedFood = 0;
      world.audioQueue.push({ kind: 'pickup' });
      addNotice(world, s.x, s.y - 24, `+${qty} Food`, '#8ef6e4');
      return `Harvested ${qty} Food`;
    }

    if (s.type === 'medical_station' && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + 45);
      world.audioQueue.push({ kind: 'heal' });
      addNotice(world, p.x, p.y - 26, `+45 HP Restored`, '#8ef6e4');
      return 'Treated wounds';
    }

    if (s.type === 'crt_tv') {
      world.audioQueue.push({ kind: 'crt_static' });
      world.crtFlicker = 0.8;
      const msg =
        world.phase === 'NIGHT' || world.phase === 'EVENING'
          ? EERIE_CRT_TRANSMISSIONS[world.day % EERIE_CRT_TRANSMISSIONS.length]
          : 'just a normal peep';
      world.crtBroadcast = msg;
      world.horrorBanner = {
        text: `CRT Monitor crackles: "${msg}"`,
        ttl: 4.5,
      };
      return 'Inspected CRT';
    }

    if (s.type === 'storage') {
      let moved = 0;
      for (const k of ['wood', 'stone', 'metal', 'fiber', 'food', 'herbs'] as ResourceKey[]) {
        if (world.villageStock[k] > 0) {
          p.resources[k] += world.villageStock[k];
          moved += world.villageStock[k];
          world.villageStock[k] = 0;
        }
      }
      world.audioQueue.push({ kind: 'pickup' });
      addNotice(world, s.x, s.y - 24, moved > 0 ? `Collected ${moved} Village Stock` : 'Cache Empty', '#8ef6e4');
      return moved > 0 ? `Collected ${moved} resources` : 'Village stock empty';
    }

    if (STRUCTURE_BLUEPRINT_MAP[s.type] && s.tier < 3) {
      return upgradeStructure(world, s.id).message;
    }
  }

  if (target.kind === 'villager') {
    const v = world.villagers.find((u) => u.id === target.id && u.alive);
    if (!v) return null;
    let line = `${v.name}: "Stay near the warm braziers when midnight fog rolls in."`;
    if (v.role === 'GUARD') {
      line = `${v.name}: "Build a Watchtower and I'll climb up to cover the perimeter."`;
    } else if (v.role === 'SHARPSHOOTER') {
      line = `${v.name}: "Give me a Watchtower—my fire arrows will ignite anything drenched in tar!"`;
    } else if (v.role === 'BLACKSMITH') {
      line = `${v.name}: "I'm sharpening every blade in town (+15% weapon damage) and smelting spare iron."`;
    } else if (v.role === 'HERBALIST') {
      line = `${v.name}: "I brew fresh bandages at dusk. Keep the village standing and I'll keep you patched."`;
    } else if (v.role === 'BUILDER') {
      line = `${v.name}: "I'll finish your new towers and patch walls while you scout."`;
    } else if (v.role === 'MEDIC') {
      if (p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + 25);
        world.audioQueue.push({ kind: 'heal' });
        line = `${v.name}: "Hold still—I've dressed your wounds (+25 HP)."`;
      } else {
        line = `${v.name}: "Bring herbs from the forest if we take casualties tonight."`;
      }
    } else if (v.role === 'SCOUT') {
      line = `${v.name}: "Heard voices near the Old Radio Outpost to the northeast. Check it by daylight."`;
    } else if (v.name === 'Lord Vane') {
      line = `Lord Vane: "Every fifth night something ancient stalks the pines... light the Braziers."`;
    }
    v.bubble = { text: '...', ttl: 1.8, tone: 'glyph' };
    world.horrorBanner = { text: line, ttl: 4.5 };
    return line;
  }

  return null;
}

export function craftRecipe(world: GameWorld, recipeId: string): { ok: boolean; message: string } {
  const recipe = CRAFTING_RECIPES.find((r) => r.id === recipeId);
  if (!recipe) return { ok: false, message: 'Unknown recipe.' };

  const p = world.player;
  if (recipe.requiresStructure) {
    const hasStruct = world.structures.some((s) => !s.destroyed && s.type === recipe.requiresStructure);
    if (!hasStruct && !p.unlockedRecipes.includes(recipe.id)) {
      return { ok: false, message: `Requires ${recipe.requiresStructure.replace('_', ' ')} or blueprint.` };
    }
  }

  if (!hasResources(p.resources, recipe.cost)) {
    return { ok: false, message: 'Not enough resources.' };
  }

  spendResources(p.resources, recipe.cost);

  if (recipe.outputWeapon) {
    const spec = WEAPON_SPECS[recipe.outputWeapon];
    const existing = p.weapons.find((w) => w.id === recipe.outputWeapon);
    if (existing) {
      existing.durability = spec.maxDurability;
    } else {
      p.weapons.push({ id: recipe.outputWeapon, durability: spec.maxDurability, maxDurability: spec.maxDurability });
    }
    p.equippedWeaponId = recipe.outputWeapon;
  } else if (recipe.outputConsumable) {
    p.consumables[recipe.outputConsumable.id] =
      (p.consumables[recipe.outputConsumable.id] ?? 0) + recipe.outputConsumable.amount;
  }

  world.audioQueue.push({ kind: 'build' });
  addNotice(world, p.x, p.y - 30, `Crafted ${recipe.name}`, '#8ef6e4');
  return { ok: true, message: `Crafted ${recipe.name}.` };
}

export function useConsumable(world: GameWorld, id: ConsumableId): { ok: boolean; message: string } {
  const p = world.player;
  if ((p.consumables[id] ?? 0) <= 0) {
    return { ok: false, message: 'Out of stock.' };
  }

  if (id === 'bandage') {
    if (p.hp >= p.maxHp) return { ok: false, message: 'Health is already full.' };
    p.consumables[id]--;
    p.hp = Math.min(p.maxHp, p.hp + 42);
    world.audioQueue.push({ kind: 'heal' });
    addNotice(world, p.x, p.y - 28, '+42 HP', '#8ef6e4');
    return { ok: true, message: 'Used Herbal Bandage.' };
  }

  if (id === 'cooked_ration') {
    p.consumables[id]--;
    p.hunger = Math.min(p.maxHunger, p.hunger + 45);
    p.stamina = Math.min(p.maxStamina, p.stamina + 30);
    p.hp = Math.min(p.maxHp, p.hp + 10);
    world.audioQueue.push({ kind: 'pickup' });
    addNotice(world, p.x, p.y - 28, '+45 Hunger', '#f5d89a');
    return { ok: true, message: 'Ate Cooked Ration.' };
  }

  if (id === 'lantern_oil') {
    p.consumables[id]--;
    p.lanternFuel = 100;
    p.lanternOn = true;
    world.audioQueue.push({ kind: 'pickup' });
    addNotice(world, p.x, p.y - 28, 'Lantern Refilled', '#f5d89a');
    return { ok: true, message: 'Refilled Lantern.' };
  }

  return { ok: false, message: 'Cannot use item directly.' };
}

export function placeStructure(
  world: GameWorld,
  type: StructureType,
  x: number,
  y: number
): { ok: boolean; message: string; structure?: Structure } {
  const bp = STRUCTURE_BLUEPRINT_MAP[type];
  if (!bp) return { ok: false, message: 'Invalid structure blueprint.' };

  if (world.gold < bp.goldCost) {
    addNotice(world, x, y - 24, `Need ${bp.goldCost}g`, '#ff8a80');
    return { ok: false, message: `Need ${bp.goldCost} Gold for ${bp.name}.` };
  }

  const gx = Math.round(x / 16) * 16;
  const gy = Math.round(y / 16) * 16;

  if (!checkPlacementValid(world, gx, gy, bp.width, bp.height)) {
    addNotice(world, gx, gy - 24, 'Blocked', '#ff8a80');
    return { ok: false, message: 'Placement blocked.' };
  }

  world.gold -= bp.goldCost;

  const lvScale = 1 + (world.villageLevel - 1) * 0.25;
  const tier = Math.min(3, world.villageLevel) as 1 | 2 | 3;
  const maxHp = Math.round(bp.maxHp * lvScale);
  const attackDamage = Math.round(bp.attackDamage * lvScale);

  const structure: Structure = {
    id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    name: bp.name,
    x: gx,
    y: gy,
    width: bp.width,
    height: bp.height,
    tier,
    hp: maxHp,
    maxHp,
    blocksMovement: bp.blocksMovement,
    isOpen: type === 'gate' ? false : undefined,
    lightRadius: bp.lightRadius,
    attackRange: bp.attackRange,
    attackDamage,
    attackCooldown: 0,
    prodTimer: 0,
    storedFood: type === 'farm' ? 0 : undefined,
    hitFlash: 0,
    destroyed: false,
    buildProgress: 0, // Blueprint starts at 0% — autonomous workers sprint over and hammer it to 100%!
    assignedVillagerId: null,
    fuel: type === 'brazier_beacon' ? 100 : undefined,
    aimAngle: 0,
  };

  world.structures.push(structure);
  world.structuresBuilt++;
  world.audioQueue.push({ kind: 'build' });
  addNotice(world, gx, gy - 28, `-${bp.goldCost}g · Blueprint Placed`, '#72f2ff');
  addLog(world, `Placed ${bp.name} blueprint — workers dispatched.`, 'info');

  // Wake autonomous workers immediately so they sprint to construct the blueprint!
  for (const v of world.villagers) {
    if (v.alive && v.role !== 'GUARD' && v.role !== 'SHARPSHOOTER' && v.role !== 'SCOUT') {
      v.decisionCooldown = 0;
    }
  }

  for (let i = 0; i < 6; i++) {
    world.smokePuffs.push({
      x: gx + (Math.random() - 0.5) * bp.width * 0.7,
      y: gy + (Math.random() - 0.5) * bp.height * 0.5,
      vx: (Math.random() - 0.5) * 32,
      vy: -14 - Math.random() * 18,
      size: 5 + Math.random() * 4,
      alpha: 0.65,
      color: '#72f2ff',
      ttl: 0.55,
    });
  }

  return { ok: true, message: `Placed ${bp.name} blueprint.`, structure };
}

const HIRE_WORKER_NAMES = ['Dorian', 'Elda', 'Rowan', 'Fenn', 'Maren', 'Toby', 'Hilda', 'Caleb'];
const HIRE_GUARD_NAMES = ['Garrick', 'Sera', 'Vance', 'Freya', 'Alden', 'Kira', 'Torin', 'Lyra'];

export function hireColonist(world: GameWorld): { ok: boolean; message: string; villager?: Villager } {
  if (world.gold < HIRE_UNIT_COST) {
    addNotice(world, world.villageCenter.x, world.villageCenter.y - 10, `Need ${HIRE_UNIT_COST}g`, '#ff8a80');
    return { ok: false, message: `Need ${HIRE_UNIT_COST} Gold to hire.` };
  }

  world.gold -= HIRE_UNIT_COST;
  const kind = world.nextHireKind;
  world.nextHireKind = kind === 'WORKER' ? 'GUARD' : 'WORKER';

  const count = world.villagers.length + 1;
  const isWorker = kind === 'WORKER';
  const role: Villager['role'] = isWorker
    ? count % 2 === 0
      ? 'BUILDER'
      : 'FORAGER'
    : count % 2 === 0
      ? 'SHARPSHOOTER'
      : 'GUARD';

  const namePool = isWorker ? HIRE_WORKER_NAMES : HIRE_GUARD_NAMES;
  const name = namePool[count % namePool.length];
  const angle = count * 1.15;
  const spawnX = world.villageCenter.x + Math.cos(angle) * 58;
  const spawnY = world.villageCenter.y + 36 + Math.sin(angle) * 44;
  const maxHp = isWorker ? 75 + (world.villageLevel - 1) * 15 : 105 + (world.villageLevel - 1) * 20;

  const villager: Villager = {
    id: `vil-hire-${Date.now()}-${count}`,
    name,
    role,
    headShape: count % 2 === 0 ? 'square' : 'round',
    accessory: isWorker ? 'cap' : role === 'SHARPSHOOTER' ? 'hood' : 'helm',
    bodyTint: isWorker ? '#d5d0c4' : '#bcc4cc',
    x: spawnX,
    y: spawnY,
    vx: 0,
    vy: 0,
    facing: 1,
    radius: 14,
    hp: maxHp,
    maxHp,
    stamina: 100,
    hunger: 100,
    fear: 4,
    courage: isWorker ? 52 : 88,
    skills: {
      combat: isWorker ? 30 : 86,
      building: isWorker ? 92 : 35,
      foraging: isWorker ? 90 : 35,
      medicine: 20,
    },
    homeX: world.villageCenter.x,
    homeY: world.villageCenter.y + 40,
    task: 'IDLE',
    intentLabel: isWorker ? 'Ready to build & haul Gold' : 'Moving to perimeter',
    targetPos: null,
    targetEntityId: null,
    attackCooldown: 0,
    workTimer: 0,
    decisionCooldown: 0,
    hitFlash: 0,
    walkCycle: 0,
    carriedWood: 0,
    carriedFood: 0,
    carryingLogs: false,
    hammerAnim: 0,
    memories: [],
    alive: true,
  };

  world.villagers.push(villager);
  world.audioQueue.push({ kind: 'rescue' });
  addNotice(
    world,
    spawnX,
    spawnY - 28,
    isWorker ? `+1 Worker (${name})` : `+1 Guard (${name})`,
    isWorker ? '#ffd166' : '#8ef6e4'
  );
  addLog(world, `Hired ${name} (${isWorker ? 'Worker' : 'Guard'}) for ${HIRE_UNIT_COST}g.`, 'info');
  return { ok: true, message: `Hired ${name}.`, villager };
}

export function upgradeVillage(world: GameWorld): { ok: boolean; message: string } {
  const cost = getVillageUpgradeCost(world.villageLevel);
  if (world.gold < cost) {
    addNotice(world, world.villageCenter.x, world.villageCenter.y - 12, `Need ${cost}g`, '#ff8a80');
    return { ok: false, message: `Need ${cost} Gold to upgrade Village.` };
  }

  world.gold -= cost;
  world.villageLevel += 1;
  world.coreMaxHp += 200;
  world.coreHp = Math.min(world.coreMaxHp, world.coreHp + 250);

  const core = world.structures.find((s) => s.id === 'lm-campfire');
  if (core && !core.destroyed) {
    core.tier = Math.min(3, world.villageLevel) as 1 | 2 | 3;
    core.maxHp = world.coreMaxHp;
    core.hp = world.coreHp;
    core.lightRadius = Math.min(420, 290 + (world.villageLevel - 1) * 35);
  }

  // Empower all existing towers & barricades + heal villagers!
  for (const s of world.structures) {
    if (s.destroyed || s.id === 'lm-campfire') continue;
    const bp = STRUCTURE_BLUEPRINT_MAP[s.type];
    if (!bp) continue;
    s.tier = Math.min(3, world.villageLevel) as 1 | 2 | 3;
    const scale = 1 + (world.villageLevel - 1) * 0.25;
    s.maxHp = Math.round(bp.maxHp * scale);
    s.hp = Math.min(s.maxHp, s.hp + Math.round(s.maxHp * 0.4));
    if (bp.attackDamage > 0) s.attackDamage = Math.round(bp.attackDamage * scale);
    if (bp.lightRadius > 0) s.lightRadius = Math.round(bp.lightRadius * (1 + (world.villageLevel - 1) * 0.12));
  }
  for (const v of world.villagers) {
    if (!v.alive) continue;
    v.maxHp += 15;
    v.hp = Math.min(v.maxHp, v.hp + 35);
  }

  world.audioQueue.push({ kind: 'shrine' });
  world.soundWaves.push({
    x: world.villageCenter.x,
    y: world.villageCenter.y + 36,
    radius: 18,
    maxRadius: 240,
    color: 'rgba(255, 209, 102, 0.78)',
    ttl: 0.75,
  });
  addNotice(
    world,
    world.villageCenter.x,
    world.villageCenter.y - 20,
    `Village Lv ${world.villageLevel}! +Core HP & Power`,
    '#ffd166'
  );
  addLog(world, `Upgraded Village to Level ${world.villageLevel}! Towers, guards, and Gold yield boosted.`, 'info');
  return { ok: true, message: `Village upgraded to Level ${world.villageLevel}!` };
}

export function upgradeStructure(world: GameWorld, structureId: string): { ok: boolean; message: string } {
  const s = world.structures.find((st) => st.id === structureId && !st.destroyed);
  if (!s) return { ok: false, message: 'Structure not found.' };
  const bp = STRUCTURE_BLUEPRINT_MAP[s.type];
  if (!bp || s.tier >= 3) return { ok: false, message: 'Already at maximum tier.' };

  const cost = s.tier === 1 ? bp.upgradeCostTier2 : bp.upgradeCostTier3;
  if (!hasResources(world.player.resources, cost)) {
    return { ok: false, message: 'Insufficient resources for upgrade.' };
  }

  spendResources(world.player.resources, cost);
  s.tier = (s.tier + 1) as 2 | 3;
  s.maxHp = Math.round(bp.maxHp * (s.tier === 2 ? 1.65 : 2.5));
  s.hp = s.maxHp;
  if (s.attackDamage > 0) s.attackDamage = Math.round(bp.attackDamage * (s.tier === 2 ? 1.45 : 2.0));
  if (s.lightRadius > 0) s.lightRadius = Math.round(bp.lightRadius * (s.tier === 2 ? 1.2 : 1.42));
  if (s.type === 'brazier_beacon' && s.tier === 3) {
    s.fuel = 100;
  }
  if (s.type === 'wooden_wall' && s.tier === 2) s.name = 'Reinforced Wall';
  if (s.type === 'wooden_wall' && s.tier === 3) {
    s.type = 'stone_wall';
    s.name = 'Stone Fortification';
  }

  world.audioQueue.push({ kind: 'build' });
  addNotice(world, s.x, s.y - 26, `Upgraded to Tier ${s.tier}!`, '#ffd166');
  return { ok: true, message: `Upgraded ${s.name} to Tier ${s.tier}.` };
}

export function cycleWeapon(world: GameWorld): void {
  const p = world.player;
  const list: WeaponId[] = p.weapons.length > 0 ? p.weapons.map((w) => w.id) : ['fists'];
  const idx = list.indexOf(p.equippedWeaponId);
  p.equippedWeaponId = list[(idx + 1) % list.length];
  addNotice(world, p.x, p.y - 30, WEAPON_SPECS[p.equippedWeaponId].name, '#e8f5ef');
}

export function respawnPlayerAtVillage(world: GameWorld): void {
  const p = world.player;
  p.alive = true;
  p.hp = p.maxHp;
  p.stamina = p.maxStamina;
  p.hunger = Math.max(55, p.hunger);
  p.rootedTimer = 0;
  p.x = world.villageCenter.x;
  p.y = world.villageCenter.y + 72;
  p.invulnTimer = 2.0;
  p.hitFlash = 0;
  if (world.phase === 'NIGHT') {
    world.day++;
    world.minuteOfDay = 420;
    world.phase = 'DAY';
    world.monsters = [];
    world.rootZones = [];
    world.alarmActive = false;
    world.wave.phase = 'CALM';
    world.wave.bossActive = false;
    world.wave.bossId = null;
  }
  addLog(world, 'You regained consciousness beside the Village Hearth. The village bears the scars of the night.', 'warning');
}

function getPlayerDamageMultiplier(world: GameWorld, weaponId: WeaponId): number {
  let mult = 1.0;
  if (world.activeRelics.includes('blood_moon_pact')) mult *= 1.5;
  if (world.villagers.some((v) => v.alive && v.role === 'BLACKSMITH')) mult *= 1.15;
  const masteryLv = getWeaponMasteryLevel(world, weaponId);
  mult *= 1 + (masteryLv - 1) * 0.08;
  return mult;
}

function triggerPlayerAttack(world: GameWorld): void {
  const p = world.player;
  const spec = WEAPON_SPECS[p.equippedWeaponId];
  if (p.attackCooldown > 0 || p.attackPhase !== 'idle' || p.stamina < spec.staminaCost * 0.6) return;

  p.stamina = Math.max(0, p.stamina - spec.staminaCost);
  p.attackPhase = 'windup';
  p.attackTimer = spec.windup;
  p.attackCooldown = spec.cooldown;
  p.attackAngle = p.aimAngle;
  p.attackHitIds = [];
  p.noiseLevel = Math.min(100, p.noiseLevel + spec.noise);
  world.audioQueue.push({ kind: spec.ranged ? 'bow' : 'swing' });

  // Melee Mastery Lv 3+ Dash-Strike lunge!
  const masteryLv = getWeaponMasteryLevel(world, p.equippedWeaponId);
  if (!spec.ranged && masteryLv >= 3 && (p.dashStrikeWindow ?? 0) > 0) {
    p.x += Math.cos(p.attackAngle) * 24;
    p.y += Math.sin(p.attackAngle) * 24;
    resolveWorldCollisions(world, p, p.radius, true);
    addNotice(world, p.x, p.y - 34, 'DASH-STRIKE!', '#ffd166');
  }

  const inst = p.weapons.find((w) => w.id === p.equippedWeaponId);
  if (inst && p.equippedWeaponId !== 'fists') {
    inst.durability = Math.max(0, inst.durability - 1);
    if (inst.durability <= 0) {
      p.weapons = p.weapons.filter((w) => w.id !== inst.id);
      p.equippedWeaponId = p.weapons[0]?.id ?? 'fists';
      addNotice(world, p.x, p.y - 34, `${spec.name} Broke!`, '#f5a99a');
    }
  }
}

function resolveMeleeActiveHitbox(world: GameWorld): void {
  const p = world.player;
  const spec = WEAPON_SPECS[p.equippedWeaponId];
  if (spec.ranged) return;

  const masteryLv = getWeaponMasteryLevel(world, p.equippedWeaponId);
  const isDashStrike = masteryLv >= 3 && (p.dashStrikeWindow ?? 0) > 0;
  const dmgMult = getPlayerDamageMultiplier(world, p.equippedWeaponId) * (isDashStrike ? 1.65 : 1.0);

  for (const m of world.monsters) {
    if (m.state === 'DYING' || p.attackHitIds.includes(m.id)) continue;
    const dx = m.x - p.x;
    const dy = m.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist > spec.range + m.radius) continue;
    const ang = Math.atan2(dy, dx);
    const diff = Math.abs(Math.atan2(Math.sin(ang - p.attackAngle), Math.cos(ang - p.attackAngle)));
    if (diff > spec.arcRad * 0.58 && dist > 26) continue;

    p.attackHitIds.push(m.id);
    const dmg = Math.round((spec.damage + Math.floor((p.level - 1) * 3)) * dmgMult);
    m.hp -= dmg;
    m.hitFlash = 0.16;
    if (m.type === 'MIMIC' && !m.mimicRevealed) m.mimicRevealed = true;

    // Resonance Blade ignites tarred foes & disrupts shadows!
    if (p.equippedWeaponId === 'resonance_blade' && ((m.tarredTimer ?? 0) > 0 || isDashStrike)) {
      igniteMonster(world, m, 5.5);
    }

    const kb = m.type === 'BRUTE' || m.isBoss ? 7 : isDashStrike ? 32 : 22;
    m.x += Math.cos(ang) * kb;
    m.y += Math.sin(ang) * kb;
    resolveWorldCollisions(world, m, m.radius, false);

    awardWeaponMastery(world, p.equippedWeaponId, m.isBoss ? 14 : 9);

    world.hitstopTimer = Math.max(world.hitstopTimer, 0.038);
    world.cameraShake = Math.min(1, world.cameraShake + 0.25);
    world.audioQueue.push({ kind: 'hit_flesh' });
    addNotice(world, m.x, m.y - 26, `-${dmg}`, isDashStrike ? '#ffd166' : '#f5d89a');

    if (m.hp <= 0) {
      awardMonsterKill(world, m);
      world.hitstopTimer = Math.max(world.hitstopTimer, 0.05);
      world.cameraShake = Math.min(1, world.cameraShake + 0.3);
    }
  }

  for (const n of world.resourceNodes) {
    if (n.depleted || p.attackHitIds.includes(n.id)) continue;
    if (n.kind === 'clue_monolith' || n.kind === 'supply_crate') continue;
    const dx = n.x - p.x;
    const dy = n.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist > spec.range + n.radius) continue;
    const ang = Math.atan2(dy, dx);
    const diff = Math.abs(Math.atan2(Math.sin(ang - p.attackAngle), Math.cos(ang - p.attackAngle)));
    if (diff > spec.arcRad * 0.55 && dist > 26) continue;

    p.attackHitIds.push(n.id);
    const bonus =
      n.kind === 'pine_tree' || n.kind === 'dead_tree'
        ? spec.gatherWoodBonus
        : n.kind === 'stone_boulder' || n.kind === 'metal_vein' || n.kind === 'crystal_outcrop'
          ? spec.gatherStoneBonus
          : 1.2;
    harvestNodeDamage(world, n, spec.damage * bonus);
  }
}

function fireTeslaChainLightning(world: GameWorld, pylon: Structure, firstTarget: Monster): void {
  const maxTargets = 2 + pylon.tier; // T1: 3, T2: 4, T3: 5
  const hitIds = new Set<string>();
  const points: Vec2[] = [{ x: pylon.x, y: pylon.y - 24 }];
  let current: Monster | null = firstTarget;
  let dmg = pylon.attackDamage;

  for (let hop = 0; hop < maxTargets && current; hop++) {
    hitIds.add(current.id);
    points.push({ x: current.x, y: current.y - 10 });

    current.hp -= dmg;
    current.hitFlash = 0.2;
    current.stunTimer = Math.max(current.stunTimer ?? 0, current.isBoss ? 0.35 : 0.85);
    if (current.type === 'MIMIC' && !current.mimicRevealed) current.mimicRevealed = true;
    addNotice(world, current.x, current.y - 28, `⚡-${dmg}`, '#8ef6ff');

    if (current.hp <= 0) {
      current.state = 'DYING';
      current.deathTimer = 0.4;
      world.monstersSlain++;
      world.player.xp += current.isBoss ? 220 : 22;
    }

    // Find next chain target within 165px
    let next: Monster | null = null;
    let bestD = 165;
    for (const cand of world.monsters) {
      if (cand.state === 'DYING' || hitIds.has(cand.id) || cand.type === 'WATCHER') continue;
      if (cand.type === 'MIMIC' && !cand.mimicRevealed) continue;
      const d = Math.hypot(cand.x - current.x, cand.y - current.y);
      if (d < bestD) {
        bestD = d;
        next = cand;
      }
    }
    current = next;
    dmg = Math.max(12, Math.round(dmg * 0.84));
  }

  world.lightningArcs.push({ points, ttl: 0.28 });
  world.audioQueue.push({ kind: 'lightning' });
  pylon.attackCooldown = pylon.tier === 3 ? 1.45 : pylon.tier === 2 ? 1.85 : 2.2;
}

function stepStructuresAndTurrets(world: GameWorld, dt: number): void {
  const p = world.player;

  for (const s of world.structures) {
    if (s.destroyed) continue;
    s.hitFlash = Math.max(0, s.hitFlash - dt);
    s.attackCooldown = Math.max(0, s.attackCooldown - dt);

    // Blueprints stay at buildProgress < 1 until autonomous workers (or player standing right next to them) build them!
    if ((s.buildProgress ?? 1) < 1) {
      if (p.alive && Math.hypot(p.x - s.x, p.y - s.y) < 76) {
        s.buildProgress = Math.min(1, (s.buildProgress ?? 0) + dt * 0.22);
        if (s.buildProgress >= 1) {
          addNotice(world, s.x, s.y - 30, `${s.name} Built!`, '#8ef6e4');
          world.audioQueue.push({ kind: 'build' });
        }
      }
      continue;
    }

    // Flame Tower (brazier_beacon): infinite burning light + auto-fires scorching Fire Bolts!
    if (s.type === 'brazier_beacon') {
      const bp = STRUCTURE_BLUEPRINT_MAP.brazier_beacon;
      s.fuel = 100;
      s.lightRadius = Math.round(bp.lightRadius * (1 + (s.tier - 1) * 0.14));
      if (Math.random() < dt * 2.5) {
        world.smokePuffs.push({
          x: s.x + (Math.random() - 0.5) * 8,
          y: s.y - 26,
          vx: 8 + Math.random() * 10,
          vy: -22 - Math.random() * 14,
          size: 3 + Math.random() * 3,
          alpha: 0.65,
          color: Math.random() < 0.55 ? '#ffd166' : '#f77f00',
          ttl: 0.65,
        });
      }

      if (s.attackCooldown <= 0) {
        let target: Monster | null = null;
        let bestDist = s.attackRange > 0 ? s.attackRange : 270;
        for (const m of world.monsters) {
          if (m.state === 'DYING' || m.type === 'WATCHER') continue;
          const d = Math.hypot(m.x - s.x, m.y - s.y);
          if (d < bestDist) {
            bestDist = d;
            target = m;
          }
        }
        if (target) {
          const ang = Math.atan2(target.y - s.y, target.x - s.x);
          s.aimAngle = ang;
          world.projectiles.push({
            id: `proj-flame-${Math.random().toString(36).slice(2, 7)}`,
            owner: 'turret',
            x: s.x,
            y: s.y - 30,
            vx: Math.cos(ang) * 460,
            vy: Math.sin(ang) * 460,
            damage: Math.max(18, s.attackDamage),
            ttl: 0.85,
            color: '#ff9f43',
            radius: 5,
            isFire: true,
          });
          s.attackCooldown = Math.max(0.85, 1.32 - (s.tier - 1) * 0.14);
          world.audioQueue.push({ kind: 'fire_ignite' });
        }
      }
    }

    // Cabin chimney smoke puffs
    if ((s.type === 'house' || s.type === 'shelter' || s.type === 'blacksmith') && s.lightRadius > 0) {
      if (Math.random() < dt * 1.1) {
        world.smokePuffs.push({
          x: s.x + s.width * 0.24,
          y: s.y - s.height * 0.68,
          vx: 10 + Math.random() * 9,
          vy: -16 - Math.random() * 10,
          size: 7 + Math.random() * 5,
          alpha: 0.24,
          color: '#b8bec8',
          ttl: 1.8,
        });
      }
    }

    // Tesla Pylon chain lightning
    if (s.type === 'tesla_pylon' && s.attackCooldown <= 0) {
      let target: Monster | null = null;
      let bestDist = s.attackRange;
      for (const m of world.monsters) {
        if (m.state === 'DYING' || m.type === 'WATCHER') continue;
        const d = Math.hypot(m.x - s.x, m.y - s.y);
        if (d < bestDist) {
          bestDist = d;
          target = m;
        }
      }
      if (target) fireTeslaChainLightning(world, s, target);
    }

    // Completed Arrow Tower (watchtower) & Auto-Turret: 100% autonomous targeting & rapid firing!
    if ((s.type === 'turret' || s.type === 'watchtower') && s.attackCooldown <= 0) {
      let target: Monster | null = null;
      let bestDist = s.attackRange;
      for (const m of world.monsters) {
        if (m.state === 'DYING' || m.type === 'WATCHER') continue;
        if (m.type === 'MIMIC' && !m.mimicRevealed) continue;
        const d = Math.hypot(m.x - s.x, m.y - s.y);
        if (d < bestDist) {
          bestDist = d;
          target = m;
        }
      }
      if (target) {
        const ang = Math.atan2(target.y - s.y, target.x - s.x);
        s.aimAngle = ang;
        const isFire = s.tier >= 3;
        world.projectiles.push({
          id: `proj-${Math.random().toString(36).slice(2, 7)}`,
          owner: 'turret',
          x: s.x,
          y: s.y - (s.type === 'watchtower' ? 42 : 16),
          vx: Math.cos(ang) * 620,
          vy: Math.sin(ang) * 620,
          damage: Math.max(20, s.attackDamage),
          ttl: 0.9,
          color: isFire ? '#ff9f43' : '#f5d89a',
          radius: isFire ? 5 : 4,
          isFire,
        });
        s.attackCooldown = Math.max(0.55, 0.84 - (s.tier - 1) * 0.1);
        world.audioQueue.push({ kind: 'bow' });
      }
    }
  }
}

function stepProjectiles(world: GameWorld, dt: number): void {
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const pr = world.projectiles[i];
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.ttl -= dt;

    if (pr.ttl <= 0 || pr.x < 20 || pr.x > world.worldWidth - 20 || pr.y < 20 || pr.y > world.worldHeight - 20) {
      world.projectiles.splice(i, 1);
      continue;
    }

    let consumed = false;
    for (const m of world.monsters) {
      if (m.state === 'DYING') continue;
      if (Math.hypot(m.x - pr.x, m.y - pr.y) <= m.radius + pr.radius + 4) {
        m.hp -= pr.damage;
        m.hitFlash = 0.14;
        if (m.type === 'MIMIC' && !m.mimicRevealed) m.mimicRevealed = true;

        // Fire Arrow + Tar Trap ignition synergy!
        if (pr.isFire) {
          igniteMonster(world, m, (m.tarredTimer ?? 0) > 0 ? 7.5 : 4.5);
        }

        if (pr.owner === 'player') {
          awardWeaponMastery(world, world.player.equippedWeaponId, 8);
        }

        world.audioQueue.push({ kind: 'hit_flesh' });
        addNotice(world, m.x, m.y - 24, `-${pr.damage}`, pr.isFire ? '#ff9f43' : '#f5d89a');
        if (m.hp <= 0) {
          awardMonsterKill(world, m);
        }
        if (!pr.pierce) {
          consumed = true;
          break;
        }
      }
    }

    if (!consumed && pr.owner === 'player') {
      for (const n of world.resourceNodes) {
        if (!n.depleted && n.kind === 'wild_deer' && Math.hypot(n.x - pr.x, n.y - pr.y) <= n.radius + 8) {
          harvestNodeDamage(world, n, pr.damage);
          consumed = true;
          break;
        }
      }
    }

    if (consumed) {
      world.projectiles.splice(i, 1);
    }
  }
}

function stepTrappedSurvivors(world: GameWorld, dt: number): void {
  const p = world.player;
  for (const surv of world.trappedSurvivors) {
    if (surv.state !== 'ESCORTING') continue;

    const dx = p.x - surv.x;
    const dy = p.y - surv.y;
    const distP = Math.hypot(dx, dy);
    if (distP > 44) {
      const spd = Math.min(185, distP > 140 ? 180 : 148);
      const nx = dx / distP;
      const ny = dy / distP;
      surv.facing = nx >= 0 ? 1 : -1;
      const nextPos = { x: surv.x + nx * spd * dt, y: surv.y + ny * spd * dt };
      resolveWorldCollisions(world, nextPos, 14, true);
      surv.x = nextPos.x;
      surv.y = nextPos.y;
      surv.walkCycle += spd * dt * 0.14;
    }

    // Arrived safely at Ashen Village -> Recruit as permanent specialist villager!
    if (Math.hypot(surv.x - world.villageCenter.x, surv.y - world.villageCenter.y) < 250) {
      surv.state = 'RECRUITED';
      const newVillager: Villager = {
        id: `vil-rescued-${surv.id}`,
        name: surv.name,
        role: surv.role,
        headShape: surv.role === 'BLACKSMITH' ? 'square' : 'round',
        accessory: surv.role === 'BLACKSMITH' ? 'apron' : surv.role === 'SHARPSHOOTER' ? 'hood' : 'scarf',
        bodyTint: surv.role === 'HERBALIST' ? '#b9cbb8' : surv.role === 'SHARPSHOOTER' ? '#b5bec9' : '#cbb9a8',
        x: surv.x,
        y: surv.y,
        vx: 0,
        vy: 0,
        facing: surv.facing,
        radius: 14,
        hp: surv.maxHp,
        maxHp: surv.maxHp,
        stamina: 100,
        hunger: 92,
        fear: 12,
        courage: surv.role === 'SHARPSHOOTER' ? 88 : 70,
        skills: {
          combat: surv.role === 'SHARPSHOOTER' ? 92 : 60,
          building: surv.role === 'BLACKSMITH' ? 85 : 50,
          foraging: surv.role === 'HERBALIST' ? 88 : 50,
          medicine: surv.role === 'HERBALIST' ? 95 : 35,
        },
        homeX: world.villageCenter.x + (Math.random() - 0.5) * 140,
        homeY: world.villageCenter.y + 70,
        task: 'IDLE',
        intentLabel: `Settling in as Village ${surv.role}`,
        targetPos: null,
        targetEntityId: null,
        attackCooldown: 0,
        workTimer: 0,
        decisionCooldown: 0.4,
        hitFlash: 0,
        walkCycle: 0,
        carriedWood: 0,
        carriedFood: 0,
        memories: [
          {
            day: world.day,
            text: 'Rescued from the wilds and brought safely to Ashen Village.',
            fearImpact: -10,
          },
        ],
        alive: true,
        bubble: { text: 'Thank you!', ttl: 3.5, tone: 'speech' },
      };
      world.villagers.push(newVillager);
      world.audioQueue.push({ kind: 'rescue' });

      const bonusText =
        surv.role === 'BLACKSMITH'
          ? 'Unlocked +15% Forged Weapon Damage & Iron smelting!'
          : surv.role === 'SHARPSHOOTER'
            ? 'Garrick will man Watchtowers with Fire Arrows!'
            : 'Lira brews free Herbal Bandages & boosts village healing!';
      world.horrorBanner = {
        text: `${surv.name} joined Ashen Village! ${bonusText}`,
        ttl: 5.5,
      };
      addLog(world, `${surv.name} (${surv.role}) joined Ashen Village! ${bonusText}`, 'info');
    }
  }
}

function stepAtmosphericHorrorEvents(world: GameWorld, dt: number): void {
  if (world.phase !== 'EVENING' && world.phase !== 'NIGHT') return;
  world.horrorEventCooldown -= dt;
  if (world.horrorEventCooldown > 0) return;

  world.horrorEventCooldown = 28 + Math.random() * 22;
  const roll = Math.random();

  if (roll < 0.34) {
    const line = EERIE_CRT_TRANSMISSIONS[Math.floor(Math.random() * EERIE_CRT_TRANSMISSIONS.length)];
    world.crtBroadcast = line;
    world.crtFlicker = 1.0;
    world.horrorBanner = { text: `The Village CRT flickers: "${line}"`, ttl: 4.5 };
    world.audioQueue.push({ kind: 'crt_static' });
    addLog(world, `CRT broadcast intercepted: "${line}"`, 'horror');
  } else if (roll < 0.62 && !world.monsters.some((m) => m.type === 'WATCHER')) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 360 + Math.random() * 90;
    spawnMonster(world, 'WATCHER', world.player.x + Math.cos(ang) * dist, world.player.y + Math.sin(ang) * dist);
    world.horrorBanner = { text: 'You feel eyes watching you from the edge of the fog.', ttl: 4.5 };
    world.audioQueue.push({ kind: 'watcher' });
    addLog(world, 'A tall pale silhouette was spotted observing from the mist.', 'horror');
  } else {
    world.audioQueue.push({ kind: 'howl' });
    world.horrorBanner = { text: 'Something howled deep inside the Whispering Woods.', ttl: 4 };
  }
}

export function stepGameWorld(world: GameWorld, input: InputState, rawDt: number): void {
  if (world.gameOver) return;
  const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

  world.cameraShake = Math.max(0, world.cameraShake - dt * 2.2);
  world.crtFlicker = Math.max(0, world.crtFlicker - dt * 1.4);
  world.darknessSurgeTimer = Math.max(0, world.darknessSurgeTimer - dt);
  world.celebrationTimer = Math.max(0, world.celebrationTimer - dt);
  if (world.horrorBanner) {
    world.horrorBanner.ttl -= dt;
    if (world.horrorBanner.ttl <= 0) world.horrorBanner = null;
  }

  if (world.hitstopTimer > 0) {
    world.hitstopTimer = Math.max(0, world.hitstopTimer - dt);
    return;
  }

  // 1. Crisp Tower-Defense Day Countdown (45s) -> Escalating Night Wave -> Wave Cleared Dawn Bonus!
  if (world.phase === 'DAY' || world.phase === 'DAWN' || world.phase === 'EVENING') {
    world.dayTimeRemaining = Math.max(0, world.dayTimeRemaining - dt);
    const ratio = 1 - world.dayTimeRemaining / 45;
    world.minuteOfDay = 480 + ratio * 700; // Smoothly shifts morning -> golden afternoon -> dusk!
    world.phase = world.dayTimeRemaining <= 6 ? 'EVENING' : 'DAY';

    if (world.dayTimeRemaining <= 0) {
      world.phase = 'NIGHT';
      world.minuteOfDay = 1320;
      world.weather = world.day % 2 === 0 ? 'RAIN' : 'FOG';
      world.crtBroadcast = 'PERIMETER BREACH';
      startNightWaveTelegraph(world);
    }
  } else if (world.phase === 'NIGHT') {
    world.minuteOfDay = 1320;
    if (world.wave.phase === 'CLEARED') {
      world.wavesCleared += 1;
      world.day += 1;
      const bonus = 25 + world.wavesCleared * 10;
      world.gold += bonus;
      world.phase = 'DAY';
      world.dayTimeRemaining = 45;
      world.minuteOfDay = 480;
      world.weather = 'CLEAR';
      world.alarmActive = false;
      world.wave.phase = 'CALM';
      world.wave.bossActive = false;
      world.wave.bossId = null;
      world.crtBroadcast = 'DEFEND THE CORE';
      // Respawn fallen player at dawn & heal villagers slightly
      if (!world.player.alive) {
        world.player.alive = true;
        world.player.hp = world.player.maxHp;
        world.player.x = world.villageCenter.x;
        world.player.y = world.villageCenter.y + 72;
      }
      for (const v of world.villagers) {
        if (v.alive) v.hp = Math.min(v.maxHp, v.hp + 35);
      }
      world.audioQueue.push({ kind: 'rescue' });
      addNotice(
        world,
        world.villageCenter.x,
        world.villageCenter.y - 24,
        `Wave Cleared! +${bonus} Gold`,
        '#ffd166'
      );
      addLog(world, `Night Wave ${world.wavesCleared} cleared! Earned +${bonus} Gold.`, 'info');
    }
  }

  // Alarm active while monsters are near the village
  const anyThreatNearVillage = world.monsters.some(
    (m) => m.state !== 'DYING' && m.type !== 'WATCHER' && Math.hypot(m.x - world.villageCenter.x, m.y - world.villageCenter.y) < 760
  );
  world.alarmActive = world.phase === 'NIGHT' || anyThreatNearVillage;

  // 2. Smooth Streamlined Player Controls (zero Hunger/Stamina/Lantern % micromanagement!)
  const p = world.player;
  if (p.alive) {
    p.hitFlash = Math.max(0, p.hitFlash - dt);
    p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    p.dodgeCooldown = Math.max(0, p.dodgeCooldown - dt);
    p.attackCooldown = Math.max(0, p.attackCooldown - dt);
    p.dashStrikeWindow = Math.max(0, (p.dashStrikeWindow ?? 0) - dt);
    p.rootedTimer = Math.max(0, (p.rootedTimer ?? 0) - dt);
    p.noiseLevel = Math.max(0, p.noiseLevel - dt * 28);
    p.stamina = p.maxStamina;
    p.hunger = p.maxHunger;
    p.lanternFuel = 100;
    p.lanternOn = true;

    // Gentle passive recovery out of combat
    if (p.hitFlash <= 0 && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + dt * (world.phase === 'DAY' ? 6 : 2.5));
    }

    if (input.aimActive) {
      p.aimAngle = Math.atan2(input.aimWorldY - p.y, input.aimWorldX - p.x);
      p.facing = Math.cos(p.aimAngle) >= 0 ? 1 : -1;
    } else if (Math.hypot(input.moveX, input.moveY) > 0.15) {
      p.aimAngle = Math.atan2(input.moveY, input.moveX);
      p.facing = input.moveX >= 0 ? 1 : -1;
    }

    if (input.dodgePressed && p.dodgeCooldown <= 0) {
      const mag = Math.hypot(input.moveX, input.moveY);
      const dx = mag > 0.1 ? input.moveX / mag : Math.cos(p.aimAngle);
      const dy = mag > 0.1 ? input.moveY / mag : Math.sin(p.aimAngle);
      p.dodgeTimer = 0.2;
      p.dodgeCooldown = 0.65;
      p.invulnTimer = Math.max(p.invulnTimer, 0.26);
      p.dodgeVx = dx * 430;
      p.dodgeVy = dy * 430;
      world.audioQueue.push({ kind: 'dodge' });
    }

    if (p.dodgeTimer > 0) {
      p.dodgeTimer -= dt;
      p.vx = p.dodgeVx;
      p.vy = p.dodgeVy;
    } else {
      const mag = Math.hypot(input.moveX, input.moveY);
      const nx = mag > 1 ? input.moveX / mag : input.moveX;
      const ny = mag > 1 ? input.moveY / mag : input.moveY;
      const moveSpeed = input.sprint ? 235 : 185;
      p.vx = nx * moveSpeed;
      p.vy = ny * moveSpeed;
    }

    const prevX = p.x;
    const prevY = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    resolveWorldCollisions(world, p, p.radius, true);

    const movedDist = Math.hypot(p.x - prevX, p.y - prevY);
    if (movedDist > 0.4) {
      p.walkCycle += movedDist * 0.14;
    }

    // Auto-attack nearest monster in spear reach OR explicit attack click!
    const nearestMob = world.monsters.find(
      (m) => m.state !== 'DYING' && m.type !== 'WATCHER' && Math.hypot(m.x - p.x, m.y - p.y) <= 74
    );
    if (!p.selectedBuildType && (input.attackPressed || nearestMob)) {
      if (nearestMob && !input.attackPressed) {
        p.aimAngle = Math.atan2(nearestMob.y - p.y, nearestMob.x - p.x);
        p.facing = Math.cos(p.aimAngle) >= 0 ? 1 : -1;
      }
      triggerPlayerAttack(world);
    }

    if (p.attackPhase !== 'idle') {
      p.attackTimer -= dt;
      const spec = WEAPON_SPECS[p.equippedWeaponId];
      if (p.attackPhase === 'windup' && p.attackTimer <= 0) {
        p.attackPhase = 'active';
        p.attackTimer = spec.active;
        if (spec.ranged) {
          const speed = spec.projectileSpeed ?? 560;
          const masteryLv = getWeaponMasteryLevel(world, p.equippedWeaponId);
          const dmgMult = getPlayerDamageMultiplier(world, p.equippedWeaponId);
          const dmg = Math.round((spec.damage + Math.floor((p.level - 1) * 4)) * dmgMult);

          const isCrossbow = p.equippedWeaponId === 'heavy_crossbow';
          const angles =
            masteryLv >= 3
              ? isCrossbow
                ? [p.attackAngle - 0.06, p.attackAngle + 0.06]
                : [p.attackAngle - 0.16, p.attackAngle, p.attackAngle + 0.16]
              : [p.attackAngle];
          const isFire = masteryLv >= 3 && isCrossbow;

          for (const ang of angles) {
            world.projectiles.push({
              id: `proj-${Math.random().toString(36).slice(2, 7)}`,
              owner: 'player',
              x: p.x + Math.cos(ang) * 18,
              y: p.y - 6 + Math.sin(ang) * 18,
              vx: Math.cos(ang) * speed,
              vy: Math.sin(ang) * speed,
              damage: dmg,
              ttl: spec.range / speed,
              color: isFire ? '#ff9f43' : isCrossbow ? '#8ef6e4' : '#e8e4d8',
              radius: isFire ? 5 : 4,
              pierce: isCrossbow,
              isFire,
            });
          }
        } else {
          resolveMeleeActiveHitbox(world);
        }
      } else if (p.attackPhase === 'active') {
        if (!spec.ranged) resolveMeleeActiveHitbox(world);
        if (p.attackTimer <= 0) {
          p.attackPhase = 'recovery';
          p.attackTimer = spec.recovery;
        }
      } else if (p.attackPhase === 'recovery' && p.attackTimer <= 0) {
        p.attackPhase = 'idle';
      }
    }

    if (input.interactPressed) {
      performInteract(world);
    }

    // Auto-collect nearby dropped loot
    for (let i = world.droppedItems.length - 1; i >= 0; i--) {
      const dItem = world.droppedItems[i];
      dItem.ttl -= dt;
      if (dItem.ttl <= 0) {
        world.droppedItems.splice(i, 1);
        continue;
      }
      if (Math.hypot(dItem.x - p.x, dItem.y - p.y) < 42) {
        if (dItem.resource) {
          p.resources[dItem.resource] = (p.resources[dItem.resource] ?? 0) + dItem.amount;
          const label = dItem.resource === 'rare_shard' ? 'Ancient Shard' : dItem.resource.replace('_', ' ');
          addNotice(world, p.x, p.y - 26, `+${dItem.amount} ${label}`, '#8ef6e4');
        } else if (dItem.consumable) {
          p.consumables[dItem.consumable] = (p.consumables[dItem.consumable] ?? 0) + dItem.amount;
        }
        world.audioQueue.push({ kind: 'pickup' });
        world.droppedItems.splice(i, 1);
      }
    }
  }

  // 3. Wild deer wandering + depleted node respawns
  for (const n of world.resourceNodes) {
    n.hitFlash = Math.max(0, n.hitFlash - dt);
    if (n.depleted) {
      n.respawnTimer -= dt;
      if (n.respawnTimer <= 0) {
        n.depleted = false;
        n.hp = n.maxHp;
      }
      continue;
    }
    if (n.kind === 'wild_deer') {
      const distP = Math.hypot(n.x - p.x, n.y - p.y);
      if (distP < 130) {
        const ang = Math.atan2(n.y - p.y, n.x - p.x);
        n.vx = Math.cos(ang) * 110;
        n.vy = Math.sin(ang) * 110;
      } else {
        n.vx = (n.vx ?? 0) * 0.94;
        n.vy = (n.vy ?? 0) * 0.94;
      }
      if (Math.hypot(n.vx ?? 0, n.vy ?? 0) > 5) {
        const pos = { x: n.x + (n.vx ?? 0) * dt, y: n.y + (n.vy ?? 0) * dt };
        resolveWorldCollisions(world, pos, n.radius, true);
        n.x = pos.x;
        n.y = pos.y;
      }
    }
  }

  // 4. Step Autonomous Workers/Guards, Monsters, Structures & Turrets, Projectiles
  stepVillagers(world, dt);
  stepMonsters(world, dt);
  stepStructuresAndTurrets(world, dt);
  stepProjectiles(world, dt);

  // Real Lose Condition check ("Do Nothing = Lose")
  if (world.coreHp <= 0) {
    world.coreHp = 0;
    world.gameOver = true;
    world.gameOverReason = 'core_destroyed';
  } else if (!world.player.alive && world.villagers.every((v) => !v.alive)) {
    world.gameOver = true;
    world.gameOverReason = 'colony_wiped';
  }

  // 5. Tick Visual Effects (Lightning, Soundwaves, Root Zones, Smoke, Fleeing Birds, Footprints, Notices)
  for (let i = world.lightningArcs.length - 1; i >= 0; i--) {
    world.lightningArcs[i].ttl -= dt;
    if (world.lightningArcs[i].ttl <= 0) world.lightningArcs.splice(i, 1);
  }
  for (let i = world.soundWaves.length - 1; i >= 0; i--) {
    const sw = world.soundWaves[i];
    sw.ttl -= dt;
    sw.radius += (sw.maxRadius - sw.radius) * Math.min(1, dt * 5.2);
    if (sw.ttl <= 0) world.soundWaves.splice(i, 1);
  }
  for (let i = world.rootZones.length - 1; i >= 0; i--) {
    world.rootZones[i].ttl -= dt;
    if (world.rootZones[i].ttl <= 0) world.rootZones.splice(i, 1);
  }
  for (let i = world.smokePuffs.length - 1; i >= 0; i--) {
    const sp = world.smokePuffs[i];
    sp.x += sp.vx * dt;
    sp.y += sp.vy * dt;
    sp.size += dt * 4.2;
    sp.ttl -= dt;
    if (sp.ttl <= 0) world.smokePuffs.splice(i, 1);
  }
  if (world.smokePuffs.length > 75) {
    world.smokePuffs.splice(0, world.smokePuffs.length - 75);
  }
  for (let i = world.fleeingBirds.length - 1; i >= 0; i--) {
    const b = world.fleeingBirds[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.flap += dt * 16;
    b.ttl -= dt;
    if (b.ttl <= 0) world.fleeingBirds.splice(i, 1);
  }
  for (let i = world.footprints.length - 1; i >= 0; i--) {
    world.footprints[i].alpha -= dt * 0.015;
    if (world.footprints[i].alpha <= 0.02) world.footprints.splice(i, 1);
  }
  for (let i = world.floatingNotices.length - 1; i >= 0; i--) {
    world.floatingNotices[i].ttl -= dt;
    world.floatingNotices[i].y -= dt * 22;
    if (world.floatingNotices[i].ttl <= 0) world.floatingNotices.splice(i, 1);
  }
}
