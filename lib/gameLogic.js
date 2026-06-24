export const BOARD_CELLS    = 9;
export const MAX_BARRICADES = 10;
export const CELL_SZ        = 60;
export const PAD            = 28;
export const SVG_SIZE       = PAD * 2 + CELL_SZ * BOARD_CELLS;

export function generateCode(l = 6) {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({length:l},()=>c[Math.floor(Math.random()*c.length)]).join("");
}
export function generateSessionId() {
  return "s_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function flipCoord(x,y){return{x:BOARD_CELLS-1-x,y:BOARD_CELLS-1-y};}
export function flipWall(key){
  const[type,xs,ys]=key.split("_");const x=+xs,y=+ys;
  if(type==="R")return `R_${BOARD_CELLS-2-x}_${BOARD_CELLS-1-y}`;
  return `D_${BOARD_CELLS-1-x}_${BOARD_CELLS-2-y}`;
}

export const getRightWallKey=(x,y)=>`R_${x}_${y}`;
export const getDownWallKey =(x,y)=>`D_${x}_${y}`;
export function parseWallKey(key){const[type,x,y]=key.split("_");return{type,x:+x,y:+y};}
export function getWallBetween(from,to){
  const dx=to.x-from.x,dy=to.y-from.y;
  if(dx===1 &&dy===0)return getRightWallKey(from.x,from.y);
  if(dx===-1&&dy===0)return getRightWallKey(to.x,  to.y);
  if(dy===1 &&dx===0)return getDownWallKey(from.x, from.y);
  if(dy===-1&&dx===0)return getDownWallKey(to.x,   to.y);
  return null;
}

export function isValidMove(from,to,barricades,opponentPos){
  if(to.x<0||to.x>=BOARD_CELLS||to.y<0||to.y>=BOARD_CELLS)return false;
  if(opponentPos&&opponentPos.x===to.x&&opponentPos.y===to.y)return false;
  const dx=Math.abs(to.x-from.x),dy=Math.abs(to.y-from.y);
  if(!((dx===1&&dy===0)||(dx===0&&dy===1)))return false;
  const wall=getWallBetween(from,to);
  if(wall&&barricades.includes(wall))return false;
  return true;
}
export function getValidMoves(pos,barricades,opponentPos){
  return[{x:pos.x+1,y:pos.y},{x:pos.x-1,y:pos.y},{x:pos.x,y:pos.y+1},{x:pos.x,y:pos.y-1}]
    .filter(to=>isValidMove(pos,to,barricades,opponentPos));
}
export function getAllWalls(){
  const w=[];
  for(let y=0;y<BOARD_CELLS;y++)for(let x=0;x<BOARD_CELLS-1;x++)w.push(getRightWallKey(x,y));
  for(let y=0;y<BOARD_CELLS-1;y++)for(let x=0;x<BOARD_CELLS;x++)w.push(getDownWallKey(x,y));
  return w;
}
export function checkWin(redPos,bluePos){
  if(redPos.y>=BOARD_CELLS-1)return"red";
  if(bluePos.y<=0)return"blue";
  return null;
}

export function canReachGoal(startPos,barricades,goalY){
  const visited=new Set(),queue=[{...startPos}];
  while(queue.length>0){
    const{x,y}=queue.shift();
    const key=`${x},${y}`;
    if(visited.has(key))continue;
    visited.add(key);
    if(y===goalY)return true;
    for(const d of[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]){
      const nx=x+d.x,ny=y+d.y;
      if(nx<0||nx>=BOARD_CELLS||ny<0||ny>=BOARD_CELLS)continue;
      const wall=getWallBetween({x,y},{x:nx,y:ny});
      if(wall&&barricades.includes(wall))continue;
      if(!visited.has(`${nx},${ny}`))queue.push({x:nx,y:ny});
    }
  }
  return false;
}
export function isBarricadeLegal(wallKey,gs){
  const bars=[...(Array.isArray(gs.barricades)?gs.barricades:[]),wallKey];
  return canReachGoal({x:gs.red_x,y:gs.red_y},bars,BOARD_CELLS-1)
      && canReachGoal({x:gs.blue_x,y:gs.blue_y},bars,0);
}

export function cellTopLeft(x,y){return{x:PAD+x*CELL_SZ,y:PAD+y*CELL_SZ};}
export function wallKeyToLine(key){
  const{type,x,y}=parseWallKey(key);
  if(type==="R")return{x1:PAD+(x+1)*CELL_SZ,y1:PAD+y*CELL_SZ,x2:PAD+(x+1)*CELL_SZ,y2:PAD+(y+1)*CELL_SZ};
  return{x1:PAD+x*CELL_SZ,y1:PAD+(y+1)*CELL_SZ,x2:PAD+(x+1)*CELL_SZ,y2:PAD+(y+1)*CELL_SZ};
}
export function wallHitRect(key){
  const{x1,y1,x2,y2}=wallKeyToLine(key);const H=10;
  if(x1===x2)return{rx:x1-H,ry:y1,rw:H*2,rh:y2-y1};
  return{rx:x1,ry:y1-H,rw:x2-x1,rh:H*2};
}

export function computeAIMove(gs){
  const bars=Array.isArray(gs.barricades)?gs.barricades:[];
  const ai={x:gs.blue_x,y:gs.blue_y},opp={x:gs.red_x,y:gs.red_y};
  const myBars=gs.blue_barricades??MAX_BARRICADES;
  const myMoves=getValidMoves(ai,bars,opp),oppMoves=getValidMoves(opp,bars,ai);
  const win=myMoves.find(m=>m.y===0);if(win)return{action:"move",pos:win};
  if(myBars>0){
    const ow=oppMoves.find(m=>m.y===BOARD_CELLS-1);
    if(ow){const w=getWallBetween(opp,ow);if(w&&!bars.includes(w)&&isBarricadeLegal(w,gs))return{action:"barricade",wall:w};}
  }
  const fwd=myMoves.filter(m=>m.y<ai.y).sort((a,b)=>a.y-b.y);
  if(fwd.length>0)return{action:"move",pos:fwd[0]};
  if(myBars>0&&gs.red_y>=4){
    for(const mv of oppMoves.filter(m=>m.y>opp.y)){
      const w=getWallBetween(opp,mv);
      if(w&&!bars.includes(w)&&isBarricadeLegal(w,gs))return{action:"barricade",wall:w};
    }
  }
  if(myMoves.length>0)return{action:"move",pos:myMoves[0]};
  if(myBars>0){const f=getAllWalls().find(w=>!bars.includes(w)&&isBarricadeLegal(w,gs));if(f)return{action:"barricade",wall:f};}
  return null;
}
