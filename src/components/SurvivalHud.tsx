import React from 'react';
import { getVillageUpgradeCost, HIRE_UNIT_COST, STRUCTURE_BLUEPRINT_MAP } from '../game/recipes';
import { GameWorld, StructureType } from '../game/types';

interface SurvivalHudProps {
  world: GameWorld;
  muted: boolean;
  onToggleMute: () => void;
  onOpenPause: () => void;
  onSelectBuild: (type: StructureType) => void;
  onCancelBuild: () => void;
  onHireColonist: () => void;
  onUpgradeVillage: () => void;
}

function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const SurvivalHud: React.FC<SurvivalHudProps> = ({
  world,
  muted,
  onToggleMute,
  onOpenPause,
  onSelectBuild,
  onCancelBuild,
  onHireColonist,
  onUpgradeVillage,
}) => {
  const isNight = world.phase === 'NIGHT';
  const activeBoss =
    world.wave.bossActive && world.wave.bossId
      ? world.monsters.find((m) => m.id === world.wave.bossId && m.state !== 'DYING') ?? null
      : null;

  const corePct = Math.max(0, Math.min(1, world.coreHp / Math.max(1, world.coreMaxHp)));
  const totalSegments = 16;
  const filledSegments = Math.round(corePct * totalSegments);
  const coreSegColor =
    corePct > 0.55 ? 'bg-[#8ef6e4]' : corePct > 0.28 ? 'bg-[#ffd166]' : 'bg-[#f05d5e]';

  const workersAlive = world.villagers.filter(
    (v) => v.alive && v.role !== 'GUARD' && v.role !== 'SHARPSHOOTER' && v.role !== 'SCOUT'
  ).length;
  const guardsAlive = world.villagers.filter(
    (v) => v.alive && (v.role === 'GUARD' || v.role === 'SHARPSHOOTER' || v.role === 'SCOUT')
  ).length;
  const activeMonsters = world.monsters.filter((m) => m.state !== 'DYING' && m.type !== 'WATCHER').length;
  const remainingWave = activeMonsters + (isNight ? world.wave.remainingToSpawn : 0);

  const arrowCost = STRUCTURE_BLUEPRINT_MAP.watchtower.goldCost;
  const flameCost = STRUCTURE_BLUEPRINT_MAP.brazier_beacon.goldCost;
  const wallCost = STRUCTURE_BLUEPRINT_MAP.barricade.goldCost;
  const upgradeCost = getVillageUpgradeCost(world.villageLevel);
  const selectedBuild = world.player.selectedBuildType;
  const nextHireLabel = world.nextHireKind === 'WORKER' ? 'Hire Worker' : 'Hire Guard';

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none font-hud text-[#eef4f1]">
      {/* TOP BAR: Minimal Mobile-First HUD */}
      <div className="flex items-start justify-between gap-2 p-2.5 md:p-4">
        {/* Top-Left: Day / Wave Timer + Compact Colony Counts */}
        <div className="pointer-events-auto bg-[#0e141b]/88 border border-[#32414e] px-2.5 py-1.5 md:px-3.5 md:py-2 rounded shadow-lg">
          <div className="flex items-center gap-2 text-xs md:text-sm font-semibold tracking-wide whitespace-nowrap">
            <span className="text-[#eef4f1]">Day {world.day}</span>
            <span className="text-[#566876]">·</span>
            {isNight ? (
              <span className="text-[#ff8a80] tabular-nums">
                Night Wave {world.wave.waveNumber}
              </span>
            ) : (
              <span className="text-[#8ef6e4] tabular-nums">
                Night in {formatCountdown(world.dayTimeRemaining)}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-[#b4c4ce] tabular-nums whitespace-nowrap">
            <span className="inline-flex items-center gap-1" title="Autonomous Workers">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 13l5-5M9.5 3.5l3 3-2 2-3-3 2-2z" stroke="#ffd166" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {workersAlive}
            </span>
            <span className="inline-flex items-center gap-1" title="Perimeter Guards">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 2l5 2v4c0 3.2-2.2 5.2-5 6-2.8-.8-5-2.8-5-6V4l5-2z" stroke="#8ef6e4" strokeWidth="1.5" />
              </svg>
              {guardsAlive}
            </span>
            {isNight && (
              <span className="inline-flex items-center gap-1 text-[#ff9b92]" title="Remaining Monsters">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="5" stroke="#ff7a70" strokeWidth="1.5" />
                  <circle cx="6.2" cy="7.5" r="1" fill="#ff7a70" />
                  <circle cx="9.8" cy="7.5" r="1" fill="#ff7a70" />
                </svg>
                {remainingWave}
              </span>
            )}
          </div>
        </div>

        {/* Top-Right: Unified Gold Counter + Sound & Pause Icons */}
        <div className="pointer-events-auto flex items-center gap-1.5 md:gap-2">
          <div
            data-testid="gold-counter"
            className="flex items-center gap-1.5 bg-[#0e141b]/90 border border-[#6e5a2c] px-2.5 py-1.5 md:px-3.5 md:py-2 rounded shadow-lg whitespace-nowrap"
          >
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true" className="shrink-0">
              <circle cx="9" cy="9" r="7.5" fill="#f2b830" stroke="#7a510c" strokeWidth="1.4" />
              <circle cx="9" cy="9" r="4.6" fill="#ffd966" />
              <text x="9" y="12" textAnchor="middle" fill="#6b4308" fontSize="8" fontWeight="bold">G</text>
            </svg>
            <span className="text-xs md:text-sm font-bold text-[#ffd966] tabular-nums">
              {world.gold} Gold
            </span>
          </div>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            className="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center bg-[#0e141b]/90 border border-[#32414e] hover:border-[#8ef6e4] rounded text-[#d6e2e8] shrink-0"
          >
            {muted ? (
              <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M4 7.5h3.5L12 4v12l-4.5-3.5H4v-5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M14.5 7.5l3.5 5M18 7.5l-3.5 5" stroke="#ff8a80" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M4 7.5h3.5L12 4v12l-4.5-3.5H4v-5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M14.8 7.2a4 4 0 010 5.6M16.8 5.2a6.8 6.8 0 010 9.6" stroke="#8ef6e4" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenPause}
            aria-label="Pause game"
            className="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center bg-[#0e141b]/90 border border-[#32414e] hover:border-[#8ef6e4] rounded text-[#d6e2e8] shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <rect x="4" y="3" width="3.5" height="12" rx="1" fill="currentColor" />
              <rect x="10.5" y="3" width="3.5" height="12" rx="1" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>

      {/* TOP-CENTER STACK: Night Alarm / Boss Bar + Segmented Village Core Health Bar */}
      <div className="fixed top-[66px] md:top-3.5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 w-[min(92vw,370px)] pointer-events-none">
        {activeBoss ? (
          <div className="w-full bg-[#1a0d10]/92 border border-[#d64545] px-3 py-1.5 rounded shadow-lg">
            <div className="flex items-center justify-between text-[11px] font-bold tracking-wider uppercase">
              <span className="text-[#ff9b92] truncate">{activeBoss.name}</span>
              <span className="text-[#ffd966] tabular-nums">
                {Math.max(0, Math.ceil(activeBoss.hp))}/{activeBoss.maxHp}
              </span>
            </div>
            <div className="mt-1 h-2 w-full bg-[#2a1416] overflow-hidden rounded-sm">
              <div
                className="h-full bg-[#e64a4a]"
                style={{ width: `${Math.max(0, (activeBoss.hp / activeBoss.maxHp) * 100)}%` }}
              />
            </div>
          </div>
        ) : (isNight || world.alarmActive) ? (
          <div className="bg-[#230e11]/92 border border-[#b84444] px-3 py-1 rounded text-[10px] md:text-[11px] font-bold tracking-[0.14em] uppercase text-[#ff8e88] text-center shadow-lg whitespace-nowrap">
            VILLAGE ALARM — MONSTERS AT THE PERIMETER
          </div>
        ) : null}

        {/* Segmented Village Core Health Bar */}
        <div
          data-testid="core-hp-bar"
          className="flex items-center gap-2 bg-[#0e141b]/90 border border-[#32414e] px-3 py-1.5 rounded shadow-lg"
        >
          <span className="text-[11px] md:text-xs font-semibold tracking-wide text-[#dbe8ee] whitespace-nowrap">
            Village Core
          </span>
          <div className="flex items-center gap-[2px]" aria-label={`Village Core ${Math.ceil(world.coreHp)} of ${world.coreMaxHp}`}>
            {Array.from({ length: totalSegments }).map((_, idx) => (
              <span
                key={idx}
                className={`w-[5px] md:w-[6px] h-3 rounded-[1px] ${
                  idx < filledSegments ? coreSegColor : 'bg-[#222c36]'
                }`}
              />
            ))}
          </div>
          <span className="text-[11px] font-semibold text-[#ffd966] tabular-nums whitespace-nowrap">
            Lv {world.villageLevel}
          </span>
        </div>
      </div>

      {/* PLACEMENT HINT PILL (only while placing a blueprint) */}
      {selectedBuild && (
        <div className="fixed bottom-[106px] md:bottom-[118px] left-1/2 -translate-x-1/2 pointer-events-auto flex items-center gap-3 bg-[#0d1922]/94 border border-[#72f2ff] px-3.5 py-1.5 rounded shadow-lg text-xs">
          <span className="text-[#8ef6e4] font-medium whitespace-nowrap">
            Tap ground to place {STRUCTURE_BLUEPRINT_MAP[selectedBuild]?.name}
          </span>
          <button
            type="button"
            onClick={onCancelBuild}
            className="px-2 py-0.5 text-[11px] font-semibold bg-[#223340] hover:bg-[#2f4556] text-[#eef4f1] rounded"
          >
            Cancel
          </button>
        </div>
      )}

      {/* BOTTOM ACTION BAR: 5 Large Touch-Friendly Tower, Worker & Upgrade Buttons */}
      <div className="fixed inset-x-0 bottom-0 p-2 md:p-3 flex justify-center pointer-events-none">
        <div
          role="toolbar"
          aria-label="Village defense actions"
          className="pointer-events-auto grid grid-cols-5 gap-1.5 md:gap-2.5 bg-[#0c1218]/92 border border-[#31414f] p-1.5 md:p-2 rounded-lg shadow-2xl w-full max-w-[680px]"
        >
          {/* 1. Build Arrow Tower (30g) */}
          <ActionCard
            label="Arrow Tower"
            cost={arrowCost}
            affordable={world.gold >= arrowCost}
            active={selectedBuild === 'watchtower'}
            accent="cyan"
            onClick={() =>
              selectedBuild === 'watchtower' ? onCancelBuild() : onSelectBuild('watchtower')
            }
            icon={
              <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <path d="M9 28L12 12h8l3 16" stroke="#b99976" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M11 23l10-6M21 23l-10-6" stroke="#856b4f" strokeWidth="1.6" />
                <rect x="8" y="8" width="16" height="5" rx="1" fill="#7d644b" stroke="#e4d6c1" strokeWidth="1.4" />
                <path d="M7 8l9-5 9 5" stroke="#8ef6e4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
          />

          {/* 2. Build Flame Tower (50g) */}
          <ActionCard
            label="Flame Tower"
            cost={flameCost}
            affordable={world.gold >= flameCost}
            active={selectedBuild === 'brazier_beacon'}
            accent="amber"
            onClick={() =>
              selectedBuild === 'brazier_beacon' ? onCancelBuild() : onSelectBuild('brazier_beacon')
            }
            icon={
              <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <path d="M11 28l2-11h6l2 11H11z" fill="#5e5b55" stroke="#c8c2b4" strokeWidth="1.4" />
                <path d="M9 17h14l-2-4H11l-2 4z" fill="#323842" stroke="#c8c2b4" strokeWidth="1.3" />
                <path d="M16 4c3 3.5 5 6 5 8.5a5 5 0 01-10 0C11 10 13 7.5 16 4z" fill="#f77f00" />
                <path d="M16 8c1.6 1.8 2.6 3.1 2.6 4.5a2.6 2.6 0 01-5.2 0c0-1.4 1-2.7 2.6-4.5z" fill="#ffd966" />
              </svg>
            }
          />

          {/* 3. Build Barricade Wall (20g) */}
          <ActionCard
            label="Barricade"
            cost={wallCost}
            affordable={world.gold >= wallCost}
            active={selectedBuild === 'barricade'}
            accent="stone"
            onClick={() =>
              selectedBuild === 'barricade' ? onCancelBuild() : onSelectBuild('barricade')
            }
            icon={
              <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <path d="M6 27V11l2-4 2 4v16M12 27V9l2-4 2 4v18M18 27V9l2-4 2 4v18M24 27V11l2-4 2 4v16" stroke="#c7b299" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="4" y="16" width="24" height="3.5" fill="#7c6348" stroke="#181c22" strokeWidth="1.2" />
              </svg>
            }
          />

          {/* 4. Hire Worker / Guard (40g) */}
          <ActionCard
            label={nextHireLabel}
            cost={HIRE_UNIT_COST}
            affordable={world.gold >= HIRE_UNIT_COST}
            active={false}
            accent="gold"
            onClick={onHireColonist}
            icon={
              world.nextHireKind === 'WORKER' ? (
                <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                  <circle cx="15" cy="11" r="5" fill="#d9d4c7" stroke="#14181e" strokeWidth="1.5" />
                  <path d="M10 10a5 5 0 0110 0H10z" fill="#6d8c54" />
                  <rect x="10" y="17" width="10" height="10" rx="2" fill="#5e7250" stroke="#14181e" strokeWidth="1.4" />
                  <path d="M22 23l5-8M24 13l4 3" stroke="#ffd966" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                  <circle cx="15" cy="11" r="5" fill="#d9d4c7" stroke="#14181e" strokeWidth="1.5" />
                  <path d="M9.5 10.5a5.5 5.5 0 0111 0H9.5z" fill="#5e6d7e" />
                  <rect x="10" y="17" width="10" height="10" rx="2" fill="#465464" stroke="#14181e" strokeWidth="1.4" />
                  <path d="M24 26V8M24 6l-2 4h4l-2-4z" stroke="#8ef6e4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )
            }
          />

          {/* 5. Upgrade Village (100g+) */}
          <ActionCard
            label="Upgrade"
            cost={upgradeCost}
            affordable={world.gold >= upgradeCost}
            active={false}
            accent="emerald"
            onClick={onUpgradeVillage}
            icon={
              <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <path d="M16 5l9 9h-5v12h-8V14H7l9-9z" fill="#ffd966" stroke="#7a510c" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            }
          />
        </div>
      </div>
    </div>
  );
};

interface ActionCardProps {
  label: string;
  cost: number;
  affordable: boolean;
  active: boolean;
  accent: 'cyan' | 'amber' | 'stone' | 'gold' | 'emerald';
  icon: React.ReactNode;
  onClick: () => void;
}

const ACCENT_BORDER: Record<ActionCardProps['accent'], string> = {
  cyan: 'border-[#4e8f99] hover:border-[#8ef6e4]',
  amber: 'border-[#966a35] hover:border-[#ffd166]',
  stone: 'border-[#52606c] hover:border-[#b7c5cf]',
  gold: 'border-[#8a7638] hover:border-[#ffd966]',
  emerald: 'border-[#4b856d] hover:border-[#8ef6e4]',
};

const ActionCard: React.FC<ActionCardProps> = ({
  label,
  cost,
  affordable,
  active,
  accent,
  icon,
  onClick,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col items-center justify-center gap-0.5 py-2 px-1 md:py-2.5 md:px-2 rounded-md border text-center min-h-[70px] md:min-h-[82px] ${
        active
          ? 'bg-[#173642] border-[#72f2ff] ring-1 ring-[#72f2ff]'
          : affordable
            ? `bg-[#141c24]/95 ${ACCENT_BORDER[accent]} active:bg-[#1c2834]`
            : 'bg-[#10151b]/80 border-[#28313a] opacity-55'
      }`}
    >
      <div className="flex items-center justify-center h-7">{icon}</div>
      <span className="text-[10px] md:text-xs font-semibold leading-tight text-[#eef4f1] truncate max-w-full">
        {label}
      </span>
      <span
        className={`text-[10px] md:text-[11px] font-bold tabular-nums ${
          affordable ? 'text-[#ffd966]' : 'text-[#8e9aa3]'
        }`}
      >
        {cost}g
      </span>
    </button>
  );
};
