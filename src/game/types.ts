export type Vec2 = { x: number; y: number };

export type DayPhase = 'DAWN' | 'DAY' | 'EVENING' | 'NIGHT';
export type WeatherType = 'CLEAR' | 'FOG' | 'RAIN' | 'STORM';
export type CardinalDirection = 'N' | 'E' | 'S' | 'W';

export type RegionId =
  | 'ashen_village'
  | 'whispering_forest'
  | 'shattered_quarry'
  | 'abandoned_homestead'
  | 'sunken_ruins'
  | 'hollow_cavern'
  | 'watchers_ridge'
  | 'blighted_barrens';

export type ResourceKey =
  | 'wood'
  | 'stone'
  | 'metal'
  | 'fiber'
  | 'food'
  | 'herbs'
  | 'rare_shard'
  | 'artifact';

export type WeaponId =
  | 'fists'
  | 'wooden_spear'
  | 'wood_axe'
  | 'hunting_bow'
  | 'iron_sword'
  | 'heavy_crossbow'
  | 'resonance_blade';

export type ConsumableId = 'cooked_ration' | 'bandage' | 'lantern_oil' | 'trap_kit';

export type StructureType =
  | 'wooden_wall'
  | 'stone_wall'
  | 'barricade'
  | 'watchtower'
  | 'brazier_beacon'
  | 'tesla_pylon'
  | 'tar_trap'
  | 'spike_trap'
  | 'gate'
  | 'storage'
  | 'farm'
  | 'workshop'
  | 'blacksmith'
  | 'medical_station'
  | 'torch_post'
  | 'turret'
  | 'shelter'
  | 'crt_tv'
  | 'house'
  | 'bench'
  | 'campfire';

export type VillagerRole =
  | 'GUARD'
  | 'BUILDER'
  | 'FORAGER'
  | 'MEDIC'
  | 'SCOUT'
  | 'CITIZEN'
  | 'SHARPSHOOTER'
  | 'BLACKSMITH'
  | 'HERBALIST';

export type VillagerTask =
  | 'IDLE'
  | 'GATHERING'
  | 'BUILDING'
  | 'REPAIRING'
  | 'PATROLLING'
  | 'GUARDING'
  | 'SHELTERING'
  | 'FIGHTING'
  | 'HEALING'
  | 'FLEEING'
  | 'EATING'
  | 'INVESTIGATING'
  | 'MANNING_TOWER'
  | 'CELEBRATING';

export type MonsterType =
  | 'CRAWLER'
  | 'STALKER'
  | 'BRUTE'
  | 'HOWLER'
  | 'MIMIC'
  | 'WATCHER'
  | 'UNKNOWN'
  | 'PALE_STAG'
  | 'ROOTBOUND_WARDEN';

export type MonsterAIState =
  | 'PATROL'
  | 'STALK'
  | 'PURSUE'
  | 'SIEGE'
  | 'HOWL'
  | 'TELEGRAPH'
  | 'ATTACK'
  | 'DISGUISED'
  | 'OBSERVE'
  | 'RETREAT'
  | 'CHARGE'
  | 'SUMMON'
  | 'DYING';

export type ResourceNodeKind =
  | 'pine_tree'
  | 'dead_tree'
  | 'stone_boulder'
  | 'metal_vein'
  | 'berry_bush'
  | 'herb_patch'
  | 'supply_crate'
  | 'clue_monolith'
  | 'wild_deer'
  | 'crystal_outcrop';

export type RelicId = 'blood_moon_pact' | 'watchers_eye' | 'ashen_resurrection';

export interface WeaponInstance {
  id: WeaponId;
  durability: number;
  maxDurability: number;
}

export interface WeaponMasteryEntry {
  xp: number;
  level: number;
}

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  aimAngle: number;
  facing: 1 | -1;
  radius: number;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  hunger: number;
  maxHunger: number;
  lanternFuel: number;
  lanternOn: boolean;
  dodgeTimer: number;
  dodgeCooldown: number;
  dodgeVx: number;
  dodgeVy: number;
  dashStrikeWindow?: number;
  rootedTimer?: number;
  attackPhase: 'idle' | 'windup' | 'active' | 'recovery';
  attackTimer: number;
  attackCooldown: number;
  attackAngle: number;
  attackHitIds: string[];
  hitFlash: number;
  invulnTimer: number;
  walkCycle: number;
  noiseLevel: number;
  xp: number;
  level: number;
  equippedWeaponId: WeaponId;
  weapons: WeaponInstance[];
  weaponMastery?: Partial<Record<WeaponId, WeaponMasteryEntry>>;
  consumables: Record<ConsumableId, number>;
  resources: Record<ResourceKey, number>;
  unlockedRecipes: string[];
  selectedBuildType: StructureType | null;
  alive: boolean;
}

