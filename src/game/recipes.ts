import { ConsumableId, ResourceKey, StructureType, WeaponId } from './types';

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  tierLabel: 'Primitive' | 'Iron' | 'Shard-Forged';
  role: string;
  masteryPerk: string;
  damage: number;
  range: number;
  arcRad: number;
  ranged: boolean;
  projectileSpeed?: number;
  staminaCost: number;
  windup: number;
  active: number;
  recovery: number;
  cooldown: number;
  maxDurability: number;
  gatherWoodBonus: number;
  gatherStoneBonus: number;
  noise: number;
}

export const WEAPON_SPECS: Record<WeaponId, WeaponSpec> = {
  fists: {
    id: 'fists',
    name: 'Bare Hands',
    tierLabel: 'Primitive',
    role: 'Close Brawl',
    masteryPerk: 'Lv 3: Quick Dash-Jab',
    damage: 10,
    range: 42,
    arcRad: 1.4,
    ranged: false,
    staminaCost: 6,
    windup: 0.08,
    active: 0.1,
    recovery: 0.14,
    cooldown: 0.34,
    maxDurability: 9999,
    gatherWoodBonus: 1,
    gatherStoneBonus: 0.6,
    noise: 14,
  },
  wooden_spear: {
    id: 'wooden_spear',
    name: 'Wooden Spear',
    tierLabel: 'Primitive',
    role: 'Long Reach Thrust',
    masteryPerk: 'Lv 3: Lunge Dash-Strike (1.8x DMG)',
    damage: 22,
    range: 72,
    arcRad: 0.9,
    ranged: false,
    staminaCost: 11,
    windup: 0.1,
    active: 0.12,
    recovery: 0.16,
    cooldown: 0.42,
    maxDurability: 70,
    gatherWoodBonus: 1.2,
    gatherStoneBonus: 0.8,
    noise: 20,
  },
  wood_axe: {
    id: 'wood_axe',
    name: 'Iron-Head Axe',
    tierLabel: 'Iron',
    role: 'Heavy Cleave & Timber',
    masteryPerk: 'Lv 3: Staggering Dash-Cleave',
    damage: 28,
    range: 56,
    arcRad: 1.8,
    ranged: false,
    staminaCost: 14,
    windup: 0.16,
    active: 0.12,
    recovery: 0.2,
    cooldown: 0.54,
    maxDurability: 95,
    gatherWoodBonus: 2.8,
    gatherStoneBonus: 1.6,
    noise: 34,
  },
  hunting_bow: {
    id: 'hunting_bow',
    name: 'Hunting Bow',
    tierLabel: 'Primitive',
    role: 'Silent Ranged Shot',
    masteryPerk: 'Lv 3: 3-Arrow Fan Volley',
    damage: 24,
    range: 390,
    arcRad: 0.2,
    ranged: true,
    projectileSpeed: 560,
    staminaCost: 10,
    windup: 0.14,
    active: 0.06,
    recovery: 0.16,
    cooldown: 0.46,
    maxDurability: 85,
    gatherWoodBonus: 0.6,
    gatherStoneBonus: 0.5,
    noise: 12,
  },
  iron_sword: {
    id: 'iron_sword',
    name: 'Forged Sword',
    tierLabel: 'Iron',
    role: 'Fast Wide Slash',
    masteryPerk: 'Lv 3: Whirling Dash-Slash',
    damage: 36,
    range: 66,
    arcRad: 2.05,
    ranged: false,
    staminaCost: 12,
    windup: 0.1,
    active: 0.12,
    recovery: 0.14,
    cooldown: 0.38,
    maxDurability: 140,
    gatherWoodBonus: 1.5,
    gatherStoneBonus: 1.0,
    noise: 28,
  },
  heavy_crossbow: {
    id: 'heavy_crossbow',
    name: 'Heavy Crossbow',
    tierLabel: 'Iron',
    role: 'Piercing Siege Bolt',
    masteryPerk: 'Lv 3: Twin Piercing Fire Bolts',
    damage: 54,
    range: 460,
    arcRad: 0.15,
    ranged: true,
    projectileSpeed: 720,
    staminaCost: 14,
    windup: 0.2,
    active: 0.06,
    recovery: 0.28,
    cooldown: 0.82,
    maxDurability: 120,
    gatherWoodBonus: 0.6,
    gatherStoneBonus: 0.5,
    noise: 38,
  },
  resonance_blade: {
    id: 'resonance_blade',
    name: 'Resonance Blade',
    tierLabel: 'Shard-Forged',
    role: 'Shard Edge · Ignites & Disrupts Shadows',
    masteryPerk: 'Lv 3: Arcing Resonance Slash',
    damage: 64,
    range: 78,
    arcRad: 2.4,
    ranged: false,
    staminaCost: 11,
    windup: 0.09,
    active: 0.14,
    recovery: 0.14,
    cooldown: 0.35,
    maxDurability: 240,
    gatherWoodBonus: 2.2,
    gatherStoneBonus: 2.2,
    noise: 22,
  },
};

