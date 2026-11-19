import React from 'react';

interface TitleScreenProps {
  hasSave: boolean;
  onContinue: () => void;
  onNewGame: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  hasSave,
  onContinue,
  onNewGame,
}) => {
  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-7 md:p-12">
      {/* Subtle left contrast scrim for calm negative-space typography */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-y-0 left-0 w-[min(540px,100vw)] bg-gradient-to-r from-[#0d1218]/90 via-[#0d1218]/58 to-transparent"
      />

      <div className="relative z-10 max-w-md pointer-events-auto mt-6 md:mt-10">
        {/* Custom inline SVG tower emblem */}
        <div className="flex items-center gap-3 mb-3">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true" className="shrink-0">
            <rect x="4" y="4" width="28" height="28" rx="4" fill="#131c24" stroke="#8ef6e4" strokeWidth="1.5" />
            <path d="M12 29l2.5-13h7L24 29" stroke="#c9b08e" strokeWidth="2" strokeLinecap="round" />
            <rect x="11" y="12" width="14" height="4.5" rx="1" fill="#7d644b" stroke="#eef4f1" strokeWidth="1.2" />
            <path d="M10 12l8-5 8 5" stroke="#ffd966" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-hud text-xs tracking-[0.2em] text-[#b9cad2] uppercase">
            Colony Tower Defense
          </span>
        </div>

        <h1
          className="font-pixel text-4xl md:text-5xl font-bold leading-[1.06] tracking-wider text-[#eef5f0]"
          style={{ textShadow: '0 2px 14px rgba(0,0,0,0.85)' }}
        >
          VILLAGE
          <br />
          <span className="text-[#ffd966]">AFTER DARK</span>
        </h1>

        <p className="mt-3 font-hud text-xs md:text-sm leading-relaxed text-[#cfdbe0] max-w-sm">
          Guide autonomous workers, drop tower blueprints, and defend the Village Core against escalating night waves.
        </p>

        <nav aria-label="Main Menu" className="mt-8 flex flex-col items-start gap-2.5">
          {hasSave ? (
            <>
              <button
                type="button"
                data-start="true"
                onClick={onContinue}
                className="px-6 py-2.5 rounded font-hud text-sm font-bold tracking-wider text-[#0d1218] bg-[#8ef6e4] hover:bg-[#b5fbf0] whitespace-nowrap shrink-0"
              >
                Continue Defense
              </button>
              <button
                type="button"
                onClick={onNewGame}
                className="px-5 py-2 rounded font-hud text-sm tracking-wider text-[#e2eae6] border border-[#516370] bg-[#10171f]/88 hover:border-[#ffd966] hover:text-[#ffd966] whitespace-nowrap shrink-0"
              >
                New Village
              </button>
            </>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={onNewGame}
              className="px-7 py-3 rounded font-hud text-sm font-bold tracking-wider text-[#0d1218] bg-[#8ef6e4] hover:bg-[#b5fbf0] whitespace-nowrap shrink-0 shadow-lg"
            >
              Play
            </button>
          )}
        </nav>
      </div>

      {/* Minimal one-line hint without hotkey clutter */}
      <div className="relative z-10 pointer-events-none">
        <p className="font-hud text-[11px] tracking-[0.1em] text-[#c7d3d9]/85">
          Tap a tower to place · Workers gather Gold &amp; build automatically · Protect the Village Core
        </p>
      </div>
    </div>
  );
};
