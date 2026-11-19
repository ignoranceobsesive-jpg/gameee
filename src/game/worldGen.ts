import {
  CursedShrine,
  DiscoveryEntry,
  GameWorld,
  MerchantOffer,
  RegionId,
  RegionMeta,
  ResourceNode,
  Structure,
  TrappedSurvivor,
  Villager,
  VillagerRole,
} from './types';

export function buildMerchantOffers(day: number): MerchantOffer[] {
  return [
    {
      id: `offer-shard-${day}`,
      name: 'Ancient Resonance Shard',
      description: 'Rare glowing crystal for Tesla Pylons & Shard-Forged weapons.',
      cost: { food: 6, wood: 8 },
      rewardResource: { key: 'rare_shard', amount: 2 },
    },
    {
      id: `offer-oil-${day}`,
      name: 'Refined Lantern Oil (×2)',
      description: 'Burns hotter through midnight indigo fog.',
      cost: { wood: 5, herbs: 2 },
      rewardConsumable: { id: 'lantern_oil', amount: 2 },
    },
    {
      id: `offer-crossbow-${day}`,
      name: 'Heavy Crossbow Blueprint',
      description: 'Unlocks Heavy Crossbow crafting immediately without waiting for ruins.',
      cost: { rare_shard: 1, metal: 3 },
      unlockRecipeId: 'craft_heavy_crossbow',
    },
    {
      id: `offer-sword-${day}`,
      name: 'Tempered Iron Sword',
      description: 'Ready-forged iron blade delivered straight to your hand.',
      cost: { food: 8, stone: 6 },
      rewardWeapon: 'iron_sword',
    },
  ];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const WORLD_CLUES: Record<string, { title: string; region: RegionId; body: string }> = {
  clue_crt_tape: {
    title: 'Broadcast Tape #04 — "Just a Normal Peep"',
    region: 'ashen_village',
    body: 'Scratched behind the village CRT casing: "The loop keeps the town calm. When the static speaks instead of the little square peep, lock the gates and count every face twice."',
  },
  clue_forest_marks: {
    title: 'Three-Toed Ash Prints',
    region: 'whispering_forest',
    body: 'Deep claw grooves circle the pine trunks at eye height. Whoever—or whatever—made them stood motionless for hours watching the village lanterns.',
  },
  clue_homestead_log: {
    title: 'Abandoned Homestead Ledger',
    region: 'abandoned_homestead',
    body: '"Night 11: Thomas came back from the quarry after sundown. He knew our names, yet he never blinked near the fire. We left before dawn." — Blueprint fragment for Heavy Crossbow enclosed.',
  },
  clue_quarry_shard: {
    title: 'Humming Quarry Vein',
    region: 'shattered_quarry',
    body: 'Pale crystalline shards pulse faintly inside the iron seam. When struck with steel, nearby shadows recoil.',
  },
  clue_ruins_relay: {
    title: 'Sunken Relay Frequency 44.7',
    region: 'sunken_ruins',
    body: 'A rusted antenna still beams a slow pulse toward the village CRT. The log reads: "CONTAINMENT RING BREACHED. ENTITY CLASS: UNKNOWN. LIGHT DELAYS IT — RESONANCE WOUNDS IT."',
  },
  clue_cavern_nest: {
    title: 'Hollow Cavern Sheddings',
    region: 'hollow_cavern',
    body: 'Hundreds of pale husks litter the cave floor beside stolen villager hats. The Crawlers drag metal and voices underground.',
  },
  clue_ridge_note: {
    title: 'Surveyor Notes on The Watcher',
    region: 'watchers_ridge',
    body: '"It never crosses the lantern threshold unless provoked. It simply tallies how many of us remain each dusk."',
  },
};

export function formatGameTime(minuteOfDay: number): string {
  const m = ((Math.floor(minuteOfDay) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mins = m % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${suffix}`;
}

export function getRegionAt(regions: RegionMeta[], x: number, y: number): RegionMeta {
  let best = regions[0];
  let bestScore = Infinity;
  for (const r of regions) {
    const d = Math.hypot(x - r.x, y - r.y) / r.radius;
    if (d < bestScore) {
      bestScore = d;
      best = r;
    }
  }
  return best;
}

export function createInitialWorld(seed = 1408): GameWorld {
  const rand = mulberry32(seed);
  const worldWidth = 3200;
  const worldHeight = 2400;
  const cx = 1600;
  const cy = 1200;

  const regions: RegionMeta[] = [
    {
      id: 'ashen_village',
      name: 'Ashen Village',
      zoneLabel: 'Hub',
      x: cx,
      y: cy,
      radius: 460,
      dangerLevel: 1,
      description: 'The central settlement around the old Broadcast CRT outpost. Build walls, light braziers, and defend the people.',
      discovered: true,
    },
    {
      id: 'whispering_forest',
      name: 'The Whispering Woods',
      zoneLabel: 'Zone 1',
      x: 920,
      y: 760,
      radius: 470,
      dangerLevel: 1,
      description: 'Zone 1 (Starter): Dense pines, berries, stone, wild deer, and a trapped Herbalist near an abandoned camp.',
      discovered: false,
    },
    {
      id: 'shattered_quarry',
      name: 'The Ashen Ruins — Quarry',
      zoneLabel: 'Zone 2',
      x: 2380,
      y: 1080,
      radius: 440,
      dangerLevel: 2,
      description: 'Zone 2 (Mid-Tier): Burned timber, iron veins, lootable crates, and patrolling Gloom Stalkers.',
      discovered: false,
    },
    {
      id: 'abandoned_homestead',
      name: 'The Ashen Ruins — Homestead',
      zoneLabel: 'Zone 2',
      x: 820,
      y: 1760,
      radius: 400,
      dangerLevel: 2,
      description: 'Zone 2 (Mid-Tier): Collapsed cabins, supply caches, and a trapped Sharpshooter calling for aid.',
      discovered: false,
    },
    {
      id: 'sunken_ruins',
      name: 'The Old Radio Outpost',
      zoneLabel: 'Zone 4',
      x: 2440,
      y: 480,
      radius: 420,
      dangerLevel: 4,
      description: 'Zone 4 (Endgame Mystery): Ruined relay facility tied to the village CRT, rich in Ancient Shards, blueprints, and story logs.',
      discovered: false,
    },
    {
      id: 'hollow_cavern',
      name: 'The Sunken Mire & Deep Pines',
      zoneLabel: 'Zone 3',
      x: 620,
      y: 420,
      radius: 380,
      dangerLevel: 3,
      description: 'Zone 3 (High-Risk): Thick fog, glowing herbs, Ancient Shard crystal clusters, and a trapped Master Blacksmith.',
      discovered: false,
    },
    {
      id: 'watchers_ridge',
      name: "Watcher's Ridge",
      zoneLabel: 'Zone 3',
      x: 2420,
      y: 1860,
      radius: 420,
      dangerLevel: 3,
      description: 'Zone 3 (High-Risk): Wind-scoured cliffs overlooking the village where ancient shrines and pale silhouettes linger.',
      discovered: false,
    },
    {
      id: 'blighted_barrens',
      name: 'Blighted Barrens',
      zoneLabel: 'Zone 4',
      x: 1620,
      y: 2140,
      radius: 460,
      dangerLevel: 4,
      description: 'Zone 4 (Outer Wilds): Corrupted wastes where Timber Brutes, Banshee Howlers, and Aberrations gather before nightfall.',
      discovered: false,
    },
  ];

  // Preserve iconic landmarks: Central CRT Outpost (clear sandbag frame), Village Hearth, Cabins, Benches, Streetlamps + starter Brazier
  const structures: Structure[] = [
    {
      id: 'lm-crt-tv',
      type: 'crt_tv',
      name: 'Central Broadcast CRT Outpost',
      x: cx,
      y: cy - 110,
      width: 96,
      height: 52,
      tier: 1,
      hp: 450,
      maxHp: 450,
      blocksMovement: true,
      lightRadius: 225,
      attackRange: 0,
      attackDamage: 0,
      attackCooldown: 0,
      prodTimer: 0,
      isCoreLandmark: true,
      hitFlash: 0,
      destroyed: false,
      buildProgress: 1,
    },
    {
      id: 'lm-campfire',
      type: 'campfire',
      name: 'Village Core',
      x: cx,
      y: cy + 36,
      width: 46,
      height: 46,
      tier: 1,
      hp: 300,
      maxHp: 300,
      blocksMovement: false,
      lightRadius: 290,
      attackRange: 0,
      attackDamage: 0,
      attackCooldown: 0,
      prodTimer: 0,
      isCoreLandmark: false,
      hitFlash: 0,
      destroyed: false,
    },
    {
      id: 'lm-house-west',
      type: 'house',
      name: 'West Outpost House',
      x: cx - 220,
      y: cy - 95,
      width: 112,
      height: 76,
      tier: 1,
      hp: 360,
      maxHp: 360,
      blocksMovement: true,
      lightRadius: 150,
      attackRange: 0,
      attackDamage: 0,
      attackCooldown: 0,
      prodTimer: 0,
      isCoreLandmark: true,
      hitFlash: 0,
      destroyed: false,
    },
    {
      id: 'lm-house-east',
      type: 'house',
      name: 'East Provision House',
      x: cx + 225,
      y: cy - 95,
      width: 112,
      height: 76,
      tier: 1,
      hp: 360,
      maxHp: 360,
      blocksMovement: true,
      lightRadius: 150,
      attackRange: 0,
      attackDamage: 0,
      attackCooldown: 0,
      prodTimer: 0,
      isCoreLandmark: true,
      hitFlash: 0,
      destroyed: false,
    },
    {
      id: 'lm-house-south',
      type: 'shelter',
      name: 'Old Watch Shelter',
      x: cx - 190,
      y: cy + 165,
      width: 102,
      height: 70,
      tier: 1,
      hp: 320,
      maxHp: 320,
      blocksMovement: true,
      lightRadius: 140,
      attackRange: 0,
      attackDamage: 0,
      attackCooldown: 0,
      prodTimer: 0,
      isCoreLandmark: false,
      hitFlash: 0,
      destroyed: false,
    },
    {
      id: 'lm-bench-1',
      type: 'bench',
      name: 'Plaza Bench West',
      x: cx - 120,
      y: cy + 28,
      width: 58,
      height: 22,
      tier: 1,
      hp: 100,
      maxHp: 100,
      blocksMovement: false,
      lightRadius: 0,
      attackRange: 0,
      attackDamage: 0,
      attackCooldown: 0,
      prodTimer: 0,
      hitFlash: 0,
      destroyed: false,
    },
    {
      id: 'lm-bench-2',
      type: 'bench',
      name: 'Plaza Bench East',
      x: cx + 132,
      y: cy + 22,
      width: 58,
      height: 22,
      tier: 1,
      hp: 100,
      maxHp: 100,
      blocksMovement: false,
      lightRadius: 0,
      attackRange: 0,
      attackDamage: 0,
      attackCooldown: 0,
      prodTimer: 0,
      hitFlash: 0,
      destroyed: false,
    },
    {
      id: 'lm-torch-center',
      type: 'torch_post',
      name: 'Plaza Streetlamp',
      x: cx + 82,
      y: cy - 68,
      width: 24,
      height: 24,
      tier: 1,
      hp: 110,
      maxHp: 110,
      blocksMovement: false,
      lightRadius: 240,
      attackRange: 0,
      attackDamage: 0,
      attackCooldown: 0,
      prodTimer: 0,
      hitFlash: 0,
      destroyed: false,
    },
    {
      id: 'lm-torch-west',
      type: 'torch_post',
      name: 'West Gate Lantern',
      x: cx - 320,
      y: cy + 20,
      width: 24,
      height: 24,
      tier: 1,
      hp: 110,
      maxHp: 110,
      blocksMovement: false,
      lightRadius: 220,
      attackRange: 0,
      attackDamage: 0,
      attackCooldown: 0,
      prodTimer: 0,
      hitFlash: 0,
      destroyed: false,
    },
    {
      id: 'lm-torch-east',
      type: 'torch_post',
      name: 'East Gate Lantern',
      x: cx + 320,
      y: cy + 20,
      width: 24,
      height: 24,
      tier: 1,
      hp: 110,
      maxHp: 110,
      blocksMovement: false,
      lightRadius: 220,
      attackRange: 0,
      attackDamage: 0,
      attackCooldown: 0,
      prodTimer: 0,
      hitFlash: 0,
      destroyed: false,
    },
    {
      id: 'lm-storage',
      type: 'storage',
      name: 'Village Supply Cache',
      x: cx + 160,
      y: cy + 145,
      width: 60,
      height: 44,
      tier: 1,
      hp: 190,
      maxHp: 190,
      blocksMovement: true,
      lightRadius: 0,
      attackRange: 0,
      attackDamage: 0,
      attackCooldown: 0,
      prodTimer: 0,
      hitFlash: 0,
      destroyed: false,
    },
    // Open perimeter by default so player strategically places Arrow Towers, Flame Towers & Barricade Walls!
    // Abandoned Homestead ruined houses
    {
      id: 'ruin-home-1',
      type: 'house',
      name: 'Abandoned Cabin',
      x: 790,
      y: 1710,
      width: 104,
      height: 70,
      tier: 1,
      hp: 140,
      maxHp: 260,
      blocksMovement: true,
      lightRadius: 0,
      attackRange: 0,
      attackDamage: 0,
      attackCooldown: 0,
      prodTimer: 0,
      hitFlash: 0,
      destroyed: false,
    },
    {
      id: 'ruin-home-2',
      type: 'house',
      name: 'Collapsed Barn',
      x: 940,
      y: 1830,
      width: 108,
      height: 72,
      tier: 1,
      hp: 110,
      maxHp: 260,
      blocksMovement: true,
      lightRadius: 0,
      attackRange: 0,
      attackDamage: 0,
      attackCooldown: 0,
      prodTimer: 0,
      hitFlash: 0,
      destroyed: false,
    },
  ];

  // Named AI Villagers carrying forward familiar characters from the village!
  const villagerBlueprints: Array<{
    name: string;
    role: VillagerRole;
    headShape: 'round' | 'square';
    accessory: Villager['accessory'];
    tint: string;
    dx: number;
    dy: number;
    courage: number;
    skills: Villager['skills'];
  }> = [
    {
      name: 'Orin',
      role: 'BUILDER',
      headShape: 'square',
      accessory: 'cap',
      tint: '#cdc9bf',
      dx: -92,
      dy: -16,
      courage: 52,
      skills: { combat: 35, building: 94, foraging: 86, medicine: 20 },
    },
    {
      name: 'Talia',
      role: 'BUILDER',
      headShape: 'round',
      accessory: 'scarf',
      tint: '#d5d1c7',
      dx: 98,
      dy: 88,
      courage: 50,
      skills: { combat: 32, building: 90, foraging: 84, medicine: 25 },
    },
    {
      name: 'Ivo',
      role: 'FORAGER',
      headShape: 'round',
      accessory: 'scarf',
      tint: '#c6c3bb',
      dx: -175,
      dy: 68,
      courage: 48,
      skills: { combat: 30, building: 82, foraging: 92, medicine: 20 },
    },
    {
      name: 'Nora',
      role: 'FORAGER',
      headShape: 'square',
      accessory: 'none',
      tint: '#d0cdc4',
      dx: 168,
      dy: -18,
      courage: 46,
      skills: { combat: 30, building: 80, foraging: 90, medicine: 20 },
    },
    {
      name: 'Bram',
      role: 'GUARD',
      headShape: 'square',
      accessory: 'helm',
      tint: '#c3c0b8',
      dx: -55,
      dy: -155,
      courage: 86,
      skills: { combat: 85, building: 35, foraging: 30, medicine: 20 },
    },
    {
      name: 'Mina',
      role: 'SHARPSHOOTER',
      headShape: 'round',
      accessory: 'hood',
      tint: '#c4c1b9',
      dx: 145,
      dy: 32,
      courage: 82,
      skills: { combat: 82, building: 35, foraging: 40, medicine: 25 },
    },
  ];

  const villagers: Villager[] = villagerBlueprints.map((vb, idx) => ({
    id: `vil-${idx + 1}`,
    name: vb.name,
    role: vb.role,
    headShape: vb.headShape,
    accessory: vb.accessory,
    bodyTint: vb.tint,
    x: cx + vb.dx,
    y: cy + vb.dy,
    vx: 0,
    vy: 0,
    facing: idx % 2 === 0 ? 1 : -1,
    radius: 14,
    hp: vb.role === 'GUARD' || vb.role === 'SHARPSHOOTER' ? 105 : 75,
    maxHp: vb.role === 'GUARD' || vb.role === 'SHARPSHOOTER' ? 105 : 75,
    stamina: 100,
    hunger: 100,
    fear: 6,
    courage: vb.courage,
    skills: vb.skills,
    homeX: cx + (idx % 2 === 0 ? -190 : 195),
    homeY: cy + (idx % 3 === 0 ? 135 : -55),
    task: 'IDLE',
    intentLabel: vb.role === 'GUARD' || vb.role === 'SHARPSHOOTER' ? 'Guarding perimeter' : 'Gathering timber',
    targetPos: null,
    targetEntityId: null,
    attackCooldown: 0,
    workTimer: 0,
    decisionCooldown: 0.08 * idx,
    hitFlash: 0,
    walkCycle: rand() * Math.PI * 2,
    carriedWood: 0,
    carriedFood: 0,
    carryingLogs: idx === 0, // Start one worker actively hauling logs so economy reads immediately on frame 1!
    hammerAnim: 0,
    memories: [],
    alive: true,
  }));

  const resourceNodes: ResourceNode[] = [];
  let nodeIdCounter = 1;

  const isTooCloseToVillageCore = (x: number, y: number, pad = 290) =>
    Math.hypot(x - cx, y - cy) < pad;

  const isOverlappingExisting = (x: number, y: number, minDist = 56) => {
    for (const s of structures) {
      if (Math.hypot(x - s.x, y - s.y) < Math.max(s.width, s.height) * 0.65 + minDist * 0.5) {
        return true;
      }
    }
    for (const n of resourceNodes) {
      if (Math.hypot(x - n.x, y - n.y) < minDist) return true;
    }
    return false;
  };

  const addNode = (
    kind: ResourceNode['kind'],
    name: string,
    x: number,
    y: number,
    opts?: { clueId?: string }
  ) => {
    const region = getRegionAt(regions, x, y).id;
    const isTree = kind === 'pine_tree' || kind === 'dead_tree';
    const isRock = kind === 'stone_boulder' || kind === 'metal_vein' || kind === 'crystal_outcrop';
    const isDeer = kind === 'wild_deer';
    const isClue = kind === 'clue_monolith';
    const isCrate = kind === 'supply_crate';

    resourceNodes.push({
      id: `node-${nodeIdCounter++}`,
      kind,
      name,
      region,
      x,
      y,
      radius: isTree ? 22 : isRock ? 20 : isDeer ? 16 : 18,
      hp: isRock ? 70 : isTree ? 55 : isDeer ? 45 : isCrate || isClue ? 1 : 24,
      maxHp: isRock ? 70 : isTree ? 55 : isDeer ? 45 : isCrate || isClue ? 1 : 24,
      depleted: false,
      respawnTimer: 0,
      blocksMovement: isTree || isRock || isClue,
      hitFlash: 0,
      vx: 0,
      vy: 0,
      clueId: opts?.clueId,
      looted: false,
    });
  };

  // Starter nearby trees & boulders right around the clearing so autonomous workers visibly chop & haul Gold immediately!
  const starterNodes: Array<[ResourceNode['kind'], string, number, number]> = [
    ['pine_tree', 'Ashen Pine', cx - 285, cy - 35],
    ['pine_tree', 'Ashen Pine', cx - 310, cy + 95],
    ['pine_tree', 'Ashen Pine', cx - 240, cy - 235],
    ['pine_tree', 'Ashen Pine', cx + 275, cy + 165],
    ['pine_tree', 'Ashen Pine', cx + 295, cy - 185],
    ['stone_boulder', 'Granite Outcrop', cx + 315, cy - 55],
    ['stone_boulder', 'Granite Outcrop', cx + 325, cy + 95],
    ['stone_boulder', 'Granite Outcrop', cx - 85, cy + 265],
  ];
  for (const [kind, name, x, y] of starterNodes) {
    addNode(kind, name, x, y);
  }

  // Place Story / Mystery Clue Monoliths & Notes across the 7 regions
  const cluePlacements: Array<[string, string, number, number]> = [
    ['clue_crt_tape', 'Taped Note behind CRT', cx + 52, cy - 105],
    ['clue_forest_marks', 'Clawed Pine Trunk', 920, 740],
    ['clue_homestead_log', 'Homestead Ledger', 855, 1745],
    ['clue_quarry_shard', 'Humming Vein Inscription', 2390, 1080],
    ['clue_ruins_relay', 'Broken Signal Relay', 2440, 480],
    ['clue_cavern_nest', 'Hollow Cavern Husks', 625, 435],
    ['clue_ridge_note', 'Surveyor Cairn', 2420, 1850],
  ];
  for (const [clueId, name, x, y] of cluePlacements) {
    addNode('clue_monolith', name, x, y, { clueId });
  }

  // Procedurally populate every region with purposeful resources
  const spawnInDisk = (
    centerX: number,
    centerY: number,
    radius: number,
    count: number,
    kind: ResourceNode['kind'],
    label: string,
    minDist = 66
  ) => {
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 8) {
      attempts++;
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * radius;
      const x = Math.max(90, Math.min(worldWidth - 90, centerX + Math.cos(a) * d));
      const y = Math.max(90, Math.min(worldHeight - 90, centerY + Math.sin(a) * d));
      if (isTooCloseToVillageCore(x, y, 340)) continue;
      if (isOverlappingExisting(x, y, minDist)) continue;
      addNode(kind, label, x, y);
      placed++;
    }
  };

  // Whispering Forest (NW & W)
  spawnInDisk(920, 760, 480, 38, 'pine_tree', 'Tall Pine', 74);
  spawnInDisk(920, 760, 460, 12, 'berry_bush', 'Wild Berries', 62);
  spawnInDisk(920, 760, 440, 10, 'herb_patch', 'Medicinal Herbs', 62);
  spawnInDisk(940, 820, 420, 6, 'wild_deer', 'Forest Deer', 95);

  // Shattered Quarry (E)
  spawnInDisk(2380, 1080, 430, 26, 'stone_boulder', 'Quarry Boulder', 72);
  spawnInDisk(2420, 1080, 380, 14, 'metal_vein', 'Iron Ore Vein', 78);
  spawnInDisk(2450, 1120, 320, 4, 'crystal_outcrop', 'Resonant Crystal', 95);

  // Abandoned Homestead (SW)
  spawnInDisk(840, 1760, 380, 12, 'dead_tree', 'Blighted Timber', 78);
  spawnInDisk(840, 1760, 310, 7, 'supply_crate', 'Salvage Crate', 88);
  spawnInDisk(840, 1760, 360, 6, 'herb_patch', 'Overgrown Herbs', 68);

  // Sunken Relay Ruins (NE)
  spawnInDisk(2440, 480, 390, 14, 'stone_boulder', 'Ruined Masonry', 78);
  spawnInDisk(2440, 480, 350, 7, 'metal_vein', 'Salvage Relay Steel', 85);
  spawnInDisk(2440, 480, 300, 5, 'crystal_outcrop', 'Signal Shard', 92);
  spawnInDisk(2440, 480, 280, 4, 'supply_crate', 'Relay Footlocker', 92);

  // Hollow Cavern (far NW)
  spawnInDisk(620, 420, 330, 14, 'stone_boulder', 'Cavern Slate', 74);
  spawnInDisk(620, 420, 290, 9, 'metal_vein', 'Deep Iron Seam', 78);
  spawnInDisk(620, 420, 240, 6, 'crystal_outcrop', 'Pale Cave Shard', 86);

  // Watcher's Ridge (SE) & Blighted Barrens (S)
  spawnInDisk(2420, 1860, 400, 16, 'dead_tree', 'Twisted Pine', 82);
  spawnInDisk(2420, 1860, 340, 9, 'stone_boulder', 'Ridge Stone', 78);
  spawnInDisk(1620, 2120, 460, 18, 'dead_tree', 'Ash Trunk', 86);
  spawnInDisk(1620, 2120, 420, 10, 'metal_vein', 'Charred Ore', 92);
  spawnInDisk(1620, 2120, 360, 4, 'supply_crate', 'Lost Expedition Crate', 110);

  // Scatter outer ambient trees & berries around mid-ring so no stretch feels empty
  spawnInDisk(cx, cy, 1150, 26, 'pine_tree', 'Outskirts Pine', 95);
  spawnInDisk(cx, cy, 1050, 10, 'berry_bush', 'Roadside Berries', 90);
  spawnInDisk(cx, cy, 1100, 8, 'stone_boulder', 'Field Stone', 95);

  const initialDiscoveries: DiscoveryEntry[] = [
    {
      id: 'disc-intro',
      title: 'Arrival in Ashen Village',
      region: 'ashen_village',
      dayFound: 1,
      body: 'You woke beside the hearth as morning mist cleared. The villagers brace for sundown. Gather wood, stone, and food by day—reinforce the perimeter before dark.',
    },
  ];

  return {
    version: 2,
    seed,
    worldWidth,
    worldHeight,
    villageCenter: { x: cx, y: cy },
    day: 1,
    minuteOfDay: 480,
    phase: 'DAY',
    weather: 'CLEAR',
    weatherTimer: 95,
    gold: 85,
    coreHp: 300,
    coreMaxHp: 300,
    villageLevel: 1,
    wavesCleared: 0,
    dayTimeRemaining: 45,
    nextHireKind: 'WORKER',
    gameOver: false,
    gameOverReason: null,
    alarmActive: false,
    alarmTimer: 0,
    crtBroadcast: 'DEFEND THE CORE',
    crtFlicker: 0,
    horrorBanner: null,
    hitstopTimer: 0,
    cameraShake: 0,
    nightSpawnTimer: 2,
    horrorEventCooldown: 30,
    monstersSlain: 0,
    structuresBuilt: 0,
    villageStock: {
      wood: 10,
      stone: 6,
      metal: 2,
      fiber: 6,
      food: 8,
      herbs: 3,
      rare_shard: 0,
      artifact: 0,
    },
    player: {
      x: cx - 58,
      y: cy + 86, // Open central plaza beside hearth facing clearly toward CRT
      vx: 0,
      vy: 0,
      aimAngle: -Math.PI / 3,
      facing: 1,
      radius: 15,
      hp: 100,
      maxHp: 100,
      stamina: 100,
      maxStamina: 100,
      hunger: 92,
      maxHunger: 100,
      lanternFuel: 100,
      lanternOn: true,
      dodgeTimer: 0,
      dodgeCooldown: 0,
      dodgeVx: 0,
      dodgeVy: 0,
      attackPhase: 'idle',
      attackTimer: 0,
      attackCooldown: 0,
      attackAngle: 0,
      attackHitIds: [],
      hitFlash: 0,
      invulnTimer: 0,
      walkCycle: 0,
      noiseLevel: 0,
      xp: 0,
      level: 1,
      equippedWeaponId: 'wooden_spear',
      weapons: [
        { id: 'wooden_spear', durability: 70, maxDurability: 70 },
        { id: 'wood_axe', durability: 95, maxDurability: 95 },
      ],
      weaponMastery: {
        wooden_spear: { xp: 0, level: 1 },
        wood_axe: { xp: 0, level: 1 },
      },
      dashStrikeWindow: 0,
      rootedTimer: 0,
      consumables: {
        cooked_ration: 2,
        bandage: 2,
        lantern_oil: 1,
        trap_kit: 0,
      },
      resources: {
        wood: 18,
        stone: 10,
        metal: 3,
        fiber: 8,
        food: 5,
        herbs: 3,
        rare_shard: 1,
        artifact: 0,
      },
      unlockedRecipes: [
        'craft_wooden_spear',
        'craft_wood_axe',
        'craft_hunting_bow',
        'craft_bandage',
        'craft_ration',
        'craft_lantern_oil',
        'craft_iron_sword',
      ],
      selectedBuildType: null,
      alive: true,
    },
    villagers,
    monsters: [],
    structures,
    resourceNodes,
    projectiles: [],
    droppedItems: [],
    footprints: [],
    floatingNotices: [],
    regions,
    discoveries: initialDiscoveries,
    eventLog: [
      {
        id: 'ev-start',
        day: 1,
        timeText: formatGameTime(450),
        text: 'Dawn breaks over Ashen Village. Explore nearby woods, fortify the perimeter, and prepare for Night Wave 1.',
        severity: 'info',
      },
    ],
    audioQueue: [],
    wave: {
      waveNumber: 1,
      phase: 'CALM',
      direction: 'N',
      telegraphTimer: 0,
      remainingToSpawn: 0,
      bossActive: false,
      bossName: null,
      bossId: null,
    },
    bossesDefeated: [],
    darknessSurgeTimer: 0,
    celebrationTimer: 0,
    lightningArcs: [],
    soundWaves: [],
    rootZones: [],
    smokePuffs: [],
    fleeingBirds: [],
    merchant: {
      active: false,
      x: cx + 96,
      y: cy + 208,
      lastVisitDay: 0,
      offers: buildMerchantOffers(1),
    },
    trappedSurvivors: [
      {
        id: 'surv-lira',
        name: 'Lira',
        role: 'HERBALIST',
        region: 'whispering_forest',
        x: 860,
        y: 740,
        state: 'TRAPPED',
        hp: 90,
        maxHp: 90,
        walkCycle: 0,
        facing: 1,
      },
      {
        id: 'surv-garrick',
        name: 'Garrick',
        role: 'SHARPSHOOTER',
        region: 'abandoned_homestead',
        x: 840,
        y: 1790,
        state: 'TRAPPED',
        hp: 105,
        maxHp: 105,
        walkCycle: 0,
        facing: 1,
      },
      {
        id: 'surv-doran',
        name: 'Doran',
        role: 'BLACKSMITH',
        region: 'hollow_cavern',
        x: 680,
        y: 520,
        state: 'TRAPPED',
        hp: 120,
        maxHp: 120,
        walkCycle: 0,
        facing: 1,
      },
    ] as TrappedSurvivor[],
    shrines: [
      {
        id: 'shrine-blood-moon',
        relicId: 'blood_moon_pact',
        name: 'Altar of the Blood Moon',
        region: 'shattered_quarry',
        x: 2210,
        y: 1040,
        rewardText: '+50% weapon damage permanently.',
        consequenceText: 'Tonight’s incoming monster wave is doubled.',
        used: false,
      },
      {
        id: 'shrine-watchers-eye',
        relicId: 'watchers_eye',
        name: "Shrine of the Watcher's Eye",
        region: 'sunken_ruins',
        x: 2340,
        y: 590,
        rewardText: 'Reveals hidden Gloom Stalkers & crystal shards on map.',
        consequenceText: 'Supernatural creatures detect you from 40% farther.',
        used: false,
      },
      {
        id: 'shrine-ashen-resurrection',
        relicId: 'ashen_resurrection',
        name: 'Cairn of Ashen Resurrection',
        region: 'watchers_ridge',
        x: 2280,
        y: 1740,
        rewardText: 'Revives a fallen villager (or grants +30 Max HP).',
        consequenceText: 'Summons an immediate timber-brute ambush.',
        used: false,
      },
    ] as CursedShrine[],
    activeRelics: [],
  };
}