export interface CraftingRecipe {
  id: string;
  name: string;
  category: 'weapon' | 'survival' | 'defense';
  description: string;
  cost: Partial<Record<ResourceKey, number>>;
  requiresStructure?: StructureType;
  startsUnlocked: boolean;
  outputWeapon?: WeaponId;
  outputConsumable?: { id: ConsumableId; amount: number };
}

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  {
    id: 'craft_wooden_spear',
    name: 'Wooden Spear',
    category: 'weapon',
    description: 'Primitive polearm to keep Shadow Crawlers at bay.',
    cost: { wood: 5, fiber: 2 },
    startsUnlocked: true,
    outputWeapon: 'wooden_spear',
  },
  {
    id: 'craft_wood_axe',
    name: 'Iron-Head Axe',
    category: 'weapon',
    description: 'Chops trees 2.8x faster and cleaves heavy timber armor.',
    cost: { wood: 4, stone: 3, metal: 1 },
    startsUnlocked: true,
    outputWeapon: 'wood_axe',
  },
  {
    id: 'craft_hunting_bow',
    name: 'Hunting Bow',
    category: 'weapon',
    description: 'Quiet ranged bow for hunting deer and sniping Banshee Howlers.',
    cost: { wood: 6, fiber: 5 },
    startsUnlocked: true,
    outputWeapon: 'hunting_bow',
  },
  {
    id: 'craft_bandage',
    name: 'Herbal Bandage',
    category: 'survival',
    description: 'Restores 42 HP and steadies wounds.',
    cost: { fiber: 2, herbs: 2 },
    startsUnlocked: true,
    outputConsumable: { id: 'bandage', amount: 2 },
  },
  {
    id: 'craft_ration',
    name: 'Cooked Ration',
    category: 'survival',
    description: 'Restores 45 Hunger, 30 Stamina, and 10 HP.',
    cost: { food: 2, wood: 1 },
    startsUnlocked: true,
    outputConsumable: { id: 'cooked_ration', amount: 2 },
  },
  {
    id: 'craft_lantern_oil',
    name: 'Lantern Fuel Flask',
    category: 'survival',
    description: 'Refills portable lantern to pierce fog & expose Gloom Stalkers.',
    cost: { herbs: 1, wood: 2, fiber: 1 },
    startsUnlocked: true,
    outputConsumable: { id: 'lantern_oil', amount: 1 },
  },
  {
    id: 'craft_iron_sword',
    name: 'Forged Iron Sword',
    category: 'weapon',
    description: 'Iron-tier sweeping blade with fast recovery.',
    cost: { metal: 5, wood: 2, stone: 2 },
    startsUnlocked: true,
    outputWeapon: 'iron_sword',
  },
  {
    id: 'craft_heavy_crossbow',
    name: 'Heavy Crossbow',
    category: 'weapon',
    description: 'Piercing bolt launcher that staggers Brutes & bosses. Unlock via Workshop, Blacksmith, or Outpost.',
    cost: { wood: 8, metal: 6, fiber: 4 },
    requiresStructure: 'workshop',
    startsUnlocked: false,
    outputWeapon: 'heavy_crossbow',
  },
  {
    id: 'craft_resonance_blade',
    name: 'Resonance Blade',
    category: 'weapon',
    description: 'Shard-forged blade that ignites tarred foes & wounds Aberrations.',
    cost: { metal: 6, rare_shard: 3 },
    requiresStructure: 'blacksmith',
    startsUnlocked: false,
    outputWeapon: 'resonance_blade',
  },
];

