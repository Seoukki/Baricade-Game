import { useState, useCallback } from "react";
import {
  BOARD_CELLS,CELL_SZ,PAD,SVG_SIZE,
  cellTopLeft,wallKeyToLine,wallHitRect,
  getAllWalls,getValidMoves,flipCoord,flipWall,isBarricadeLegal,
} from "../lib/gameLogic";

const M=7, PSZ=CELL_SZ-M*2, PRX=11;

export default function GameBoard({
  gameState,myTeam,isMyTurn,actionMode,
  onMove,onPlaceBarricade,
  redLabel="START MERAH",blueLabel="START BIRU",
}) {
  const [hovCell,setHovCell]=useState(null);
  const [hovWall,setHovWall]=useState(null);
  if(!gameState)return null;

  const{red_x,red_y,blue_x,blue_y,winner}=gameState;
  const bars=Array.isArray(gameState.barricades)?gameState.barricades:[];
  const isFlipped=myTeam==="red";
  const myPos=myTeam==="red"?{x:red_x,y:red_y}:{x:blue_x,y:blue_y};
  const oppPos=myTeam==="red"?{x:blue_x,y:blue_y}:{x:red_x,y:red_y};

  const gToD=(gx,gy)=>isFlipped?flipCoord(gx,gy):{x:gx,y:gy};
  const gWall=(key)=>isFlipped?flipWall(key):key;

  // Always show valid moves unless in barricade mode
  const showMoves=isMyTurn&&actionMode!=="barricade"&&!winner;
  const gameMoves=showMoves?getValidMoves(myPos,bars,oppPos):[];
  const dispMoves=gameMoves.map(m=>gToD(m.x,m.y));
  const isVD=(dx,dy)=>dispMoves.some(m=>m.x===dx&&m.y===dy);

  const canWall=isMyTurn&&actionMode==="barricade"&&!winner;
  const freeGW=canWall?getAllWalls().filter(w=>!bars.includes(w)&&isBarricadeLegal(w,gameState)):[];
  const freeDW=freeGW.map(gWall);
  const myColor=myTeam==="red"?"#D94F3D":"#3D6BD9";

  const{x:rdx,y:rdy}=gToD(red_x,red_y);
  const{x:bdx,y:bdy}=gToD(blue_x,blue_y);
  const rTL={x:PAD+rdx*CELL_SZ+M,y:PAD+rdy*CELL_SZ+M};
  const bTL={x:PAD+bdx*CELL_SZ+M,y:PAD+bdy*CELL_SZ+M};
  const rHomeY=gToD(0,0).y, bHomeY=gToD(0,BOARD_CELLS-1).y;

  const handleCell=useCallback((dx,dy)=>{
    if(!showMoves||!isVD(dx,dy))return;
    const gx=isFlipped?BOARD_CELLS-1-dx:dx;
    const gy=isFlipped?BOARD_CELLS-1-dy:dy;
    onMove(gx,gy);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[showMoves,isFlipped,JSON.stringify(dispMoves),onMove]);

  const handleWall=useCallback((dk)=>{
    if(!canWall)return;
    onPlaceBarricade(gWall(dk));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[canWall,isFlipped,JSON.stringify(bars),onPlaceBarricade]);

  return (
    <svg viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`} width="100%" height="100%"
      style={{display:"block",margin:"0 auto",touchAction:"manipulation"}}>

      <rect x={0} y={0} width={SVG_SIZE} height={SVG_SIZE} rx={16} fill="#E8E2D8"/>
      <rect x={PAD} y={PAD} width={CELL_SZ*BOARD_CELLS} height={CELL_SZ*BOARD_CELLS} rx={4} fill="#F2EEE7" stroke="#C4BFB7" strokeWidth={2}/>

      {/* Home tints */}
      <rect x={PAD} y={PAD+rHomeY*CELL_SZ} width={CELL_SZ*BOARD_CELLS} height={CELL_SZ} fill="#D94F3D" opacity={0.12}/>
      <rect x={PAD} y={PAD+bHomeY*CELL_SZ} width={CELL_SZ*BOARD_CELLS} height={CELL_SZ} fill="#3D6BD9" opacity={0.12}/>

      {/* Cell hit areas */}
      {Array.from({length:BOARD_CELLS}).flatMap((_,dy)=>
        Array.from({length:BOARD_CELLS}).map((_,dx)=>{
          const{x:cx,y:cy}=cellTopLeft(dx,dy);
          const valid=isVD(dx,dy);
          const hov=hovCell?.x===dx&&hovCell?.y===dy;
          return <rect key={`c${dx}${dy}`} x={cx} y={cy} width={CELL_SZ} height={CELL_SZ}
            fill={valid&&hov?myColor+"70":valid?myColor+"28":"transparent"}
            style={{cursor:valid?"pointer":"default",transition:"fill .12s"}}
            onMouseEnter={()=>valid&&setHovCell({x:dx,y:dy})}
            onMouseLeave={()=>setHovCell(null)}
            onClick={()=>handleCell(dx,dy)}/>;
        })
      )}

      {/* Valid move rings */}
      {dispMoves.map(({x:dx,y:dy})=>{
        const{x:cx,y:cy}=cellTopLeft(dx,dy);
        return <rect key={`vm${dx}${dy}`} x={cx+4} y={cy+4} width={CELL_SZ-8} height={CELL_SZ-8}
          rx={8} fill="none" stroke={myColor} strokeWidth={2.5} strokeDasharray="8 4" opacity={0.85}
          style={{pointerEvents:"none"}}/>;
      })}

      {/* Grid */}
      {Array.from({length:BOARD_CELLS-1}).map((_,i)=>{
        const p=PAD+(i+1)*CELL_SZ;
        return <g key={i}>
          <line x1={p} y1={PAD} x2={p} y2={PAD+CELL_SZ*BOARD_CELLS} stroke="#D4CFC6" strokeWidth={1}/>
          <line x1={PAD} y1={p} x2={PAD+CELL_SZ*BOARD_CELLS} y2={p} stroke="#D4CFC6" strokeWidth={1}/>
        </g>;
      })}

      {/* Labels */}
      {Array.from({length:BOARD_CELLS}).map((_,i)=>(
        <g key={`lb${i}`}>
          <text x={PAD+i*CELL_SZ+CELL_SZ/2} y={PAD-12} textAnchor="middle" fontSize={11} fill="#A8A49C" fontFamily="DM Sans,sans-serif">{String.fromCharCode(65+i)}</text>
          <text x={PAD-13} y={PAD+i*CELL_SZ+CELL_SZ/2+4} textAnchor="middle" fontSize={11} fill="#A8A49C" fontFamily="DM Sans,sans-serif">{i+1}</text>
        </g>
      ))}

      <text x={PAD+(CELL_SZ*BOARD_CELLS)/2} y={PAD-1} textAnchor="middle" fontSize={9} fontWeight={700} fontFamily="DM Sans,sans-serif" fill={isFlipped?"#3D6BD9":"#D94F3D"}>▼ {isFlipped?blueLabel:redLabel}</text>
      <text x={PAD+(CELL_SZ*BOARD_CELLS)/2} y={PAD+CELL_SZ*BOARD_CELLS+16} textAnchor="middle" fontSize={9} fontWeight={700} fontFamily="DM Sans,sans-serif" fill={isFlipped?"#D94F3D":"#3D6BD9"}>▲ {isFlipped?redLabel:blueLabel}</text>

      {/* Barricade hover */}
      {hovWall&&freeDW.includes(hovWall)&&(()=>{
        const{x1,y1,x2,y2}=wallKeyToLine(hovWall);
        return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={myColor} strokeWidth={8} strokeLinecap="round" opacity={0.5} strokeDasharray="12 5"/>;
      })()}

      {/* Placed barricades */}
      {bars.map(gk=>{const{x1,y1,x2,y2}=wallKeyToLine(gWall(gk));return <line key={gk} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3A3632" strokeWidth={7} strokeLinecap="round"/>;})}

      {/* Wall targets */}
      {canWall&&freeDW.map((dk,i)=>{
        const{rx,ry,rw,rh}=wallHitRect(dk);
        return <rect key={i} x={rx} y={ry} width={rw} height={rh} fill="transparent" style={{cursor:"crosshair"}}
          onMouseEnter={()=>setHovWall(dk)} onMouseLeave={()=>setHovWall(null)} onClick={()=>handleWall(dk)}/>;
      })}

      {/* Blue piece */}
      <g style={{transform:`translate(${bTL.x}px,${bTL.y}px)`,transition:"transform .35s cubic-bezier(.34,1.56,.64,1)"}}>
        <rect x={0} y={0} width={PSZ} height={PSZ} rx={PRX} fill="#3D6BD9"/>
        <text x={PSZ/2} y={PSZ/2+6} textAnchor="middle" fontSize={17} fontWeight={700} fill="white" fontFamily="DM Sans,sans-serif">B</text>
      </g>
      {/* Red piece */}
      <g style={{transform:`translate(${rTL.x}px,${rTL.y}px)`,transition:"transform .35s cubic-bezier(.34,1.56,.64,1)"}}>
        <rect x={0} y={0} width={PSZ} height={PSZ} rx={PRX} fill="#D94F3D"/>
        <text x={PSZ/2} y={PSZ/2+6} textAnchor="middle" fontSize={17} fontWeight={700} fill="white" fontFamily="DM Sans,sans-serif">R</text>
      </g>
    </svg>
  );
}
