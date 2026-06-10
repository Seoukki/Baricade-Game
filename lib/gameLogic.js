export const BOARD_CELLS    = 9;
export const MAX_BARRICADES = 10;

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

// ── Perspective flip ────────────────────────────────────────────────────────
// Red player always sees themselves at the BOTTOM (board is flipped for red)
// Blue player sees themselves at the BOTTOM by default (no flip needed)
// isFlipped = (myTeam === "red")

export function flipCoord(x, y) {
  return { x: BOARD_CELLS - 1 - x, y: BOARD_CELLS - 1 - y };
}

// Flip a wall key (symmetric: applying twice returns original)
export function flipWall(key) {
  const [type, xs, ys] = key.split("_");
  const x = +xs, y = +ys;
  if (type === "R") return `R_${BOARD_CELLS - 2 - x}_${BOARD_CELLS - 1 - y}`;
  return               `D_${BOARD_CELLS - 1 - x}_${BOARD_CELLS - 2 - y}`;
}

// ── Wall keys ───────────────────────────────────────────────────────────────
// R_x_y = right wall of cell (x,y)  → vertical border between (x,y)↔(x+1,y)
// D_x_y = down  wall of cell (x,y)  → horizontal border between (x,y)↔(x,y+1)

export const getRightWallKey = (x, y) => `R_${x}_${y}`;
export const getDownWallKey  = (x, y) => `D_${x}_${y}`;

export function parseWallKey(key) {
  const [type, x, y] = key.split("_");
  return { type, x: +x, y: +y };
}

export function getWallBetween(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (dx ===  1 && dy === 0) return getRightWallKey(from.x, from.y);
  if (dx === -1 && dy === 0) return getRightWallKey(to.x,   to.y);
  if (dy ===  1 && dx === 0) return getDownWallKey(from.x,  from.y);
  if (dy === -1 && dx === 0) return getDownWallKey(to.x,    to.y);
  return null;
}

// ── Movement ────────────────────────────────────────────────────────────────
export function isValidMove(from, to, barricades, opponentPos) {
  if (to.x < 0 || to.x >= BOARD_CELLS || to.y < 0 || to.y >= BOARD_CELLS) return false;
  if (opponentPos && opponentPos.x === to.x && opponentPos.y === to.y) return false;
  const dx = Math.abs(to.x - from.x), dy = Math.abs(to.y - from.y);
  if (!((dx === 1 && dy === 0) || (dx === 0 && dy === 1))) return false;
  const wall = getWallBetween(from, to);
  if (wall && barricades.includes(wall)) return false;
  return true;
}

export function getValidMoves(pos, barricades, opponentPos) {
  return [
    { x: pos.x + 1, y: pos.y }, { x: pos.x - 1, y: pos.y },
    { x: pos.x, y: pos.y + 1 }, { x: pos.x, y: pos.y - 1 },
  ].filter(to => isValidMove(pos, to, barricades, opponentPos));
}

export function getAllWalls() {
  const w = [];
  for (let y = 0; y < BOARD_CELLS; y++)
    for (let x = 0; x < BOARD_CELLS - 1; x++) w.push(getRightWallKey(x, y));
  for (let y = 0; y < BOARD_CELLS - 1; y++)
    for (let x = 0; x < BOARD_CELLS; x++) w.push(getDownWallKey(x, y));
  return w;
}

export function checkWin(redPos, bluePos) {
  if (redPos.y >= BOARD_CELLS - 1) return "red";
  if (bluePos.y <= 0)              return "blue";
  return null;
}

// ── SVG ─────────────────────────────────────────────────────────────────────
export const CELL_SZ  = 54;
export const PAD      = 32;
export const SVG_SIZE = PAD * 2 + CELL_SZ * BOARD_CELLS;

export function cellTopLeft(x, y) {
  return { x: PAD + x * CELL_SZ, y: PAD + y * CELL_SZ };
}

export function wallKeyToLine(key) {
  const { type, x, y } = parseWallKey(key);
  if (type === "R") return {
    x1: PAD + (x+1)*CELL_SZ, y1: PAD + y*CELL_SZ,
    x2: PAD + (x+1)*CELL_SZ, y2: PAD + (y+1)*CELL_SZ,
  };
  return {
    x1: PAD + x*CELL_SZ,       y1: PAD + (y+1)*CELL_SZ,
    x2: PAD + (x+1)*CELL_SZ,   y2: PAD + (y+1)*CELL_SZ,
  };
}

export function wallHitRect(key) {
  const { x1, y1, x2, y2 } = wallKeyToLine(key);
  const H = 9;
  if (x1 === x2) return { rx: x1-H, ry: y1,   rw: H*2,    rh: y2-y1 };
  return              { rx: x1,   ry: y1-H, rw: x2-x1,  rh: H*2   };
}

// ── AI ───────────────────────────────────────────────────────────────────────
export function computeAIMove(gs) {
  const bars   = Array.isArray(gs.barricades) ? gs.barricades : [];
  const aiPos  = { x: gs.blue_x, y: gs.blue_y };
  const oppPos = { x: gs.red_x,  y: gs.red_y  };
  const myBars = gs.blue_barricades ?? MAX_BARRICADES;

  const myMoves  = getValidMoves(aiPos,  bars, oppPos);
  const oppMoves = getValidMoves(oppPos, bars, aiPos);

  const winMove = myMoves.find(m => m.y === 0);
  if (winMove) return { action: "move", pos: winMove };

  if (myBars > 0) {
    const oppWin = oppMoves.find(m => m.y === BOARD_CELLS - 1);
    if (oppWin) {
      const wall = getWallBetween(oppPos, oppWin);
      if (wall && !bars.includes(wall)) return { action: "barricade", wall };
    }
  }

  const toGoal = myMoves.filter(m => m.y < aiPos.y).sort((a, b) => a.y - b.y);
  if (toGoal.length > 0) return { action: "move", pos: toGoal[0] };

  if (myBars > 0 && gs.red_y >= 4) {
    for (const mv of oppMoves.filter(m => m.y > oppPos.y)) {
      const wall = getWallBetween(oppPos, mv);
      if (wall && !bars.includes(wall)) return { action: "barricade", wall };
    }
  }

  if (myMoves.length > 0) return { action: "move", pos: myMoves[0] };

  if (myBars > 0) {
    const free = getAllWalls().find(w => !bars.includes(w));
    if (free) return { action: "barricade", wall: free };
  }

  return null;
}
