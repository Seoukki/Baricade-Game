import { useState, useCallback } from "react";
import {
  BOARD_SIZE, CELL, PAD, SVG_SIZE,
  toSVG, edgeToLine, edgeHitRect,
  getAllEdges, getValidMoves,
} from "../lib/gameLogic";

const PIECE_R = 16;
const NODE_R  = 4;

export default function GameBoard({
  gameState,
  myTeam,
  isMyTurn,
  onMove,
  onPlaceBarricade,
}) {
  const [hoveredEdge, setHoveredEdge]   = useState(null);
  const [hoveredMove, setHoveredMove]   = useState(null);

  if (!gameState) return null;

  const {
    red_x, red_y, blue_x, blue_y,
    barricades: rawBarricades,
    phase, current_turn, winner,
  } = gameState;

  // Guard: Supabase may deliver barricades as null before state initialises
  const barricades = Array.isArray(rawBarricades) ? rawBarricades : [];

  const redPos  = { x: red_x,  y: red_y  };
  const bluePos = { x: blue_x, y: blue_y };
  const myPos   = myTeam === "red" ? redPos : bluePos;
  const oppPos  = myTeam === "red" ? bluePos : redPos;

  // Valid moves for current player
  const validMoves = (isMyTurn && phase === "move" && !winner)
    ? getValidMoves(myPos, barricades, oppPos)
    : [];

  // Edges available for barricade placement
  const allEdges     = getAllEdges();
  const canPlace     = isMyTurn && phase === "place" && !winner;
  const freeEdges    = canPlace ? allEdges.filter((e) => !barricades.includes(e)) : [];

  const isValidMovePos = (x, y) =>
    validMoves.some((m) => m.x === x && m.y === y);

  // ── Derived SVG coords ───────────────────────────────────────────
  const rSVG = toSVG(red_x,  red_y);
  const bSVG = toSVG(blue_x, blue_y);

  // ── Click handlers ───────────────────────────────────────────────
  const handleNodeClick = useCallback((x, y) => {
    if (!isMyTurn || phase !== "move" || winner) return;
    const isValid = validMoves.some((m) => m.x === x && m.y === y);
    if (isValid) onMove(x, y);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, phase, winner, JSON.stringify(validMoves), onMove]);

  const handleEdgeClick = useCallback((edgeKey) => {
    if (!canPlace) return;
    if (!barricades.includes(edgeKey)) onPlaceBarricade(edgeKey);
  }, [canPlace, barricades, onPlaceBarricade]);

  return (
    <svg
      viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
      width="100%"
      height="100%"
      style={{ maxWidth: SVG_SIZE, maxHeight: SVG_SIZE, display: "block", margin: "0 auto" }}
    >
      {/* ── Background ── */}
      <rect x="0" y="0" width={SVG_SIZE} height={SVG_SIZE} rx="16" fill="#E8E2D8" />

      {/* ── Home rows ── */}
      <rect x={PAD} y={PAD} width={CELL * 8} height={CELL * 0.5}
        rx="4" fill="#D94F3D" opacity="0.18" />
      <rect x={PAD} y={PAD + CELL * 7.5} width={CELL * 8} height={CELL * 0.5}
        rx="4" fill="#3D6BD9" opacity="0.18" />

      {/* ── Grid lines ── */}
      {Array.from({ length: BOARD_SIZE }).map((_, i) => {
        const p = PAD + i * CELL;
        return (
          <g key={i}>
            <line x1={PAD} y1={p} x2={PAD + CELL * 8} y2={p}
              stroke="#C8C4BB" strokeWidth="1.5" />
            <line x1={p} y1={PAD} x2={p} y2={PAD + CELL * 8}
              stroke="#C8C4BB" strokeWidth="1.5" />
          </g>
        );
      })}

      {/* ── Column & row labels ── */}
      {Array.from({ length: BOARD_SIZE }).map((_, i) => (
        <g key={`lbl-${i}`}>
          <text
            x={PAD + i * CELL} y={PAD - 12}
            textAnchor="middle" fontSize="11" fill="#A8A49C" fontFamily="DM Sans, sans-serif"
          >
            {String.fromCharCode(65 + i)}
          </text>
          <text
            x={PAD - 14} y={PAD + i * CELL + 4}
            textAnchor="middle" fontSize="11" fill="#A8A49C" fontFamily="DM Sans, sans-serif"
          >
            {i + 1}
          </text>
        </g>
      ))}

      {/* ── Barricade preview on hover ── */}
      {hoveredEdge && freeEdges.includes(hoveredEdge) && (() => {
        const { x1, y1, x2, y2 } = edgeToLine(hoveredEdge);
        const col = myTeam === "red" ? "#D94F3D" : "#3D6BD9";
        return (
          <line x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={col} strokeWidth="6" strokeLinecap="round" opacity="0.45"
            strokeDasharray="8 4" />
        );
      })()}

      {/* ── Placed barricades ── */}
      {barricades.map((key) => {
        const { x1, y1, x2, y2 } = edgeToLine(key);
        return (
          <line key={key}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#3A3632" strokeWidth="5" strokeLinecap="round"
          />
        );
      })}

      {/* ── Edge hit targets (barricade placement) ── */}
      {canPlace && freeEdges.map((key) => {
        const { rx, ry, rw, rh } = edgeHitRect(key);
        return (
          <rect key={key}
            x={rx} y={ry} width={rw} height={rh}
            fill="transparent"
            style={{ cursor: "crosshair" }}
            onMouseEnter={() => setHoveredEdge(key)}
            onMouseLeave={() => setHoveredEdge(null)}
            onClick={() => handleEdgeClick(key)}
          />
        );
      })}

      {/* ── Valid move glow rings ── */}
      {validMoves.map(({ x, y }) => {
        const { x: cx, y: cy } = toSVG(x, y);
        const col = myTeam === "red" ? "#D94F3D" : "#3D6BD9";
        const isHov = hoveredMove?.x === x && hoveredMove?.y === y;
        return (
          <g key={`vm-${x}-${y}`}>
            <circle cx={cx} cy={cy} r={PIECE_R + 4}
              fill={col} opacity="0.12"
              style={{ animation: "pulse 2s ease-in-out infinite" }}
            />
            <circle cx={cx} cy={cy} r={PIECE_R - 2}
              fill={col} opacity={isHov ? "0.55" : "0.3"}
              style={{ cursor: "pointer", transition: "opacity 0.15s" }}
              onMouseEnter={() => setHoveredMove({ x, y })}
              onMouseLeave={() => setHoveredMove(null)}
              onClick={() => handleNodeClick(x, y)}
            />
          </g>
        );
      })}

      {/* ── Node dots ── */}
      {Array.from({ length: BOARD_SIZE }).flatMap((_, y) =>
        Array.from({ length: BOARD_SIZE }).map((_, x) => {
          const { x: cx, y: cy } = toSVG(x, y);
          const isValid = isValidMovePos(x, y);
          if (isValid) return null; // drawn above
          const isRed   = red_x === x && red_y === y;
          const isBlue  = blue_x === x && blue_y === y;
          if (isRed || isBlue) return null; // drawn below as pieces
          return (
            <circle key={`n-${x}-${y}`}
              cx={cx} cy={cy} r={NODE_R}
              fill="#C8C4BB"
            />
          );
        })
      )}

      {/* ── Blue piece (uses CSS transform for smooth animation) ── */}
      <g
        style={{
          transform: `translate(${bSVG.x}px, ${bSVG.y}px)`,
          transition: "transform 0.38s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        <circle cx={0} cy={0} r={PIECE_R + 5} fill="#3D6BD9" opacity="0.18" />
        <circle cx={0} cy={0} r={PIECE_R} fill="#3D6BD9" stroke="white" strokeWidth="3" />
        <text x={0} y={5} textAnchor="middle" fontSize="13"
          fill="white" fontFamily="DM Sans, sans-serif" fontWeight="700">B</text>
      </g>

      {/* ── Red piece ── */}
      <g
        style={{
          transform: `translate(${rSVG.x}px, ${rSVG.y}px)`,
          transition: "transform 0.38s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        <circle cx={0} cy={0} r={PIECE_R + 5} fill="#D94F3D" opacity="0.18" />
        <circle cx={0} cy={0} r={PIECE_R} fill="#D94F3D" stroke="white" strokeWidth="3" />
        <text x={0} y={5} textAnchor="middle" fontSize="13"
          fill="white" fontFamily="DM Sans, sans-serif" fontWeight="700">R</text>
      </g>

      {/* ── Home labels ── */}
      <text x={PAD + CELL * 4} y={PAD - 18}
        textAnchor="middle" fontSize="10" fill="#D94F3D" fontFamily="DM Sans, sans-serif" fontWeight="600">
        HOME RED
      </text>
      <text x={PAD + CELL * 4} y={PAD + CELL * 8 + 28}
        textAnchor="middle" fontSize="10" fill="#3D6BD9" fontFamily="DM Sans, sans-serif" fontWeight="600">
        HOME BLUE
      </text>
    </svg>
  );
}
