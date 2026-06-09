import { useState, useCallback } from "react";
import {
  BOARD_CELLS, CELL_SZ, PAD, SVG_SIZE,
  cellTopLeft, wallKeyToLine, wallHitRect,
  getAllWalls, getValidMoves,
} from "../lib/gameLogic";

const MARGIN   = 6;
const PIECE_SZ = CELL_SZ - MARGIN * 2;
const PIECE_RX = 10;

export default function GameBoard({
  gameState,
  myTeam,
  isMyTurn,
  actionMode,
  onMove,
  onPlaceBarricade,
}) {
  const [hoveredCell, setHoveredCell] = useState(null);
  const [hoveredWall, setHoveredWall] = useState(null);

  if (!gameState) return null;

  const { red_x, red_y, blue_x, blue_y, winner } = gameState;
  const bars    = Array.isArray(gameState.barricades) ? gameState.barricades : [];
  const redPos  = { x: red_x,  y: red_y  };
  const bluePos = { x: blue_x, y: blue_y };
  const myPos   = myTeam === "red" ? redPos : bluePos;
  const oppPos  = myTeam === "red" ? bluePos : redPos;

  const validMoves  = (isMyTurn && actionMode === "move" && !winner)
    ? getValidMoves(myPos, bars, oppPos) : [];
  const canWall    = isMyTurn && actionMode === "barricade" && !winner;
  const freeWalls  = canWall ? getAllWalls().filter(w => !bars.includes(w)) : [];

  const isValidCell = (x, y) => validMoves.some(m => m.x === x && m.y === y);

  const myColor = myTeam === "red" ? "#D94F3D" : "#3D6BD9";

  // piece SVG top-left (for transform animation)
  const rTL = { x: PAD + red_x  * CELL_SZ + MARGIN, y: PAD + red_y  * CELL_SZ + MARGIN };
  const bTL = { x: PAD + blue_x * CELL_SZ + MARGIN, y: PAD + blue_y * CELL_SZ + MARGIN };

  const handleCellClick = useCallback((x, y) => {
    if (!isMyTurn || actionMode !== "move" || winner) return;
    if (validMoves.some(m => m.x === x && m.y === y)) onMove(x, y);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, actionMode, winner, JSON.stringify(validMoves), onMove]);

  const handleWallClick = useCallback((key) => {
    if (!canWall || bars.includes(key)) return;
    onPlaceBarricade(key);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canWall, JSON.stringify(bars), onPlaceBarricade]);

  return (
    <svg
      viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
      width="100%" height="100%"
      style={{ maxWidth: SVG_SIZE, maxHeight: SVG_SIZE, display: "block", margin: "0 auto" }}
    >
      {/* Outer bg */}
      <rect x={0} y={0} width={SVG_SIZE} height={SVG_SIZE} rx={16} fill="#E8E2D8" />

      {/* Board bg */}
      <rect x={PAD} y={PAD}
        width={CELL_SZ * BOARD_CELLS} height={CELL_SZ * BOARD_CELLS}
        rx={4} fill="#F0EDE6" stroke="#C4BFB7" strokeWidth={2} />

      {/* Home row tints */}
      <rect x={PAD} y={PAD}
        width={CELL_SZ * BOARD_CELLS} height={CELL_SZ}
        fill="#D94F3D" opacity={0.12} />
      <rect x={PAD} y={PAD + CELL_SZ * (BOARD_CELLS - 1)}
        width={CELL_SZ * BOARD_CELLS} height={CELL_SZ}
        fill="#3D6BD9" opacity={0.12} />

      {/* Cell interaction rects */}
      {Array.from({ length: BOARD_CELLS }).flatMap((_, y) =>
        Array.from({ length: BOARD_CELLS }).map((_, x) => {
          const { x: cx, y: cy } = cellTopLeft(x, y);
          const valid  = isValidCell(x, y);
          const hov    = hoveredCell?.x === x && hoveredCell?.y === y;
          return (
            <rect key={`c${x}-${y}`}
              x={cx} y={cy} width={CELL_SZ} height={CELL_SZ}
              fill={valid && hov ? myColor + "55" : valid ? myColor + "25" : "transparent"}
              style={{ cursor: valid ? "pointer" : "default", transition: "fill .15s" }}
              onMouseEnter={() => valid && setHoveredCell({ x, y })}
              onMouseLeave={() => setHoveredCell(null)}
              onClick={() => handleCellClick(x, y)}
            />
          );
        })
      )}

      {/* Valid move ring */}
      {validMoves.map(({ x, y }) => {
        const { x: cx, y: cy } = cellTopLeft(x, y);
        return (
          <rect key={`vm${x}-${y}`}
            x={cx + 3} y={cy + 3} width={CELL_SZ - 6} height={CELL_SZ - 6}
            rx={8} fill="none"
            stroke={myColor} strokeWidth={2.5} strokeDasharray="6 4" opacity={0.7}
            style={{ pointerEvents: "none" }}
          />
        );
      })}

      {/* Internal grid lines */}
      {Array.from({ length: BOARD_CELLS - 1 }).map((_, i) => {
        const p = PAD + (i + 1) * CELL_SZ;
        return (
          <g key={`gl${i}`}>
            <line x1={p} y1={PAD} x2={p} y2={PAD + CELL_SZ * BOARD_CELLS}
              stroke="#D4CFC6" strokeWidth={1} />
            <line x1={PAD} y1={p} x2={PAD + CELL_SZ * BOARD_CELLS} y2={p}
              stroke="#D4CFC6" strokeWidth={1} />
          </g>
        );
      })}

      {/* Column / row labels */}
      {Array.from({ length: BOARD_CELLS }).map((_, i) => (
        <g key={`lbl${i}`}>
          <text x={PAD + i * CELL_SZ + CELL_SZ / 2} y={PAD - 14}
            textAnchor="middle" fontSize={11} fill="#A8A49C"
            fontFamily="DM Sans,sans-serif">{String.fromCharCode(65 + i)}</text>
          <text x={PAD - 14} y={PAD + i * CELL_SZ + CELL_SZ / 2 + 4}
            textAnchor="middle" fontSize={11} fill="#A8A49C"
            fontFamily="DM Sans,sans-serif">{i + 1}</text>
        </g>
      ))}

      {/* Home labels inside SVG */}
      <text x={PAD + (CELL_SZ * BOARD_CELLS) / 2} y={PAD - 2}
        textAnchor="middle" fontSize={9} fill="#D94F3D"
        fontFamily="DM Sans,sans-serif" fontWeight={700}>▼ START MERAH</text>
      <text x={PAD + (CELL_SZ * BOARD_CELLS) / 2} y={PAD + CELL_SZ * BOARD_CELLS + 18}
        textAnchor="middle" fontSize={9} fill="#3D6BD9"
        fontFamily="DM Sans,sans-serif" fontWeight={700}>▲ START BIRU</text>

      {/* Barricade hover preview */}
      {hoveredWall && freeWalls.includes(hoveredWall) && (() => {
        const { x1, y1, x2, y2 } = wallKeyToLine(hoveredWall);
        return (
          <line x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={myColor} strokeWidth={7} strokeLinecap="round"
            opacity={0.5} strokeDasharray="10 5" />
        );
      })()}

      {/* Placed barricades */}
      {bars.map(key => {
        const { x1, y1, x2, y2 } = wallKeyToLine(key);
        return (
          <line key={key} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#3A3632" strokeWidth={6} strokeLinecap="round" />
        );
      })}

      {/* Wall hit targets (barricade mode) */}
      {canWall && freeWalls.map(key => {
        const { rx, ry, rw, rh } = wallHitRect(key);
        return (
          <rect key={key} x={rx} y={ry} width={rw} height={rh}
            fill="transparent" style={{ cursor: "crosshair" }}
            onMouseEnter={() => setHoveredWall(key)}
            onMouseLeave={() => setHoveredWall(null)}
            onClick={() => handleWallClick(key)}
          />
        );
      })}

      {/* Blue piece (CSS transform for smooth animation) */}
      <g style={{
        transform: `translate(${bTL.x}px,${bTL.y}px)`,
        transition: "transform .38s cubic-bezier(.34,1.56,.64,1)",
      }}>
        <rect x={0} y={0} width={PIECE_SZ} height={PIECE_SZ} rx={PIECE_RX}
          fill="#3D6BD9" />
        <text x={PIECE_SZ / 2} y={PIECE_SZ / 2 + 6}
          textAnchor="middle" fontSize={17} fontWeight={700}
          fill="white" fontFamily="DM Sans,sans-serif">B</text>
      </g>

      {/* Red piece */}
      <g style={{
        transform: `translate(${rTL.x}px,${rTL.y}px)`,
        transition: "transform .38s cubic-bezier(.34,1.56,.64,1)",
      }}>
        <rect x={0} y={0} width={PIECE_SZ} height={PIECE_SZ} rx={PIECE_RX}
          fill="#D94F3D" />
        <text x={PIECE_SZ / 2} y={PIECE_SZ / 2 + 6}
          textAnchor="middle" fontSize={17} fontWeight={700}
          fill="white" fontFamily="DM Sans,sans-serif">R</text>
      </g>
    </svg>
  );
}