export interface VillagerMemory {
  day: number;
  text: string;
  fearImpact: number;
}

export interface Villager {
  id: string;
  name: string;
  role: VillagerRole;
  headShape: 'round' | 'square';
  accessory: 'none' | 'tophat' | 'cap' | 'scarf' | 'glasses' | 'helm' | 'hood' | 'apron';
  bodyTint: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  radius: number;
  hp: number;
  maxHp: number;
  stamina: number;
  hunger: number;
  fear: number;
  courage: number;
  skills: {
    combat: number;
    building: number;
    foraging: number;
    medicine: number;
  };
  homeX: number;
  homeY: number;
  task: VillagerTask;
  intentLabel: string;
  targetPos: Vec2 | null;
  targetEntityId: string | null;
  assignedTowerId?: string | null;
  attackCooldown: number;
  workTimer: number;
  decisionCooldown: number;
  hitFlash: number;
  walkCycle: number;
  carriedWood: number;
  carriedFood: number;
  carryingLogs?: boolean;
  hammerAnim?: number;
  memories: VillagerMemory[];
  alive: boolean;
  bubble?: { text: string; ttl: number; tone: 'glyph' | 'alert' | 'speech' };
}

export interface Monster {
  id: string;
  type: MonsterType;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  detectionRange: number;
  hearingRange: number;
  state: MonsterAIState;
  stateTimer: number;
  telegraphDuration: number;
  attackCooldown: number;
  targetId: string | null;
  targetKind: 'player' | 'villager' | 'structure' | null;
  lastKnownPos: Vec2 | null;
  patrolOrigin: Vec2;
  hitFlash: number;
  animPhase: number;
  deathTimer: number;
  mimicDisguiseName?: string;
  mimicRevealed?: boolean;
  hasAttackToken: boolean;
  // Tactical status effects & boss state
  visibility?: number; // 0..1 (Gloom Stalker stealth in darkness vs revealed in light)
  tarredTimer?: number;
  burningTimer?: number;
  stunTimer?: number;
  buffTimer?: number;
  slowedByLight?: boolean;
  isBoss?: boolean;
  bossPhase?: 1 | 2 | 3;
  bossAbilityTimer?: number;
  chargeDir?: Vec2 | null;
}

export interface Structure {
  id: string;
  type: StructureType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tier: 1 | 2 | 3;
  hp: number;
  maxHp: number;
  blocksMovement: boolean;
  isOpen?: boolean;
  lightRadius: number;
  attackRange: number;
  attackDamage: number;
  attackCooldown: number;
  prodTimer: number;
  storedFood?: number;
  isCoreLandmark?: boolean;
  hitFlash: number;
  destroyed: boolean;
  // Construction animation, tower occupancy, & brazier fuel
  buildProgress?: number; // 0..1 (1 = completed)
  assignedVillagerId?: string | null;
  fuel?: number; // 0..100 for brazier_beacon
  aimAngle?: number;
}

export interface ResourceNode {
  id: string;
  kind: ResourceNodeKind;
  name: string;
  region: RegionId;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  depleted: boolean;
  respawnTimer: number;
  blocksMovement: boolean;
  hitFlash: number;
  vx?: number;
  vy?: number;
  clueId?: string;
  looted?: boolean;
}

export interface Projectile {
  id: string;
  owner: 'player' | 'villager' | 'turret' | 'monster';
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  ttl: number;
  color: string;
  radius: number;
  pierce?: boolean;
  isFire?: boolean;
}

export interface DroppedItem {
  id: string;
  x: number;
  y: number;
  resource?: ResourceKey;
  consumable?: ConsumableId;
  amount: number;
  ttl: number;
}

export interface FootprintDecal {
  x: number;
  y: number;
  angle: number;
  kind: 'human' | 'monster' | 'claw';
  alpha: number;
}

export interface FloatingNotice {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  ttl: number;
}

export interface LightningArc {
  points: Vec2[];
  ttl: number;
}

export interface SoundWaveRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  ttl: number;
}

export interface RootZone {
  id: string;
  x: number;
  y: number;
  radius: number;
  ttl: number;
}

export interface SmokePuff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
  ttl: number;
}

export interface FleeingBird {
  x: number;
  y: number;
  vx: number;
  vy: number;
  flap: number;
  ttl: number;
}

export interface WaveState {
  waveNumber: number;
  phase: 'CALM' | 'TELEGRAPH' | 'ACTIVE' | 'CLEARED';
  direction: CardinalDirection;
  telegraphTimer: number;
  remainingToSpawn: number;
  bossActive: boolean;
  bossName: string | null;
  bossId: string | null;
}

