import { useState, useEffect, useCallback, useRef } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabase";
import GameBoard from "../../components/GameBoard";
import { getValidMoves, checkWin, MAX_BARRICADES } from "../../lib/gameLogic";
import { useLang } from "../../context/LanguageContext";

function getSession() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("barricade_session") || "";
}

export default function Game() {
  const router   = useRouter();
  const { code } = router.query;
  const { tr, toggleLang } = useLang();

  const [room,          setRoom]          = useState(null);
  const [players,       setPlayers]       = useState([]);
  const [gameState,     setGameState]     = useState(null);
  const [myTeam,        setMyTeam]        = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState("");
  const [showWin,       setShowWin]       = useState(false);
  const [actionMode,    setActionMode]    = useState(null);
  const [actionMsg,     setActionMsg]     = useState("");
  const [opponentOnline,setOpponentOnline]= useState(true);

  const sessionId = typeof window !== "undefined" ? getSession() : "";
  const channelRef = useRef(null);
  const lock       = useRef(false);

  const isMyTurn = gameState && myTeam === gameState.current_turn && !gameState.winner;

  const fetchData = useCallback(async () => {
    if (!code) return;
    try {
      const { data: r, error: re } = await supabase.from("rooms").select("*").eq("code", code).single();
      if (re || !r) { setError(tr("room_not_found")); setLoading(false); return; }
      const { data: ps } = await supabase.from("players").select("*").eq("room_id", r.id);
      const { data: gs } = await supabase.from("game_states").select("*").eq("room_id", r.id).maybeSingle();
      setRoom(r); setPlayers(ps || []);
      if (gs) {
        if (typeof gs.barricades === "string") { try { gs.barricades = JSON.parse(gs.barricades); } catch { gs.barricades = []; } }
        setGameState(gs);
        if (gs.winner) setShowWin(true);
      }
      const me = (ps || []).find(p => p.session_id === sessionId);
      if (me) setMyTeam(me.team);
      if (r.status === "waiting") { router.replace(`/lobby/${code}`); return; }
    } catch (err) { console.error(err); setError(tr("error_generic")); }
    finally { setLoading(false); }
  }, [code, sessionId, router, tr]);

  useEffect(() => {
    if (!code) return;
    fetchData();
    const channel = supabase.channel(`game:${code}`, { config: { presence: { key: sessionId } } })
      .on("postgres_changes", { event: "*", schema: "public", table: "game_states" }, payload => {
        const gs = payload.new; if (!gs) return;
        if (typeof gs.barricades === "string") { try { gs.barricades = JSON.parse(gs.barricades); } catch { gs.barricades = []; } }
        setGameState(gs); setActionMode(null);
        if (gs.winner) setShowWin(true);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `code=eq.${code}` }, payload => {
        if (payload.new) setRoom(payload.new);
      })
      .on("presence", { event: "sync" }, () => {
        const online = Object.values(channel.presenceState()).flat();
        setOpponentOnline(online.filter(p => p.session_id !== sessionId).length > 0);
      })
      .subscribe(async status => {
        if (status === "SUBSCRIBED") await channel.track({ session_id: sessionId });
      });
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [code, fetchData, sessionId]);

  const handleMove = useCallback(async (toX, toY) => {
    if (!isMyTurn || actionMode !== "move" || lock.current) return;
    lock.current = true; setActionMsg("");
    try {
      const isRed = myTeam === "red";
      const newRed  = isRed  ? { x: toX, y: toY } : { x: gameState.red_x,  y: gameState.red_y  };
      const newBlue = !isRed ? { x: toX, y: toY } : { x: gameState.blue_x, y: gameState.blue_y };
      const winner  = checkWin(newRed, newBlue);
      await supabase.from("game_states").update({
        ...(isRed ? { red_x: toX, red_y: toY } : { blue_x: toX, blue_y: toY }),
        current_turn: myTeam === "red" ? "blue" : "red",
        winner: winner || null, updated_at: new Date().toISOString(),
      }).eq("room_id", room.id);
      if (winner) await supabase.from("rooms").update({ status: "finished" }).eq("id", room.id);
      setActionMode(null);
    } catch (err) { console.error(err); setActionMsg("Gagal bergerak."); }
    finally { lock.current = false; }
  }, [isMyTurn, actionMode, gameState, myTeam, room]);

  const handlePlaceBarricade = useCallback(async (wallKey) => {
    if (!isMyTurn || actionMode !== "barricade" || lock.current) return;
    const bars   = Array.isArray(gameState?.barricades) ? gameState.barricades : [];
    const myLeft = myTeam === "red" ? gameState.red_barricades : gameState.blue_barricades;
    if (bars.includes(wallKey) || myLeft <= 0) return;
    lock.current = true; setActionMsg("");
    try {
      const extra = myTeam === "red" ? { red_barricades: myLeft-1 } : { blue_barricades: myLeft-1 };
      await supabase.from("game_states").update({
        barricades: [...bars, wallKey], ...extra,
        current_turn: myTeam === "red" ? "blue" : "red",
        updated_at: new Date().toISOString(),
      }).eq("room_id", room.id);
      setActionMode(null);
    } catch (err) { console.error(err); setActionMsg("Gagal pasang rintangan."); }
    finally { lock.current = false; }
  }, [isMyTurn, actionMode, gameState, myTeam, room]);

  const handleRematch = useCallback(async () => {
    if (!room) return;
    await supabase.from("game_states").update({
      current_turn: "red", red_x:4, red_y:0, blue_x:4, blue_y:8,
      barricades:[], red_barricades: MAX_BARRICADES, blue_barricades: MAX_BARRICADES,
      winner: null, updated_at: new Date().toISOString(),
    }).eq("room_id", room.id);
    await supabase.from("rooms").update({ status: "playing" }).eq("id", room.id);
    setShowWin(false); setActionMode(null);
  }, [room]);

  const redPlayer  = players.find(p => p.team === "red");
  const bluePlayer = players.find(p => p.team === "blue");
  const myBarsLeft = gameState ? (myTeam === "red" ? gameState.red_barricades : gameState.blue_barricades) : MAX_BARRICADES;
  const myPos      = gameState ? (myTeam === "red" ? {x:gameState.red_x,y:gameState.red_y} : {x:gameState.blue_x,y:gameState.blue_y}) : null;
  const oppPos     = gameState ? (myTeam === "red" ? {x:gameState.blue_x,y:gameState.blue_y} : {x:gameState.red_x,y:gameState.red_y}) : null;
  const bars       = Array.isArray(gameState?.barricades) ? gameState.barricades : [];
  const hasValidMoves = myPos && oppPos ? getValidMoves(myPos, bars, oppPos).length > 0 : true;

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
      <div className="min-h-screen grid-bg flex flex-col">

        <header className="flex items-center justify-between px-4 py-3 bg-white/70 backdrop-blur border-b border-[var(--border)] sticky top-0 z-10">
          <button className="flex items-center gap-1.5 text-[var(--muted)] text-sm hover:text-[var(--text)] transition-colors" onClick={() => router.push("/")}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            {tr("leave")}
          </button>
          <h1 className="font-display text-xl font-black">
            Bari<span style={{color:"var(--red)"}}>ca</span><span style={{color:"var(--blue)"}}>de</span>
          </h1>
          <div className="flex items-center gap-2">
            <button onClick={toggleLang} className="text-xs text-[var(--muted)] hover:text-[var(--text)]">🌐</button>
            <div className="text-xs font-mono text-[var(--muted)] bg-[var(--cream)] px-2 py-1 rounded-lg border border-[var(--border)]">{code}</div>
          </div>
        </header>

        {!opponentOnline && !gameState?.winner && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-amber-700 text-sm animate-fade-in">
            {tr("opponent_left")}
          </div>
        )}

        <div className="flex-1 flex flex-col lg:flex-row items-start justify-center gap-4 p-4 md:p-6">

          <div className="w-full lg:flex-1 lg:max-w-[590px]">
            <div className={`mb-3 px-5 py-2.5 rounded-2xl font-medium text-sm text-center text-white shadow-sm transition-all ${gameState?.winner ? (gameState.winner==="red"?"bg-[var(--red)]":"bg-[var(--blue)]") : isMyTurn?"bg-[var(--blue)]":"bg-[#6B7280]"}`}>
              {gameState?.winner ? `${gameState.winner==="red"?"🔴 Merah":"🔵 Biru"} ${tr("winner_msg")}`
                : isMyTurn ? tr("your_turn")
                : `${tr("waiting_for")} ${gameState?.current_turn==="red" ? redPlayer?.player_name||"Merah" : bluePlayer?.player_name||"Biru"}...`}
            </div>

            <div className="card p-3 md:p-4">
              <GameBoard
                gameState={gameState} myTeam={myTeam} isMyTurn={!!isMyTurn}
                actionMode={actionMode} onMove={handleMove} onPlaceBarricade={handlePlaceBarricade}
                redLabel={tr("red_home_label")} blueLabel={tr("blue_home_label")}
              />
            </div>

            {isMyTurn && !gameState?.winner && (
              <div className="mt-3 card p-4 animate-fade-in">
                {actionMode === null ? (
                  <>
                    <p className="text-xs text-[var(--muted)] font-semibold uppercase tracking-wider text-center mb-3">{tr("choose_action")}</p>
                    <div className="flex gap-2">
                      <button className={`btn flex-1 py-3.5 text-sm font-semibold ${myTeam==="red"?"btn-red":"btn-blue"}`}
                        onClick={() => setActionMode("move")} disabled={!hasValidMoves}>
                        🚶 {tr("walk")}
                      </button>
                      <button className="btn btn-ghost flex-1 py-3.5 text-sm font-semibold"
                        onClick={() => setActionMode("barricade")} disabled={(myBarsLeft??0)<=0}>
                        🚧 {tr("barrier")}
                        <span className="ml-1 text-xs font-bold" style={{color:myTeam==="red"?"var(--red)":"var(--blue)"}}>×{myBarsLeft??MAX_BARRICADES}</span>
                      </button>
                    </div>
                    {!hasValidMoves && (myBarsLeft??0)<=0 && <p className="mt-2 text-xs text-center text-red-500">{tr("no_moves")}</p>}
                  </>
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-[var(--text)]">
                      {actionMode==="move" ? `🚶 ${tr("move_instruction")}` : `🚧 ${tr("barrier_instruction")}`}
                    </p>
                    <button className="btn btn-ghost text-xs px-3 py-2 ml-2 flex-shrink-0" onClick={() => setActionMode(null)}>{tr("cancel")}</button>
                  </div>
                )}
              </div>
            )}

            {actionMsg && <div className="mt-2 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm text-center animate-fade-in">{actionMsg}</div>}
          </div>

          <div className="w-full lg:w-68 space-y-3">
            <div className="card p-4">
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">Pemain</p>
              {[{team:"red",player:redPlayer},{team:"blue",player:bluePlayer}].map(({team,player}) => {
                const col = team==="red"?"var(--red)":"var(--blue)";
                const bg  = team==="red"?"rgba(217,79,61,0.08)":"rgba(61,107,217,0.08)";
                const bd  = team==="red"?"rgba(217,79,61,0.25)":"rgba(61,107,217,0.25)";
                const turn = gameState?.current_turn===team && !gameState?.winner;
                const bars = team==="red"?(gameState?.red_barricades??MAX_BARRICADES):(gameState?.blue_barricades??MAX_BARRICADES);
                return (
                  <div key={team} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl mb-2 transition-all`}
                    style={{background:turn?bg:"transparent",border:`1.5px solid ${turn?bd:"transparent"}`}}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{background:col}}>
                      {team==="red"?"R":"B"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold" style={{color:col}}>
                        {team==="red"?tr("team_red"):tr("team_blue")}
                        {myTeam===team && <span className="ml-1 text-[var(--muted)]">{tr("you")}</span>}
                      </p>
                      <p className="text-sm text-[var(--text)] truncate">{player?.player_name??tr("waiting_player")}</p>
                    </div>
                    <div className="flex flex-col items-end">
                      {turn && <div className="w-2 h-2 rounded-full mb-1" style={{background:col,animation:"pulse 1.5s ease infinite"}}/>}
                      <span className="text-xs text-[var(--muted)]">🚧×{bars}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="card p-4">
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">{tr("info_pos")}</p>
              <div className="space-y-1.5 text-xs font-mono">
                {gameState && <>
                  <div className="flex justify-between"><span className="text-[var(--red)]">R</span><span>{String.fromCharCode(65+gameState.red_x)}{gameState.red_y+1}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--blue)]">B</span><span>{String.fromCharCode(65+gameState.blue_x)}{gameState.blue_y+1}</span></div>
                  <div className="flex justify-between mt-1 pt-1 border-t border-[var(--border)]"><span className="text-[var(--muted)]">{tr("info_barriers")}</span><span>{bars.length}</span></div>
                </>}
              </div>
            </div>

            <div className="card p-4">
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">{tr("how_to") || "Cara Bermain"}</p>
              <ul className="space-y-1.5 text-xs text-[var(--muted)]">
                <li>① <strong className="text-[var(--text)]">{tr("walk")}</strong> — {tr("step_walk_desc")}</li>
                <li>② <strong className="text-[var(--text)]">{tr("barrier")}</strong> — {tr("step_barrier_desc")}</li>
                <li>🏁 {tr("step_win_desc")}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {showWin && gameState?.winner && (
        <WinModal winner={gameState.winner}
          winnerName={gameState.winner==="red"?redPlayer?.player_name:bluePlayer?.player_name}
          myTeam={myTeam} isHost={room&&sessionId===room.host_session_id}
          onRematch={handleRematch} onLeave={()=>router.push("/")} tr={tr} />
      )}
    </>
  );
}

function WinModal({ winner, winnerName, myTeam, isHost, onRematch, onLeave, tr }) {
  const isWinner = winner === myTeam;
  const col = winner==="red"?"#D94F3D":"#3D6BD9";
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="card max-w-sm w-full p-7 text-center animate-pop-in overflow-y-auto max-h-[90vh]">
        <div className="text-5xl mb-3">{isWinner?"🏆":"💙"}</div>
        <h2 className="font-display text-3xl font-black mb-1" style={{color:col}}>{isWinner?tr("you_win"):tr("you_lose")}</h2>
        <p className="text-[var(--muted)] text-sm mb-5">{winnerName} {tr("winner_msg")}</p>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 text-left">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1">{tr("support")}</p>
          <p className="text-xs text-amber-600 mb-3">{tr("support_desc")}</p>
          <a href="https://saweria.co/chaesseon" target="_blank" rel="noopener noreferrer"
            className="btn w-full text-sm py-2.5" style={{background:"#FBBF24",color:"#78350F"}}>{tr("donate")}</a>
        </div>
        <div className="bg-[var(--cream)] rounded-2xl p-4 mb-5 text-left">
          <p className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider mb-2">{tr("contact")}</p>
          <div className="space-y-2">
            {[["https://wa.me/62895402466525","📱","WhatsApp","0895402466525","green"],["mailto:fynnxxc@gmail.com","✉️","Email","fynnxxc@gmail.com","blue"],["https://instagram.com/se_o_nn","📸","Instagram","@se_o_nn","pink"]].map(([href,icon,label,val,c])=>(
              <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                className={`flex items-center gap-2 text-xs text-[var(--text)] hover:text-${c}-600 transition-colors`}>
                <span className={`w-6 h-6 rounded-full bg-${c}-100 flex items-center justify-center`}>{icon}</span>
                {label}: {val}
              </a>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          {isHost ? <button className="btn btn-blue w-full py-3" onClick={onRematch}>🔁 {tr("play_again")}</button>
            : <p className="text-sm text-[var(--muted)] py-1">{tr("waiting_rematch")}</p>}
          <button className="btn btn-ghost w-full text-sm" onClick={onLeave}>{tr("back_home")}</button>
        </div>
      </div>
    </div>
  );
}