export const HIRE_UNIT_COST = 40;
export function getVillageUpgradeCost(currentLevel: number): number {
  return 100 + Math.max(0, currentLevel - 1) * 60;
}

export interface StructureBlueprint {
  type: StructureType;
  name: string;
  role: string;
  upgradeNote: string;
  width: number;
  height: number;
  maxHp: number;
  blocksMovement: boolean;
  lightRadius: number;
  attackRange: number;
  attackDamage: number;
  goldCost: number;
  cost: Partial<Record<ResourceKey, number>>;
  upgradeCostTier2: Partial<Record<ResourceKey, number>>;
  upgradeCostTier3: Partial<Record<ResourceKey, number>>;
}

export const BUILDABLE_STRUCTURES: StructureBlueprint[] = [
  {
    type: 'watchtower',
    name: 'Arrow Tower',
    role: 'Automatically fires long-range arrows at approaching monsters',
    upgradeNote: 'Scales with Village Level',
    width: 56,
    height: 56,
    maxHp: 220,
    blocksMovement: true,
    lightRadius: 200,
    attackRange: 390,
    attackDamage: 24,
    goldCost: 30,
    cost: { wood: 10, stone: 5 },
    upgradeCostTier2: { stone: 8, metal: 4 },
    upgradeCostTier3: { stone: 12, metal: 6, rare_shard: 2 },
  },
  {
    type: 'brazier_beacon',
    name: 'Flame Tower',
    role: 'Illuminates darkness, reveals & slows shadows, and fires burning bolts',
    upgradeNote: 'Scales with Village Level',
    width: 40,
    height: 40,
    maxHp: 190,
    blocksMovement: true,
    lightRadius: 320,
    attackRange: 310,
    attackDamage: 18,
    goldCost: 50,
    cost: { wood: 5, stone: 3, fiber: 2 },
    upgradeCostTier2: { stone: 5, metal: 3 },
    upgradeCostTier3: { stone: 8, metal: 4, rare_shard: 1 },
  },
  {
    type: 'tesla_pylon',
    name: 'Tesla Pylon',
    role: 'Arcs chain lightning across multiple monsters & briefly stuns them',
    upgradeNote: 'Scales with Village Level',
    width: 44,
    height: 44,
    maxHp: 210,
    blocksMovement: true,
    lightRadius: 165,
    attackRange: 300,
    attackDamage: 30,
    goldCost: 80,
    cost: { stone: 6, metal: 4, rare_shard: 2 },
    upgradeCostTier2: { metal: 6, rare_shard: 3 },
    upgradeCostTier3: { metal: 8, rare_shard: 5 },
  },
  {
    type: 'tar_trap',
    name: 'Tar Trap',
    role: 'Slows monsters 50% & ignites when struck by fire',
    upgradeNote: 'Scales with Village Level',
    width: 54,
    height: 40,
    maxHp: 90,
    blocksMovement: false,
    lightRadius: 0,
    attackRange: 44,
    attackDamage: 6,
    goldCost: 25,
    cost: { wood: 3, fiber: 2 },
    upgradeCostTier2: { wood: 4, stone: 2 },
    upgradeCostTier3: { stone: 4, rare_shard: 1 },
  },
  {
    type: 'barricade',
    name: 'Barricade Wall',
    role: 'Blocks approaching monsters and deals spike damage to attackers',
    upgradeNote: 'Scales with Village Level',
    width: 66,
    height: 28,
    maxHp: 220,
    blocksMovement: true,
    lightRadius: 0,
    attackRange: 0,
    attackDamage: 16,
    goldCost: 20,
    cost: { wood: 4, fiber: 2 },
    upgradeCostTier2: { wood: 4, metal: 2 },
    upgradeCostTier3: { stone: 6, metal: 4 },
  },
  {
    type: 'wooden_wall',
    name: 'Wooden Wall',
    role: 'Sturdy perimeter wall',
    upgradeNote: 'Scales with Village Level',
    width: 68,
    height: 28,
    maxHp: 210,
    blocksMovement: true,
    lightRadius: 0,
    attackRange: 0,
    attackDamage: 0,
    goldCost: 20,
    cost: { wood: 5 },
    upgradeCostTier2: { wood: 6, stone: 4 },
    upgradeCostTier3: { stone: 10, metal: 2 },
  },
  {
    type: 'gate',
    name: 'Village Gate',
    role: 'Auto-locks at dusk',
    upgradeNote: 'Scales with Village Level',
    width: 74,
    height: 26,
    maxHp: 220,
    blocksMovement: true,
    lightRadius: 0,
    attackRange: 0,
    attackDamage: 0,
    goldCost: 25,
    cost: { wood: 7, metal: 1 },
    upgradeCostTier2: { wood: 6, metal: 3 },
    upgradeCostTier3: { stone: 8, metal: 5 },
  },
  {
    type: 'spike_trap',
    name: 'Spike Trap',
    role: 'Impales & slows monsters',
    upgradeNote: 'Scales with Village Level',
    width: 44,
    height: 44,
    maxHp: 80,
    blocksMovement: false,
    lightRadius: 0,
    attackRange: 34,
    attackDamage: 28,
    goldCost: 20,
    cost: { wood: 3, stone: 2 },
    upgradeCostTier2: { metal: 2, stone: 2 },
    upgradeCostTier3: { metal: 4, rare_shard: 1 },
  },
  {
    type: 'torch_post',
    name: 'Lantern Post',
    role: 'Warm streetlamp to push back night fog',
    upgradeNote: 'Scales with Village Level',
    width: 24,
    height: 24,
    maxHp: 90,
    blocksMovement: false,
    lightRadius: 230,
    attackRange: 0,
    attackDamage: 0,
    goldCost: 15,
    cost: { wood: 3, fiber: 2 },
    upgradeCostTier2: { metal: 2, stone: 2 },
    upgradeCostTier3: { metal: 3, rare_shard: 1 },
  },
  {
    type: 'turret',
    name: 'Crossbow Turret',
    role: 'Automated perimeter sentry',
    upgradeNote: 'Scales with Village Level',
    width: 46,
    height: 46,
    maxHp: 195,
    blocksMovement: true,
    lightRadius: 115,
    attackRange: 330,
    attackDamage: 28,
    goldCost: 45,
    cost: { wood: 8, metal: 5, stone: 4 },
    upgradeCostTier2: { metal: 7, rare_shard: 2 },
    upgradeCostTier3: { metal: 10, rare_shard: 3 },
  },
  {
    type: 'farm',
    name: 'Crop Plot',
    role: 'Harvest spot for workers',
    upgradeNote: 'Scales with Village Level',
    width: 78,
    height: 54,
    maxHp: 95,
    blocksMovement: false,
    lightRadius: 0,
    attackRange: 0,
    attackDamage: 0,
    goldCost: 30,
    cost: { wood: 5, fiber: 3 },
    upgradeCostTier2: { wood: 6, stone: 3 },
    upgradeCostTier3: { wood: 8, stone: 6, herbs: 3 },
  },
  {
    type: 'medical_station',
    name: 'Medical Tent',
    role: 'Heals nearby defenders',
    upgradeNote: 'Scales with Village Level',
    width: 76,
    height: 56,
    maxHp: 170,
    blocksMovement: true,
    lightRadius: 155,
    attackRange: 0,
    attackDamage: 0,
    goldCost: 50,
    cost: { wood: 8, fiber: 5, herbs: 3 },
    upgradeCostTier2: { wood: 6, herbs: 6, metal: 2 },
    upgradeCostTier3: { stone: 8, herbs: 8, rare_shard: 2 },
  },
  {
    type: 'workshop',
    name: 'Workshop',
    role: 'Speeds up worker building',
    upgradeNote: 'Scales with Village Level',
    width: 82,
    height: 58,
    maxHp: 215,
    blocksMovement: true,
    lightRadius: 145,
    attackRange: 0,
    attackDamage: 0,
    goldCost: 60,
    cost: { wood: 10, stone: 5, metal: 2 },
    upgradeCostTier2: { stone: 8, metal: 5 },
    upgradeCostTier3: { stone: 12, metal: 8 },
  },
  {
    type: 'blacksmith',
    name: 'Blacksmith Forge',
    role: 'Strengthens guards',
    upgradeNote: 'Scales with Village Level',
    width: 86,
    height: 62,
    maxHp: 265,
    blocksMovement: true,
    lightRadius: 195,
    attackRange: 0,
    attackDamage: 0,
    goldCost: 70,
    cost: { stone: 10, metal: 5, wood: 6 },
    upgradeCostTier2: { stone: 10, metal: 8, rare_shard: 1 },
    upgradeCostTier3: { stone: 14, metal: 10, rare_shard: 3 },
  },
  {
    type: 'storage',
    name: 'Supply Cache',
    role: 'Village storehouse',
    upgradeNote: 'Scales with Village Level',
    width: 58,
    height: 44,
    maxHp: 175,
    blocksMovement: true,
    lightRadius: 0,
    attackRange: 0,
    attackDamage: 0,
    goldCost: 35,
    cost: { wood: 7, stone: 2 },
    upgradeCostTier2: { wood: 8, metal: 3 },
    upgradeCostTier3: { stone: 10, metal: 5 },
  },
  {
    type: 'shelter',
    name: 'Fortified Shelter',
    role: 'Timber cabin refuge',
    upgradeNote: 'Scales with Village Level',
    width: 96,
    height: 68,
    maxHp: 330,
    blocksMovement: true,
    lightRadius: 145,
    attackRange: 0,
    attackDamage: 0,
    goldCost: 45,
    cost: { wood: 12, stone: 8 },
    upgradeCostTier2: { stone: 12, metal: 4 },
    upgradeCostTier3: { stone: 18, metal: 8 },
  },
];

export const STRUCTURE_BLUEPRINT_MAP: Record<string, StructureBlueprint> = Object.fromEntries(
  BUILDABLE_STRUCTURES.map((b) => [b.type, b])
);

export const RESOURCE_LABELS: Record<ResourceKey, string> = {
  wood: 'Wood',
  stone: 'Stone',
  metal: 'Metal',
  fiber: 'Fiber',
  food: 'Food',
  herbs: 'Herbs',
  rare_shard: 'Ancient Shard',
  artifact: 'Artifact',
};

export function hasResources(
  pool: Record<ResourceKey, number>,
  cost: Partial<Record<ResourceKey, number>>
): boolean {
  for (const [k, amt] of Object.entries(cost)) {
    if ((pool[k as ResourceKey] ?? 0) < (amt ?? 0)) return false;
  }
  return true;
}

export function spendResources(
  pool: Record<ResourceKey, number>,
  cost: Partial<Record<ResourceKey, number>>
): void {
  for (const [k, amt] of Object.entries(cost)) {
    pool[k as ResourceKey] = Math.max(0, (pool[k as ResourceKey] ?? 0) - (amt ?? 0));
  }
}
