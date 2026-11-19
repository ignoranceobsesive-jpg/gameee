import { GameWorld, Vec2 } from './types';

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function resolveCircleRectCollision(
  pos: Vec2,
  radius: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): boolean {
  const halfW = rw * 0.5;
  const halfH = rh * 0.5;
  const nearestX = clamp(pos.x, rx - halfW, rx + halfW);
  const nearestY = clamp(pos.y, ry - halfH, ry + halfH);
  const dx = pos.x - nearestX;
  const dy = pos.y - nearestY;
  const distSq = dx * dx + dy * dy;

  if (distSq >= radius * radius) return false;

  if (distSq > 0.0001) {
    const dist = Math.sqrt(distSq);
    const push = radius - dist;
    pos.x += (dx / dist) * push;
    pos.y += (dy / dist) * push;
  } else {
    // Center inside rectangle: push out along shortest axis
    const overlapX = halfW + radius - Math.abs(pos.x - rx);
    const overlapY = halfH + radius - Math.abs(pos.y - ry);
    if (overlapX < overlapY) {
      pos.x += pos.x < rx ? -overlapX : overlapX;
    } else {
      pos.y += pos.y < ry ? -overlapY : overlapY;
    }
  }
  return true;
}

export function resolveWorldCollisions(
  world: GameWorld,
  pos: Vec2,
  radius: number,
  allowOpenGates = true
): void {
  pos.x = clamp(pos.x, 42 + radius, world.worldWidth - 42 - radius);
  pos.y = clamp(pos.y, 42 + radius, world.worldHeight - 42 - radius);

  // Solid structures
  for (let i = 0; i < world.structures.length; i++) {
    const s = world.structures[i];
    if (s.destroyed || !s.blocksMovement) continue;
    if (s.type === 'gate' && s.isOpen && allowOpenGates) continue;
    resolveCircleRectCollision(pos, radius, s.x, s.y, s.width, s.height);
  }

  // Solid resource nodes (trees, rocks, monoliths)
  for (let i = 0; i < world.resourceNodes.length; i++) {
    const n = world.resourceNodes[i];
    if (n.depleted || !n.blocksMovement) continue;
    const dx = pos.x - n.x;
    const dy = pos.y - n.y;
    const minDist = radius + n.radius * 0.72;
    const distSq = dx * dx + dy * dy;
    if (distSq < minDist * minDist && distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      const push = minDist - dist;
      pos.x += (dx / dist) * push;
      pos.y += (dy / dist) * push;
    }
  }
}

export function checkPlacementValid(
  world: GameWorld,
  x: number,
  y: number,
  width: number,
  height: number
): boolean {
  if (x < 90 || x > world.worldWidth - 90 || y < 90 || y > world.worldHeight - 90) {
    return false;
  }

  // Must not overlap player tightly
  if (Math.hypot(x - world.player.x, y - world.player.y) < Math.max(width, height) * 0.42 + 12) {
    return false;
  }

  // Must not overlap existing structures (ignore small decorative benches so plaza placement feels generous)
  for (const s of world.structures) {
    if (s.destroyed || s.type === 'bench') continue;
    const margin = s.type === 'campfire' ? 0.4 : 0.42;
    const overlapX = Math.abs(x - s.x) < (width + s.width) * margin;
    const overlapY = Math.abs(y - s.y) < (height + s.height) * margin;
    if (overlapX && overlapY) return false;
  }

  // Must not overlap solid resource nodes
  for (const n of world.resourceNodes) {
    if (n.depleted || !n.blocksMovement) continue;
    if (Math.hypot(x - n.x, y - n.y) < Math.max(width, height) * 0.45 + n.radius * 0.7) {
      return false;
    }
  }

  return true;
}
