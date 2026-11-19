import { GameSettings, GameWorld } from './types';

const SAVE_KEY = 'village_after_dark_td_save_v2';
const SETTINGS_KEY = 'village_after_dark_settings_v1';

export function hasSavedWorld(): boolean {
  try {
    return Boolean(localStorage.getItem(SAVE_KEY));
  } catch {
    return false;
  }
}

export function saveWorld(world: GameWorld): boolean {
  try {
    const clean: GameWorld = {
      ...world,
      audioQueue: [],
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(clean));
    return true;
  } catch {
    return false;
  }
}

export function loadWorld(): GameWorld | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameWorld;
    if (
      parsed &&
      parsed.version === 2 &&
      parsed.player &&
      Array.isArray(parsed.villagers) &&
      Array.isArray(parsed.structures) &&
      Array.isArray(parsed.resourceNodes)
    ) {
      parsed.audioQueue = [];
      parsed.gold ??= 85;
      parsed.coreHp ??= 300;
      parsed.coreMaxHp ??= 300;
      parsed.villageLevel ??= 1;
      parsed.wavesCleared ??= 0;
      parsed.dayTimeRemaining ??= 45;
      parsed.nextHireKind ??= 'WORKER';
      parsed.gameOver ??= false;
      parsed.gameOverReason ??= null;
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearSavedWorld(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function loadSettings(): GameSettings {
  const defaults: GameSettings = {
    filmGrain: true,
    fogEffects: true,
    showTouchControls: 'auto',
    masterVol: 0.6,
    ambientVol: 0.45,
    sfxVol: 0.7,
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}
