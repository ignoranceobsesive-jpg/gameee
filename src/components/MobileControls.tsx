import React, { useRef, useState } from 'react';

interface MobileControlsProps {
  visible: boolean;
  onJoystickChange: (dx: number, dy: number, sprint: boolean) => void;
  onAttack: () => void;
}

export const MobileControls: React.FC<MobileControlsProps> = ({
  visible,
  onJoystickChange,
  onAttack,
}) => {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  if (!visible) return null;

  const maxRadius = 38;

  const updateStick = (clientX: number, clientY: number) => {
    const rect = baseRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }
    setKnob({ x: dx, y: dy });
    const nx = Math.abs(dx) < 5 ? 0 : dx / maxRadius;
    const ny = Math.abs(dy) < 5 ? 0 : dy / maxRadius;
    onJoystickChange(nx, ny, dist > maxRadius * 0.85);
  };

  const resetStick = () => {
    pointerIdRef.current = null;
    setKnob({ x: 0, y: 0 });
    onJoystickChange(0, 0, false);
  };

  return (
    <div className="fixed inset-x-0 bottom-[102px] z-20 pointer-events-none px-3.5 flex items-end justify-between select-none touch-none font-hud">
      {/* Left: Smooth Analog Virtual Joystick cleanly ABOVE the bottom 5-button tower bar */}
      <div
        ref={baseRef}
        aria-label="Movement joystick"
        onPointerDown={(e) => {
          pointerIdRef.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          updateStick(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (pointerIdRef.current !== e.pointerId) return;
          updateStick(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (pointerIdRef.current === e.pointerId) resetStick();
        }}
        onPointerCancel={resetStick}
        className="pointer-events-auto relative w-24 h-24 rounded-full bg-[#0e141b]/72 border-2 border-[#596d7d]/70 flex items-center justify-center touch-none shadow-lg"
      >
        <div
          className="w-10 h-10 rounded-full bg-[#8ef6e4]/85 border-2 border-[#0e141b] shadow"
          style={{
            transform: `translate3d(${knob.x}px, ${knob.y}px, 0)`,
          }}
        />
      </div>

      {/* Right: Single Clean Attack Button */}
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          onAttack();
        }}
        aria-label="Strike nearby monster"
        className="pointer-events-auto w-16 h-16 rounded-full bg-[#8ef6e4]/90 border-2 border-[#0e141b] text-xs font-bold text-[#0e141b] active:scale-95 shadow-lg flex flex-col items-center justify-center"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 19L19 5M14 5h5v5M7 13l4 4" stroke="#0e141b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[10px] leading-none mt-0.5">Strike</span>
      </button>
    </div>
  );
};
