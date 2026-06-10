import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import GameBoard from "../../components/GameBoard";
import { getValidMoves, checkWin, computeAIMove, MAX_BARRICADES } from "../../lib/gameLogic";
import { useLang } from "../../context/LanguageContext";

const INIT = { current_turn:"red", red_x:4, red_y:0, blue_x:4, blue_y:8, barricades:[], red_barricades:MAX_BARRICADES, blue_barricades:MAX_BARRICADES, winner:null };

export default function AIGame() {
  const router = useRouter();
  const { tr, toggleLang } = useLang();
  const [gs,         setGs]         = useState(INIT);
  const [actionMode, setActionMode] = useState(null);
  const [showWin,    setShowWin]    = useState(false);
  const [aiThinking, setAiThinking] = useState(false);

  const isMyTurn = gs.current_turn === "red" && !gs.winner;
  const bars     = Array.isArray(gs.barricades) ? gs.barricades : [];
  const myPos    = { x: gs.red_x, y: gs.red_y };
  const oppPos   = { x: gs.blue_x, y: gs.blue_y };
  const hasValidMoves = getValidMoves(myPos, bars, oppPos).length > 0;
  const myBarsLeft    = gs.red_barricades ?? MAX_BARRICADES;

  // AI turn
  useEffect(() => {
    if (gs.current_turn !== "blue" || gs.winner) return;
    setAiThinking(true);
    const t = setTimeout(() => {
      const dec = computeAIMove(gs);
      setGs(prev => {
        if (!dec) return prev;
        let next = { ...prev };
        if (dec.action === "move") {
          next.blue_x = dec.pos.x; next.blue_y = dec.pos.y;
          next.current_turn = "red";
          const w = checkWin({ x:next.red_x,y:next.red_y }, { x:next.blue_x,y:next.blue_y });
          next.winner = w;
        } else {
          const prevBars = Array.isArray(prev.barricades) ? prev.barricades : [];
          next.barricades = [...prevBars, dec.wall];
          next.blue_barricades = (prev.blue_barricades ?? MAX_BARRICADES) - 1;
          next.current_turn = "red";
        }
        return next;
      });
      setAiThinking(false);
    }, 750);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs.current_turn, gs.winner]);

  useEffect(() => { if (gs.winner) setShowWin(true); }, [gs.winner]);

  const handleMove = useCallback((toX, toY) => {
    if (!isMyTurn || actionMode !== "move") return;
    setGs(prev => {
      const newR = { x: toX, y: toY };
      const newB = { x: prev.blue_x, y: prev.blue_y };
      return { ...prev, red_x: toX, red_y: toY, current_turn: "blue", winner: checkWin(newR, newB) };
    });
    setActionMode(null);
  }, [isMyTurn, actionMode]);

  const handlePlaceBarricade = useCallback((wallKey) => {
    if (!isMyTurn || actionMode !== "barricade" || (gs.red_barricades??0) <= 0) return;
    setGs(prev => {
      const prevBars = Array.isArray(prev.barricades) ? prev.barricades : [];
      if (prevBars.includes(wallKey)) return prev;
      return { ...prev, barricades:[...prevBars,wallKey], red_barricades:(prev.red_barricades??MAX_BARRICADES)-1, current_turn:"blue" };
    });
    setActionMode(null);
  }, [isMyTurn, actionMode, gs.red_barricades]);

  function restart() { setGs(INIT); setActionMode(null); setShowWin(false); setAiThinking(false); }

  return (
    <>
      <Head><title>vs AI — Barricade</title></Head>
      <div className="min-h-screen grid-bg flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 bg-white/70 backdrop-blur border-b border-[var(--border)] sticky top-0 z-10">
          <button className="flex items-center gap-1.5 text-[var(--muted)] text-sm hover:text-[var(--text)] transition-colors" onClick={() => router.push("/")}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            {tr("leave")}
          </button>
          <h1 className="font-display text-xl font-black">
            Bari<span style={{color:"var(--red)"}}>ca</span><span style={{color:"var(--blue)"}}>de</span>
            <span className="ml-2 text-xs font-body font-semibold text-[var(--muted)] align-middle">vs AI</span>
          </h1>
          <div className="flex items-center gap-2">
            <button onClick={toggleLang} className="text-xs text-[var(--muted)]">🌐</button>
            <button className="btn btn-ghost text-xs px-3 py-2" onClick={restart}>🔁</button>
          </div>
        </header>

        {aiThinking && (
          <div className="bg-[var(--cream)] border-b border-[var(--border)] px-4 py-2 flex items-center justify-center gap-2 text-sm text-[var(--muted)]">
            <div style={{width:14,height:14,borderRadius:"50%",border:"2px solid #3D6BD9",borderTopColor:"transparent",animation:"spin .7s linear infinite"}}/>
            {tr("ai_thinking")}
          </div>
        )}

        <div className="flex-1 flex flex-col lg:flex-row items-start justify-center gap-4 p-4 md:p-6">
          <div className="w-full lg:flex-1 lg:max-w-[590px]">
            <div className={`mb-3 px-5 py-2.5 rounded-2xl font-medium text-sm text-center text-white shadow-sm transition-all ${gs.winner?(gs.winner==="red"?"bg-[var(--red)]":"bg-[var(--blue)]"):isMyTurn?"bg-[var(--red)]":"bg-[var(--blue)]"}`}>
              {gs.winner ? (gs.winner==="red"?tr("you_win"):`🤖 ${tr("ai_wins")}`) : isMyTurn ? tr("your_turn") : `🤖 ${tr("ai_thinking")}`}
            </div>

            <div className="card p-3 md:p-4">
              {/* Human is red → board is flipped (red sees themselves at bottom) */}
              <GameBoard gameState={gs} myTeam="red" isMyTurn={isMyTurn}
                actionMode={actionMode} onMove={handleMove} onPlaceBarricade={handlePlaceBarricade}
                redLabel={tr("red_home_label")} blueLabel={tr("blue_home_label")} />
            </div>

            {isMyTurn && !gs.winner && (
              <div className="mt-3 card p-4 animate-fade-in">
                {actionMode === null ? (
                  <>
                    <p className="text-xs text-[var(--muted)] font-semibold uppercase tracking-wider text-center mb-3">{tr("choose_action")}</p>
                    <div className="flex gap-2">
                      <button className="btn btn-red flex-1 py-3.5 text-sm font-semibold" onClick={() => setActionMode("move")} disabled={!hasValidMoves}>
                        🚶 {tr("walk")}
                      </button>
                      <button className="btn btn-ghost flex-1 py-3.5 text-sm font-semibold" onClick={() => setActionMode("barricade")} disabled={myBarsLeft<=0}>
                        🚧 {tr("barrier")} <span className="ml-1 text-xs font-bold text-[var(--red)]">×{myBarsLeft}</span>
                      </button>
                    </div>
                    {!hasValidMoves && myBarsLeft<=0 && <p className="mt-2 text-xs text-center text-red-500">{tr("no_moves")}</p>}
                  </>
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-[var(--text)]">
                      {actionMode==="move"?`🚶 ${tr("move_instruction")}`:`🚧 ${tr("barrier_instruction")}`}
                    </p>
                    <button className="btn btn-ghost text-xs px-3 py-2 ml-2 flex-shrink-0" onClick={() => setActionMode(null)}>{tr("cancel")}</button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="w-full lg:w-64 space-y-3">
            <div className="card p-4">
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">Pemain</p>
              {[{team:"red",label:tr("you"),sub:tr("team_red"),bars:myBarsLeft,turn:isMyTurn},{team:"blue",label:"AI",sub:tr("team_blue"),bars:gs.blue_barricades??MAX_BARRICADES,turn:!isMyTurn&&!gs.winner}].map(p=>{
                const col=p.team==="red"?"var(--red)":"var(--blue)";
                const bg=p.team==="red"?"rgba(217,79,61,0.08)":"rgba(61,107,217,0.08)";
                const bd=p.team==="red"?"rgba(217,79,61,0.25)":"rgba(61,107,217,0.25)";
                return (
                  <div key={p.team} className="flex items-center gap-3 px-3 py-2.5 rounded-xl mb-2 transition-all"
                    style={{background:p.turn?bg:"transparent",border:`1.5px solid ${p.turn?bd:"transparent"}`}}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{background:col}}>{p.team==="red"?"R":"B"}</div>
                    <div className="flex-1"><p className="text-xs font-semibold" style={{color:col}}>{p.label}</p><p className="text-sm">{p.sub}</p></div>
                    <span className="text-xs text-[var(--muted)]">🚧×{p.bars}</span>
                  </div>
                );
              })}
            </div>
            <div className="card p-4">
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">{tr("how_to")||"Tips"}</p>
              <ul className="space-y-1.5 text-xs text-[var(--muted)]">
                <li>① <strong className="text-[var(--text)]">{tr("walk")}</strong> — {tr("step_walk_desc")}</li>
                <li>② <strong className="text-[var(--text)]">{tr("barrier")}</strong> — {tr("step_barrier_desc")}</li>
                <li>🏁 {tr("step_win_desc")}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {showWin && gs.winner && (
        <WinModal winner={gs.winner} onRestart={restart} onLeave={()=>router.push("/")} tr={tr} />
      )}
    </>
  );
}

function WinModal({ winner, onRestart, onLeave, tr }) {
  const isWinner = winner === "red";
  const col = winner==="red"?"#D94F3D":"#3D6BD9";
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="card max-w-sm w-full p-7 text-center animate-pop-in overflow-y-auto max-h-[90vh]">
        <div className="text-5xl mb-3">{isWinner?"🏆":"🤖"}</div>
        <h2 className="font-display text-3xl font-black mb-1" style={{color:col}}>{isWinner?tr("you_win"):tr("ai_wins")}</h2>
        <p className="text-[var(--muted)] text-sm mb-5">{isWinner?tr("congrats_ai"):tr("lost_ai")}</p>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 text-left">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1">{tr("support")}</p>
          <p className="text-xs text-amber-600 mb-3">{tr("support_desc")}</p>
          <a href="https://saweria.co/chaesseon" target="_blank" rel="noopener noreferrer"
            className="btn w-full text-sm py-2.5" style={{background:"#FBBF24",color:"#78350F"}}>{tr("donate")}</a>
        </div>
        <div className="bg-[var(--cream)] rounded-2xl p-4 mb-5 text-left">
          <p className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider mb-2">{tr("contact")}</p>
          <div className="space-y-2">
            {[["https://wa.me/62895402466525","📱","WhatsApp","0895402466525"],["mailto:fynnxxc@gmail.com","✉️","Email","fynnxxc@gmail.com"],["https://instagram.com/se_o_nn","📸","Instagram","@se_o_nn"]].map(([href,icon,label,val])=>(
              <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-[var(--text)]">
                <span>{icon}</span>{label}: {val}
              </a>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <button className="btn btn-red w-full py-3" onClick={onRestart}>🔁 {tr("play_again")}</button>
          <button className="btn btn-ghost w-full text-sm" onClick={onLeave}>{tr("back_home")}</button>
        </div>
      </div>
    </div>
  );
}
