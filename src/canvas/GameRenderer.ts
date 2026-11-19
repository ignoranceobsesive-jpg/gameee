import { checkPlacementValid, clamp } from '../game/collision';
import { InteractableTarget } from '../game/engine';
import { getDirectionVector } from '../game/monsterAI';
import { STRUCTURE_BLUEPRINT_MAP, WEAPON_SPECS } from '../game/recipes';
import {
  CursedShrine,
  GameSettings,
  GameWorld,
  Monster,
  ResourceNode,
  Structure,
  TrappedSurvivor,
  Vec2,
  Villager,
} from '../game/types';

interface WeatherParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  layer: 0 | 1;
}

interface RainSplash {
  x: number;
  y: number;
  age: number;
  maxAge: number;
}

interface TerrainProp {
  x: number;
  y: number;
  kind: 'weed' | 'pebble' | 'moss' | 'puddle';
  scale: number;
}

interface LightSource {
  x: number;
  y: number;
  radius: number;
  color: 'fire' | 'crt' | 'tesla' | 'shrine' | 'lantern';
  flicker: number;
  intensity: number;
}

export class GameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private lightCanvas: HTMLCanvasElement;
  private lightCtx: CanvasRenderingContext2D;
  private grainCanvas: HTMLCanvasElement;
  private grainPattern: CanvasPattern | null = null;
  private earthPattern: CanvasPattern | null = null;
  private weatherPool: WeatherParticle[] = [];
  private rainSplashes: RainSplash[] = [];
  private terrainProps: TerrainProp[] = [];
  private activeLights: LightSource[] = [];

  public cameraX = 1600;
  public cameraY = 1200;
  public zoom = 1;
  private width = 1440;
  private height = 900;
  private time = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;

    // 0.34x offscreen lighting canvas for rich midnight-indigo multiply darkness & warm fire emission
    this.lightCanvas = document.createElement('canvas');
    this.lightCanvas.width = 480;
    this.lightCanvas.height = 300;
    const lCtx = this.lightCanvas.getContext('2d');
    if (!lCtx) throw new Error('Light buffer context unavailable');
    this.lightCtx = lCtx;

    // Pre-baked seamless 256x256 procedural damp earth + moss + stone grit tile
    const earthTile = document.createElement('canvas');
    earthTile.width = 256;
    earthTile.height = 256;
    const eCtx = earthTile.getContext('2d');
    if (eCtx) {
      eCtx.fillStyle = '#4e524e';
      eCtx.fillRect(0, 0, 256, 256);

      // Subtle organic damp loam patches & moss flecks
      for (let i = 0; i < 160; i++) {
        const rx = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
        const ry = ((Math.sin(i * 78.233) * 24634.6345) % 1 + 1) % 1;
        const rad = 6 + (i % 14);
        eCtx.fillStyle =
          i % 4 === 0
            ? 'rgba(40, 54, 43, 0.34)' // subtle damp moss (#28362b)
            : i % 3 === 0
              ? 'rgba(43, 45, 47, 0.35)' // deep damp loam (#2b2d2f)
              : 'rgba(104, 102, 92, 0.22)'; // weathered ash highlight
        eCtx.beginPath();
        eCtx.ellipse(rx * 256, ry * 256, rad, rad * 0.68, (i % 6) * 0.4, 0, Math.PI * 2);
        eCtx.fill();
      }
      // Crisp hand-drawn grit specks
      for (let i = 0; i < 340; i++) {
        const rx = ((Math.sin(i * 39.17) * 19381.23) % 1 + 1) % 1;
        const ry = ((Math.sin(i * 91.41) * 51829.77) % 1 + 1) % 1;
        eCtx.fillStyle = i % 2 === 0 ? 'rgba(24, 27, 29, 0.25)' : 'rgba(138, 134, 122, 0.16)';
        eCtx.fillRect(rx * 256, ry * 256, 2, 2);
      }
      this.earthPattern = this.ctx.createPattern(earthTile, 'repeat');
    }

    // Pre-baked subtle film grain tile
    this.grainCanvas = document.createElement('canvas');
    this.grainCanvas.width = 128;
    this.grainCanvas.height = 128;
    const gCtx = this.grainCanvas.getContext('2d');
    if (gCtx) {
      const img = gCtx.createImageData(128, 128);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.floor(Math.random() * 255);
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = 10;
      }
      gCtx.putImageData(img, 0, 0);
      this.grainPattern = this.ctx.createPattern(this.grainCanvas, 'repeat');
    }

    // Pre-allocate multi-layer weather particles
    for (let i = 0; i < 88; i++) {
      this.weatherPool.push({
        x: Math.random() * 1600,
        y: Math.random() * 1000,
        vx: -18 - Math.random() * 22,
        vy: 6 + Math.random() * 14,
        size: 1.2 + Math.random() * 1.9,
        alpha: 0.14 + Math.random() * 0.28,
        layer: i % 3 === 0 ? 1 : 0,
      });
    }

    for (let i = 0; i < 18; i++) {
      this.rainSplashes.push({
        x: Math.random() * 1440,
        y: Math.random() * 900,
        age: Math.random() * 0.6,
        maxAge: 0.45 + Math.random() * 0.35,
      });
    }

    // Deterministic terrain props: moss patches, grass tufts, stones, reflective puddles
    for (let i = 0; i < 520; i++) {
      const r1 = Math.abs(Math.sin(i * 17.13) * 43758.5453) % 1;
      const r2 = Math.abs(Math.sin(i * 49.71) * 24634.6345) % 1;
      const kind: TerrainProp['kind'] =
        i % 24 === 0 ? 'puddle' : i % 7 === 0 ? 'moss' : i % 5 === 0 ? 'pebble' : 'weed';
      this.terrainProps.push({
        x: 60 + r1 * 3080,
        y: 60 + r2 * 2280,
        kind,
        scale: 0.75 + (i % 5) * 0.15,
      });
    }
  }

  public resize(width: number, height: number): void {
    this.width = Math.max(320, Math.floor(width));
    this.height = Math.max(240, Math.floor(height));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.lightCanvas.width = Math.max(160, Math.floor(this.width * 0.28));
    this.lightCanvas.height = Math.max(110, Math.floor(this.height * 0.28));
  }

  public screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
      x: (sx - this.width * 0.5) / this.zoom + this.cameraX,
      y: (sy - this.height * 0.5) / this.zoom + this.cameraY,
    };
  }

  public worldToScreen(wx: number, wy: number): { sx: number; sy: number } {
    return {
      sx: (wx - this.cameraX) * this.zoom + this.width * 0.5,
      sy: (wy - this.cameraY) * this.zoom + this.height * 0.5,
    };
  }

  private getNightFactor(world: GameWorld): number {
    const m = world.minuteOfDay;
    if (m >= 460 && m <= 1020) return 0; // Crisp overcast daylight
    if (m > 1020 && m < 1230) return (m - 1020) / 210; // Dusk
    if (m >= 1230 || m < 310) return 1; // Deep midnight indigo
    return 1 - (m - 310) / 150; // Dawn
  }

  private collectActiveLights(world: GameWorld): void {
    this.activeLights.length = 0;
    const night = this.getNightFactor(world);
    const surgeMult = world.darknessSurgeTimer > 0 ? 0.62 : 1.0;

    for (const s of world.structures) {
      if (s.destroyed || s.lightRadius <= 0 || (s.buildProgress ?? 1) < 1) continue;
      const flk =
        Math.sin(this.time * 10.5 + s.x * 0.05) * 0.045 +
        Math.sin(this.time * 23 + s.y * 0.07) * 0.025;
      if (s.type === 'crt_tv') {
        this.activeLights.push({
          x: s.x,
          y: s.y - 42,
          radius: s.lightRadius * surgeMult,
          color: 'crt',
          flicker: world.crtFlicker > 0.1 ? Math.sin(this.time * 40) * 0.15 : flk * 0.5,
          intensity: 0.9,
        });
      } else if (s.type === 'tesla_pylon') {
        this.activeLights.push({
          x: s.x,
          y: s.y - 24,
          radius: s.lightRadius * surgeMult,
          color: 'tesla',
          flicker: flk,
          intensity: 0.92,
        });
      } else if (s.type === 'campfire' || s.type === 'brazier_beacon' || s.type === 'torch_post') {
        const fuelFactor = s.type === 'brazier_beacon' && (s.fuel ?? 100) <= 0 ? 0.25 : 1;
        this.activeLights.push({
          x: s.x,
          y: s.y - (s.type === 'torch_post' ? 42 : 14),
          radius: s.lightRadius * fuelFactor * surgeMult,
          color: 'fire',
          flicker: flk * 1.4,
          intensity: 1.0,
        });
      } else if (night > 0.2) {
        // Warm light spilling outside lit cabin windows/doorways!
        this.activeLights.push({
          x: s.x - s.width * 0.12,
          y: s.y + s.height * 0.45,
          radius: s.lightRadius * 1.05 * surgeMult,
          color: 'fire',
          flicker: flk * 0.4,
          intensity: 0.72,
        });
      }
    }

    if (world.merchant.active) {
      this.activeLights.push({
        x: world.merchant.x + 18,
        y: world.merchant.y - 18,
        radius: 175 * surgeMult,
        color: 'fire',
        flicker: Math.sin(this.time * 9) * 0.03,
        intensity: 0.9,
      });
    }

    for (const sh of world.shrines) {
      if (!sh.used) {
        this.activeLights.push({
          x: sh.x,
          y: sh.y - 18,
          radius: 135,
          color: 'shrine',
          flicker: Math.sin(this.time * 4 + sh.x) * 0.06,
          intensity: 0.8,
        });
      }
    }

    if (world.player.alive && world.player.lanternOn && world.player.lanternFuel > 0) {
      this.activeLights.push({
        x: world.player.x + Math.cos(world.player.aimAngle) * 18,
        y: world.player.y - 12 + Math.sin(world.player.aimAngle) * 14,
        radius: 230 * surgeMult,
        color: 'lantern',
        flicker: Math.sin(this.time * 12) * 0.03,
        intensity: 0.96,
      });
    }
  }

  private getShadowOffset(x: number, y: number, nightFactor: number): { dx: number; dy: number } {
    if (nightFactor < 0.25 || this.activeLights.length === 0) {
      // Crisp 3/4 overcast low-sun shadow angling down-left
      return { dx: -0.68, dy: 0.28 };
    }
    let nearest: LightSource | null = null;
    let bestD = 360;
    for (let i = 0; i < this.activeLights.length; i++) {
      const l = this.activeLights[i];
      const d = Math.hypot(x - l.x, y - l.y);
      if (d < bestD && d > 8) {
        bestD = d;
        nearest = l;
      }
    }
    if (!nearest) return { dx: -0.55, dy: 0.26 };
    const nx = (x - nearest.x) / bestD;
    const ny = (y - nearest.y) / bestD;
    const stretch = clamp(0.45 + bestD / 280, 0.55, 1.35);
    return { dx: nx * stretch, dy: ny * stretch * 0.55 + 0.16 };
  }

  private getWarmRimDir(x: number, y: number): { x: number; y: number; strength: number } | null {
    let best: LightSource | null = null;
    let bestD = 260;
    for (let i = 0; i < this.activeLights.length; i++) {
      const l = this.activeLights[i];
      if (l.color !== 'fire' && l.color !== 'lantern') continue;
      const d = Math.hypot(l.x - x, l.y - y);
      if (d < bestD && d > 10) {
        bestD = d;
        best = l;
      }
    }
    if (!best) return null;
    return {
      x: (best.x - x) / bestD,
      y: (best.y - y) / bestD,
      strength: clamp(1 - bestD / 260, 0.15, 0.85),
    };
  }

  private drawDirectionalShadow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    rx: number,
    ry: number,
    nightFactor: number
  ): void {
    const off = this.getShadowOffset(x, y, nightFactor);
    const angle = Math.atan2(off.dy, off.dx) * 0.35;
    ctx.fillStyle = nightFactor > 0.4 ? 'rgba(7, 10, 18, 0.48)' : 'rgba(14, 18, 22, 0.34)';
    ctx.beginPath();
    ctx.ellipse(x + off.dx * rx * 0.72, y + 3 + off.dy * ry * 0.65, rx * 1.05, ry * 0.85, angle, 0, Math.PI * 2);
    ctx.fill();
  }

  public render(
    world: GameWorld,
    dt: number,
    isTitleMode: boolean,
    nearestInteract: InteractableTarget | null,
    buildCursorWorld: { x: number; y: number } | null,
    settings: GameSettings
  ): void {
    this.time += dt;
    const ctx = this.ctx;
    const nightFactor = isTitleMode ? 0.58 : this.getNightFactor(world);

    this.collectActiveLights(world);

    // Smooth camera follow
    if (isTitleMode) {
      const tourX = world.villageCenter.x + Math.sin(this.time * 0.18) * 110;
      const tourY = world.villageCenter.y - 10 + Math.cos(this.time * 0.14) * 45;
      this.cameraX += (tourX - this.cameraX) * Math.min(1, dt * 3);
      this.cameraY += (tourY - this.cameraY) * Math.min(1, dt * 3);
    } else {
      const targetX = clamp(world.player.x, this.width * 0.35, world.worldWidth - this.width * 0.35);
      const targetY = clamp(world.player.y, this.height * 0.35, world.worldHeight - this.height * 0.35);
      this.cameraX += (targetX - this.cameraX) * Math.min(1, dt * 7.5);
      this.cameraY += (targetY - this.cameraY) * Math.min(1, dt * 7.5);
    }

    const shakeMag = world.cameraShake * world.cameraShake * 11;
    const shakeX = shakeMag > 0.2 ? (Math.random() - 0.5) * shakeMag : 0;
    const shakeY = shakeMag > 0.2 ? (Math.random() - 0.5) * shakeMag : 0;

    ctx.save();
    ctx.fillStyle = '#4e524e';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.translate(this.width * 0.5 + shakeX, this.height * 0.5 + shakeY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.cameraX, -this.cameraY);

    const viewLeft = this.cameraX - this.width * 0.62;
    const viewRight = this.cameraX + this.width * 0.62;
    const viewTop = this.cameraY - this.height * 0.62;
    const viewBottom = this.cameraY + this.height * 0.62;

    this.drawBiomesAndGround(ctx, world, viewLeft, viewRight, viewTop, viewBottom);
    this.drawFootprints(ctx, world, viewLeft, viewRight, viewTop, viewBottom);
    this.drawRootZones(ctx, world, viewLeft, viewRight, viewTop, viewBottom);

    // Depth-sorted 2.5D entities (strict Y-sorting)
    const drawList: Array<{ y: number; draw: () => void }> = [];

    for (const s of world.structures) {
      if (s.destroyed) continue;
      if (s.x < viewLeft - 160 || s.x > viewRight + 160 || s.y < viewTop - 180 || s.y > viewBottom + 160) continue;
      // Ground-flat traps & farms draw beneath standing characters
      const sortY = s.type === 'tar_trap' || s.type === 'spike_trap' || s.type === 'farm' ? s.y - 36 : s.y;
      drawList.push({ y: sortY, draw: () => this.drawStructure(ctx, s, world, nightFactor) });
    }

    for (const n of world.resourceNodes) {
      if (n.depleted) continue;
      if (n.x < viewLeft - 100 || n.x > viewRight + 100 || n.y < viewTop - 130 || n.y > viewBottom + 100) continue;
      drawList.push({ y: n.y, draw: () => this.drawResourceNode(ctx, n, world, nightFactor) });
    }

    for (const sh of world.shrines) {
      if (sh.x < viewLeft - 80 || sh.x > viewRight + 80 || sh.y < viewTop - 100 || sh.y > viewBottom + 80) continue;
      drawList.push({ y: sh.y, draw: () => this.drawCursedShrine(ctx, sh, nightFactor) });
    }

    if (world.merchant.active) {
      const m = world.merchant;
      if (m.x > viewLeft - 120 && m.x < viewRight + 120 && m.y > viewTop - 120 && m.y < viewBottom + 120) {
        drawList.push({ y: m.y, draw: () => this.drawMerchantCart(ctx, m.x, m.y, nightFactor) });
      }
    }

    // Trapped RPG survivors omitted in Tower Defense mode (hiring happens via Hire Worker/Guard button)

    for (const d of world.droppedItems) {
      if (d.x < viewLeft || d.x > viewRight || d.y < viewTop || d.y > viewBottom) continue;
      drawList.push({
        y: d.y - 6,
        draw: () => {
          const bob = Math.sin(this.time * 4.5 + d.x) * 2.5;
          const isShard = d.resource === 'rare_shard' || d.resource === 'artifact';
          ctx.fillStyle = isShard ? '#72f2ff' : '#ffd166';
          ctx.strokeStyle = '#14171c';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          if (isShard) {
            ctx.moveTo(d.x, d.y + bob - 8);
            ctx.lineTo(d.x + 6, d.y + bob);
            ctx.lineTo(d.x, d.y + bob + 8);
            ctx.lineTo(d.x - 6, d.y + bob);
            ctx.closePath();
          } else {
            ctx.arc(d.x, d.y + bob, 5.5, 0, Math.PI * 2);
          }
          ctx.fill();
          ctx.stroke();
        },
      });
    }

    for (const v of world.villagers) {
      if (!v.alive || v.task === 'MANNING_TOWER') continue;
      if (v.x < viewLeft - 70 || v.x > viewRight + 70 || v.y < viewTop - 90 || v.y > viewBottom + 70) continue;
      drawList.push({ y: v.y, draw: () => this.drawVillager(ctx, v, nightFactor) });
    }

    for (const m of world.monsters) {
      if (m.x < viewLeft - 110 || m.x > viewRight + 110 || m.y < viewTop - 120 || m.y > viewBottom + 110) continue;
      drawList.push({ y: m.y, draw: () => this.drawMonster(ctx, m, nightFactor) });
    }

    if (world.player.alive) {
      drawList.push({ y: world.player.y, draw: () => this.drawPlayer(ctx, world, nightFactor) });
    }

    drawList.sort((a, b) => a.y - b.y);
    for (let i = 0; i < drawList.length; i++) {
      drawList[i].draw();
    }

    // Smoke puffs (chimneys, fires, construction dust)
    for (const sp of world.smokePuffs) {
      if (sp.x < viewLeft - 40 || sp.x > viewRight + 40 || sp.y < viewTop - 40 || sp.y > viewBottom + 40) continue;
      ctx.save();
      ctx.globalAlpha = clamp(sp.alpha * (sp.ttl / 1.4), 0, 0.72);
      ctx.fillStyle = sp.color;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Fleeing birds during night wave telegraph
    for (const b of world.fleeingBirds) {
      const wing = Math.sin(b.flap) * 5;
      ctx.save();
      ctx.strokeStyle = '#14171d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x - 6, b.y + wing);
      ctx.quadraticCurveTo(b.x - 2, b.y - 3, b.x, b.y);
      ctx.quadraticCurveTo(b.x + 2, b.y - 3, b.x + 6, b.y + wing);
      ctx.stroke();
      ctx.restore();
    }

    // Projectiles (with fiery trails for Fire Arrows!)
    for (const pr of world.projectiles) {
      ctx.save();
      ctx.strokeStyle = '#14161a';
      ctx.lineWidth = pr.isFire ? 5 : 4;
      ctx.beginPath();
      ctx.moveTo(pr.x - pr.vx * 0.03, pr.y - pr.vy * 0.03);
      ctx.lineTo(pr.x, pr.y);
      ctx.stroke();

      ctx.strokeStyle = pr.color;
      ctx.lineWidth = pr.isFire ? 3 : 2.2;
      ctx.beginPath();
      ctx.moveTo(pr.x - pr.vx * 0.03, pr.y - pr.vy * 0.03);
      ctx.lineTo(pr.x, pr.y);
      ctx.stroke();

      if (pr.isFire) {
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Tesla Pylon Chain Lightning Arcs!
    for (const arc of world.lightningArcs) {
      this.drawLightningArc(ctx, arc.points, clamp(arc.ttl / 0.28, 0, 1));
    }

    // Banshee Howler & Boss Expanding Soundwave Rings!
    for (const sw of world.soundWaves) {
      ctx.save();
      ctx.globalAlpha = clamp(sw.ttl * 1.1, 0, 0.85);
      ctx.strokeStyle = sw.color;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, Math.max(4, sw.radius - 10), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Build mode placement ghost + influence/attack radius circle
    if (!isTitleMode && world.player.selectedBuildType && buildCursorWorld) {
      this.drawBuildPreview(ctx, world, buildCursorWorld);
    }

    // World-space contextual interact highlight ring
    if (!isTitleMode && nearestInteract) {
      const pulse = 0.72 + Math.sin(this.time * 6) * 0.24;
      ctx.save();
      ctx.strokeStyle =
        nearestInteract.kind === 'merchant' || nearestInteract.kind === 'survivor'
          ? `rgba(255, 209, 102, ${pulse})`
          : nearestInteract.kind === 'shrine'
            ? `rgba(235, 110, 110, ${pulse})`
            : `rgba(142, 246, 228, ${pulse})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(nearestInteract.x, nearestInteract.y, 28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Floating combat & harvest notices
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    for (const fn of world.floatingNotices) {
      ctx.globalAlpha = clamp(fn.ttl, 0, 1);
      ctx.fillStyle = '#0d1016';
      ctx.fillText(fn.text, fn.x + 1, fn.y + 1);
      ctx.fillStyle = fn.color;
      ctx.fillText(fn.text, fn.x, fn.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // Blend-Mode Atmospheric Lighting Engine (Multiply Deep Midnight Indigo + Lighter Warm Fire Glows)
    this.drawDynamicLighting(ctx, world, nightFactor, settings.fogEffects);

    // Multi-Layer Ground Fog, Diagonal Rain + Splashes, & Atmospheric Ash Motes
    this.drawWeatherAndFog(ctx, world, dt, settings.fogEffects);

    // Subtle film grain & low-HP vignette
    if (settings.filmGrain && this.grainPattern) {
      ctx.save();
      ctx.fillStyle = this.grainPattern;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }

    if (!isTitleMode && world.player.alive && world.player.hp < 35) {
      const pulse = 0.22 + Math.sin(this.time * 6) * 0.08;
      ctx.save();
      ctx.strokeStyle = `rgba(165, 36, 36, ${pulse})`;
      ctx.lineWidth = 28;
      ctx.strokeRect(0, 0, this.width, this.height);
      ctx.restore();
    }
  }

  private drawBiomesAndGround(
    ctx: CanvasRenderingContext2D,
    world: GameWorld,
    left: number,
    right: number,
    top: number,
    bottom: number
  ): void {
    // Base seamless procedural damp earth pattern
    if (this.earthPattern) {
      ctx.fillStyle = this.earthPattern;
      ctx.fillRect(left - 120, top - 120, right - left + 240, bottom - top + 240);
    }

    // Subtle biome washes so each of the 4 Zones feels visually distinct
    const regionRgb: Record<string, string> = {
      ashen_village: '124, 119, 108',
      whispering_forest: '48, 66, 52',
      shattered_quarry: '76, 80, 86',
      abandoned_homestead: '88, 81, 70',
      sunken_ruins: '52, 68, 76',
      hollow_cavern: '42, 48, 56',
      watchers_ridge: '68, 66, 62',
      blighted_barrens: '62, 54, 50',
    };

    for (const r of world.regions) {
      if (r.x + r.radius < left || r.x - r.radius > right || r.y + r.radius < top || r.y - r.radius > bottom) {
        continue;
      }
      const rgb = regionRgb[r.id] ?? '88, 86, 80';
      const grad = ctx.createRadialGradient(r.x, r.y, r.radius * 0.4, r.x, r.y, r.radius * 1.08);
      grad.addColorStop(0, `rgba(${rgb}, 0.42)`);
      grad.addColorStop(0.75, `rgba(${rgb}, 0.22)`);
      grad.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius * 1.08, 0, Math.PI * 2);
      ctx.fill();
    }

    // Feathered worn dirt crossroads radiating from Ashen Village plaza
    const cx = world.villageCenter.x;
    const cy = world.villageCenter.y;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(130, 118, 98, 0.34)';
    ctx.lineWidth = 54;
    ctx.beginPath();
    ctx.moveTo(cx - 600, cy + 20);
    ctx.lineTo(cx + 600, cy + 20);
    ctx.moveTo(cx, cy - 520);
    ctx.lineTo(cx, cy + 560);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(148, 134, 112, 0.36)';
    ctx.lineWidth = 28;
    ctx.stroke();

    // Central weathered cobblestone village hearth plaza with subtle stone border joints
    ctx.fillStyle = 'rgba(136, 128, 114, 0.30)';
    ctx.beginPath();
    ctx.arc(cx, cy + 16, 152, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(42, 46, 50, 0.36)';
    ctx.lineWidth = 4;
    ctx.setLineDash([14, 6]);
    ctx.beginPath();
    ctx.arc(cx, cy + 16, 151, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Moss patches, damp puddles, pebbles & pixel grass tufts
    const isWet = world.weather === 'RAIN' || world.weather === 'STORM';
    for (let i = 0; i < this.terrainProps.length; i++) {
      const tp = this.terrainProps[i];
      if (tp.x < left || tp.x > right || tp.y < top || tp.y > bottom) continue;
      if (tp.kind === 'moss') {
        ctx.fillStyle = 'rgba(40, 58, 44, 0.56)';
        ctx.beginPath();
        ctx.ellipse(tp.x, tp.y, 16 * tp.scale, 10 * tp.scale, 0.3, 0, Math.PI * 2);
        ctx.fill();
      } else if (tp.kind === 'puddle') {
        ctx.fillStyle = isWet ? 'rgba(28, 40, 54, 0.62)' : 'rgba(32, 42, 52, 0.36)';
        ctx.beginPath();
        ctx.ellipse(tp.x, tp.y, 20 * tp.scale, 11 * tp.scale, -0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(155, 178, 196, 0.22)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(tp.x - 3, tp.y - 2, 11 * tp.scale, 4 * tp.scale, -0.1, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      } else if (tp.kind === 'weed') {
        const sway = Math.sin(this.time * 1.9 + tp.x * 0.04) * 1.6;
        ctx.strokeStyle = '#263027';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(tp.x, tp.y);
        ctx.lineTo(tp.x - 3 + sway, tp.y - 7);
        ctx.moveTo(tp.x, tp.y);
        ctx.lineTo(tp.x + 1 + sway, tp.y - 9);
        ctx.moveTo(tp.x, tp.y);
        ctx.lineTo(tp.x + 4 + sway, tp.y - 6);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#5e5d58';
        ctx.strokeStyle = '#202326';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(tp.x, tp.y, 5 * tp.scale, 3 * tp.scale, 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // World border mist treeline rim
    ctx.strokeStyle = 'rgba(13, 19, 33, 0.68)';
    ctx.lineWidth = 14;
    ctx.strokeRect(36, 36, world.worldWidth - 72, world.worldHeight - 72);
  }

  private drawFootprints(
    ctx: CanvasRenderingContext2D,
    world: GameWorld,
    left: number,
    right: number,
    top: number,
    bottom: number
  ): void {
    for (const fp of world.footprints) {
      if (fp.x < left || fp.x > right || fp.y < top || fp.y > bottom) continue;
      ctx.save();
      ctx.translate(fp.x, fp.y);
      ctx.rotate(fp.angle);
      ctx.globalAlpha = fp.alpha;
      ctx.fillStyle = fp.kind === 'human' ? '#242628' : '#120f14';
      if (fp.kind === 'claw') {
        ctx.fillRect(-5, -4, 10, 2);
        ctx.fillRect(-5, 0, 11, 2);
        ctx.fillRect(-5, 4, 10, 2);
      } else {
        ctx.beginPath();
        ctx.ellipse(0, 0, 3.5, 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawRootZones(
    ctx: CanvasRenderingContext2D,
    world: GameWorld,
    left: number,
    right: number,
    top: number,
    bottom: number
  ): void {
    for (const rz of world.rootZones) {
      if (rz.x + rz.radius < left || rz.x - rz.radius > right || rz.y + rz.radius < top || rz.y - rz.radius > bottom) {
        continue;
      }
      ctx.save();
      ctx.fillStyle = 'rgba(46, 86, 48, 0.34)';
      ctx.strokeStyle = 'rgba(128, 212, 118, 0.72)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(rz.x, rz.y, rz.radius, rz.radius * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Writhing root tendrils
      ctx.strokeStyle = '#33281f';
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.sin(this.time * 3 + i) * 0.15;
        ctx.beginPath();
        ctx.moveTo(rz.x, rz.y);
        ctx.quadraticCurveTo(
          rz.x + Math.cos(a + 0.3) * rz.radius * 0.5,
          rz.y + Math.sin(a + 0.3) * rz.radius * 0.35,
          rz.x + Math.cos(a) * rz.radius * 0.88,
          rz.y + Math.sin(a) * rz.radius * 0.62
        );
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawLightningArc(ctx: CanvasRenderingContext2D, points: Vec2[], alpha: number): void {
    if (points.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const drawPath = () => {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const p0 = points[i - 1];
        const p1 = points[i];
        const midX = (p0.x + p1.x) * 0.5 + (Math.random() - 0.5) * 18;
        const midY = (p0.y + p1.y) * 0.5 + (Math.random() - 0.5) * 18;
        ctx.lineTo(midX, midY);
        ctx.lineTo(p1.x, p1.y);
      }
      ctx.stroke();
    };

    ctx.globalAlpha = alpha * 0.55;
    ctx.strokeStyle = '#53d8ff';
    ctx.lineWidth = 7;
    drawPath();

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#e8fbff';
    ctx.lineWidth = 2.4;
    drawPath();
    ctx.restore();
  }

  private drawStructure(ctx: CanvasRenderingContext2D, s: Structure, world: GameWorld, nightFactor: number): void {
    const x = s.x;
    const y = s.y;
    const hw = s.width * 0.5;
    const hh = s.height * 0.5;
    const outline = s.hitFlash > 0 ? '#ffffff' : '#14171c';
    const progress = s.buildProgress ?? 1;

    ctx.save();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';

    // Glowing Cyan Holographic Wireframe Blueprint + Circular Progress Arc while workers build it!
    if (progress < 1) {
      const pulse = 0.78 + Math.sin(this.time * 6.5) * 0.18;
      const ringR = Math.max(hw, hh) + 14;

      // Dashed cyan foundation ring
      ctx.save();
      ctx.strokeStyle = `rgba(114, 242, 255, ${0.42 * pulse})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.ellipse(x, y + hh * 0.35, ringR, ringR * 0.56, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Bold glowing circular progress arc on ground around blueprint!
      ctx.strokeStyle = 'rgba(14, 24, 34, 0.75)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(x, y + hh * 0.35, ringR, ringR * 0.56, 0, 0, Math.PI * 2);
      ctx.stroke();

      if (progress > 0.01) {
        ctx.strokeStyle = '#72f2ff';
        ctx.lineWidth = 4.2;
        ctx.beginPath();
        ctx.ellipse(
          x,
          y + hh * 0.35,
          ringR,
          ringR * 0.56,
          0,
          -Math.PI * 0.5,
          -Math.PI * 0.5 + Math.PI * 2 * progress
        );
        ctx.stroke();
      }

      // Wireframe holographic blueprint silhouette matching structure type
      ctx.fillStyle = `rgba(68, 198, 255, ${0.14 + progress * 0.14})`;
      ctx.strokeStyle = `rgba(130, 244, 255, ${0.88 * pulse})`;
      ctx.lineWidth = 2;

      if (s.type === 'watchtower') {
        const h = 76;
        // 4 tower posts + parapet platform + roof frame
        ctx.fillRect(x - hw * 0.7, y + hh - h, s.width * 0.7, h);
        ctx.strokeRect(x - hw * 0.7, y + hh - h, s.width * 0.7, h);
        ctx.fillRect(x - hw * 0.92, y + hh - h - 10, s.width * 0.92, 13);
        ctx.strokeRect(x - hw * 0.92, y + hh - h - 10, s.width * 0.92, 13);
        // X-bracing lines
        ctx.beginPath();
        ctx.moveTo(x - hw * 0.7, y + hh - 4);
        ctx.lineTo(x + hw * 0.7, y + hh - 46);
        ctx.moveTo(x + hw * 0.7, y + hh - 4);
        ctx.lineTo(x - hw * 0.7, y + hh - 46);
        ctx.stroke();
      } else if (s.type === 'brazier_beacon') {
        ctx.beginPath();
        ctx.moveTo(x - 14, y + 8);
        ctx.lineTo(x - 10, y - 28);
        ctx.lineTo(x + 10, y - 28);
        ctx.lineTo(x + 14, y + 8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeRect(x - 15, y - 36, 30, 10);
      } else {
        ctx.fillRect(x - hw, y - hh - 10, s.width, s.height + 10);
        ctx.strokeRect(x - hw, y - hh - 10, s.width, s.height + 10);
        for (let px = x - hw + 12; px < x + hw - 4; px += 12) {
          ctx.beginPath();
          ctx.moveTo(px, y - hh - 16);
          ctx.lineTo(px, y + hh);
          ctx.stroke();
        }
      }

      // Crisp overhead build progress bar
      const barY = s.type === 'watchtower' ? y - 68 : y - hh - 30;
      ctx.fillStyle = 'rgba(10, 16, 24, 0.9)';
      ctx.fillRect(x - 24, barY, 48, 6);
      ctx.fillStyle = '#72f2ff';
      ctx.fillRect(x - 23, barY + 1, 46 * Math.max(0.04, progress), 4);
      ctx.restore();
      ctx.restore();
      return;
    }

    if (s.type === 'crt_tv') {
      // Upgraded Central Broadcast CRT Outpost with sturdy timber/iron frame & protective sandbags!
      this.drawDirectionalShadow(ctx, x, y + 12, 54, 18, nightFactor);

      // Protective sandbag ring at outpost base
      ctx.fillStyle = '#8d8470';
      for (const [ox, oy] of [
        [-34, 8],
        [-18, 12],
        [0, 14],
        [18, 12],
        [34, 8],
      ]) {
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, 12, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Bolted steel-and-timber A-frame stand
      ctx.fillStyle = '#3c4046';
      ctx.fillRect(x - 28, y - 40, 8, 48);
      ctx.strokeRect(x - 28, y - 40, 8, 48);
      ctx.fillRect(x + 20, y - 40, 8, 48);
      ctx.strokeRect(x + 20, y - 40, 8, 48);
      ctx.fillStyle = '#5c4d3e';
      ctx.fillRect(x - 36, y - 42, 72, 9);
      ctx.strokeRect(x - 36, y - 42, 72, 9);

      // Dangling signal cables
      const sway = Math.sin(this.time * 1.6) * 2.2;
      ctx.strokeStyle = '#1b1e22';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 16, y - 40);
      ctx.quadraticCurveTo(x - 22 + sway, y - 16, x - 12 + sway, y + 4);
      ctx.moveTo(x + 14, y - 40);
      ctx.quadraticCurveTo(x + 20 + sway, y - 20, x + 12 + sway, y + 2);
      ctx.stroke();

      // Rabbit-ear antennas
      ctx.strokeStyle = outline;
      ctx.beginPath();
      ctx.moveTo(x - 12, y - 108);
      ctx.lineTo(x - 28, y - 128);
      ctx.moveTo(x + 12, y - 108);
      ctx.lineTo(x + 28, y - 126);
      ctx.stroke();

      // Heavy retro CRT casing
      const tvW = 104;
      const tvH = 70;
      const tvX = x - tvW * 0.5;
      const tvY = y - 108;
      ctx.fillStyle = '#5c605d';
      ctx.beginPath();
      ctx.roundRect(tvX, tvY, tvW, tvH, 7);
      ctx.fill();
      ctx.stroke();

      // Dial knobs on right bezel
      ctx.fillStyle = '#2d3033';
      ctx.beginPath();
      ctx.arc(tvX + tvW - 7, tvY + 18, 3.5, 0, Math.PI * 2);
      ctx.arc(tvX + tvW - 7, tvY + 30, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Glowing CRT glass screen
      const sx = tvX + 8;
      const sy = tvY + 8;
      const sw = tvW - 24;
      const sh = tvH - 16;
      const isEerie = world.phase === 'NIGHT' || world.crtFlicker > 0.1;
      ctx.fillStyle = isEerie ? '#56746e' : '#b8c3bc';
      ctx.fillRect(sx, sy, sw, sh);

      // Scanlines
      ctx.fillStyle = 'rgba(12, 18, 22, 0.14)';
      for (let ly = sy + 2; ly < sy + sh - 13; ly += 4) {
        ctx.fillRect(sx, ly, sw, 1.2);
      }

      // Iconic little square peep inside CRT
      const bob = Math.sin(this.time * 2.8) * 1.4;
      ctx.fillStyle = isEerie ? '#172022' : '#dedbd2';
      ctx.fillRect(sx + sw * 0.36, sy + sh * 0.24 + bob, 13, 12);
      ctx.strokeRect(sx + sw * 0.36, sy + sh * 0.24 + bob, 13, 12);

      // Broadcast strip
      ctx.fillStyle = 'rgba(10, 14, 18, 0.92)';
      ctx.fillRect(sx, sy + sh - 13, sw, 13);
      ctx.fillStyle = isEerie ? '#8ef6e4' : '#e6eee9';
      ctx.font = 'bold 7.5px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(world.crtBroadcast || 'just a normal peep', sx + sw * 0.5, sy + sh - 3.5, sw - 4);
    } else if (s.type === 'campfire') {
      // Village Core Hearth — scales visually with Village Level (stone ring -> gilded runes -> radiant core)
      if (world.villageLevel >= 2) {
        ctx.save();
        ctx.strokeStyle = world.villageLevel >= 3 ? 'rgba(114, 242, 255, 0.45)' : 'rgba(255, 209, 102, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(x, y + 2, 32, 20, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = '#383028';
      ctx.beginPath();
      ctx.ellipse(x, y + 1, 20, 13, 0, 0, Math.PI * 2);
      ctx.fill();

      // Ring stones
      ctx.fillStyle = world.villageLevel >= 2 ? '#787b82' : '#62615c';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * 18, y + Math.sin(a) * 12, 4.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      // Crossed logs
      ctx.strokeStyle = '#3d2c1e';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x - 11, y + 4);
      ctx.lineTo(x + 11, y - 3);
      ctx.moveTo(x - 10, y - 4);
      ctx.lineTo(x + 10, y + 4);
      ctx.stroke();

      const flk = Math.sin(this.time * 13) * 3.5;
      const sway = Math.sin(this.time * 7) * 2.5;
      const fireScale = 1 + Math.min(0.45, (world.villageLevel - 1) * 0.16);
      ctx.fillStyle = '#f77f00';
      ctx.beginPath();
      ctx.moveTo(x - 11 * fireScale, y + 3);
      ctx.quadraticCurveTo(x + sway, y - 26 * fireScale - flk, x + 11 * fireScale, y + 3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.moveTo(x - 6 * fireScale, y + 2);
      ctx.quadraticCurveTo(x + sway * 0.6, y - 16 * fireScale - flk * 0.6, x + 6 * fireScale, y + 2);
      ctx.closePath();
      ctx.fill();
    } else if (s.type === 'brazier_beacon') {
      // Wide Fire Brazier Beacon (T1 stone/iron -> T2 riveted iron -> T3 rune-etched eternal beacon)
      this.drawDirectionalShadow(ctx, x, y + 8, 22, 10, nightFactor);
      const lit = (s.fuel ?? 100) > 0 || s.tier === 3;

      // Stone pedestal / iron tripod
      ctx.fillStyle = s.tier === 3 ? '#4c5460' : s.tier === 2 ? '#44484e' : '#5f5b54';
      ctx.beginPath();
      ctx.moveTo(x - 13, y + 8);
      ctx.lineTo(x - 9, y - 16);
      ctx.lineTo(x + 9, y - 16);
      ctx.lineTo(x + 13, y + 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Iron fire basket
      ctx.fillStyle = '#2d3138';
      ctx.beginPath();
      ctx.moveTo(x - 15, y - 16);
      ctx.lineTo(x - 11, y - 26);
      ctx.lineTo(x + 11, y - 26);
      ctx.lineTo(x + 15, y - 16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      if (s.tier === 3) {
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 1.6;
        ctx.strokeRect(x - 7, y - 10, 14, 12);
      }

      if (lit) {
        const flk = Math.sin(this.time * 12 + x) * 4;
        const sway = Math.sin(this.time * 6 + y) * 3;
        ctx.fillStyle = '#f77f00';
        ctx.beginPath();
        ctx.moveTo(x - 11, y - 24);
        ctx.quadraticCurveTo(x + sway, y - 50 - flk, x + 11, y - 24);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.moveTo(x - 6, y - 24);
        ctx.quadraticCurveTo(x + sway * 0.5, y - 39 - flk * 0.6, x + 6, y - 24);
        ctx.closePath();
        ctx.fill();
      }
    } else if (s.type === 'tesla_pylon') {
      // Arcane / Tech Shard Pylon (glowing floating crystal + copper coils)
      this.drawDirectionalShadow(ctx, x, y + 10, 24, 11, nightFactor);
      ctx.fillStyle = s.tier === 3 ? '#3b4554' : '#4a4e54';
      ctx.beginPath();
      ctx.moveTo(x - 17, y + 10);
      ctx.lineTo(x - 11, y - 28);
      ctx.lineTo(x + 11, y - 28);
      ctx.lineTo(x + 17, y + 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Copper coil bands
      ctx.strokeStyle = s.tier >= 2 ? '#d9a45b' : '#8c7656';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(x - 12, y - 10);
      ctx.lineTo(x + 12, y - 10);
      ctx.moveTo(x - 10, y - 19);
      ctx.lineTo(x + 10, y - 19);
      ctx.stroke();

      // Levitating glowing Ancient Shard crystal
      const hover = Math.sin(this.time * 4.2 + x) * 3;
      ctx.fillStyle = '#72f2ff';
      ctx.strokeStyle = '#14171c';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(x, y - 52 + hover);
      ctx.lineTo(x + 9, y - 39 + hover);
      ctx.lineTo(x, y - 28 + hover);
      ctx.lineTo(x - 9, y - 39 + hover);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (s.type === 'tar_trap') {
      // Glossy flammable dark pitch puddle
      ctx.fillStyle = '#14161a';
      ctx.strokeStyle = '#2b3038';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(x, y, hw * 0.95, hh * 0.85, 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Oily specular sheen
      ctx.fillStyle = s.tier === 3 ? 'rgba(255, 168, 76, 0.28)' : 'rgba(130, 152, 178, 0.26)';
      ctx.beginPath();
      ctx.ellipse(x - 7, y - 4, hw * 0.42, hh * 0.24, -0.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (
      s.type === 'house' ||
      s.type === 'shelter' ||
      s.type === 'workshop' ||
      s.type === 'blacksmith' ||
      s.type === 'medical_station'
    ) {
      // Upgraded 2.5D Textured Wooden Cabin with stone foundation, timber beams, roof shingles, chimney & glowing windows!
      this.drawDirectionalShadow(ctx, x, y + hh, hw + 14, 18, nightFactor);
      const wallH = 54;
      const topY = y + hh - wallH;

      // Stone foundation plinth
      ctx.fillStyle = '#484c52';
      ctx.fillRect(x - hw - 2, y + hh - 9, s.width + 4, 11);
      ctx.strokeRect(x - hw - 2, y + hh - 9, s.width + 4, 11);

      // Timber plank wall body
      const wallColor =
        s.type === 'medical_station'
          ? '#c7c2b6'
          : s.type === 'blacksmith'
            ? '#4f5258'
            : s.type === 'workshop'
              ? '#6e5c4a'
              : '#655647';
      ctx.fillStyle = wallColor;
      ctx.fillRect(x - hw, topY, s.width, wallH - 8);
      ctx.strokeRect(x - hw, topY, s.width, wallH - 8);

      // Horizontal wood plank grooves & corner timber beams
      ctx.strokeStyle = 'rgba(20, 22, 26, 0.35)';
      ctx.lineWidth = 1.2;
      for (let py = topY + 10; py < y + hh - 10; py += 10) {
        ctx.beginPath();
        ctx.moveTo(x - hw + 2, py);
        ctx.lineTo(x + hw - 2, py);
        ctx.stroke();
      }
      ctx.fillStyle = '#3d332a';
      ctx.fillRect(x - hw, topY, 6, wallH - 8);
      ctx.fillRect(x + hw - 6, topY, 6, wallH - 8);

      // Stone Chimney on roof
      ctx.strokeStyle = outline;
      ctx.lineWidth = 2;
      ctx.fillStyle = '#53575e';
      ctx.fillRect(x + hw * 0.42, topY - 24, 14, 24);
      ctx.strokeRect(x + hw * 0.42, topY - 24, 14, 24);

      // Pitched 2.5D Shingled Roof with overhang shadow
      ctx.fillStyle = 'rgba(12, 16, 22, 0.38)';
      ctx.fillRect(x - hw - 2, topY + 2, s.width + 4, 8);

      const roofColor = s.tier >= 2 ? '#343b44' : s.type === 'medical_station' ? '#634644' : '#3d3937';
      ctx.fillStyle = roofColor;
      ctx.beginPath();
      ctx.moveTo(x - hw - 10, topY + 5);
      ctx.lineTo(x - hw + 10, topY - 22);
      ctx.lineTo(x + hw - 10, topY - 22);
      ctx.lineTo(x + hw + 10, topY + 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Layered roof shingle rows
      ctx.strokeStyle = 'rgba(18, 20, 24, 0.48)';
      ctx.lineWidth = 1.2;
      for (let ry = topY - 14; ry <= topY - 2; ry += 6) {
        ctx.beginPath();
        ctx.moveTo(x - hw + 2, ry);
        ctx.lineTo(x + hw - 2, ry);
        ctx.stroke();
      }

      // Lit warm paned window + ground light spill at dusk/night!
      const lit = (world.phase === 'EVENING' || world.phase === 'NIGHT') && s.lightRadius > 0;
      const winX = x - hw * 0.62;
      const winY = y + hh - 37;
      if (lit) {
        // Warm amber light spill onto the damp ground outside the window!
        const spill = ctx.createRadialGradient(winX + 11, y + hh + 6, 4, winX + 11, y + hh + 14, 42);
        spill.addColorStop(0, 'rgba(255, 209, 102, 0.42)');
        spill.addColorStop(0.6, 'rgba(247, 127, 0, 0.16)');
        spill.addColorStop(1, 'rgba(247, 127, 0, 0)');
        ctx.fillStyle = spill;
        ctx.beginPath();
        ctx.ellipse(winX + 11, y + hh + 12, 36, 18, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = outline;
      ctx.lineWidth = 2;
      ctx.fillStyle = lit ? '#ffd166' : '#262b32';
      ctx.fillRect(winX, winY, 22, 16);
      ctx.strokeRect(winX, winY, 22, 16);
      // Mullion window crossbars
      ctx.strokeStyle = '#2d261e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(winX + 11, winY);
      ctx.lineTo(winX + 11, winY + 16);
      ctx.moveTo(winX, winY + 8);
      ctx.lineTo(winX + 22, winY + 8);
      ctx.stroke();

      // Framed wooden doorway
      ctx.strokeStyle = outline;
      ctx.lineWidth = 2;
      ctx.fillStyle = '#332820';
      ctx.fillRect(x + hw * 0.14, y + hh - 35, 20, 31);
      ctx.strokeRect(x + hw * 0.14, y + hh - 35, 20, 31);
      ctx.fillStyle = '#c8aa74';
      ctx.fillRect(x + hw * 0.14 + 14, y + hh - 20, 3, 3);

      // Medical cross or Blacksmith forge ember glow
      if (s.type === 'medical_station') {
        ctx.fillStyle = '#b53b3b';
        ctx.fillRect(x - 3, topY - 17, 6, 14);
        ctx.fillRect(x - 7, topY - 13, 14, 6);
      } else if (s.type === 'blacksmith') {
        ctx.fillStyle = '#f77f00';
        ctx.fillRect(x - hw + 8, y + hh - 18, 12, 8);
      }
    } else if (s.type === 'wooden_wall' || s.type === 'stone_wall' || s.type === 'barricade') {
      this.drawDirectionalShadow(ctx, x, y + hh, hw, 9, nightFactor);
      ctx.fillStyle =
        s.type === 'stone_wall' || s.tier === 3
          ? '#5e656f'
          : s.tier === 2
            ? '#645c50'
            : '#725f4b';
      ctx.fillRect(x - hw, y - hh - 12, s.width, s.height + 12);
      ctx.strokeRect(x - hw, y - hh - 12, s.width, s.height + 12);

      // Timber palisade logs or iron bands (T2) or glowing runes (T3)
      ctx.lineWidth = 1.4;
      for (let px = x - hw + 11; px < x + hw - 4; px += 11) {
        ctx.beginPath();
        ctx.moveTo(px, y - hh - 12);
        ctx.lineTo(px, y + hh);
        ctx.stroke();
      }
      if (s.tier >= 2) {
        ctx.fillStyle = '#363b42';
        ctx.fillRect(x - hw + 2, y - 4, s.width - 4, 5);
      }
      if (s.tier === 3) {
        ctx.fillStyle = '#72f2ff';
        ctx.fillRect(x - 4, y - hh - 5, 8, 3);
      }
      if (s.type === 'barricade') {
        ctx.strokeStyle = s.tier >= 2 ? '#b4bec7' : '#d8cfb8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let px = x - hw + 8; px < x + hw; px += 13) {
          ctx.moveTo(px, y - hh - 12);
          ctx.lineTo(px - 3, y - hh - 22);
          ctx.moveTo(px, y - hh - 12);
          ctx.lineTo(px + 3, y - hh - 22);
        }
        ctx.stroke();
      }
    } else if (s.type === 'gate') {
      ctx.fillStyle = s.tier >= 2 ? '#454a50' : '#534538';
      if (s.isOpen) {
        ctx.fillRect(x - hw, y - hh - 8, 12, s.height + 8);
        ctx.strokeRect(x - hw, y - hh - 8, 12, s.height + 8);
        ctx.fillRect(x + hw - 12, y - hh - 8, 12, s.height + 8);
        ctx.strokeRect(x + hw - 12, y - hh - 8, 12, s.height + 8);
      } else {
        ctx.fillRect(x - hw, y - hh - 12, s.width, s.height + 12);
        ctx.strokeRect(x - hw, y - hh - 12, s.width, s.height + 12);
        ctx.fillStyle = '#9aa3ac';
        ctx.fillRect(x - hw + 4, y - 5, s.width - 8, 5);
      }
    } else if (s.type === 'torch_post') {
      this.drawDirectionalShadow(ctx, x, y + 6, 16, 6, nightFactor);
      ctx.fillStyle = '#2d3138';
      ctx.fillRect(x - 3, y - 56, 6, 60);
      ctx.strokeRect(x - 3, y - 56, 6, 60);
      // Hanging lantern bracket
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(x, y - 58, 6.2 + Math.sin(this.time * 10 + x) * 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (s.type === 'watchtower' || s.type === 'turret') {
      this.drawDirectionalShadow(ctx, x, y + hh, hw + 8, 14, nightFactor);
      if (s.type === 'watchtower') {
        const h = 82;
        // 4 sturdy timber/iron/stone tower legs & cross-bracing
        ctx.fillStyle = s.tier === 3 ? '#515964' : s.tier === 2 ? '#4d5054' : '#685643';
        ctx.fillRect(x - hw * 0.72, y + hh - h, s.width * 0.72, h);
        ctx.strokeRect(x - hw * 0.72, y + hh - h, s.width * 0.72, h);

        // Cross braces
        ctx.strokeStyle = '#26211c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - hw * 0.7, y + hh - 6);
        ctx.lineTo(x + hw * 0.7, y + hh - 46);
        ctx.moveTo(x + hw * 0.7, y + hh - 6);
        ctx.lineTo(x - hw * 0.7, y + hh - 46);
        ctx.stroke();

        // Elevated parapet platform
        ctx.strokeStyle = outline;
        ctx.fillStyle = s.tier === 3 ? '#626c78' : '#7a654f';
        ctx.fillRect(x - hw * 0.9, y + hh - h - 10, s.width * 0.9, 14);
        ctx.strokeRect(x - hw * 0.9, y + hh - h - 10, s.width * 0.9, 14);

        // Subtle cyan perimeter ring underneath completed Arrow Towers
        ctx.save();
        ctx.strokeStyle = 'rgba(142, 246, 228, 0.34)';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.ellipse(x, y + hh * 0.5, hw + 14, hh * 0.85 + 7, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Autonomous Tower Archer standing inside parapet aiming along s.aimAngle!
        const py = y + hh - h - 18;
        ctx.fillStyle = '#d4cfc4';
        ctx.beginPath();
        ctx.arc(x, py, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = s.tier >= 2 ? '#365046' : '#535a64';
        ctx.beginPath();
        ctx.arc(x, py - 3, 8.5, Math.PI, 0);
        ctx.fill();
        ctx.stroke();
        const aim = s.aimAngle ?? 0;
        ctx.strokeStyle = s.tier >= 3 ? '#ff9f43' : '#f5d89a';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(x, py);
        ctx.lineTo(x + Math.cos(aim) * 16, py + Math.sin(aim) * 16);
        ctx.stroke();

        // Watchtower brazier corner lamp
        ctx.fillStyle = s.tier === 3 ? '#ff9f43' : '#ffd166';
        ctx.beginPath();
        ctx.arc(x + hw * 0.72, y + hh - h - 12, 4.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Auto-Bolt Turret
        ctx.fillStyle = s.tier === 3 ? '#4c5764' : '#575d63';
        ctx.fillRect(x - hw * 0.72, y + hh - 36, s.width * 0.72, 36);
        ctx.strokeRect(x - hw * 0.72, y + hh - 36, s.width * 0.72, 36);
        const aim = s.aimAngle ?? 0;
        ctx.strokeStyle = '#8ef6e4';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y + hh - 30);
        ctx.lineTo(x + Math.cos(aim) * 18, y + hh - 30 + Math.sin(aim) * 18);
        ctx.stroke();
      }
    } else if (s.type === 'spike_trap') {
      ctx.fillStyle = '#3d3c39';
      ctx.fillRect(x - hw, y - hh, s.width, s.height);
      ctx.strokeRect(x - hw, y - hh, s.width, s.height);
      ctx.fillStyle = s.tier === 3 ? '#8ef6e4' : '#d2cec4';
      for (const ox of [-10, 0, 10]) {
        for (const oy of [-8, 8]) {
          ctx.beginPath();
          ctx.moveTo(x + ox - 3, y + oy + 3);
          ctx.lineTo(x + ox, y + oy - 6);
          ctx.lineTo(x + ox + 3, y + oy + 3);
          ctx.closePath();
          ctx.fill();
        }
      }
    } else if (s.type === 'farm') {
      ctx.fillStyle = '#4e4437';
      ctx.fillRect(x - hw, y - hh, s.width, s.height);
      ctx.strokeRect(x - hw, y - hh, s.width, s.height);
      ctx.fillStyle = (s.storedFood ?? 0) > 0 ? '#9ab575' : '#657357';
      for (let ry = y - hh + 10; ry < y + hh - 6; ry += 12) {
        ctx.fillRect(x - hw + 8, ry, s.width - 16, 5);
      }
    } else if (s.type === 'storage') {
      this.drawDirectionalShadow(ctx, x, y + hh, hw, 8, nightFactor);
      ctx.fillStyle = '#736552';
      ctx.fillRect(x - hw, y - hh - 8, s.width, s.height + 8);
      ctx.strokeRect(x - hw, y - hh - 8, s.width, s.height + 8);
      ctx.fillStyle = '#33373d';
      ctx.fillRect(x - hw + 2, y - 5, s.width - 4, 4);
    } else if (s.type === 'bench') {
      this.drawDirectionalShadow(ctx, x, y + 6, 26, 7, nightFactor);
      ctx.fillStyle = '#625649';
      ctx.fillRect(x - 24, y - 14, 48, 8);
      ctx.strokeRect(x - 24, y - 14, 48, 8);
      ctx.fillRect(x - 26, y - 6, 52, 6);
      ctx.strokeRect(x - 26, y - 6, 52, 6);
    }

    // Damage bar when hurt
    if (s.hp < s.maxHp) {
      const bw = 42;
      const pct = clamp(s.hp / s.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(13, 16, 22, 0.88)';
      ctx.fillRect(x - bw * 0.5, y - hh - 26, bw, 5);
      ctx.fillStyle = pct > 0.5 ? '#8ef6e4' : pct > 0.25 ? '#ffd166' : '#d65a5a';
      ctx.fillRect(x - bw * 0.5 + 1, y - hh - 25, (bw - 2) * pct, 3);
    }

    ctx.restore();
  }

  private drawResourceNode(
    ctx: CanvasRenderingContext2D,
    n: ResourceNode,
    world: GameWorld,
    nightFactor: number
  ): void {
    const x = n.x;
    const y = n.y;
    ctx.save();
    ctx.strokeStyle = n.hitFlash > 0 ? '#ffffff' : '#14171c';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';

    if (n.kind === 'pine_tree' || n.kind === 'dead_tree') {
      this.drawDirectionalShadow(ctx, x, y + 4, 28, 12, nightFactor);

      // Gentle ambient wind sway + dramatic perimeter shake along incoming wave telegraph direction!
      let shakeAmp = 2.6;
      let shakeFreq = 1.45;
      if (world.wave.phase === 'TELEGRAPH') {
        const dirVec = getDirectionVector(world.wave.direction);
        const dot = (x - world.villageCenter.x) * dirVec.x + (y - world.villageCenter.y) * dirVec.y;
        if (dot > 120) {
          shakeAmp = 7.5;
          shakeFreq = 13.5;
        }
      }
      const sway = Math.sin(this.time * shakeFreq + x * 0.025 + y * 0.015) * shakeAmp;

      // Textured bark trunk with root flare
      ctx.fillStyle = '#483b2f';
      ctx.beginPath();
      ctx.moveTo(x - 7, y + 4);
      ctx.lineTo(x - 5, y - 26);
      ctx.lineTo(x + 5, y - 26);
      ctx.lineTo(x + 7, y + 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      if (n.kind === 'pine_tree') {
        // 3 layered jagged pine foliage tiers with dark shadow undersides & swaying crown
        const drawTier = (baseY: number, width: number, height: number, fill: string, swayMult: number) => {
          const sw = sway * swayMult;
          ctx.fillStyle = fill;
          ctx.beginPath();
          ctx.moveTo(x + sw, baseY - height);
          ctx.lineTo(x + width * 0.55 + sw * 0.6, baseY - height * 0.35);
          ctx.lineTo(x + width + sw * 0.3, baseY);
          ctx.lineTo(x + width * 0.35 + sw * 0.2, baseY - 4);
          ctx.lineTo(x + sw * 0.1, baseY + 3);
          ctx.lineTo(x - width * 0.35 + sw * 0.2, baseY - 4);
          ctx.lineTo(x - width + sw * 0.3, baseY);
          ctx.lineTo(x - width * 0.55 + sw * 0.6, baseY - height * 0.35);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        };

        drawTier(y - 16, 27, 36, '#2f3d32', 0.45);
        drawTier(y - 34, 22, 34, '#3c4d3f', 0.78);
        drawTier(y - 52, 16, 28, '#4c5f4e', 1.12);
      } else {
        // Gnarled dead timber branches
        ctx.strokeStyle = '#3d352d';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y - 24);
        ctx.lineTo(x - 16 + sway * 0.4, y - 50);
        ctx.moveTo(x, y - 28);
        ctx.lineTo(x + 15 + sway * 0.4, y - 54);
        ctx.stroke();
      }
    } else if (n.kind === 'stone_boulder' || n.kind === 'metal_vein' || n.kind === 'crystal_outcrop') {
      this.drawDirectionalShadow(ctx, x, y + 4, 22, 9, nightFactor);
      ctx.fillStyle =
        n.kind === 'metal_vein' ? '#5c626a' : n.kind === 'crystal_outcrop' ? '#495e61' : '#716f68';
      ctx.beginPath();
      ctx.moveTo(x - 19, y + 4);
      ctx.lineTo(x - 14, y - 14);
      ctx.lineTo(x + 4, y - 19);
      ctx.lineTo(x + 19, y - 6);
      ctx.lineTo(x + 15, y + 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (n.kind === 'metal_vein') {
        ctx.fillStyle = '#c8a46b';
        ctx.fillRect(x - 7, y - 10, 6, 4);
        ctx.fillRect(x + 4, y - 5, 5, 4);
      } else if (n.kind === 'crystal_outcrop') {
        ctx.fillStyle = '#72f2ff';
        ctx.beginPath();
        ctx.moveTo(x - 5, y - 10);
        ctx.lineTo(x, y - 30);
        ctx.lineTo(x + 6, y - 10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    } else if (n.kind === 'berry_bush' || n.kind === 'herb_patch') {
      ctx.fillStyle = n.kind === 'herb_patch' ? '#456455' : '#3a4b3d';
      ctx.beginPath();
      ctx.arc(x - 6, y - 4, 10, 0, Math.PI * 2);
      ctx.arc(x + 6, y - 3, 9, 0, Math.PI * 2);
      ctx.arc(x, y - 10, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = n.kind === 'herb_patch' ? '#8ef6e4' : '#d26a66';
      ctx.fillRect(x - 5, y - 10, 3, 3);
      ctx.fillRect(x + 3, y - 6, 3, 3);
      ctx.fillRect(x - 1, y - 3, 3, 3);
    } else if (n.kind === 'supply_crate') {
      this.drawDirectionalShadow(ctx, x, y + 4, 16, 6, nightFactor);
      ctx.fillStyle = '#7e6d57';
      ctx.fillRect(x - 13, y - 16, 26, 20);
      ctx.strokeRect(x - 13, y - 16, 26, 20);
      ctx.beginPath();
      ctx.moveTo(x - 13, y - 16);
      ctx.lineTo(x + 13, y + 4);
      ctx.stroke();
    } else if (n.kind === 'clue_monolith') {
      this.drawDirectionalShadow(ctx, x, y + 5, 16, 6, nightFactor);
      ctx.fillStyle = '#484e54';
      ctx.beginPath();
      ctx.moveTo(x - 10, y + 4);
      ctx.lineTo(x - 7, y - 36);
      ctx.lineTo(x + 7, y - 31);
      ctx.lineTo(x + 10, y + 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#8ef6e4';
      ctx.beginPath();
      ctx.arc(x, y - 20, 3.2 + Math.sin(this.time * 4) * 1, 0, Math.PI * 2);
      ctx.fill();
    } else if (n.kind === 'wild_deer') {
      this.drawDirectionalShadow(ctx, x, y + 5, 16, 6, nightFactor);
      ctx.fillStyle = '#9b9182';
      ctx.beginPath();
      ctx.ellipse(x, y - 10, 14, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 11, y - 19, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 7, y - 4);
      ctx.lineTo(x - 8, y + 5);
      ctx.moveTo(x + 7, y - 4);
      ctx.lineTo(x + 8, y + 5);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawMerchantCart(ctx: CanvasRenderingContext2D, x: number, y: number, nightFactor: number): void {
    ctx.save();
    this.drawDirectionalShadow(ctx, x, y + 12, 46, 15, nightFactor);
    ctx.strokeStyle = '#14171c';
    ctx.lineWidth = 2.2;

    // Covered canvas wagon canopy
    ctx.fillStyle = '#6e5e4e';
    ctx.beginPath();
    ctx.roundRect(x - 42, y - 44, 64, 34, 14);
    ctx.fill();
    ctx.stroke();
    // Canvas rib seams on covered wagon hood
    ctx.strokeStyle = 'rgba(26, 22, 18, 0.5)';
    ctx.lineWidth = 1.6;
    for (const rx of [x - 24, x - 6]) {
      ctx.beginPath();
      ctx.moveTo(rx, y - 43);
      ctx.lineTo(rx, y - 11);
      ctx.stroke();
    }
    ctx.strokeStyle = '#14171c';
    ctx.lineWidth = 2;
    // Timber wagon bed
    ctx.fillStyle = '#534131';
    ctx.fillRect(x - 44, y - 14, 68, 16);
    ctx.strokeRect(x - 44, y - 14, 68, 16);
    // Spoked wooden wheels
    ctx.fillStyle = '#382c22';
    for (const wx of [x - 30, x + 10]) {
      ctx.beginPath();
      ctx.arc(wx, y + 4, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // Iron lantern pole + hanging warm amber merchant lantern
    const swing = Math.sin(this.time * 3) * 2;
    ctx.strokeStyle = '#24282e';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x + 22, y - 14);
    ctx.lineTo(x + 28, y - 42);
    ctx.lineTo(x + 36, y - 42);
    ctx.stroke();
    ctx.strokeStyle = '#14171c';
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(x + 36 + swing, y - 34, 5.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Hooded Night Merchant standing clearly in front-right of cart
    this.drawPeepBody(ctx, x + 36, y + 16, -1, 0, false, '#d9cdb6', 'round', 'hood', 0, false, nightFactor);

    // Subtle diegetic TRADER label above wagon
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MERCHANT', x - 8, y - 52);
    ctx.restore();
  }

  private drawCursedShrine(ctx: CanvasRenderingContext2D, sh: CursedShrine, nightFactor: number): void {
    const x = sh.x;
    const y = sh.y;
    const accent =
      sh.relicId === 'blood_moon_pact'
        ? '#e85d5d'
        : sh.relicId === 'watchers_eye'
          ? '#72f2ff'
          : '#ffd166';
    ctx.save();
    this.drawDirectionalShadow(ctx, x, y + 8, 26, 11, nightFactor);
    ctx.strokeStyle = '#14171c';
    ctx.lineWidth = 2.2;

    // Carved stone altar dais
    ctx.fillStyle = '#43474f';
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 24, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Ruined obelisk
    ctx.fillStyle = sh.used ? '#35383f' : '#535862';
    ctx.beginPath();
    ctx.moveTo(x - 13, y + 2);
    ctx.lineTo(x - 9, y - 46);
    ctx.lineTo(x, y - 54);
    ctx.lineTo(x + 9, y - 46);
    ctx.lineTo(x + 13, y + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (!sh.used) {
      const pulse = 0.65 + Math.sin(this.time * 4.5 + x) * 0.3;
      ctx.fillStyle = accent;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.arc(x, y - 28, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x, y - 28, 12 + Math.sin(this.time * 3) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawTrappedSurvivor(ctx: CanvasRenderingContext2D, surv: TrappedSurvivor, nightFactor: number): void {
    const isMoving = surv.state === 'ESCORTING';
    const acc = surv.role === 'BLACKSMITH' ? 'apron' : surv.role === 'SHARPSHOOTER' ? 'hood' : 'scarf';
    const tint = surv.role === 'HERBALIST' ? '#b9cbb8' : surv.role === 'SHARPSHOOTER' ? '#b5bec9' : '#cbb9a8';
    this.drawPeepBody(ctx, surv.x, surv.y, surv.facing, surv.walkCycle, isMoving, tint, 'round', acc, 0, false, nightFactor);

    if (surv.state === 'TRAPPED') {
      // Distress beacon ring + wooden debris barricade
      const pulse = 0.5 + Math.sin(this.time * 5) * 0.35;
      ctx.save();
      ctx.strokeStyle = `rgba(255, 209, 102, ${pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(surv.x, surv.y - 10, 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('HELP!', surv.x, surv.y - 58);
      ctx.restore();
    }
  }

  private drawPeepBody(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    facing: 1 | -1,
    walkCycle: number,
    isMoving: boolean,
    bodyTint: string,
    headShape: 'round' | 'square',
    accessory: string,
    hitFlash: number,
    isPlayer: boolean,
    nightFactor: number
  ): void {
    const bob = isMoving ? Math.abs(Math.sin(walkCycle)) * 3.2 : Math.sin(this.time * 2.6 + x) * 1.1;
    const stride = isMoving ? Math.sin(walkCycle) * 5.8 : 0;
    const drawY = y - bob;

    ctx.save();
    this.drawDirectionalShadow(ctx, x, y + 2, 15, 7, nightFactor);
    ctx.strokeStyle = hitFlash > 0 ? '#ffffff' : '#14171c';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';

    // Legs
    ctx.beginPath();
    ctx.moveTo(x - 4, drawY - 10);
    ctx.lineTo(x - 4 - stride, y + 2);
    ctx.moveTo(x + 4, drawY - 10);
    ctx.lineTo(x + 4 + stride, y + 2);
    ctx.stroke();

    // Stylized cloak / coat silhouette for richer 2.5D survival character presence
    ctx.fillStyle = hitFlash > 0 ? '#ffffff' : isPlayer ? '#3c4e4e' : '#4a4b4f';
    ctx.beginPath();
    ctx.moveTo(x - 9, drawY - 26);
    ctx.lineTo(x + 9, drawY - 26);
    ctx.lineTo(x + 11, drawY - 8);
    ctx.lineTo(x - 11, drawY - 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner torso tunic
    ctx.fillStyle = hitFlash > 0 ? '#ffffff' : bodyTint;
    ctx.beginPath();
    ctx.roundRect(x - 6.5, drawY - 26, 13, 15, 3);
    ctx.fill();
    ctx.stroke();

    // Subtle shaded side + warm fire rim-light highlight!
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.fillRect(x - 6, drawY - 25, 4.5, 13);

    const rim = this.getWarmRimDir(x, y);
    if (rim && nightFactor > 0.25 && hitFlash <= 0) {
      ctx.strokeStyle = `rgba(255, 209, 102, ${rim.strength * 0.72})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const rimSide = rim.x >= 0 ? 1 : -1;
      ctx.moveTo(x + rimSide * 9, drawY - 25);
      ctx.lineTo(x + rimSide * 10, drawY - 10);
      ctx.stroke();
      ctx.strokeStyle = '#14171c';
    }

    // Head
    const headY = drawY - 38;
    ctx.fillStyle = hitFlash > 0 ? '#ffffff' : bodyTint;
    if (headShape === 'square') {
      ctx.beginPath();
      ctx.roundRect(x - 11, headY - 10, 22, 20, 3);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, headY, 11.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Warm rim highlight on head facing nearest campfire/brazier
    if (rim && nightFactor > 0.25 && hitFlash <= 0) {
      ctx.strokeStyle = `rgba(255, 209, 102, ${rim.strength * 0.7})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const a0 = Math.atan2(rim.y, rim.x);
      ctx.arc(x, headY, 11, a0 - 0.85, a0 + 0.85);
      ctx.stroke();
      ctx.strokeStyle = '#14171c';
    }

    // Eyes
    const ex = facing * 2.5;
    ctx.fillStyle = '#14171c';
    ctx.fillRect(x - 4 + ex, headY - 2, 2.2, 2.8);
    ctx.fillRect(x + 2 + ex, headY - 2, 2.2, 2.8);

    // Accessories (Hoods, Scarves, Aprons, Helms, Tophat)
    if (isPlayer) {
      // Survivor hooded mantle & cyan-mint clasp
      ctx.fillStyle = '#36504e';
      ctx.beginPath();
      ctx.arc(x, headY - 2, 12.2, Math.PI * 0.95, Math.PI * 2.05);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#4e6966';
      ctx.fillRect(x - 9, drawY - 27, 18, 5);
      ctx.strokeRect(x - 9, drawY - 27, 18, 5);
      ctx.fillStyle = '#8ef6e4';
      ctx.fillRect(x + facing * 4, drawY - 26, 3, 3);
    } else if (accessory === 'hood') {
      ctx.fillStyle = '#3c4a46';
      ctx.beginPath();
      ctx.arc(x, headY - 2, 12.4, Math.PI * 0.92, Math.PI * 2.08);
      ctx.fill();
      ctx.stroke();
    } else if (accessory === 'apron') {
      ctx.fillStyle = '#5a4332';
      ctx.fillRect(x - 7, drawY - 23, 14, 15);
      ctx.strokeRect(x - 7, drawY - 23, 14, 15);
    } else if (accessory === 'tophat') {
      ctx.fillStyle = '#363434';
      ctx.fillRect(x - 12, headY - 12, 24, 3);
      ctx.strokeRect(x - 12, headY - 12, 24, 3);
      ctx.fillRect(x - 8, headY - 23, 16, 11);
      ctx.strokeRect(x - 8, headY - 23, 16, 11);
    } else if (accessory === 'helm') {
      ctx.fillStyle = '#535a64';
      ctx.beginPath();
      ctx.arc(x, headY - 4, 12, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
    } else if (accessory === 'cap') {
      ctx.fillStyle = '#52575e';
      ctx.beginPath();
      ctx.arc(x, headY - 6, 10, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
    } else if (accessory === 'scarf') {
      ctx.fillStyle = '#7c5347';
      ctx.fillRect(x - 8, drawY - 27, 16, 4.5);
      ctx.strokeRect(x - 8, drawY - 27, 16, 4.5);
    } else if (accessory === 'glasses') {
      ctx.strokeStyle = '#14171c';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(x - 6 + ex * 0.5, headY - 4, 5, 4);
      ctx.strokeRect(x + 1 + ex * 0.5, headY - 4, 5, 4);
    }

    ctx.restore();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, world: GameWorld, nightFactor: number): void {
    const p = world.player;
    const isMoving = Math.hypot(p.vx, p.vy) > 8;
    ctx.save();
    if (p.dodgeTimer > 0) ctx.globalAlpha = 0.72;

    this.drawPeepBody(ctx, p.x, p.y, p.facing, p.walkCycle, isMoving, '#dfdbd1', 'round', 'none', p.hitFlash, true, nightFactor);

    // Rooted snare vines around feet
    if ((p.rootedTimer ?? 0) > 0) {
      ctx.strokeStyle = '#89d478';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 16, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Equipped weapon oriented along aimAngle
    const spec = WEAPON_SPECS[p.equippedWeaponId];
    const handX = p.x + Math.cos(p.aimAngle) * 10;
    const handY = p.y - 18 + Math.sin(p.aimAngle) * 8;
    const swingOffset =
      p.attackPhase === 'windup'
        ? -0.65
        : p.attackPhase === 'active'
          ? 0.95
          : p.attackPhase === 'recovery'
            ? 0.45
            : 0;
    const wAngle = p.aimAngle + swingOffset;

    ctx.save();
    ctx.translate(handX, handY);
    ctx.rotate(wAngle);
    ctx.strokeStyle = '#14171c';
    ctx.lineWidth = 2;

    if (p.equippedWeaponId === 'wooden_spear') {
      ctx.fillStyle = '#7c6a53';
      ctx.fillRect(-6, -2, 34, 4);
      ctx.strokeRect(-6, -2, 34, 4);
      ctx.fillStyle = '#cfd4d6';
      ctx.beginPath();
      ctx.moveTo(28, -4);
      ctx.lineTo(39, 0);
      ctx.lineTo(28, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (p.equippedWeaponId === 'wood_axe') {
      ctx.fillStyle = '#73604a';
      ctx.fillRect(-4, -2, 24, 4);
      ctx.strokeRect(-4, -2, 24, 4);
      ctx.fillStyle = '#aeb4b8';
      ctx.fillRect(14, -9, 9, 12);
      ctx.strokeRect(14, -9, 9, 12);
    } else if (p.equippedWeaponId === 'iron_sword' || p.equippedWeaponId === 'resonance_blade') {
      ctx.fillStyle = p.equippedWeaponId === 'resonance_blade' ? '#72f2ff' : '#cfd5d8';
      ctx.fillRect(4, -2.5, 28, 5);
      ctx.strokeRect(4, -2.5, 28, 5);
      ctx.fillStyle = '#47494b';
      ctx.fillRect(0, -6, 4, 12);
    } else if (p.equippedWeaponId === 'hunting_bow' || p.equippedWeaponId === 'heavy_crossbow') {
      ctx.strokeStyle = '#6f5b43';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(4, 0, 12, -1.1, 1.1);
      ctx.stroke();
    }
    ctx.restore();

    // Melee slash arc
    if (p.attackPhase === 'active' && !spec.ranged) {
      ctx.save();
      ctx.strokeStyle =
        p.equippedWeaponId === 'resonance_blade'
          ? 'rgba(114, 242, 255, 0.85)'
          : (p.dashStrikeWindow ?? 0) > 0
            ? 'rgba(255, 209, 102, 0.88)'
            : 'rgba(242, 238, 226, 0.72)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 16, spec.range * 0.82, p.attackAngle - spec.arcRad * 0.5, p.attackAngle + spec.arcRad * 0.5);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  private drawVillager(ctx: CanvasRenderingContext2D, v: Villager, nightFactor: number): void {
    const isMoving = Math.hypot(v.vx, v.vy) > 6;
    this.drawPeepBody(
      ctx,
      v.x,
      v.y,
      v.facing,
      v.walkCycle,
      isMoving,
      v.bodyTint,
      v.headShape,
      v.accessory,
      v.hitFlash,
      false,
      nightFactor
    );

    // Visible tools, weapons, carried timber log bundles & swinging hammer animations!
    ctx.save();
    ctx.strokeStyle = '#1e2126';
    ctx.lineWidth = 2;

    if (v.carryingLogs) {
      // Worker visibly hauling a 3-log tied timber bundle back to Village Core for +Gold!
      const lx = v.x + v.facing * 9;
      const ly = v.y - 18;
      ctx.fillStyle = '#735336';
      ctx.fillRect(lx - 9, ly - 5, 18, 5);
      ctx.strokeRect(lx - 9, ly - 5, 18, 5);
      ctx.fillStyle = '#8b6644';
      ctx.fillRect(lx - 8, ly - 9, 16, 5);
      ctx.strokeRect(lx - 8, ly - 9, 16, 5);
      // Pale wood cut endcaps
      ctx.fillStyle = '#d9c3a3';
      ctx.beginPath();
      ctx.arc(lx + v.facing * 8, ly - 2.5, 2.3, 0, Math.PI * 2);
      ctx.arc(lx + v.facing * 7, ly - 6.5, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (v.role === 'GUARD') {
      ctx.beginPath();
      ctx.moveTo(v.x + v.facing * 9, v.y - 10);
      ctx.lineTo(v.x + v.facing * 14, v.y - 42);
      ctx.stroke();
      ctx.fillStyle = '#c8d0d6';
      ctx.fillRect(v.x + v.facing * 13 - 2, v.y - 46, 4, 6);
    } else if (v.role === 'SHARPSHOOTER') {
      ctx.strokeStyle = '#8b6a48';
      ctx.beginPath();
      ctx.arc(v.x + v.facing * 10, v.y - 20, 9, -1.1, 1.1);
      ctx.stroke();
    } else {
      // Worker hammer / hatchet with active swing animation while hammering blueprints or chopping!
      const swing = v.hammerAnim ? Math.sin(v.hammerAnim) * 0.85 : 0;
      ctx.save();
      ctx.translate(v.x + v.facing * 8, v.y - 18);
      ctx.rotate(swing * v.facing);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(v.facing * 11, -13);
      ctx.stroke();
      ctx.fillStyle = v.task === 'BUILDING' ? '#72f2ff' : '#858e98';
      ctx.fillRect(v.facing * 10 - 3, -16, 7, 5);
      ctx.strokeRect(v.facing * 10 - 3, -16, 7, 5);
      ctx.restore();
    }
    ctx.restore();

    if (v.bubble) {
      ctx.save();
      ctx.fillStyle = v.bubble.tone === 'alert' ? '#ffd166' : 'rgba(14, 18, 24, 0.88)';
      ctx.strokeStyle = v.bubble.tone === 'alert' ? '#14171c' : '#8ef6e4';
      ctx.lineWidth = 1.4;
      const w = Math.max(22, v.bubble.text.length * 7 + 10);
      ctx.beginPath();
      ctx.roundRect(v.x - w * 0.5, v.y - 68, w, 16, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = v.bubble.tone === 'alert' ? '#14171c' : '#e8f5ef';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(v.bubble.text, v.x, v.y - 60);
      ctx.restore();
    }

    if (v.hp < v.maxHp) {
      const pct = clamp(v.hp / v.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(13, 16, 22, 0.85)';
      ctx.fillRect(v.x - 14, v.y - 56, 28, 4);
      ctx.fillStyle = '#8ef6e4';
      ctx.fillRect(v.x - 13, v.y - 55, 26 * pct, 2);
    }
  }

  private drawMonster(ctx: CanvasRenderingContext2D, m: Monster, nightFactor: number): void {
    if (m.type === 'MIMIC' && !m.mimicRevealed) {
      this.drawPeepBody(
        ctx,
        m.x,
        m.y,
        m.facing,
        m.animPhase,
        Math.hypot(m.vx, m.vy) > 6,
        '#c2beb4',
        'round',
        'none',
        m.hitFlash,
        false,
        nightFactor
      );
      return;
    }

    ctx.save();
    const baseAlpha = m.state === 'DYING' ? clamp(m.deathTimer / 0.42, 0, 1) : (m.visibility ?? 1);
    ctx.globalAlpha = baseAlpha;

    if (m.state === 'DYING') {
      ctx.translate(m.x, m.y);
      ctx.rotate((1 - m.deathTimer / 0.42) * 1.1 * m.facing);
      ctx.translate(-m.x, -m.y);
    }

    // Banshee rage buff halo
    if ((m.buffTimer ?? 0) > 0) {
      ctx.strokeStyle = 'rgba(232, 72, 72, 0.58)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(m.x, m.y + 2, m.radius + 7, 9, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Attack windup telegraph ring
    if (m.state === 'TELEGRAPH' || m.state === 'CHARGE') {
      const pulse = 0.55 + Math.sin(this.time * 28) * 0.4;
      ctx.strokeStyle = `rgba(235, 86, 76, ${pulse})`;
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.radius + 16, 0, Math.PI * 2);
      ctx.stroke();
    }

    const x = m.x;
    const y = m.y;
    const bob = Math.sin(m.animPhase) * 2.5;
    this.drawDirectionalShadow(ctx, x, y + 4, m.radius + 6, 9, nightFactor);

    ctx.strokeStyle = m.hitFlash > 0 ? '#ffffff' : '#0b0d12';
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';

    if (m.type === 'PALE_STAG') {
      // BOSS 1: THE PALE STAG (Towering bone-white spectral antlered horror)
      ctx.fillStyle = m.hitFlash > 0 ? '#ffffff' : '#cfd6de';
      // Elongated gaunt stag torso
      ctx.beginPath();
      ctx.ellipse(x, y - 34 + bob, 24, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Four long spindly legs
      ctx.lineWidth = 3.2;
      for (const lx of [-14, -6, 6, 14]) {
        ctx.beginPath();
        ctx.moveTo(x + lx, y - 24 + bob);
        ctx.lineTo(x + lx * 1.15, y + 4 + Math.sin(m.animPhase + lx) * 4);
        ctx.stroke();
      }
      // Pale skull head
      ctx.lineWidth = 2.2;
      const hx = x + m.facing * 20;
      const hy = y - 56 + bob;
      ctx.fillStyle = '#e8eef5';
      ctx.beginPath();
      ctx.ellipse(hx, hy, 12, 9, m.facing * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Branching bone antlers!
      ctx.strokeStyle = '#e8eef5';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(hx - 4, hy - 6);
      ctx.lineTo(hx - 20, hy - 34);
      ctx.moveTo(hx - 14, hy - 22);
      ctx.lineTo(hx - 28, hy - 26);
      ctx.moveTo(hx + 4, hy - 6);
      ctx.lineTo(hx + 20, hy - 36);
      ctx.moveTo(hx + 14, hy - 24);
      ctx.lineTo(hx + 28, hy - 28);
      ctx.stroke();
      // Glowing frost-cyan eyes
      ctx.fillStyle = '#72f2ff';
      ctx.fillRect(hx + m.facing * 4 - 2, hy - 2, 4, 3.5);
    } else if (m.type === 'ROOTBOUND_WARDEN') {
      // BOSS 2: THE ROOTBOUND WARDEN (Colossal living root-titan with glowing amber/emerald sap veins)
      ctx.fillStyle = m.hitFlash > 0 ? '#ffffff' : '#2e2720';
      ctx.beginPath();
      ctx.roundRect(x - 28, y - 66 + bob, 56, 54, 12);
      ctx.fill();
      ctx.stroke();
      // Glowing mossy crown & sap veins
      ctx.strokeStyle = '#7ed97e';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x - 14, y - 18 + bob);
      ctx.lineTo(x - 4, y - 42 + bob);
      ctx.lineTo(x + 12, y - 24 + bob);
      ctx.stroke();
      // Massive branch arms
      ctx.strokeStyle = '#241c15';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x - 24, y - 48 + bob);
      ctx.lineTo(x - 40, y - 14 + bob);
      ctx.moveTo(x + 24, y - 48 + bob);
      ctx.lineTo(x + 40, y - 14 + bob);
      ctx.stroke();
      // Glowing eyes
      ctx.fillStyle = '#9ef58e';
      ctx.fillRect(x - 10, y - 54 + bob, 6, 4);
      ctx.fillRect(x + 4, y - 54 + bob, 6, 4);
    } else if (m.type === 'CRAWLER') {
      ctx.fillStyle = m.hitFlash > 0 ? '#ffffff' : '#2c2b31';
      ctx.beginPath();
      ctx.ellipse(x, y - 9 + bob, 14, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      for (const s of [-10, -4, 4, 10]) {
        ctx.moveTo(x + s, y - 6);
        ctx.lineTo(x + s * 1.4, y + 4 + Math.sin(m.animPhase + s) * 3);
      }
      ctx.stroke();
      ctx.fillStyle = '#f05a4f';
      ctx.fillRect(x + m.facing * 5 - 3, y - 12 + bob, 3, 2.5);
      ctx.fillRect(x + m.facing * 5 + 2, y - 12 + bob, 3, 2.5);
    } else if (m.type === 'BRUTE') {
      ctx.fillStyle = m.hitFlash > 0 ? '#ffffff' : '#322b29';
      ctx.beginPath();
      ctx.roundRect(x - 22, y - 52 + bob, 44, 42, 8);
      ctx.fill();
      ctx.stroke();
      // Timber-bark shoulder plates
      ctx.fillStyle = '#473e37';
      ctx.beginPath();
      ctx.arc(x + m.facing * 4, y - 52 + bob, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ff9f43';
      ctx.fillRect(x + m.facing * 6 - 4, y - 54 + bob, 3.8, 3);
      ctx.fillRect(x + m.facing * 6 + 2, y - 54 + bob, 3.8, 3);
    } else if (m.type === 'STALKER' || m.type === 'HOWLER') {
      ctx.fillStyle = m.hitFlash > 0 ? '#ffffff' : m.type === 'HOWLER' ? '#3a2d3d' : '#1b1f29';
      ctx.beginPath();
      ctx.roundRect(x - 9, y - 44 + bob, 18, 32, 5);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y - 50 + bob, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = m.type === 'HOWLER' ? '#ff6464' : '#e8f5ff';
      ctx.fillRect(x + m.facing * 3 - 4, y - 52 + bob, 3, 3);
      ctx.fillRect(x + m.facing * 3 + 2, y - 52 + bob, 3, 3);
    } else if (m.type === 'WATCHER' || m.type === 'UNKNOWN') {
      const h = m.type === 'UNKNOWN' ? 76 : 68;
      ctx.fillStyle = m.hitFlash > 0 ? '#ffffff' : '#0f1116';
      ctx.beginPath();
      ctx.roundRect(x - 10, y - h + 16, 20, h - 16, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = m.type === 'UNKNOWN' ? '#8ef6e4' : '#e6e3d8';
      ctx.beginPath();
      ctx.ellipse(x, y - h + 8, 9, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0b0d12';
      ctx.fillRect(x - 4, y - h + 5, 2.5, 4);
      ctx.fillRect(x + 2, y - h + 5, 2.5, 4);
    } else {
      // Revealed Hollow Mimic
      ctx.fillStyle = m.hitFlash > 0 ? '#ffffff' : '#2c2228';
      ctx.beginPath();
      ctx.roundRect(x - 11, y - 34 + bob, 22, 24, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#d9d3c7';
      ctx.beginPath();
      ctx.arc(x, y - 42 + bob, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e04242';
      ctx.fillRect(x - 6, y - 41 + bob, 12, 5);
    }

    // Status Effect Visual Overlays: Tarred, Burning, Stunned!
    if ((m.tarredTimer ?? 0) > 0) {
      ctx.fillStyle = 'rgba(18, 20, 26, 0.72)';
      ctx.beginPath();
      ctx.ellipse(x, y + 1, m.radius * 0.9, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if ((m.burningTimer ?? 0) > 0) {
      const f = Math.sin(this.time * 18 + x) * 4;
      ctx.fillStyle = 'rgba(247, 127, 0, 0.78)';
      ctx.beginPath();
      ctx.moveTo(x - 10, y - 8);
      ctx.quadraticCurveTo(x, y - 38 - f, x + 10, y - 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 209, 102, 0.85)';
      ctx.beginPath();
      ctx.moveTo(x - 5, y - 8);
      ctx.quadraticCurveTo(x, y - 26 - f * 0.6, x + 5, y - 8);
      ctx.closePath();
      ctx.fill();
    }
    if ((m.stunTimer ?? 0) > 0) {
      ctx.strokeStyle = '#72f2ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y - 24, m.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Monster HP bar (non-bosses; bosses get full HUD Boss Bar)
    if (!m.isBoss && m.hp < m.maxHp && m.state !== 'DYING') {
      const bw = 34;
      const pct = clamp(m.hp / m.maxHp, 0, 1);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(12, 14, 18, 0.88)';
      ctx.fillRect(x - bw * 0.5, y - 66, bw, 5);
      ctx.fillStyle = '#e05858';
      ctx.fillRect(x - bw * 0.5 + 1, y - 65, (bw - 2) * pct, 3);
    }

    ctx.restore();
  }

  private drawBuildPreview(ctx: CanvasRenderingContext2D, world: GameWorld, cursor: { x: number; y: number }): void {
    const bp = world.player.selectedBuildType ? STRUCTURE_BLUEPRINT_MAP[world.player.selectedBuildType] : null;
    if (!bp) return;
    const gx = Math.round(cursor.x / 16) * 16;
    const gy = Math.round(cursor.y / 16) * 16;
    const valid = checkPlacementValid(world, gx, gy, bp.width, bp.height);

    ctx.save();
    // Show tactical Attack or Light influence radius clearly!
    const radius = bp.attackRange > 0 ? bp.attackRange : bp.lightRadius;
    if (radius > 0) {
      ctx.fillStyle = valid ? 'rgba(255, 209, 102, 0.08)' : 'rgba(224, 88, 88, 0.08)';
      ctx.strokeStyle = valid ? 'rgba(255, 209, 102, 0.45)' : 'rgba(224, 88, 88, 0.45)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(gx, gy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = valid ? 'rgba(142, 246, 228, 0.26)' : 'rgba(220, 82, 82, 0.28)';
    ctx.strokeStyle = valid ? '#8ef6e4' : '#e05858';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.fillRect(gx - bp.width * 0.5, gy - bp.height * 0.5, bp.width, bp.height);
    ctx.strokeRect(gx - bp.width * 0.5, gy - bp.height * 0.5, bp.width, bp.height);
    ctx.restore();
  }

  private drawDynamicLighting(
    ctx: CanvasRenderingContext2D,
    world: GameWorld,
    nightFactor: number,
    fogEnabled: boolean
  ): void {
    const surgeBoost = world.darknessSurgeTimer > 0 ? 0.16 : 0;
    const effectiveNight = clamp(nightFactor + surgeBoost, 0, 1);

    // 1. Offscreen Multiply Lighting Pass (Deep Midnight Indigo #0d1321 + Warm Fire Light Pools!)
    if (effectiveNight > 0.04 || (fogEnabled && world.weather === 'FOG')) {
      const lCtx = this.lightCtx;
      const lw = this.lightCanvas.width;
      const lh = this.lightCanvas.height;
      const scaleX = lw / this.width;
      const scaleY = lh / this.height;

      // Interpolate ambient multiply color from crisp daylight (246,244,238) -> deep midnight indigo #0d1321 (13,19,33)
      const ambT = clamp(effectiveNight * 0.94 + (fogEnabled && world.weather === 'FOG' ? 0.1 : 0), 0, 0.95);
      const r = Math.round(244 + (13 - 244) * ambT);
      const g = Math.round(242 + (19 - 242) * ambT);
      const b = Math.round(236 + (33 - 236) * ambT);

      lCtx.save();
      lCtx.globalCompositeOperation = 'source-over';
      lCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      lCtx.fillRect(0, 0, lw, lh);

      // Paint warm glowing light sources onto lightCanvas using additive 'lighter'
      lCtx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.activeLights.length; i++) {
        const l = this.activeLights[i];
        const { sx, sy } = this.worldToScreen(l.x, l.y);
        const lx = sx * scaleX;
        const ly = sy * scaleY;
        const lr = l.radius * (1 + l.flicker) * this.zoom * scaleX;
        if (lx + lr < 0 || lx - lr > lw || ly + lr < 0 || ly - lr > lh) continue;

        const grad = lCtx.createRadialGradient(lx, ly, lr * 0.08, lx, ly, lr);
        if (l.color === 'crt') {
          grad.addColorStop(0, 'rgba(155, 245, 232, 0.92)');
          grad.addColorStop(0.5, 'rgba(92, 168, 162, 0.42)');
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        } else if (l.color === 'tesla') {
          grad.addColorStop(0, 'rgba(135, 235, 255, 0.95)');
          grad.addColorStop(0.5, 'rgba(72, 162, 224, 0.44)');
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        } else if (l.color === 'shrine') {
          grad.addColorStop(0, 'rgba(235, 118, 118, 0.82)');
          grad.addColorStop(0.55, 'rgba(150, 56, 56, 0.32)');
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        } else {
          // Warm firelight & lantern: Bright golden core (#ffd166) -> soft amber mid-glow (#f77f00)
          grad.addColorStop(0, `rgba(255, 232, 170, ${0.98 * l.intensity})`);
          grad.addColorStop(0.45, `rgba(247, 152, 48, ${0.62 * l.intensity})`);
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        }
        lCtx.fillStyle = grad;
        lCtx.beginPath();
        lCtx.arc(lx, ly, lr, 0, Math.PI * 2);
        lCtx.fill();
      }
      lCtx.restore();

      // Composite lightmap over scene using 'multiply' so shadows stay lush midnight indigo!
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(this.lightCanvas, 0, 0, this.width, this.height);
      ctx.restore();
    }

    // 2. Additive Warm Glow Bloom ('lighter') over fires, braziers, CRT & Tesla crystals!
    if (effectiveNight > 0.15) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.activeLights.length; i++) {
        const l = this.activeLights[i];
        const { sx, sy } = this.worldToScreen(l.x, l.y);
        const r = l.radius * 0.56 * (1 + l.flicker) * this.zoom;
        if (sx + r < 0 || sx - r > this.width || sy + r < 0 || sy - r > this.height) continue;

        const bloomAlpha = effectiveNight * 0.24 * l.intensity;
        const grad = ctx.createRadialGradient(sx, sy, 2, sx, sy, r);
        if (l.color === 'crt') {
          grad.addColorStop(0, `rgba(142, 246, 228, ${bloomAlpha})`);
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        } else if (l.color === 'tesla') {
          grad.addColorStop(0, `rgba(114, 242, 255, ${bloomAlpha * 1.15})`);
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        } else if (l.color === 'shrine') {
          grad.addColorStop(0, `rgba(235, 92, 92, ${bloomAlpha})`);
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        } else {
          grad.addColorStop(0, `rgba(255, 209, 102, ${bloomAlpha * 1.15})`);
          grad.addColorStop(0.55, `rgba(247, 127, 0, ${bloomAlpha * 0.45})`);
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawWeatherAndFog(
    ctx: CanvasRenderingContext2D,
    world: GameWorld,
    dt: number,
    fogEnabled: boolean
  ): void {
    const isRain = world.weather === 'RAIN' || world.weather === 'STORM';

    // Drifting low-lying ground fog bands (alpha 0.08 - 0.14)
    if (fogEnabled && (world.weather === 'FOG' || world.phase === 'NIGHT' || world.phase === 'EVENING')) {
      ctx.save();
      const fogAlpha = world.weather === 'FOG' ? 0.13 : 0.08;
      for (let i = 0; i < 4; i++) {
        const fx = ((this.time * (18 + i * 7) + i * 380) % (this.width + 520)) - 260;
        const fy = (i * 0.26 + 0.14) * this.height + Math.sin(this.time * 0.4 + i) * 28;
        const grad = ctx.createRadialGradient(fx, fy, 30, fx, fy, 260);
        grad.addColorStop(0, `rgba(148, 168, 190, ${fogAlpha})`);
        grad.addColorStop(1, 'rgba(148, 168, 190, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(fx - 260, fy - 120, 520, 240);
      }
      ctx.restore();
    }

    // Multi-layered diagonal rain streaks (batched into 2 draw calls!) + ground splash rings
    ctx.save();
    if (isRain) {
      for (let layer = 0; layer <= 1; layer++) {
        ctx.strokeStyle =
          layer === 1 ? 'rgba(198, 218, 236, 0.34)' : 'rgba(168, 192, 214, 0.2)';
        ctx.lineWidth = layer === 1 ? 1.5 : 1;
        const speedMult = layer === 1 ? 1.35 : 0.9;
        ctx.beginPath();
        for (let i = 0; i < this.weatherPool.length; i++) {
          const p = this.weatherPool[i];
          if (p.layer !== layer) continue;
          p.x += -140 * speedMult * dt;
          p.y += 560 * speedMult * dt;
          if (p.y > this.height) {
            p.y = -20;
            p.x = Math.random() * (this.width + 260);
          }
          if (p.x < -30) p.x = this.width + 40;
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - 5 * speedMult, p.y + 18 * speedMult);
        }
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(195, 216, 235, 0.24)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (let i = 0; i < Math.min(12, this.rainSplashes.length); i++) {
        const sp = this.rainSplashes[i];
        sp.age += dt;
        if (sp.age >= sp.maxAge) {
          sp.age = 0;
          sp.x = Math.random() * this.width;
          sp.y = Math.random() * this.height;
        }
        const t = sp.age / sp.maxAge;
        const rx = 2 + t * 10;
        const ry = 1 + t * 4.5;
        ctx.moveTo(sp.x + rx, sp.y);
        ctx.ellipse(sp.x, sp.y, rx, ry, 0, 0, Math.PI * 2);
      }
      ctx.stroke();
    } else if (fogEnabled) {
      ctx.fillStyle =
        world.phase === 'NIGHT'
          ? 'rgba(255, 216, 152, 0.14)'
          : 'rgba(220, 224, 218, 0.16)';
      for (let i = 0; i < this.weatherPool.length; i++) {
        const p = this.weatherPool[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < 0) p.x = this.width;
        if (p.y > this.height) p.y = 0;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
    }
    ctx.restore();
  }
}
