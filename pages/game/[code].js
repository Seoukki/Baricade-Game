import { useState, useEffect, useCallback, useRef } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabase";
import GameBoard from "../../components/GameBoard";
import { getValidMoves, checkWin, MAX_BARRICADES, isBarricadeLegal, generateSessionId } from "../../lib/gameLogic";
import { useLang } from "../../context/LanguageContext";

function getSession() {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("barricade_session");
  if (!id) { id = generateSessionId(); localStorage.setItem("barricade_session", id); }
  return id;
}

// Bottom action drawer — swipeable
function ActionDrawer({ isMyTurn, actionMode, setActionMode, myTeam, myBarsLeft, hasValidMoves, tr, gameState }) {
  const [dragging,  setDragging]  = useState(false);
  const [dragY,     setDragY]     = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const startY = useRef(0);

  // Re-show drawer when it becomes our turn
  useEffect(() => {
    if (isMyTurn) setDismissed(false);
  }, [isMyTurn, gameState?.current_turn]);

  const onTouchStart = (e) => {
    startY.current = e.touches[0].clientY;
    setDragging(true);
  };
  const onTouchMove = (e) => {
    const dy = Math.max(0, e.touches[0].clientY - startY.current);
    setDragY(dy);
  };
  const onTouchEnd = () => {
    setDragging(false);
    if (dragY > 80) {
      setDismissed(true);
      setActionMode(null);
    }
    setDragY(0);
  };

  if (!isMyTurn || gameState?.winner) return null;

  const col = myTeam === "red" ? "var(--red)" : "var(--blue)";

  // If dismissed, show a small pill to re-open
  if (dismissed && actionMode === null) {
    return (
      <div className="fixed bottom-6 left-1/2 z-40" style={{transform:"translateX(-50%)"}}>
        <button onClick={() => setDismissed(false)}
          className="btn shadow-lg text-white text-sm px-6 py-3"
          style={{background:col,borderRadius:99,boxShadow:`0 4px 20px ${col}55`}}>
          {tr("choose_action")} ↑
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pointer-events-none">
      <div
        className="pointer-events-auto w-full max-w-lg"
        style={{
          transform: `translateY(${dragY}px)`,
          transition: dragging ? "none" : "transform .3s cubic-bezier(.22,1,.36,1)",
        }}
      >
        {/* Drag handle */}
        <div
          className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onMouseDown={(e) => {
            startY.current = e.clientY; setDragging(true);
            const up = (ev) => {
              setDragging(false);
              if (Math.max(0, ev.clientY - startY.current) > 80) { setDismissed(true); setActionMode(null); }
              setDragY(0);
              window.removeEventListener("mousemove", move);
              window.removeEventListener("mouseup", up);
            };
            const move = (ev) => setDragY(Math.max(0, ev.clientY - startY.current));
            window.addEventListener("mousemove", move);
            window.addEventListener("mouseup", up);
          }}
        >
          <div className="w-10 h-1.5 rounded-full bg-[var(--border)]"/>
        </div>

        {/* Card */}
        <div className="bg-white border-t border-[var(--border)] shadow-[0_-8px_32px_rgba(0,0,0,0.12)] px-4 pt-2 pb-6"
          style={{borderRadius:"20px 20px 0 0"}}>

          {actionMode === null ? (
            <>
              <p className="text-xs text-[var(--muted)] font-semibold uppercase tracking-wider text-center mb-4"
                style={{borderBottom:`2px solid ${col}`,paddingBottom:8,marginBottom:12}}>
                {tr("choose_action")}
              </p>
              <div className="flex gap-3">
                <button
                  className="flex-1 flex flex-col items-center gap-2 py-4 rounded-2xl border-2 transition-all"
                  style={hasValidMoves
                    ? {borderColor:col,background:`${col}10`,color:col}
                    : {borderColor:"var(--border)",background:"#f5f5f5",color:"var(--muted)",opacity:0.5}}
                  onClick={() => hasValidMoves && setActionMode("move")}
                  disabled={!hasValidMoves}>
                  <span className="text-3xl">🚶</span>
                  <span className="text-sm font-bold">{tr("walk")}</span>
                  <span className="text-xs opacity-70">{tr("move_instruction")}</span>
                </button>
                <button
                  className="flex-1 flex flex-col items-center gap-2 py-4 rounded-2xl border-2 transition-all"
                  style={(myBarsLeft ?? 0) > 0
                    ? {borderColor:"var(--text)",background:"rgba(43,40,37,0.05)",color:"var(--text)"}
                    : {borderColor:"var(--border)",background:"#f5f5f5",color:"var(--muted)",opacity:0.5}}
                  onClick={() => (myBarsLeft ?? 0) > 0 && setActionMode("barricade")}
                  disabled={(myBarsLeft ?? 0) <= 0}>
                  <span className="text-3xl">🚧</span>
                  <span className="text-sm font-bold">{tr("barrier")} ×{myBarsLeft ?? MAX_BARRICADES}</span>
                  <span className="text-xs opacity-70">{tr("barrier_instruction")}</span>
                </button>
              </div>
              {!hasValidMoves && (myBarsLeft ?? 0) <= 0 && (
                <p className="mt-3 text-xs text-center text-red-500">{tr("no_moves")}</p>
              )}
            </>
          ) : (
            <div className="flex items-center justify-between py-2">
              <p className="text-sm font-semibold text-[var(--text)]">
                {actionMode === "move" ? `🚶 ${tr("move_instruction")}` : `🚧 ${tr("barrier_instruction")}`}
              </p>
              <button className="btn btn-ghost text-xs px-3 py-2 ml-3 flex-shrink-0"
                onClick={() => setActionMode(null)}>{tr("cancel")}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Game() {
  const router   = useRouter();
  const { code } = router.query;
  const { tr }   = useLang();

  const [room,          setRoom]          = useState(null);
  const [players,       setPlayers]       = useState([]);
  const [gameState,     setGameState]     = useState(null);
  const [myTeam,        setMyTeam]        = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState("");
  const [showWin,       setShowWin]       = useState(false);
  const [actionMode,    setActionMode]    = useState(null);
  const [actionMsg,     setActionMsg]     = useState("");
  const [oppOnline,     setOppOnline]     = useState(true);
  const [gameEnded,     setGameEnded]     = useState(false);

  const sessionId  = getSession();
  const channelRef = useRef(null);
  const lock       = useRef(false);
  const oppTimer   = useRef(null);

  const isMyTurn = gameState && myTeam === gameState.current_turn && !gameState.winner;

  const parseGS = (gs) => {
    if (!gs) return gs;
    if (typeof gs.barricades === "string") { try { gs.barricades = JSON.parse(gs.barricades); } catch { gs.barricades = []; } }
    return gs;
  };

  const fetchData = useCallback(async () => {
    if (!code) return;
    try {
      const { data: r, error: re } = await supabase.from("rooms").select("*").eq("code", code).single();
      if (re || !r) { setError(tr("room_not_found")); setLoading(false); return; }
      const { data: ps } = await supabase.from("players").select("*").eq("room_id", r.id);
      const { data: gs } = await supabase.from("game_states").select("*").eq("room_id", r.id).maybeSingle();
      setRoom(r); setPlayers(ps || []);
      if (gs) { setGameState(parseGS({...gs})); if (gs.winner) setShowWin(true); }
      const me = (ps || []).find(p => p.session_id === sessionId);
      if (me) setMyTeam(me.team);
      if (r.status === "waiting") { router.replace(`/lobby/${code}`); return; }
    } catch (e) { console.error(e); setError(tr("error_generic")); }
    finally { setLoading(false); }
  }, [code, sessionId, router, tr]);

  useEffect(() => {
    if (!code) return;
    fetchData();

    const channel = supabase.channel(`game:${code}`, { config: { presence: { key: sessionId } } })
      .on("postgres_changes", { event: "*", schema: "public", table: "game_states" }, payload => {
        const gs = parseGS({...payload.new});
        setGameState(gs); setActionMode(null);
        if (gs.winner) setShowWin(true);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `code=eq.${code}` }, payload => {
        if (payload.new) setRoom(payload.new);
      })
      .on("presence", { event: "sync" }, () => {
        const state  = channel.presenceState();
        const others = Object.values(state).flat().filter(p => p.session_id !== sessionId);
        const isOppOnline = others.length > 0;
        setOppOnline(isOppOnline);

        // If opponent was online and now gone: start 10s timer then end game
        if (!isOppOnline) {
          if (!oppTimer.current) {
            oppTimer.current = setTimeout(async () => {
              // Still offline after 10s → declare current player wins
              const gs = await supabase.from("game_states").select("*").eq("room_id", channel._roomId || "").maybeSingle();
              setGameEnded(true);
            }, 10000);
          }
        } else {
          if (oppTimer.current) { clearTimeout(oppTimer.current); oppTimer.current = null; }
        }
      })
      .subscribe(async status => {
        if (status === "SUBSCRIBED") await channel.track({ session_id: sessionId });
      });

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      if (oppTimer.current) clearTimeout(oppTimer.current);
    };
  }, [code, fetchData, sessionId]);

  // Opponent disconnect: end game after timeout
  useEffect(() => {
    if (!oppOnline && room && gameState && !gameState.winner) {
      if (!oppTimer.current) {
        oppTimer.current = setTimeout(async () => {
          const winner = myTeam === "red" ? "red" : "blue";
          await supabase.from("game_states").update({ winner, updated_at: new Date().toISOString() }).eq("room_id", room.id);
          await supabase.from("rooms").update({ status: "finished" }).eq("id", room.id);
          setGameEnded(true);
        }, 10000);
      }
    } else {
      if (oppTimer.current) { clearTimeout(oppTimer.current); oppTimer.current = null; }
    }
  }, [oppOnline, room, gameState, myTeam]);

  const handleMove = useCallback(async (toX, toY) => {
    if (!isMyTurn || actionMode !== "move" || lock.current) return;
    lock.current = true; setActionMsg("");
    try {
      const isRed  = myTeam === "red";
      const newR   = isRed  ? {x:toX,y:toY} : {x:gameState.red_x, y:gameState.red_y};
      const newB   = !isRed ? {x:toX,y:toY} : {x:gameState.blue_x,y:gameState.blue_y};
      const winner = checkWin(newR, newB);
      await supabase.from("game_states").update({
        ...(isRed?{red_x:toX,red_y:toY}:{blue_x:toX,blue_y:toY}),
        current_turn: myTeam==="red"?"blue":"red",
        winner: winner||null, updated_at: new Date().toISOString(),
      }).eq("room_id", room.id);
      if (winner) await supabase.from("rooms").update({status:"finished"}).eq("id",room.id);
      setActionMode(null);
    } catch(e) { console.error(e); setActionMsg("Gagal bergerak."); }
    finally { lock.current = false; }
  }, [isMyTurn, actionMode, gameState, myTeam, room]);

  const handlePlaceBarricade = useCallback(async (wallKey) => {
    if (!isMyTurn || actionMode !== "barricade" || lock.current) return;
    const bars   = Array.isArray(gameState?.barricades)?gameState.barricades:[];
    const myLeft = myTeam==="red"?gameState.red_barricades:gameState.blue_barricades;
    if (bars.includes(wallKey)||myLeft<=0) return;
    if (!isBarricadeLegal(wallKey, gameState)) { setActionMsg("Rintangan ini akan menjebak pemain!"); return; }
    lock.current = true; setActionMsg("");
    try {
      const extra = myTeam==="red"?{red_barricades:myLeft-1}:{blue_barricades:myLeft-1};
      await supabase.from("game_states").update({
        barricades:[...bars,wallKey],...extra,
        current_turn:myTeam==="red"?"blue":"red",
        updated_at:new Date().toISOString(),
      }).eq("room_id",room.id);
      setActionMode(null);
    } catch(e) { console.error(e); setActionMsg("Gagal pasang rintangan."); }
    finally { lock.current = false; }
  }, [isMyTurn, actionMode, gameState, myTeam, room]);

  const handleRematch = useCallback(async () => {
    if (!room) return;
    await supabase.from("game_states").update({
      current_turn:"red",red_x:4,red_y:0,blue_x:4,blue_y:8,
      barricades:[],red_barricades:MAX_BARRICADES,blue_barricades:MAX_BARRICADES,
      winner:null,updated_at:new Date().toISOString(),
    }).eq("room_id",room.id);
    await supabase.from("rooms").update({status:"playing"}).eq("id",room.id);
    setShowWin(false); setGameEnded(false); setActionMode(null);
  }, [room]);

  const redPlayer  = players.find(p=>p.team==="red");
  const bluePlayer = players.find(p=>p.team==="blue");
  const myBarsLeft = gameState?(myTeam==="red"?gameState.red_barricades:gameState.blue_barricades):MAX_BARRICADES;
  const myPos      = gameState?(myTeam==="red"?{x:gameState.red_x,y:gameState.red_y}:{x:gameState.blue_x,y:gameState.blue_y}):null;
  const oppPos     = gameState?(myTeam==="red"?{x:gameState.blue_x,y:gameState.blue_y}:{x:gameState.red_x,y:gameState.red_y}):null;
  const bars       = Array.isArray(gameState?.barricades)?gameState.barricades:[];
  const hasValidMoves = myPos&&oppPos?getValidMoves(myPos,bars,oppPos).length>0:true;

  if (loading) return (
    <div className="min-h-screen grid-bg flex items-center justify-center">
      <div className="card p-8 flex flex-col items-center gap-4">
        <div style={{width:32,height:32,borderRadius:"50%",border:"3px solid #3D6BD9",borderTopColor:"transparent",animation:"spin .7s linear infinite"}}/>
        <p className="text-[var(--muted)] text-sm">{tr("loading")}</p>
      </div>
    </div>
  );

  return (
    <>
      <Head><title>Game {code} — Barricade</title></Head>
      <div className="min-h-screen grid-bg flex flex-col pb-52">

        {/* NON-STICKY header */}
        <header className="flex items-center justify-between px-4 py-3 bg-white/80 border-b border-[var(--border)]">
          <button className="flex items-center gap-1.5 text-[var(--muted)] text-sm hover:text-[var(--text)] transition-colors"
            onClick={()=>router.push("/")}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            {tr("leave")}
          </button>
          <h1 className="font-display text-xl font-black">
            Bari<span style={{color:"var(--red)"}}>ca</span><span style={{color:"var(--blue)"}}>de</span>
          </h1>
          <div className="text-xs font-mono text-[var(--muted)] bg-[var(--cream)] px-2 py-1 rounded-lg border border-[var(--border)]">{code}</div>
        </header>

        {/* Disconnect banner */}
        {!oppOnline && !gameState?.winner && !gameEnded && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-amber-700 text-xs animate-fade-in">
            ⚠️ {tr("opponent_left")} {tr("waiting_for")}... (10s)
          </div>
        )}

        {/* Status bar */}
        <div className={`px-5 py-2.5 font-medium text-sm text-center text-white transition-all ${
          gameState?.winner?(gameState.winner==="red"?"bg-[var(--red)]":"bg-[var(--blue)]")
          :isMyTurn?"bg-[var(--blue)]":"bg-[#6B7280]"}`}>
          {gameState?.winner
            ?`${gameState.winner==="red"?"🔴 Merah":"🔵 Biru"} ${tr("winner_msg")}`
            :isMyTurn?tr("your_turn"):`${tr("waiting_for")} ${gameState?.current_turn==="red"?redPlayer?.player_name||"Merah":bluePlayer?.player_name||"Biru"}...`}
        </div>

        {/* Board + info */}
        <div className="flex-1 flex flex-col lg:flex-row items-start justify-center gap-4 p-4 md:p-6">

          <div className="w-full lg:flex-1 lg:max-w-[620px]">
            <div className="card p-2 md:p-3">
              <GameBoard
                gameState={gameState} myTeam={myTeam} isMyTurn={!!isMyTurn}
                actionMode={actionMode} onMove={handleMove} onPlaceBarricade={handlePlaceBarricade}
                redLabel={tr("red_home_label")} blueLabel={tr("blue_home_label")}
              />
            </div>
            {actionMsg && (
              <div className="mt-2 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm text-center animate-fade-in">{actionMsg}</div>
            )}
          </div>

          {/* Side info */}
          <div className="w-full lg:w-64 space-y-3">
            <div className="card p-4">
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">Pemain</p>
              {[{t:"red",p:redPlayer},{t:"blue",p:bluePlayer}].map(({t,p})=>{
                const col=t==="red"?"var(--red)":"var(--blue)";
                const bg=t==="red"?"rgba(217,79,61,0.08)":"rgba(61,107,217,0.08)";
                const bd=t==="red"?"rgba(217,79,61,0.25)":"rgba(61,107,217,0.25)";
                const turn=gameState?.current_turn===t&&!gameState?.winner;
                const bl=t==="red"?(gameState?.red_barricades??MAX_BARRICADES):(gameState?.blue_barricades??MAX_BARRICADES);
                return (
                  <div key={t} className="flex items-center gap-3 px-3 py-2.5 rounded-xl mb-2 transition-all"
                    style={{background:turn?bg:"transparent",border:`1.5px solid ${turn?bd:"transparent"}`}}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{background:col}}>
                      {t==="red"?"R":"B"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold" style={{color:col}}>
                        {t==="red"?tr("team_red"):tr("team_blue")}
                        {myTeam===t&&<span className="ml-1 text-[var(--muted)]">{tr("you")}</span>}
                      </p>
                      <p className="text-sm truncate">{p?.player_name??tr("waiting_player")}</p>
                    </div>
                    <div className="flex flex-col items-end">
                      {turn&&<div className="w-2 h-2 rounded-full mb-1" style={{background:col,animation:"pulse 1.5s ease infinite"}}/>}
                      <span className="text-xs text-[var(--muted)]">🚧×{bl}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {gameState&&(
              <div className="card p-4">
                <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">{tr("info_pos")}</p>
                <div className="space-y-1 text-xs font-mono">
                  <div className="flex justify-between"><span className="text-[var(--red)]">R</span><span>{String.fromCharCode(65+gameState.red_x)}{gameState.red_y+1}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--blue)]">B</span><span>{String.fromCharCode(65+gameState.blue_x)}{gameState.blue_y+1}</span></div>
                  <div className="flex justify-between mt-1 pt-1 border-t border-[var(--border)]"><span className="text-[var(--muted)]">{tr("info_barriers")}</span><span>{bars.length}</span></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom action drawer */}
      <ActionDrawer
        isMyTurn={!!isMyTurn} actionMode={actionMode} setActionMode={setActionMode}
        myTeam={myTeam} myBarsLeft={myBarsLeft} hasValidMoves={hasValidMoves}
        tr={tr} gameState={gameState}
      />

      {/* Win / disconnect modal */}
      {(showWin&&gameState?.winner)||gameEnded?(
        <WinModal
          winner={gameState?.winner||(myTeam==="red"?"red":"blue")}
          winnerName={gameState?.winner==="red"?redPlayer?.player_name:bluePlayer?.player_name}
          myTeam={myTeam} isHost={room&&sessionId===room.host_session_id}
          disconnected={gameEnded&&!gameState?.winner}
          onRematch={handleRematch} onLeave={()=>router.push("/")} tr={tr}
        />
      ):null}
    </>
  );
}

function WinModal({ winner, winnerName, myTeam, isHost, disconnected, onRematch, onLeave, tr }) {
  const isWinner = winner===myTeam;
  const col = winner==="red"?"#D94F3D":"#3D6BD9";
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4 animate-fade-in">
      <div className="card w-full max-w-sm p-6 text-center animate-slide-up overflow-y-auto max-h-[90vh]" style={{borderRadius:"24px 24px 20px 20px"}}>
        <div className="text-5xl mb-3">{disconnected?"📡":isWinner?"🏆":"💙"}</div>
        <h2 className="font-display text-3xl font-black mb-1" style={{color:col}}>
          {disconnected?tr("end_game"):isWinner?tr("you_win"):tr("you_lose")}
        </h2>
        <p className="text-[var(--muted)] text-sm mb-5">
          {disconnected?tr("opponent_disconnected"):`${winnerName||""} ${tr("winner_msg")}`}
        </p>

        <a href="https://saweria.co/chaesseon" target="_blank" rel="noopener noreferrer"
          className="btn w-full text-sm py-3 mb-3" style={{background:"#FBBF24",color:"#78350F",borderRadius:14}}>
          {tr("donate")}
        </a>

        <div className="bg-[var(--cream)] rounded-2xl p-4 mb-4 text-left">
          <p className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider mb-2">{tr("contact")}</p>
          <div className="space-y-2">
            {[["https://wa.me/62895402466525","📱","WhatsApp","0895402466525"],
              ["mailto:fynnxxc@gmail.com","✉️","Email","fynnxxc@gmail.com"],
              ["https://instagram.com/se_o_nn","📸","IG","@se_o_nn"]].map(([href,icon,label,val])=>(
              <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-[var(--text)] hover:opacity-70 transition-opacity">
                <span>{icon}</span><span className="font-medium">{label}:</span><span className="text-[var(--muted)]">{val}</span>
              </a>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {isHost?<button className="btn btn-blue w-full py-3" onClick={onRematch}>🔁 {tr("play_again")}</button>
            :<p className="text-sm text-[var(--muted)] py-1">{tr("waiting_rematch")}</p>}
          <button className="btn btn-ghost w-full text-sm" onClick={onLeave}>{tr("back_home")}</button>
        </div>
      </div>
    </div>
  );
}