export interface MerchantOffer {
  id: string;
  name: string;
  description: string;
  cost: Partial<Record<ResourceKey, number>>;
  rewardResource?: { key: ResourceKey; amount: number };
  rewardConsumable?: { id: ConsumableId; amount: number };
  rewardWeapon?: WeaponId;
  unlockRecipeId?: string;
  purchased?: boolean;
}

export interface MerchantState {
  active: boolean;
  x: number;
  y: number;
  lastVisitDay: number;
  offers: MerchantOffer[];
}

export interface TrappedSurvivor {
  id: string;
  name: string;
  role: 'BLACKSMITH' | 'SHARPSHOOTER' | 'HERBALIST';
  region: RegionId;
  x: number;
  y: number;
  state: 'TRAPPED' | 'ESCORTING' | 'RECRUITED';
  hp: number;
  maxHp: number;
  walkCycle: number;
  facing: 1 | -1;
}

export interface CursedShrine {
  id: string;
  relicId: RelicId;
  name: string;
  region: RegionId;
  x: number;
  y: number;
  rewardText: string;
  consequenceText: string;
  used: boolean;
}

export interface DiscoveryEntry {
  id: string;
  title: string;
  region: RegionId;
  dayFound: number;
  body: string;
}

export interface RegionMeta {
  id: RegionId;
  name: string;
  zoneLabel?: string;
  x: number;
  y: number;
  radius: number;
  dangerLevel: number;
  description: string;
  discovered: boolean;
}

export interface WorldEventLog {
  id: string;
  day: number;
  timeText: string;
  text: string;
  severity: 'info' | 'warning' | 'horror' | 'combat';
}

export interface GameSettings {
  filmGrain: boolean;
  fogEffects: boolean;
  showTouchControls: 'auto' | 'always' | 'off';
  masterVol: number;
  ambientVol: number;
  sfxVol: number;
}

export interface InputState {
  moveX: number;
  moveY: number;
  sprint: boolean;
  aimWorldX: number;
  aimWorldY: number;
  aimActive: boolean;
  attackPressed: boolean;
  attackHeld: boolean;
  interactPressed: boolean;
  dodgePressed: boolean;
  quickEquipPressed: boolean;
}

export interface AudioEvent {
  kind:
    | 'swing'
    | 'bow'
    | 'hit_flesh'
    | 'hit_wood'
    | 'hit_stone'
    | 'hurt'
    | 'dodge'
    | 'pickup'
    | 'build'
    | 'alarm'
    | 'howl'
    | 'watcher'
    | 'crt_static'
    | 'heal'
    | 'footstep'
    | 'lightning'
    | 'fire_ignite'
    | 'boss_roar'
    | 'merchant_bell'
    | 'shrine'
    | 'rescue';
}

export interface GameWorld {
  version: number;
  seed: number;
  worldWidth: number;
  worldHeight: number;
  villageCenter: Vec2;
  day: number;
  minuteOfDay: number; // 0..1439 (360 = 6:00 AM, 1080 = 6:00 PM, 1200 = 8:00 PM)
  phase: DayPhase;
  weather: WeatherType;
  weatherTimer: number;
  alarmActive: boolean;
  alarmTimer: number;
  crtBroadcast: string;
  crtFlicker: number;
  horrorBanner: { text: string; ttl: number } | null;
  hitstopTimer: number;
  cameraShake: number;
  nightSpawnTimer: number;
  horrorEventCooldown: number;
  monstersSlain: number;
  structuresBuilt: number;
  villageStock: Record<ResourceKey, number>;
  player: PlayerState;
  villagers: Villager[];
  monsters: Monster[];
  structures: Structure[];
  resourceNodes: ResourceNode[];
  projectiles: Projectile[];
  droppedItems: DroppedItem[];
  footprints: FootprintDecal[];
  floatingNotices: FloatingNotice[];
  regions: RegionMeta[];
  discoveries: DiscoveryEntry[];
  eventLog: WorldEventLog[];
  audioQueue: AudioEvent[];
  // Expansion systems
  wave: WaveState;
  bossesDefeated: string[];
  darknessSurgeTimer: number;
  celebrationTimer: number;
  lightningArcs: LightningArc[];
  soundWaves: SoundWaveRing[];
  rootZones: RootZone[];
  smokePuffs: SmokePuff[];
  fleeingBirds: FleeingBird[];
  merchant: MerchantState;
  trappedSurvivors: TrappedSurvivor[];
  shrines: CursedShrine[];
  activeRelics: RelicId[];
  // Mobile Tower Defense & Autonomous Colony fields
  gold: number;
  coreHp: number;
  coreMaxHp: number;
  villageLevel: number;
  wavesCleared: number;
  dayTimeRemaining: number;
  nextHireKind: 'WORKER' | 'GUARD';
  gameOver: boolean;
  gameOverReason: 'core_destroyed' | 'colony_wiped' | null;
}
