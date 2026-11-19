import React from 'react';
import { GameWorld } from '../game/types';

interface PauseModalProps {
  open: boolean;
  onResume: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  open,
  onResume,
  onRestart,
  onReturnTitle,
}) => {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Game paused"
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4 font-hud"
    >
      <div className="w-full max-w-xs bg-[#0f151c] border border-[#3c4d5b] rounded-lg p-5 space-y-2.5 text-xs shadow-2xl">
        <h2 className="font-pixel text-lg font-bold tracking-wider text-[#eef5f0] pb-2 border-b border-[#24313b]">
          Paused
        </h2>
        <button
          type="button"
          onClick={onResume}
          className="w-full py-2.5 font-semibold rounded bg-[#8ef6e4] text-[#0e141b] hover:bg-[#b5fbf0]"
        >
          Resume
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="w-full py-2.5 rounded border border-[#3e4e5c] text-[#e1e9e5] hover:border-[#ffd966] hover:text-[#ffd966]"
        >
          Restart Village
        </button>
        <button
          type="button"
          onClick={onReturnTitle}
          className="w-full py-2.5 rounded border border-[#3e4e5c] text-[#c5d2da] hover:border-[#8ef6e4]"
        >
          Title Screen
        </button>
      </div>
    </div>
  );
};

interface GameOverModalProps {
  world: GameWorld;
  onTryAgain: () => void;
  onReturnTitle: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  world,
  onTryAgain,
  onReturnTitle,
}) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Village Overrun"
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4 font-hud"
    >
      <div className="w-full max-w-sm bg-[#121014] border-2 border-[#a83c3c] rounded-lg p-6 space-y-5 shadow-2xl">
        <div className="text-center">
          <div className="text-[11px] font-bold tracking-[0.22em] uppercase text-[#e66a64]">
            {world.gameOverReason === 'colony_wiped' ? 'All Defenders Fallen' : 'Village Core Destroyed'}
          </div>
          <h2 className="mt-1 font-pixel text-3xl font-bold tracking-wider text-[#f7c8c4]">
            VILLAGE OVERRUN
          </h2>
          <p className="mt-1.5 text-xs text-[#b8c2c8]">
            The monsters breached the square and extinguished the Village Core. Fortify faster and expand your towers.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center border-y border-[#2d2529] py-3.5">
          <div>
            <div className="text-xl font-bold text-[#eef5f0] tabular-nums">{world.day}</div>
            <div className="text-[10px] uppercase tracking-wider text-[#99a6ae]">Days</div>
          </div>
          <div>
            <div className="text-xl font-bold text-[#8ef6e4] tabular-nums">{world.wavesCleared}</div>
            <div className="text-[10px] uppercase tracking-wider text-[#99a6ae]">Waves</div>
          </div>
          <div>
            <div className="text-xl font-bold text-[#ffd966] tabular-nums">{world.monstersSlain}</div>
            <div className="text-[10px] uppercase tracking-wider text-[#99a6ae]">Slain</div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            data-start="true"
            onClick={onTryAgain}
            className="w-full py-2.5 text-sm font-bold rounded bg-[#8ef6e4] text-[#0e141b] hover:bg-[#b5fbf0]"
          >
            Try Again
          </button>
          <button
            type="button"
            onClick={onReturnTitle}
            className="w-full py-2 text-xs rounded border border-[#455059] text-[#dce5e8] hover:border-[#ffd966]"
          >
            Title Screen
          </button>
        </div>
      </div>
    </div>
  );
};
