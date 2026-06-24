import { useState, useEffect, useCallback, useRef } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import GameBoard from "../../components/GameBoard";
import { getValidMoves, checkWin, computeAIMove, MAX_BARRICADES, isBarricadeLegal } from "../../lib/gameLogic";
import { useLang } from "../../context/LanguageContext";

const INIT = { current_turn:"red",red_x:4,red_y:0,blue_x:4,blue_y:8,barricades:[],red_barricades:MAX_BARRICADES,blue_barricades:MAX_BARRICADES,winner:null };

function ActionDrawer({ isMyTurn, actionMode, setActionMode, myBarsLeft, hasValidMoves, tr, winner }) {
  const [dismissed, setDismissed] = useState(false);
  const [dragY,     setDragY]     = useState(0);
  const dragging = useRef(false);
  const startY   = useRef(0);

  useEffect(() => { if (isMyTurn) setDismissed(false); }, [isMyTurn]);

  if (!isMyTurn||winner) return null;

  const onTD=(e)=>{startY.current=e.touches[0].clientY;dragging.current=true;};
  const onTM=(e)=>dragging.current&&setDragY(Math.max(0,e.touches[0].clientY-startY.current));
  const onTE=()=>{dragging.current=false;if(dragY>80){setDismissed(true);setActionMode(null);}setDragY(0);};

  if (dismissed&&actionMode===null) return (
    <div className="fixed bottom-6 left-1/2 z-40" style={{transform:"translateX(-50%)"}}>
      <button onClick={()=>setDismissed(false)}
        className="btn shadow-lg text-white text-sm px-6 py-3"
        style={{background:"var(--red)",borderRadius:99,boxShadow:"0 4px 20px rgba(217,79,61,0.4)"}}>
        {tr("choose_action")} ↑
      </button>
    </div>
  );

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pointer-events-none">
      <div className="pointer-events-auto w-full max-w-lg"
        style={{transform:`translateY(${dragY}px)`,transition:dragging.current?"none":"transform .3s cubic-bezier(.22,1,.36,1)"}}>
        <div className="flex justify-center pt-3 pb-2 cursor-grab" onTouchStart={onTD} onTouchMove={onTM} onTouchEnd={onTE}>
          <div className="w-10 h-1.5 rounded-full bg-[var(--border)]"/>
        </div>
        <div className="bg-white border-t border-[var(--border)] shadow-[0_-8px_32px_rgba(0,0,0,0.12)] px-4 pt-2 pb-6"
          style={{borderRadius:"20px 20px 0 0"}}>
          {actionMode===null?(
            <>
              <p className="text-xs text-[var(--muted)] font-semibold uppercase tracking-wider text-center mb-3"
                style={{borderBottom:"2px solid var(--red)",paddingBottom:8,marginBottom:12}}>
                {tr("choose_action")}
              </p>
              <div className="flex gap-3">
                <button className="flex-1 flex flex-col items-center gap-2 py-4 rounded-2xl border-2 transition-all"
                  style={hasValidMoves?{borderColor:"var(--red)",background:"rgba(217,79,61,0.08)",color:"var(--red)"}:{borderColor:"var(--border)",background:"#f5f5f5",color:"var(--muted)",opacity:0.5}}
                  onClick={()=>hasValidMoves&&setActionMode("move")} disabled={!hasValidMoves}>
                  <span className="text-3xl">🚶</span>
                  <span className="text-sm font-bold">{tr("walk")}</span>
                </button>
                <button className="flex-1 flex flex-col items-center gap-2 py-4 rounded-2xl border-2 transition-all"
                  style={(myBarsLeft??0)>0?{borderColor:"var(--text)",background:"rgba(43,40,37,0.05)",color:"var(--text)"}:{borderColor:"var(--border)",background:"#f5f5f5",color:"var(--muted)",opacity:0.5}}
                  onClick={()=>(myBarsLeft??0)>0&&setActionMode("barricade")} disabled={(myBarsLeft??0)<=0}>
                  <span className="text-3xl">🚧</span>
                  <span className="text-sm font-bold">{tr("barrier")} ×{myBarsLeft??MAX_BARRICADES}</span>
                </button>
              </div>
            </>
          ):(
            <div className="flex items-center justify-between py-2">
              <p className="text-sm font-semibold">{actionMode==="move"?`🚶 ${tr("move_instruction")}`:`🚧 ${tr("barrier_instruction")}`}</p>
              <button className="btn btn-ghost text-xs px-3 py-2 ml-3" onClick={()=>setActionMode(null)}>{tr("cancel")}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AIGame() {
  const router = useRouter();
  const { tr } = useLang();
  const [gs,         setGs]         = useState(INIT);
  const [actionMode, setActionMode] = useState(null);
  const [showWin,    setShowWin]    = useState(false);
  const [aiThinking, setAiThinking] = useState(false);

  const isMyTurn = gs.current_turn==="red"&&!gs.winner;
  const bars     = Array.isArray(gs.barricades)?gs.barricades:[];
  const myPos    = {x:gs.red_x,y:gs.red_y};
  const oppPos   = {x:gs.blue_x,y:gs.blue_y};
  const hasValidMoves = getValidMoves(myPos,bars,oppPos).length>0;
  const myBarsLeft    = gs.red_barricades??MAX_BARRICADES;

  useEffect(() => {
    if (gs.current_turn!=="blue"||gs.winner) return;
    setAiThinking(true);
    const t = setTimeout(()=>{
      const dec=computeAIMove(gs);
      setGs(prev=>{
        if(!dec)return prev;
        let next={...prev};
        if(dec.action==="move"){
          next.blue_x=dec.pos.x;next.blue_y=dec.pos.y;next.current_turn="red";
          const w=checkWin({x:next.red_x,y:next.red_y},{x:next.blue_x,y:next.blue_y});
          next.winner=w;
        }else{
          const pb=Array.isArray(prev.barricades)?prev.barricades:[];
          next.barricades=[...pb,dec.wall];
          next.blue_barricades=(prev.blue_barricades??MAX_BARRICADES)-1;
          next.current_turn="red";
        }
        return next;
      });
      setAiThinking(false);
    }, 800);
    return ()=>clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs.current_turn,gs.winner]);

  useEffect(()=>{if(gs.winner)setShowWin(true);},[gs.winner]);

  const handleMove=useCallback((toX,toY)=>{
    if(!isMyTurn||actionMode!=="move")return;
    setGs(prev=>{
      const newR={x:toX,y:toY},newB={x:prev.blue_x,y:prev.blue_y};
      return{...prev,red_x:toX,red_y:toY,current_turn:"blue",winner:checkWin(newR,newB)};
    });
    setActionMode(null);
  },[isMyTurn,actionMode]);

  const handlePlaceBarricade=useCallback((wk)=>{
    if(!isMyTurn||actionMode!=="barricade"||(gs.red_barricades??0)<=0)return;
    if(!isBarricadeLegal(wk,gs))return;
    setGs(prev=>{
      const pb=Array.isArray(prev.barricades)?prev.barricades:[];
      if(pb.includes(wk))return prev;
      return{...prev,barricades:[...pb,wk],red_barricades:(prev.red_barricades??MAX_BARRICADES)-1,current_turn:"blue"};
    });
    setActionMode(null);
  },[isMyTurn,actionMode,gs]);

  function restart(){setGs(INIT);setActionMode(null);setShowWin(false);setAiThinking(false);}

  return (
    <>
      <Head><title>vs AI — Barricade</title></Head>
      <div className="min-h-screen grid-bg flex flex-col pb-52">

        <header className="flex items-center justify-between px-4 py-3 bg-white/80 border-b border-[var(--border)]">
          <button className="flex items-center gap-1.5 text-[var(--muted)] text-sm" onClick={()=>router.push("/")}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            {tr("leave")}
          </button>
          <h1 className="font-display text-xl font-black">
            Bari<span style={{color:"var(--red)"}}>ca</span><span style={{color:"var(--blue)"}}>de</span>
            <span className="ml-2 text-xs font-body font-semibold text-[var(--muted)]">vs AI</span>
          </h1>
          <button className="btn btn-ghost text-xs px-3 py-2" onClick={restart}>🔁</button>
        </header>

        {aiThinking&&(
          <div className="bg-[var(--cream)] border-b border-[var(--border)] px-4 py-2 flex items-center justify-center gap-2 text-sm text-[var(--muted)]">
            <div style={{width:14,height:14,borderRadius:"50%",border:"2px solid #3D6BD9",borderTopColor:"transparent",animation:"spin .7s linear infinite"}}/>
            {tr("ai_thinking")}
          </div>
        )}

        <div className={`px-5 py-2.5 font-medium text-sm text-center text-white ${gs.winner?(gs.winner==="red"?"bg-[var(--red)]":"bg-[var(--blue)]"):isMyTurn?"bg-[var(--red)]":"bg-[var(--blue)]"}`}>
          {gs.winner?(gs.winner==="red"?tr("you_win"):`🤖 ${tr("ai_wins")}`):isMyTurn?tr("your_turn"):`🤖 ${tr("ai_thinking")}`}
        </div>

        <div className="flex-1 flex flex-col lg:flex-row items-start justify-center gap-4 p-4 md:p-6">
          <div className="w-full lg:flex-1 lg:max-w-[620px]">
            <div className="card p-2 md:p-3">
              <GameBoard gameState={gs} myTeam="red" isMyTurn={isMyTurn}
                actionMode={actionMode} onMove={handleMove} onPlaceBarricade={handlePlaceBarricade}
                redLabel={tr("red_home_label")} blueLabel={tr("blue_home_label")}/>
            </div>
          </div>
          <div className="w-full lg:w-60 space-y-3">
            <div className="card p-4">
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">Pemain</p>
              {[{t:"red",l:tr("you"),sub:tr("team_red"),bl:myBarsLeft,turn:isMyTurn},
                {t:"blue",l:"AI",sub:tr("team_blue"),bl:gs.blue_barricades??MAX_BARRICADES,turn:!isMyTurn&&!gs.winner}].map(p=>{
                const col=p.t==="red"?"var(--red)":"var(--blue)";
                const bg=p.t==="red"?"rgba(217,79,61,0.08)":"rgba(61,107,217,0.08)";
                const bd=p.t==="red"?"rgba(217,79,61,0.25)":"rgba(61,107,217,0.25)";
                return (
                  <div key={p.t} className="flex items-center gap-3 px-3 py-2.5 rounded-xl mb-2 transition-all"
                    style={{background:p.turn?bg:"transparent",border:`1.5px solid ${p.turn?bd:"transparent"}`}}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{background:col}}>
                      {p.t==="red"?"R":"B"}
                    </div>
                    <div className="flex-1"><p className="text-xs font-semibold" style={{color:col}}>{p.l}</p><p className="text-sm">{p.sub}</p></div>
                    <span className="text-xs text-[var(--muted)]">🚧×{p.bl}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <ActionDrawer isMyTurn={isMyTurn} actionMode={actionMode} setActionMode={setActionMode}
        myBarsLeft={myBarsLeft} hasValidMoves={hasValidMoves} tr={tr} winner={gs.winner}/>

      {showWin&&gs.winner&&(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4 animate-fade-in">
          <div className="card w-full max-w-sm p-6 text-center animate-slide-up" style={{borderRadius:"24px 24px 20px 20px"}}>
            <div className="text-5xl mb-3">{gs.winner==="red"?"🏆":"🤖"}</div>
            <h2 className="font-display text-3xl font-black mb-1" style={{color:gs.winner==="red"?"#D94F3D":"#3D6BD9"}}>
              {gs.winner==="red"?tr("you_win"):tr("ai_wins")}
            </h2>
            <p className="text-[var(--muted)] text-sm mb-5">{gs.winner==="red"?tr("congrats_ai"):tr("lost_ai")}</p>
            <a href="https://saweria.co/chaesseon" target="_blank" rel="noopener noreferrer"
              className="btn w-full text-sm py-3 mb-3" style={{background:"#FBBF24",color:"#78350F",borderRadius:14}}>
              {tr("donate")}
            </a>
            <div className="space-y-2">
              <button className="btn btn-red w-full py-3" onClick={restart}>🔁 {tr("play_again")}</button>
              <button className="btn btn-ghost w-full text-sm" onClick={()=>router.push("/")}>{tr("back_home")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
