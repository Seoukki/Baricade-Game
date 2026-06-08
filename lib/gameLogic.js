export const BOARD_SIZE = 9; // 9×9 intersections

// ── ID generators ──────────────────────────────────────────────────────────

export function generateCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++)
    out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function generateSessionId() {
  return "s_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Edge helpers ───────────────────────────────────────────────────────────
// Horizontal edge between (x,y)↔(x+1,y)  →  key: "h_x_y"
// Vertical   edge between (x,y)↔(x,y+1)  →  key: "v_x_y"

export function getEdgeKey(pos1, pos2) {
  if (pos1.y === pos2.y) {
    return `h_${Math.min(pos1.x, pos2.x)}_${pos1.y}`;
  }
  if (pos1.x === pos2.x) {
    return `v_${pos1.x}_${Math.min(pos1.y, pos2.y)}`;
  }
  return null;
}

export function parseEdgeKey(key) {
  const [type, x, y] = key.split("_");
  return { type, x: +x, y: +y };
}

export function isEdgeBlocked(pos1, pos2, barricades) {
  const key = getEdgeKey(pos1, pos2);
  return key ? barricades.includes(key) : false;
}

// ── Movement validation ────────────────────────────────────────────────────

export function isValidMove(from, to, barricades, opponentPos) {
  if (to.x < 0 || to.x >= BOARD_SIZE) return false;
  if (to.y < 0 || to.y >= BOARD_SIZE) return false;
  if (opponentPos && opponentPos.x === to.x && opponentPos.y === to.y) return false;
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  if (!((dx === 1 && dy === 0) || (dx === 0 && dy === 1))) return false;
  if (isEdgeBlocked(from, to, barricades)) return false;
  return true;
}

export function getValidMoves(pos, barricades, opponentPos) {
  return [
    { x: pos.x + 1, y: pos.y },
    { x: pos.x - 1, y: pos.y },
    { x: pos.x, y: pos.y + 1 },
    { x: pos.x, y: pos.y - 1 },
  ].filter((to) => isValidMove(pos, to, barricades, opponentPos));
}

// ── All board edges ────────────────────────────────────────────────────────

export function getAllEdges() {
  const edges = [];
  // horizontal  h_x_y  x ∈ [0..BOARD_SIZE-2]  y ∈ [0..BOARD_SIZE-1]
  for (let y = 0; y < BOARD_SIZE; y++)
    for (let x = 0; x < BOARD_SIZE - 1; x++)
      edges.push(`h_${x}_${y}`);
  // vertical    v_x_y  x ∈ [0..BOARD_SIZE-1]  y ∈ [0..BOARD_SIZE-2]
  for (let x = 0; x < BOARD_SIZE; x++)
    for (let y = 0; y < BOARD_SIZE - 1; y++)
      edges.push(`v_${x}_${y}`);
  return edges;
}

// ── Win condition ──────────────────────────────────────────────────────────

export function checkWin(redPos, bluePos) {
  if (redPos.y >= BOARD_SIZE - 1) return "red";
  if (bluePos.y <= 0) return "blue";
  return null;
}

// ── SVG coordinate helpers ─────────────────────────────────────────────────

export const CELL = 52;
export const PAD = 32;
export const SVG_SIZE = PAD * 2 + CELL * (BOARD_SIZE - 1); // 480

export function toSVG(x, y) {
  return { x: PAD + x * CELL, y: PAD + y * CELL };
}

/** Returns {x1,y1,x2,y2} line for an edge key */
export function edgeToLine(key) {
  const { type, x, y } = parseEdgeKey(key);
  if (type === "h") {
    return { x1: PAD + x * CELL, y1: PAD + y * CELL, x2: PAD + (x + 1) * CELL, y2: PAD + y * CELL };
  }
  return { x1: PAD + x * CELL, y1: PAD + y * CELL, x2: PAD + x * CELL, y2: PAD + (y + 1) * CELL };
}

/** Returns a rect around an edge for hit-testing */
export function edgeHitRect(key) {
  const { x1, y1, x2, y2 } = edgeToLine(key);
  const HIT = 10;
  if (x1 === x2) {
    // vertical edge → wide horizontal rect
    return { rx: x1 - HIT, ry: y1, rw: HIT * 2, rh: y2 - y1 };
  }
  // horizontal edge → tall vertical rect
  return { rx: x1, ry: y1 - HIT, rw: x2 - x1, rh: HIT * 2 };
}
