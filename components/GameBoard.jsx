import { useState, useCallback } from "react";
import {
  BOARD_CELLS, CELL_SZ, PAD, SVG_SIZE,
  cellTopLeft, wallKeyToLine, wallHitRect,
  getAllWalls, getValidMoves, flipCoord, flipWall,
} from "../lib/gameLogic";

const MARGIN   = 6;
const PIECE_SZ = CELL_SZ - MARGIN * 2;
const PIECE_RX = 10;

export default function GameBoard({
  gameState, myTeam, isMyTurn, actionMode,
  onMove, onPlaceBarricade,
  redLabel = "START MERAH", blueLabel = "START BIRU",
}) {
  const [hovCell, setHovCell] = useState(null);
  const [hovWall, setHovWall] = useState(null);

  if (!gameState) return null;

  const { red_x, red_y, blue_x, blue_y, winner } = gameState;
  const bars    = Array.isArray(gameState.barricades) ? gameState.barricades : [];
  // Red always sees themselves at bottom → flip board for red
  const isFlipped = myTeam === "red";

  const redPos  = { x: red_x,  y: red_y  };
  const bluePos = { x: blue_x, y: blue_y };
  const myPos   = myTeam === "red" ? redPos  : bluePos;
  const oppPos  = myTeam === "red" ? bluePos : redPos;

  // ── Coordinate helpers ──────────────────────────────────────────────
  // game → display
  const gToD = (gx, gy) => isFlipped ? flipCoord(gx, gy) : { x: gx, y: gy };
  // display → game (same transform, symmetric)
  const dToG = gToD;
  // game wall → display wall (symmetric)
  const gWallToDisplay = (key) => isFlipped ? flipWall(key) : key;

  // ── Valid moves in display space ────────────────────────────────────
  const gameMoves   = (isMyTurn && actionMode === "move" && !winner)
    ? getValidMoves(myPos, bars, oppPos) : [];
  const displayMoves = gameMoves.map(m => gToD(m.x, m.y));
  const isValidDisp = (dx, dy) => displayMoves.some(m => m.x === dx && m.y === dy);

  // ── Walls ───────────────────────────────────────────────────────────
  const canWall    = isMyTurn && actionMode === "barricade" && !winner;
  const freeGWalls = canWall ? getAllWalls().filter(w => !bars.includes(w)) : [];
  const freeDWalls = freeGWalls.map(gWallToDisplay); // display space

  const myColor = myTeam === "red" ? "#D94F3D" : "#3D6BD9";

  // ── Piece display positions ─────────────────────────────────────────
  const { x: rdx, y: rdy } = gToD(red_x,  red_y);
  const { x: bdx, y: bdy } = gToD(blue_x, blue_y);
  const rTL = { x: PAD + rdx * CELL_SZ + MARGIN, y: PAD + rdy * CELL_SZ + MARGIN };
  const bTL = { x: PAD + bdx * CELL_SZ + MARGIN, y: PAD + bdy * CELL_SZ + MARGIN };

  // ── Home row display positions ──────────────────────────────────────
  // Red home is y=0 in game space, Blue home is y=8 in game space
  const redHomeDispY  = gToD(0, 0).y;
  const blueHomeDispY = gToD(0, BOARD_CELLS - 1).y;

  // ── Handlers ────────────────────────────────────────────────────────
  const handleCellClick = useCallback((dx, dy) => {
    if (!isMyTurn || actionMode !== "move" || winner) return;
    const { x: gx, y: gy } = dToG(dx, dy);
    if (gameMoves.some(m => m.x === gx && m.y === gy)) onMove(gx, gy);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, actionMode, winner, JSON.stringify(gameMoves), isFlipped, onMove]);

  const handleWallClick = useCallback((displayWallKey) => {
    if (!canWall) return;
    const gameWallKey = gWallToDisplay(displayWallKey); // flip back to game space
    if (!bars.includes(gameWallKey)) onPlaceBarricade(gameWallKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canWall, JSON.stringify(bars), isFlipped, onPlaceBarricade]);

  return (
    <svg viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`} width="100%" height="100%"
      style={{ maxWidth: SVG_SIZE, maxHeight: SVG_SIZE, display: "block", margin: "0 auto" }}>

      {/* Outer bg */}
      <rect x={0} y={0} width={SVG_SIZE} height={SVG_SIZE} rx={16} fill="#E8E2D8" />

      {/* Board bg */}
      <rect x={PAD} y={PAD} width={CELL_SZ*BOARD_CELLS} height={CELL_SZ*BOARD_CELLS}
        rx={4} fill="#F0EDE6" stroke="#C4BFB7" strokeWidth={2} />

      {/* Home row tints — in DISPLAY space */}
      <rect x={PAD} y={PAD + redHomeDispY * CELL_SZ}
        width={CELL_SZ*BOARD_CELLS} height={CELL_SZ} fill="#D94F3D" opacity={0.12} />
      <rect x={PAD} y={PAD + blueHomeDispY * CELL_SZ}
        width={CELL_SZ*BOARD_CELLS} height={CELL_SZ} fill="#3D6BD9" opacity={0.12} />

      {/* Cell interaction rects (display coords) */}
      {Array.from({ length: BOARD_CELLS }).flatMap((_, dy) =>
        Array.from({ length: BOARD_CELLS }).map((_, dx) => {
          const { x: cx, y: cy } = cellTopLeft(dx, dy);
          const valid = isValidDisp(dx, dy);
          const hov   = hovCell?.x === dx && hovCell?.y === dy;
          return (
            <rect key={`c${dx}-${dy}`}
              x={cx} y={cy} width={CELL_SZ} height={CELL_SZ}
              fill={valid && hov ? myColor+"66" : valid ? myColor+"28" : "transparent"}
              style={{ cursor: valid ? "pointer" : "default", transition: "fill .12s" }}
              onMouseEnter={() => valid && setHovCell({ x: dx, y: dy })}
              onMouseLeave={() => setHovCell(null)}
              onClick={() => handleCellClick(dx, dy)}
            />
          );
        })
      )}

      {/* Valid move dashed ring (display coords) */}
      {displayMoves.map(({ x: dx, y: dy }) => {
        const { x: cx, y: cy } = cellTopLeft(dx, dy);
        return (
          <rect key={`vm${dx}-${dy}`}
            x={cx+3} y={cy+3} width={CELL_SZ-6} height={CELL_SZ-6}
            rx={8} fill="none"
            stroke={myColor} strokeWidth={2.5} strokeDasharray="7 4" opacity={0.75}
            style={{ pointerEvents: "none" }}
          />
        );
      })}

      {/* Internal grid lines */}
      {Array.from({ length: BOARD_CELLS - 1 }).map((_, i) => {
        const p = PAD + (i+1)*CELL_SZ;
        return (
          <g key={`gl${i}`}>
            <line x1={p} y1={PAD} x2={p} y2={PAD+CELL_SZ*BOARD_CELLS} stroke="#D4CFC6" strokeWidth={1} />
            <line x1={PAD} y1={p} x2={PAD+CELL_SZ*BOARD_CELLS} y2={p} stroke="#D4CFC6" strokeWidth={1} />
          </g>
        );
      })}

      {/* Column / row labels */}
      {Array.from({ length: BOARD_CELLS }).map((_, i) => (
        <g key={`lbl${i}`}>
          <text x={PAD+i*CELL_SZ+CELL_SZ/2} y={PAD-14}
            textAnchor="middle" fontSize={11} fill="#A8A49C" fontFamily="DM Sans,sans-serif">
            {String.fromCharCode(65+i)}
          </text>
          <text x={PAD-14} y={PAD+i*CELL_SZ+CELL_SZ/2+4}
            textAnchor="middle" fontSize={11} fill="#A8A49C" fontFamily="DM Sans,sans-serif">
            {i+1}
          </text>
        </g>
      ))}

      {/* Home labels — dynamic per perspective */}
      <text x={PAD+(CELL_SZ*BOARD_CELLS)/2} y={PAD-2}
        textAnchor="middle" fontSize={9} fontWeight={700} fontFamily="DM Sans,sans-serif"
        fill={isFlipped ? "#3D6BD9" : "#D94F3D"}>
        ▼ {isFlipped ? blueLabel : redLabel}
      </text>
      <text x={PAD+(CELL_SZ*BOARD_CELLS)/2} y={PAD+CELL_SZ*BOARD_CELLS+18}
        textAnchor="middle" fontSize={9} fontWeight={700} fontFamily="DM Sans,sans-serif"
        fill={isFlipped ? "#D94F3D" : "#3D6BD9"}>
        ▲ {isFlipped ? redLabel : blueLabel}
      </text>

      {/* Barricade hover preview (display wall) */}
      {hovWall && freeDWalls.includes(hovWall) && (() => {
        const { x1, y1, x2, y2 } = wallKeyToLine(hovWall);
        return <line x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={myColor} strokeWidth={7} strokeLinecap="round"
          opacity={0.5} strokeDasharray="10 5" />;
      })()}

      {/* Placed barricades — render in display space */}
      {bars.map(gameKey => {
        const displayKey = gWallToDisplay(gameKey);
        const { x1, y1, x2, y2 } = wallKeyToLine(displayKey);
        return <line key={gameKey} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="#3A3632" strokeWidth={6} strokeLinecap="round" />;
      })}

      {/* Wall hit targets (display walls) */}
      {canWall && freeDWalls.map((displayKey, i) => {
        const { rx, ry, rw, rh } = wallHitRect(displayKey);
        return (
          <rect key={`wh${i}`} x={rx} y={ry} width={rw} height={rh}
            fill="transparent" style={{ cursor: "crosshair" }}
            onMouseEnter={() => setHovWall(displayKey)}
            onMouseLeave={() => setHovWall(null)}
            onClick={() => handleWallClick(displayKey)}
          />
        );
      })}

      {/* Blue piece */}
      <g style={{ transform: `translate(${bTL.x}px,${bTL.y}px)`, transition: "transform .35s cubic-bezier(.34,1.56,.64,1)" }}>
        <rect x={0} y={0} width={PIECE_SZ} height={PIECE_SZ} rx={PIECE_RX} fill="#3D6BD9" />
        <text x={PIECE_SZ/2} y={PIECE_SZ/2+6} textAnchor="middle" fontSize={17}
          fontWeight={700} fill="white" fontFamily="DM Sans,sans-serif">B</text>
      </g>

      {/* Red piece */}
      <g style={{ transform: `translate(${rTL.x}px,${rTL.y}px)`, transition: "transform .35s cubic-bezier(.34,1.56,.64,1)" }}>
        <rect x={0} y={0} width={PIECE_SZ} height={PIECE_SZ} rx={PIECE_RX} fill="#D94F3D" />
        <text x={PIECE_SZ/2} y={PIECE_SZ/2+6} textAnchor="middle" fontSize={17}
          fontWeight={700} fill="white" fontFamily="DM Sans,sans-serif">R</text>
      </g>
    </svg>
  );
}
