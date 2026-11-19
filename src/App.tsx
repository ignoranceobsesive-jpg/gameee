import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SoundEngine } from './audio/SoundEngine';
import { GameRenderer } from './canvas/GameRenderer';
import { MobileControls } from './components/MobileControls';
import { GameOverModal, PauseModal } from './components/PauseAndGameOverModal';
import { SurvivalHud } from './components/SurvivalHud';
import { TitleScreen } from './components/TitleScreen';
import {
  hireColonist,
  placeStructure,
  stepGameWorld,
  upgradeVillage,
} from './game/engine';
import { spawnMonster, startNightWaveTelegraph } from './game/monsterAI';
import {
  clearSavedWorld,
  hasSavedWorld,
  loadSettings,
  loadWorld,
  saveWorld,
} from './game/storage';
import { GameSettings, GameWorld, InputState, StructureType } from './game/types';
import { createInitialWorld } from './game/worldGen';

type ScreenState = 'title' | 'playing' | 'paused' | 'gameover';

function createEmptyInput(): InputState {
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

function detectTouchViewport(): boolean {
  if (typeof window === 'undefined') return false;
  const narrow = window.innerWidth < 768;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return narrow || coarse;
}

export default function App() {
  const params =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const autostart = params?.get('autostart') === '1';
  const startAtNight = params?.get('night') === '1';
  const startGameOver = params?.get('gameover') === '1';

  const initialWorldRef = useRef<GameWorld | null>(null);
  if (!initialWorldRef.current) {
    const loaded = autostart ? null : loadWorld();
    const w = loaded ?? createInitialWorld(1408);

    if (startAtNight) {
      w.day = 2;
      w.gold = 145;
      w.phase = 'NIGHT';
      w.minuteOfDay = 1320;
      w.dayTimeRemaining = 0;
      w.weather = 'RAIN';
      w.alarmActive = true;
      // Place 2 built towers + 1 active blueprint + barricade so Night Wave reads immediately!
      const cx = w.villageCenter.x;
      const cy = w.villageCenter.y;
      const t1 = placeStructure(w, 'watchtower', cx - 176, cy + 48);
      if (t1.structure) t1.structure.buildProgress = 1;
      const t2 = placeStructure(w, 'brazier_beacon', cx + 176, cy - 16);
      if (t2.structure) t2.structure.buildProgress = 1;
      placeStructure(w, 'watchtower', cx + 80, cy + 96); // Active cyan blueprint being hammered by workers!
      const wall = placeStructure(w, 'barricade', cx - 224, cy - 32);
      if (wall.structure) wall.structure.buildProgress = 1;
      w.gold = 145;
      startNightWaveTelegraph(w, 'W');
      w.wave.phase = 'ACTIVE';
      w.wave.telegraphTimer = 0;
      spawnMonster(w, 'CRAWLER', cx - 320, cy + 30);
      spawnMonster(w, 'CRAWLER', cx - 295, cy + 75);
      spawnMonster(w, 'BRUTE', cx - 355, cy - 10);
      spawnMonster(w, 'CRAWLER', cx + 310, cy + 45);
      spawnMonster(w, 'BRUTE', cx + 350, cy + 10);
    }

    if (startGameOver) {
      w.day = 3;
      w.wavesCleared = 2;
      w.monstersSlain = 24;
      w.coreHp = 0;
      w.gameOver = true;
      w.gameOverReason = 'core_destroyed';
    }

    initialWorldRef.current = w;
  }

  const worldRef = useRef<GameWorld>(initialWorldRef.current);
  const rendererRef = useRef<GameRenderer | null>(null);
  const soundRef = useRef<SoundEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [screen, setScreen] = useState<ScreenState>(
    startGameOver ? 'gameover' : autostart ? 'playing' : 'title'
  );
  const screenRef = useRef<ScreenState>(screen);
  screenRef.current = screen;

  const [settings] = useState<GameSettings>(() => loadSettings());
  const settingsRef = useRef<GameSettings>(settings);
  settingsRef.current = settings;

  const [hasSave, setHasSave] = useState<boolean>(() => hasSavedWorld());
  const [muted, setMuted] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(() => detectTouchViewport());
  const [, setHudTick] = useState(0);

  const heldKeysRef = useRef<Set<string>>(new Set());
  const joystickRef = useRef<{ dx: number; dy: number; sprint: boolean }>({
    dx: 0,
    dy: 0,
    sprint: false,
  });
  const mouseStateRef = useRef<{
    clientX: number;
    clientY: number;
    hasMoved: boolean;
    leftDown: boolean;
  }>({
    clientX: 720,
    clientY: 450,
    hasMoved: false,
    leftDown: false,
  });
  const pendingInputRef = useRef<{
    attackPressed: boolean;
    dodgePressed: boolean;
  }>({
    attackPressed: false,
    dodgePressed: false,
  });

  const forceHudSync = useCallback(() => {
    setHudTick((t) => (t + 1) % 100000);
  }, []);

  const clearAllHeldInputs = useCallback(() => {
    heldKeysRef.current.clear();
    joystickRef.current = { dx: 0, dy: 0, sprint: false };
    mouseStateRef.current.leftDown = false;
  }, []);

  useEffect(() => {
    document.body.dataset.state = screen;
  }, [screen]);

  useEffect(() => {
    const onResize = () => setIsTouchDevice(detectTouchViewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleStartContinue = useCallback(() => {
    soundRef.current?.unlock();
    soundRef.current?.playUiClick();
    const saved = loadWorld();
    if (saved && !saved.gameOver) {
      worldRef.current = saved;
    } else {
      worldRef.current = createInitialWorld(1408);
    }
    setScreen('playing');
    forceHudSync();
  }, [forceHudSync]);

  const handleStartNewWorld = useCallback(() => {
    soundRef.current?.unlock();
    soundRef.current?.playUiClick();
    clearSavedWorld();
    const fresh = createInitialWorld(Math.floor(Date.now() % 100000) + 1408);
    worldRef.current = fresh;
    saveWorld(fresh);
    setHasSave(true);
    setScreen('playing');
    forceHudSync();
  }, [forceHudSync]);

  const handleToggleMute = useCallback(() => {
    soundRef.current?.unlock();
    const next = !muted;
    setMuted(next);
    soundRef.current?.setMuted(next);
  }, [muted]);

  const handleSelectBuild = useCallback(
    (type: StructureType) => {
      soundRef.current?.unlock();
      soundRef.current?.playUiClick();
      worldRef.current.player.selectedBuildType = type;
      forceHudSync();
    },
    [forceHudSync]
  );

  const handleCancelBuild = useCallback(() => {
    worldRef.current.player.selectedBuildType = null;
    forceHudSync();
  }, [forceHudSync]);

  const handleHireColonist = useCallback(() => {
    soundRef.current?.unlock();
    hireColonist(worldRef.current);
    forceHudSync();
  }, [forceHudSync]);

  const handleUpgradeVillage = useCallback(() => {
    soundRef.current?.unlock();
    upgradeVillage(worldRef.current);
    forceHudSync();
  }, [forceHudSync]);

  const handleReturnToTitle = useCallback(() => {
    if (!worldRef.current.gameOver) {
      saveWorld(worldRef.current);
      setHasSave(true);
    }
    clearAllHeldInputs();
    worldRef.current.player.selectedBuildType = null;
    setScreen('title');
  }, [clearAllHeldInputs]);

  const handleJoystickChange = useCallback((dx: number, dy: number, sprint: boolean) => {
    soundRef.current?.unlock();
    joystickRef.current = { dx, dy, sprint };
  }, []);

  const handleTouchAttack = useCallback(() => {
    soundRef.current?.unlock();
    const w = worldRef.current;
    const p = w.player;
    if (p.selectedBuildType) {
      const tx = p.x + Math.cos(p.aimAngle) * 76;
      const ty = p.y + Math.sin(p.aimAngle) * 76;
      const res = placeStructure(w, p.selectedBuildType, tx, ty);
      if (res.ok) p.selectedBuildType = null;
      forceHudSync();
      return;
    }

    let bestAngle: number | null = null;
    let bestDist = 230;
    for (const m of w.monsters) {
      if (m.state === 'DYING') continue;
      const d = Math.hypot(m.x - p.x, m.y - p.y);
      if (d < bestDist) {
        bestDist = d;
        bestAngle = Math.atan2(m.y - p.y, m.x - p.x);
      }
    }
    if (bestAngle !== null) p.aimAngle = bestAngle;
    pendingInputRef.current.attackPressed = true;
  }, [forceHudSync]);

  // Minimal clean keyboard support (WASD / Arrows + Space dodge + Escape pause/cancel)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;

      if (screenRef.current === 'title') {
        if (code === 'Enter' || code === 'Space') {
          e.preventDefault();
          if (hasSavedWorld()) handleStartContinue();
          else handleStartNewWorld();
        }
        return;
      }

      if (screenRef.current === 'gameover') {
        if (code === 'Enter' || code === 'Space') {
          e.preventDefault();
          handleStartNewWorld();
        }
        return;
      }

      if (code === 'Space' || code === 'ArrowUp' || code === 'ArrowDown' || code === 'ArrowLeft' || code === 'ArrowRight') {
        e.preventDefault();
      }

      if (code === 'Escape') {
        e.preventDefault();
        if (worldRef.current.player.selectedBuildType) {
          worldRef.current.player.selectedBuildType = null;
          forceHudSync();
          return;
        }
        if (screenRef.current === 'playing') {
          clearAllHeldInputs();
          setScreen('paused');
        } else if (screenRef.current === 'paused') {
          setScreen('playing');
        }
        return;
      }

      if (screenRef.current !== 'playing') return;
      soundRef.current?.unlock();
      if (!e.repeat && code === 'Space') {
        pendingInputRef.current.dodgePressed = true;
      }
      heldKeysRef.current.add(code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      heldKeysRef.current.delete(e.code);
    };

    const onBlur = () => clearAllHeldInputs();
    const onVisibility = () => {
      if (document.hidden) clearAllHeldInputs();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [clearAllHeldInputs, forceHudSync, handleStartContinue, handleStartNewWorld]);

  // Mount GameRenderer + SoundEngine once and run adaptive rAF loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new GameRenderer(canvas);
    const sound = new SoundEngine();
    sound.setVolumes(settingsRef.current.masterVol, settingsRef.current.ambientVol, settingsRef.current.sfxVol);
    rendererRef.current = renderer;
    soundRef.current = sound;

    let needsPausedPaint = true;
    const resizeToContainer = () => {
      const rect = canvas.getBoundingClientRect();
      renderer.resize(rect.width || window.innerWidth, rect.height || window.innerHeight);
      needsPausedPaint = true;
    };
    resizeToContainer();

    const ro = new ResizeObserver(resizeToContainer);
    ro.observe(canvas);

    let rafId = 0;
    let timerId: number | null = null;
    let disposed = false;
    let lastTime = performance.now();
    let hudAccumulator = 0;
    let autosaveAccumulator = 0;
    let soundAtmosAccumulator = 0;

    const scheduleNext = (jsMs: number, realFrameMs: number, isIdleOverlay: boolean) => {
      if (disposed) return;
      if (isIdleOverlay) {
        timerId = window.setTimeout(() => {
          if (!disposed) rafId = window.requestAnimationFrame(tick);
        }, 240);
      } else if (jsMs > 18 || realFrameMs > 32) {
        const yieldMs = Math.min(280, Math.max(120, Math.round(jsMs * 2.2)));
        timerId = window.setTimeout(() => {
          if (!disposed) rafId = window.requestAnimationFrame(tick);
        }, yieldMs);
      } else if (jsMs > 8) {
        timerId = window.setTimeout(() => {
          if (!disposed) rafId = window.requestAnimationFrame(tick);
        }, 64);
      } else {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const tick = (now: number) => {
      if (disposed) return;
      const frameStart = performance.now();
      const realFrameMs = Math.max(1, now - lastTime);
      const rawDt = Math.min(0.05, Math.max(0.001, realFrameMs / 1000));
      lastTime = now;

      const world = worldRef.current;
      const curScreen = screenRef.current;
      const isPaused = curScreen === 'paused' || curScreen === 'gameover';
      const isTitle = curScreen === 'title';

      const input = createEmptyInput();
      let buildCursorWorld: { x: number; y: number } | null = null;

      if (curScreen === 'playing') {
        needsPausedPaint = true;
        const keys = heldKeysRef.current;
        let mx = 0;
        let my = 0;
        if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;

        const joy = joystickRef.current;
        if (Math.abs(joy.dx) > 0.05 || Math.abs(joy.dy) > 0.05) {
          mx = joy.dx;
          my = joy.dy;
        }

        input.moveX = mx;
        input.moveY = my;
        input.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || joy.sprint;

        if (mouseStateRef.current.hasMoved) {
          const wPos = renderer.screenToWorld(mouseStateRef.current.clientX, mouseStateRef.current.clientY);
          input.aimWorldX = wPos.x;
          input.aimWorldY = wPos.y;
          input.aimActive = true;
          if (world.player.selectedBuildType) {
            buildCursorWorld = wPos;
          }
        } else if (world.player.selectedBuildType) {
          buildCursorWorld = {
            x: world.player.x + Math.cos(world.player.aimAngle) * 76,
            y: world.player.y + Math.sin(world.player.aimAngle) * 76,
          };
        }

        input.attackPressed = pendingInputRef.current.attackPressed;
        input.attackHeld = mouseStateRef.current.leftDown && !world.player.selectedBuildType;
        input.dodgePressed = pendingInputRef.current.dodgePressed;
        pendingInputRef.current.attackPressed = false;
        pendingInputRef.current.dodgePressed = false;

        stepGameWorld(world, input, rawDt);

        while (world.audioQueue.length > 0) {
          const ev = world.audioQueue.shift();
          if (ev) sound.playEvent(ev);
        }

        if (world.gameOver) {
          clearAllHeldInputs();
          clearSavedWorld();
          setHasSave(false);
          setScreen('gameover');
          forceHudSync();
        }

        autosaveAccumulator += rawDt;
        if (autosaveAccumulator >= 12 && !world.gameOver) {
          autosaveAccumulator = 0;
          saveWorld(world);
          setHasSave(true);
        }
      } else if (isTitle) {
        needsPausedPaint = true;
        stepGameWorld(world, input, rawDt * 0.65);
        world.dayTimeRemaining = Math.max(15, world.dayTimeRemaining);
        world.coreHp = world.coreMaxHp;
        world.audioQueue.length = 0;
      }

      soundAtmosAccumulator += rawDt;
      if (soundAtmosAccumulator >= 0.9) {
        soundAtmosAccumulator = 0;
        sound.updateAtmosphere(
          world.phase,
          world.alarmActive,
          world.weather === 'STORM' || world.weather === 'RAIN'
        );
      }

      if (!isPaused || needsPausedPaint) {
        renderer.render(world, rawDt, isTitle, null, buildCursorWorld, settingsRef.current);
        if (isPaused) needsPausedPaint = false;
      }

      hudAccumulator += rawDt;
      if (hudAccumulator >= 0.3 && curScreen === 'playing') {
        hudAccumulator = 0;
        setHudTick((t) => (t + 1) % 100000);
      }

      const jsMs = performance.now() - frameStart;
      scheduleNext(jsMs, realFrameMs, isPaused);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(rafId);
      if (timerId !== null) window.clearTimeout(timerId);
      ro.disconnect();
      sound.dispose();
    };
  }, [clearAllHeldInputs, forceHudSync]);

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    mouseStateRef.current.clientX = e.clientX;
    mouseStateRef.current.clientY = e.clientY;
    mouseStateRef.current.hasMoved = true;
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (screen !== 'playing') return;
    soundRef.current?.unlock();

    mouseStateRef.current.clientX = e.clientX;
    mouseStateRef.current.clientY = e.clientY;
    mouseStateRef.current.hasMoved = true;

    const world = worldRef.current;

    if (e.button === 2) {
      if (world.player.selectedBuildType) {
        world.player.selectedBuildType = null;
        forceHudSync();
      }
      return;
    }

    if (e.button !== 0 && e.pointerType === 'mouse') return;

    // One-tap / click-to-place blueprint ghost directly where tapped!
    if (world.player.selectedBuildType && rendererRef.current) {
      const wPos = rendererRef.current.screenToWorld(e.clientX, e.clientY);
      const res = placeStructure(world, world.player.selectedBuildType, wPos.x, wPos.y);
      if (res.ok && !e.shiftKey) {
        world.player.selectedBuildType = null;
      }
      forceHudSync();
      return;
    }

    mouseStateRef.current.leftDown = true;
    pendingInputRef.current.attackPressed = true;
  };

  const handleCanvasPointerUp = () => {
    mouseStateRef.current.leftDown = false;
  };

  const showTouchControls = screen === 'playing' && isTouchDevice;
  const world = worldRef.current;

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#10161d] select-none">
      <canvas
        ref={canvasRef}
        data-testid="game-canvas"
        onPointerMove={handleCanvasPointerMove}
        onPointerDown={handleCanvasPointerDown}
        onPointerUp={handleCanvasPointerUp}
        onPointerLeave={handleCanvasPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        className={`block w-full h-full touch-none ${
          screen === 'playing'
            ? world.player.selectedBuildType
              ? 'cursor-cell'
              : 'cursor-crosshair'
            : 'cursor-default'
        }`}
      />

      {screen === 'title' && (
        <TitleScreen
          hasSave={hasSave}
          onContinue={handleStartContinue}
          onNewGame={handleStartNewWorld}
        />
      )}

      {screen === 'playing' && (
        <SurvivalHud
          world={world}
          muted={muted}
          onToggleMute={handleToggleMute}
          onOpenPause={() => {
            clearAllHeldInputs();
            setScreen('paused');
          }}
          onSelectBuild={handleSelectBuild}
          onCancelBuild={handleCancelBuild}
          onHireColonist={handleHireColonist}
          onUpgradeVillage={handleUpgradeVillage}
        />
      )}

      <MobileControls
        visible={showTouchControls}
        onJoystickChange={handleJoystickChange}
        onAttack={handleTouchAttack}
      />

      <PauseModal
        open={screen === 'paused'}
        onResume={() => setScreen('playing')}
        onRestart={handleStartNewWorld}
        onReturnTitle={handleReturnToTitle}
      />

      {screen === 'gameover' && (
        <GameOverModal
          world={world}
          onTryAgain={handleStartNewWorld}
          onReturnTitle={handleReturnToTitle}
        />
      )}
    </main>
  );
}
