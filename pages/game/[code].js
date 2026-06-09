import { useState, useEffect, useCallback, useRef } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabase";
import GameBoard from "../../components/GameBoard";
import {
  getValidMoves, checkWin, MAX_BARRICADES,
} from "../../lib/gameLogic";

function getSession() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("barricade_session") || "";
}

export default function Game() {
  const router   = useRouter();
  const { code } = router.query;

  const [room,          setRoom]          = useState(null);
  const [players,       setPlayers]       = useState([]);
  const [gameState,     setGameState]     = useState(null);
  const [myTeam,        setMyTeam]        = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState("");
  const [showWin,       setShowWin]       = useState(false);
  const [actionMode,    setActionMode]    = useState(null); // null | "move" | "barricade"
  const [actionMsg,     setActionMsg]     = useState("");
  const [opponentOnline,setOpponentOnline]= useState(true);

  const sessionId  = typeof window !== "undefined" ? getSession() : "";
  const channelRef = useRef(null);
  const lock       = useRef(false);

  // ── Fetch ─────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!code) return;
    try {
      const { data: r, error: re } = await supabase
        .from("rooms").select("*").eq("code", code).single();
      if (re || !r) { setError("Room tidak ditemukan."); setLoading(false); return; }

      const { data: ps } = await supabase
        .from("players").select("*").eq("room_id", r.id);

      const { data: gs } = await supabase
        .from("game_states").select("*").eq("room_id", r.id).maybeSingle();

      setRoom(r);
      setPlayers(ps || []);
      if (gs) {
        if (typeof gs.barricades === "string") {
          try { gs.barricades = JSON.parse(gs.barricades); } catch { gs.barricades = []; }
        }
        setGameState(gs);
        if (gs.winner) setShowWin(true);
      }
      const me = (ps || []).find(p => p.session_id === sessionId);
      if (me) setMyTeam(me.team);
      if (r.status === "waiting") { router.replace(`/lobby/${code}`); return; }
    } catch (err) {
      console.error(err);
      setError("Terjadi kesalahan. Coba refresh.");
    } finally {
      setLoading(false);
    }
  }, [code, sessionId, router]);

  // ── Realtime + Presence ────────────────────────────────────────────
  useEffect(() => {
    if (!code) return;
    fetchData();

    const channel = supabase.channel(`game:${code}`, { config: { presence: { key: sessionId } } })
      .on("postgres_changes", { event: "*", schema: "public", table: "game_states" }, payload => {
        const gs = payload.new;
        if (!gs) return;
        if (typeof gs.barricades === "string") {
          try { gs.barricades = JSON.parse(gs.barricades); } catch { gs.barricades = []; }
        }
        setGameState(gs);
        setActionMode(null);
        if (gs.winner) setShowWin(true);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `code=eq.${code}` }, payload => {
        if (payload.new) setRoom(payload.new);
      })
      .on("presence", { event: "sync" }, () => {
        const state   = channel.presenceState();
        const online  = Object.values(state).flat();
        setOpponentOnline(online.filter(p => p.session_id !== sessionId).length > 0);
      })
      .subscribe(async status => {
        if (status === "SUBSCRIBED") {
          await channel.track({ session_id: sessionId });
        }
      });

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [code, fetchData, sessionId]);

  // ── MOVE ───────────────────────────────────────────────────────────
  const handleMove = useCallback(async (toX, toY) => {
    if (!isMyTurn || actionMode !== "move" || lock.current) return;
    lock.current = true;
    setActionMsg("");
    try {
      const isRed = myTeam === "red";
      const newRedPos  = isRed  ? { x: toX, y: toY } : { x: gameState.red_x,  y: gameState.red_y  };
      const newBluePos = !isRed ? { x: toX, y: toY } : { x: gameState.blue_x, y: gameState.blue_y };
      const winner     = checkWin(newRedPos, newBluePos);
      const nextTurn   = myTeam === "red" ? "blue" : "red";

      const { error: ue } = await supabase.from("game_states").update({
        ...(isRed ? { red_x: toX, red_y: toY } : { blue_x: toX, blue_y: toY }),
        current_turn: nextTurn,
        winner:       winner || null,
        updated_at:   new Date().toISOString(),
      }).eq("room_id", room.id);
      if (ue) throw ue;

      if (winner) {
        await supabase.from("rooms").update({ status: "finished" }).eq("id", room.id);
      }
      setActionMode(null);
    } catch (err) {
      console.error(err);
      setActionMsg("Gagal bergerak. Coba lagi.");
    } finally {
      lock.current = false;
    }
  }, [isMyTurn, actionMode, gameState, myTeam, room]);

  // ── PLACE BARRICADE ────────────────────────────────────────────────
  const handlePlaceBarricade = useCallback(async (wallKey) => {
    if (!isMyTurn || actionMode !== "barricade" || lock.current) return;
    const bars    = Array.isArray(gameState?.barricades) ? gameState.barricades : [];
    const myLeft  = myTeam === "red" ? gameState.red_barricades : gameState.blue_barricades;
    if (bars.includes(wallKey) || myLeft <= 0) return;
    lock.current = true;
    setActionMsg("");
    try {
      const newBars  = [...bars, wallKey];
      const nextTurn = myTeam === "red" ? "blue" : "red";
      const extra    = myTeam === "red"
        ? { red_barricades:  myLeft - 1 }
        : { blue_barricades: myLeft - 1 };

      const { error: ue } = await supabase.from("game_states").update({
        barricades:   newBars,
        ...extra,
        current_turn: nextTurn,
        updated_at:   new Date().toISOString(),
      }).eq("room_id", room.id);
      if (ue) throw ue;
      setActionMode(null);
    } catch (err) {
      console.error(err);
      setActionMsg("Gagal pasang rintangan. Coba lagi.");
    } finally {
      lock.current = false;
    }
  }, [isMyTurn, actionMode, gameState, myTeam, room]);

  // ── REMATCH ────────────────────────────────────────────────────────
  const handleRematch = useCallback(async () => {
    if (!room) return;
    try {
      await supabase.from("game_states").update({
        current_turn:    "red",
        red_x: 4, red_y: 0, blue_x: 4, blue_y: 8,
        barricades:      [],
        red_barricades:  MAX_BARRICADES,
        blue_barricades: MAX_BARRICADES,
        winner:          null,
        updated_at:      new Date().toISOString(),
      }).eq("room_id", room.id);
      await supabase.from("rooms").update({ status: "playing" }).eq("id", room.id);
      setShowWin(false);
      setActionMode(null);
    } catch (err) { console.error(err); }
  }, [room]);

  // ── Derived ────────────────────────────────────────────────────────
  const isMyTurn    = gameState && myTeam === gameState.current_turn && !gameState.winner;
  const redPlayer   = players.find(p => p.team === "red");
  const bluePlayer  = players.find(p => p.team === "blue");
  const myBarsLeft  = gameState
    ? (myTeam === "red" ? gameState.red_barricades : gameState.blue_barricades)
    : MAX_BARRICADES;
  const myPos       = gameState
    ? (myTeam === "red" ? { x: gameState.red_x, y: gameState.red_y } : { x: gameState.blue_x, y: gameState.blue_y })
    : null;
  const oppPos      = gameState
    ? (myTeam === "red" ? { x: gameState.blue_x, y: gameState.blue_y } : { x: gameState.red_x, y: gameState.red_y })
    : null;
  const hasValidMoves = myPos && oppPos && gameState
    ? getValidMoves(myPos, Array.isArray(gameState.barricades) ? gameState.barricades : [], oppPos).length > 0
    : true;

  // ── Loading / Error ────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen grid-bg flex items-center justify-center">
      <div className="card p-8 flex flex-col items-center gap-4">
        <div style={{ width:32,height:32,borderRadius:"50%",border:"3px solid #3D6BD9",borderTopColor:"transparent",animation:"spin .7s linear infinite" }} />
        <p className="text-[var(--muted)] text-sm">Memuat game...</p>
      </div>
    </div>
  );

  if (error && !room) return (
    <div className="min-h-screen grid-bg flex items-center justify-center px-4">
      <div className="card p-8 max-w-sm w-full text-center">
        <div className="text-4xl mb-3">😕</div>
        <p className="font-semibold text-[var(--text)] mb-2">{error}</p>
        <button className="btn btn-ghost mt-4 w-full" onClick={() => router.push("/")}>Beranda</button>
      </div>
    </div>
  );

  return (
    <>
      <Head><title>Game {code} — Barricade</title></Head>

      <div className="min-h-screen grid-bg flex flex-col">

        {/* ── Header ── */}
        <header className="flex items-center justify-between px-4 py-3 bg-white/70 backdrop-blur border-b border-[var(--border)] sticky top-0 z-10">
          <button className="flex items-center gap-1.5 text-[var(--muted)] text-sm hover:text-[var(--text)] transition-colors"
            onClick={() => router.push("/")}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Keluar
          </button>
          <h1 className="font-display text-xl font-black">
            Bari<span style={{color:"var(--red)"}}>ca</span><span style={{color:"var(--blue)"}}>de</span>
          </h1>
          <div className="text-xs font-mono text-[var(--muted)] bg-[var(--cream)] px-2 py-1 rounded-lg border border-[var(--border)]">{code}</div>
        </header>

        {/* ── Disconnect banner ── */}
        {!opponentOnline && !gameState?.winner && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-amber-700 text-sm animate-fade-in">
            ⚠️ Lawan telah keluar dari permainan. Menunggu kembali...
          </div>
        )}

        {/* ── Main ── */}
        <div className="flex-1 flex flex-col lg:flex-row items-start justify-center gap-4 p-4 md:p-6">

          {/* Board column */}
          <div className="w-full lg:flex-1 lg:max-w-[580px]">

            {/* Status banner */}
            <div className={`mb-3 px-5 py-2.5 rounded-2xl font-medium text-sm text-center text-white shadow-sm transition-all duration-300 ${
              gameState?.winner ? (gameState.winner === "red" ? "bg-[var(--red)]" : "bg-[var(--blue)]")
              : isMyTurn ? "bg-[var(--blue)]" : "bg-[#6B7280]"
            }`}>
              {gameState?.winner
                ? `${gameState.winner === "red" ? "🔴 Merah" : "🔵 Biru"} Menang!`
                : isMyTurn ? "Giliran kamu!" : `Menunggu ${gameState?.current_turn === "red" ? redPlayer?.player_name || "Merah" : bluePlayer?.player_name || "Biru"}...`}
            </div>

            {/* Board */}
            <div className="card p-3 md:p-4">
              <GameBoard
                gameState={gameState}
                myTeam={myTeam}
                isMyTurn={!!isMyTurn}
                actionMode={actionMode}
                onMove={handleMove}
                onPlaceBarricade={handlePlaceBarricade}
              />
            </div>

            {/* Action chooser */}
            {isMyTurn && !gameState?.winner && (
              <div className="mt-3 card p-4 animate-fade-in">
                {actionMode === null ? (
                  <>
                    <p className="text-xs text-[var(--muted)] font-semibold uppercase tracking-wider text-center mb-3">
                      Pilih aksi kamu
                    </p>
                    <div className="flex gap-2">
                      <button
                        className={`btn flex-1 py-3 text-sm ${myTeam === "red" ? "btn-red" : "btn-blue"}`}
                        onClick={() => setActionMode("move")}
                        disabled={!hasValidMoves}
                      >
                        🚶 Jalan
                      </button>
                      <button
                        className="btn btn-ghost flex-1 py-3 text-sm"
                        onClick={() => setActionMode("barricade")}
                        disabled={(myBarsLeft ?? 0) <= 0}
                        title={(myBarsLeft ?? 0) <= 0 ? "Rintangan habis!" : ""}
                      >
                        🚧 Rintangan
                        <span className="ml-1 text-xs font-bold" style={{color: myTeam === "red" ? "var(--red)" : "var(--blue)"}}>
                          ×{myBarsLeft ?? MAX_BARRICADES}
                        </span>
                      </button>
                    </div>
                    {!hasValidMoves && (myBarsLeft ?? 0) <= 0 && (
                      <p className="mt-2 text-xs text-center text-red-500">
                        ⚠️ Tidak ada langkah tersisa — kamu kalah!
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-[var(--text)]">
                      {actionMode === "move"
                        ? "🚶 Klik sel yang disorot untuk bergerak"
                        : "🚧 Klik garis antar sel untuk memasang rintangan"}
                    </p>
                    <button className="btn btn-ghost text-xs px-3 py-2 ml-2 flex-shrink-0" onClick={() => setActionMode(null)}>
                      Batal
                    </button>
                  </div>
                )}
              </div>
            )}

            {actionMsg && (
              <div className="mt-2 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm text-center animate-fade-in">
                {actionMsg}
              </div>
            )}
          </div>

          {/* Info panel */}
          <div className="w-full lg:w-72 space-y-3">

            {/* Turn cards */}
            <div className="card p-4">
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">Pemain</p>
              <TurnCard team="red"  player={redPlayer}  isTurn={gameState?.current_turn === "red"  && !gameState?.winner} isMe={myTeam === "red"}  barsLeft={gameState?.red_barricades  ?? MAX_BARRICADES} />
              <div className="my-2 text-center text-xs text-[var(--muted)]">vs</div>
              <TurnCard team="blue" player={bluePlayer} isTurn={gameState?.current_turn === "blue" && !gameState?.winner} isMe={myTeam === "blue"} barsLeft={gameState?.blue_barricades ?? MAX_BARRICADES} />
            </div>

            {/* Legend */}
            <div className="card p-4">
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">Cara Bermain</p>
              <ul className="space-y-2 text-xs text-[var(--muted)]">
                <li className="flex items-start gap-2"><span className="font-bold text-[var(--blue)]">①</span><span>Pilih <strong className="text-[var(--text)]">Jalan</strong> lalu klik sel tujuan</span></li>
                <li className="flex items-start gap-2"><span className="font-bold text-[var(--red)]">②</span><span>Atau pilih <strong className="text-[var(--text)]">Rintangan</strong> lalu klik garis antar sel</span></li>
                <li className="flex items-start gap-2"><span className="font-bold text-emerald-500">③</span><span>Setiap pemain punya <strong className="text-[var(--text)]">10 rintangan</strong></span></li>
                <li className="flex items-start gap-2"><span>🏁</span><span>Capai baris lawan untuk <strong className="text-[var(--text)]">menang</strong></span></li>
              </ul>
            </div>

            {/* Position */}
            {gameState && (
              <div className="card p-4">
                <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">Posisi</p>
                <div className="space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-[var(--red)]">Merah (R)</span>
                    <span className="font-semibold">{String.fromCharCode(65 + gameState.red_x)}{gameState.red_y + 1}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--blue)]">Biru (B)</span>
                    <span className="font-semibold">{String.fromCharCode(65 + gameState.blue_x)}{gameState.blue_y + 1}</span>
                  </div>
                  <div className="flex justify-between mt-1 pt-1 border-t border-[var(--border)]">
                    <span className="text-[var(--muted)]">Rintangan terpasang</span>
                    <span className="font-semibold">{(gameState.barricades || []).length}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Win modal */}
      {showWin && gameState?.winner && (
        <WinModal
          winner={gameState.winner}
          winnerName={gameState.winner === "red" ? redPlayer?.player_name : bluePlayer?.player_name}
          myTeam={myTeam}
          isHost={room && sessionId === room.host_session_id}
          onRematch={handleRematch}
          onLeave={() => router.push("/")}
        />
      )}
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function TurnCard({ team, player, isTurn, isMe, barsLeft }) {
  const col = team === "red" ? "var(--red)" : "var(--blue)";
  const bg  = team === "red" ? "rgba(217,79,61,0.08)" : "rgba(61,107,217,0.08)";
  const bd  = team === "red" ? "rgba(217,79,61,0.25)" : "rgba(61,107,217,0.25)";
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
      style={{ background: isTurn ? bg : "transparent", border: `1.5px solid ${isTurn ? bd : "transparent"}` }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
        style={{ background: col }}>
        {team === "red" ? "R" : "B"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold" style={{ color: col }}>
          Tim {team === "red" ? "Merah" : "Biru"}{isMe && <span className="ml-1 text-[var(--muted)]">(Kamu)</span>}
        </p>
        <p className="text-sm text-[var(--text)] truncate">{player?.player_name ?? "Menunggu..."}</p>
      </div>
      <div className="flex flex-col items-end flex-shrink-0">
        {isTurn && <div className="w-2 h-2 rounded-full mb-1" style={{ background: col, animation: "pulse 1.5s ease-in-out infinite" }} />}
        <span className="text-xs text-[var(--muted)]">🚧×{barsLeft}</span>
      </div>
    </div>
  );
}

function WinModal({ winner, winnerName, myTeam, isHost, onRematch, onLeave }) {
  const isWinner = winner === myTeam;
  const col      = winner === "red" ? "#D94F3D" : "#3D6BD9";

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="card max-w-sm w-full p-7 text-center animate-pop-in overflow-y-auto max-h-[90vh]">

        <div className="text-5xl mb-3">{isWinner ? "🏆" : "💙"}</div>
        <h2 className="font-display text-3xl font-black mb-1" style={{ color: col }}>
          {isWinner ? "Kamu Menang!" : "Kamu Kalah!"}
        </h2>
        <p className="text-[var(--muted)] text-sm mb-5">
          {winnerName || (winner === "red" ? "Tim Merah" : "Tim Biru")} meraih kemenangan 🎉
        </p>

        {/* Donate section */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 text-left">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2">☕ Dukung Developer</p>
          <p className="text-xs text-amber-600 mb-3">Suka game ini? Traktir kopi biar semangat bikin fitur baru!</p>
          <a
            href="https://saweria.co/chaesseon"
            target="_blank"
            rel="noopener noreferrer"
            className="btn w-full text-sm py-2.5"
            style={{ background: "#FBBF24", color: "#78350F" }}
          >
            ☕ Donate via Saweria
          </a>
        </div>

        {/* Contact */}
        <div className="bg-[var(--cream)] rounded-2xl p-4 mb-5 text-left">
          <p className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider mb-2">📬 Kontak Developer</p>
          <div className="space-y-2">
            <a href="https://wa.me/62895402466525" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-[var(--text)] hover:text-green-600 transition-colors">
              <span className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-base">📱</span>
              WhatsApp: 0895402466525
            </a>
            <a href="mailto:fynnxxc@gmail.com"
              className="flex items-center gap-2 text-xs text-[var(--text)] hover:text-[var(--blue)] transition-colors">
              <span className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-base">✉️</span>
              fynnxxc@gmail.com
            </a>
            <a href="https://instagram.com/se_o_nn" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-[var(--text)] hover:text-pink-500 transition-colors">
              <span className="w-6 h-6 rounded-full bg-pink-100 flex items-center justify-center text-base">📸</span>
              @se_o_nn
            </a>
          </div>
        </div>

        <div className="space-y-2">
          {isHost ? (
            <button className="btn btn-blue w-full py-3" onClick={onRematch}>🔁 Main Lagi</button>
          ) : (
            <p className="text-sm text-[var(--muted)] py-1">Menunggu host untuk main lagi...</p>
          )}
          <button className="btn btn-ghost w-full text-sm" onClick={onLeave}>Kembali ke Beranda</button>
        </div>
      </div>
    </div>
  );
}
