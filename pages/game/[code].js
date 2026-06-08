import { useState, useEffect, useCallback, useRef } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabase";
import GameBoard from "../../components/GameBoard";
import {
  getValidMoves, checkWin,
} from "../../lib/gameLogic";

function getSession() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("barricade_session") || "";
}

export default function Game() {
  const router   = useRouter();
  const { code } = router.query;

  const [room,      setRoom]      = useState(null);
  const [players,   setPlayers]   = useState([]);
  const [gameState, setGameState] = useState(null);
  const [myTeam,    setMyTeam]    = useState(null); // "red" | "blue"
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [showWin,   setShowWin]   = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  const sessionId  = typeof window !== "undefined" ? getSession() : "";
  const channelRef = useRef(null);
  const actionLock = useRef(false);  // prevent double-clicks

  // ── Fetch everything ──────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!code) return;
    try {
      const { data: r, error: re } = await supabase
        .from("rooms").select("*").eq("code", code).single();
      if (re || !r) { setError("Room tidak ditemukan."); setLoading(false); return; }

      const { data: ps } = await supabase
        .from("players").select("*").eq("room_id", r.id);

      // maybeSingle: game_state may not exist if host hasn't started yet
      const { data: gs } = await supabase
        .from("game_states").select("*").eq("room_id", r.id).maybeSingle();

      setRoom(r);
      setPlayers(ps || []);
      if (gs) setGameState(gs);

      const me = (ps || []).find((p) => p.session_id === sessionId);
      if (me) setMyTeam(me.team);

      if (gs?.winner) setShowWin(true);

      // Redirect back to lobby if game hasn't started
      if (r.status === "waiting") {
        router.replace(`/lobby/${code}`);
        return;
      }
    } catch (err) {
      console.error(err);
      setError("Terjadi kesalahan. Coba refresh.");
    } finally {
      setLoading(false);
    }
  }, [code, sessionId, router]);

  // ── Realtime subscription ─────────────────────────────────────────
  useEffect(() => {
    if (!code) return;
    fetchData();

    const channel = supabase
      .channel(`game:${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_states" }, (payload) => {
        const gs = payload.new;
        if (!gs) return;
        // Supabase JSONB arrives already parsed, but guard anyway
        if (typeof gs.barricades === "string") {
          try { gs.barricades = JSON.parse(gs.barricades); } catch { gs.barricades = []; }
        }
        setGameState(gs);
        if (gs.winner) setShowWin(true);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `code=eq.${code}` }, (payload) => {
        if (payload.new) setRoom(payload.new);
      })
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [code, fetchData]);

  // ── Derive helper booleans ────────────────────────────────────────
  const isMyTurn = gameState && myTeam === gameState.current_turn && !gameState.winner;

  // ── MOVE action ───────────────────────────────────────────────────
  const handleMove = useCallback(async (toX, toY) => {
    if (!isMyTurn || gameState?.phase !== "move" || actionLock.current) return;
    actionLock.current = true;
    setActionMsg("");

    try {
      const isRed = myTeam === "red";
      const newRed  = isRed  ? { red_x: toX,              red_y: toY              } : {};
      const newBlue = !isRed ? { blue_x: toX,             blue_y: toY             } : {};

      const newRedPos  = isRed  ? { x: toX, y: toY } : { x: gameState.red_x,  y: gameState.red_y  };
      const newBluePos = !isRed ? { x: toX, y: toY } : { x: gameState.blue_x, y: gameState.blue_y };

      const winner = checkWin(newRedPos, newBluePos);

      const { error: ue } = await supabase
        .from("game_states")
        .update({
          ...newRed,
          ...newBlue,
          phase:        winner ? "finished" : "place",
          winner:       winner || null,
          updated_at:   new Date().toISOString(),
        })
        .eq("room_id", room.id);

      if (ue) throw ue;
      if (winner) {
        await supabase.from("rooms").update({ status: "finished" }).eq("id", room.id);
      }
    } catch (err) {
      console.error(err);
      setActionMsg("Gagal memindahkan bidak. Coba lagi.");
    } finally {
      actionLock.current = false;
    }
  }, [isMyTurn, gameState, myTeam, room]);

  // ── PLACE BARRICADE action ────────────────────────────────────────
  const handlePlaceBarricade = useCallback(async (edgeKey) => {
    if (!isMyTurn || gameState?.phase !== "place" || actionLock.current) return;
    const currentBarricades = Array.isArray(gameState.barricades) ? gameState.barricades : [];
    if (currentBarricades.includes(edgeKey)) return;
    actionLock.current = true;
    setActionMsg("");

    try {
      const newBarricades = [...currentBarricades, edgeKey];
      const nextTurn = gameState.current_turn === "red" ? "blue" : "red";

      const { error: ue } = await supabase
        .from("game_states")
        .update({
          barricades:   newBarricades,
          current_turn: nextTurn,
          phase:        "move",
          updated_at:   new Date().toISOString(),
        })
        .eq("room_id", room.id);

      if (ue) throw ue;
    } catch (err) {
      console.error(err);
      setActionMsg("Gagal pasang rintangan. Coba lagi.");
    } finally {
      actionLock.current = false;
    }
  }, [isMyTurn, gameState, room]);

  // ── Play again (host rematch) ─────────────────────────────────────
  const handleRematch = useCallback(async () => {
    if (!room) return;
    try {
      await supabase
        .from("game_states")
        .update({
          current_turn: "red",
          phase:        "move",
          red_x: 4,  red_y: 0,
          blue_x: 4, blue_y: 8,
          barricades:   [],
          winner:       null,
          updated_at:   new Date().toISOString(),
        })
        .eq("room_id", room.id);

      await supabase
        .from("rooms")
        .update({ status: "playing" })
        .eq("id", room.id);

      setShowWin(false);
    } catch (err) {
      console.error(err);
    }
  }, [room]);

  // ── Derived player info ───────────────────────────────────────────
  const redPlayer  = players.find((p) => p.team === "red");
  const bluePlayer = players.find((p) => p.team === "blue");

  const myPos = gameState
    ? (myTeam === "red"
        ? { x: gameState.red_x,  y: gameState.red_y  }
        : { x: gameState.blue_x, y: gameState.blue_y })
    : null;

  const oppPos = gameState
    ? (myTeam === "red"
        ? { x: gameState.blue_x, y: gameState.blue_y }
        : { x: gameState.red_x,  y: gameState.red_y  })
    : null;

  const hasValidMoves = myPos && oppPos && gameState
    ? getValidMoves(myPos, gameState.barricades || [], oppPos).length > 0
    : true;

  // ── Status text ───────────────────────────────────────────────────
  function getStatusText() {
    if (!gameState) return "Memuat...";
    if (gameState.winner) return `${gameState.winner === "red" ? "🔴 Merah" : "🔵 Biru"} Menang!`;
    if (!isMyTurn) {
      const opp = gameState.current_turn === "red" ? redPlayer?.player_name : bluePlayer?.player_name;
      return `Giliran ${opp || "lawan"}...`;
    }
    if (gameState.phase === "move") return "Pindahkan bidakmu!";
    return "Pasang rintangan!";
  }

  // ── Loading state ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen grid-bg flex items-center justify-center">
        <div className="card p-8 flex flex-col items-center gap-4">
          <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #3D6BD9", borderTopColor: "transparent", animation: "spin 0.7s linear infinite" }} />
          <p className="text-[var(--muted)] text-sm">Memuat game...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen grid-bg flex items-center justify-center px-4">
        <div className="card p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-3">😕</div>
          <p className="font-semibold text-[var(--text)] mb-2">{error}</p>
          <button className="btn btn-ghost mt-4 w-full" onClick={() => router.push("/")}>
            Kembali ke Beranda
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Game {code} — Barricade</title>
      </Head>

      <div className="min-h-screen grid-bg flex flex-col">

        {/* ── Top bar ── */}
        <header className="flex items-center justify-between px-4 py-3 bg-white/70 backdrop-blur border-b border-[var(--border)] sticky top-0 z-10">
          <button
            className="flex items-center gap-1.5 text-[var(--muted)] text-sm hover:text-[var(--text)] transition-colors"
            onClick={() => router.push("/")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Keluar
          </button>

          <h1 className="font-display text-xl font-black text-[var(--text)]">
            Bari<span style={{ color: "var(--red)" }}>ca</span><span style={{ color: "var(--blue)" }}>de</span>
          </h1>

          <div className="text-xs font-mono text-[var(--muted)] bg-[var(--cream)] px-2 py-1 rounded-lg border border-[var(--border)]">
            {code}
          </div>
        </header>

        {/* ── Main layout ── */}
        <div className="flex-1 flex flex-col lg:flex-row items-start justify-center gap-4 p-4 md:p-6">

          {/* ── Left: game board ── */}
          <div className="w-full lg:flex-1 lg:max-w-[520px]">
            {/* Status banner */}
            <div
              className={`mb-4 px-5 py-3 rounded-2xl font-medium text-sm text-center text-white shadow-md transition-all duration-300 ${
                !gameState?.winner
                  ? isMyTurn
                    ? gameState?.phase === "move"
                      ? "bg-[var(--blue)]"
                      : "bg-[var(--red)]"
                    : "bg-[#6B7280]"
                  : gameState.winner === "red"
                    ? "bg-[var(--red)]"
                    : "bg-[var(--blue)]"
              }`}
            >
              {getStatusText()}
            </div>

            {/* Board */}
            <div className="card p-3 md:p-4">
              <GameBoard
                gameState={gameState}
                myTeam={myTeam}
                isMyTurn={!!isMyTurn}
                onMove={handleMove}
                onPlaceBarricade={handlePlaceBarricade}
              />
            </div>

            {/* Phase indicator */}
            {isMyTurn && !gameState?.winner && (
              <div className="mt-3 flex items-center justify-center gap-2">
                <PhaseStep
                  label="Bergerak"
                  active={gameState?.phase === "move"}
                  done={gameState?.phase === "place"}
                  color="var(--blue)"
                />
                <div className="w-8 h-0.5 bg-[var(--border)]" />
                <PhaseStep
                  label="Pasang Rintangan"
                  active={gameState?.phase === "place"}
                  done={false}
                  color="var(--red)"
                />
              </div>
            )}

            {!hasValidMoves && isMyTurn && gameState?.phase === "move" && !gameState?.winner && (
              <div className="mt-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm text-center">
                ⚠️ Kamu terjebak! Tidak ada langkah yang tersedia.
              </div>
            )}

            {actionMsg && (
              <div className="mt-3 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm text-center animate-fade-in">
                {actionMsg}
              </div>
            )}
          </div>

          {/* ── Right: info panel ── */}
          <div className="w-full lg:w-72 space-y-4">

            {/* Turn indicator */}
            <div className="card p-4">
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
                Giliran
              </p>
              <TurnCard
                team="red"
                player={redPlayer}
                isTurn={gameState?.current_turn === "red" && !gameState?.winner}
                isMe={myTeam === "red"}
              />
              <div className="my-2 text-center text-xs text-[var(--muted)] font-medium">vs</div>
              <TurnCard
                team="blue"
                player={bluePlayer}
                isTurn={gameState?.current_turn === "blue" && !gameState?.winner}
                isMe={myTeam === "blue"}
              />
            </div>

            {/* Barricades count */}
            <div className="card p-4">
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
                Rintangan Dipasang
              </p>
              <div className="text-3xl font-display font-black text-[var(--text)] text-center">
                {gameState?.barricades?.length ?? 0}
                <span className="text-base font-body font-normal text-[var(--muted)] ml-1">/ ∞</span>
              </div>
            </div>

            {/* Legend */}
            <div className="card p-4">
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
                Cara Bermain
              </p>
              <ul className="space-y-2 text-xs text-[var(--muted)]">
                <li className="flex items-start gap-2">
                  <span className="text-[var(--blue)] font-bold mt-0.5">①</span>
                  <span>Klik sel yang disorot untuk <strong className="text-[var(--text)]">bergerak</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[var(--red)] font-bold mt-0.5">②</span>
                  <span>Klik garis antar sel untuk <strong className="text-[var(--text)]">memasang rintangan</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-emerald-500 mt-0.5">🏁</span>
                  <span>Capai baris rumah lawan untuk <strong className="text-[var(--text)]">menang</strong></span>
                </li>
              </ul>
            </div>

            {/* Position info */}
            {gameState && myTeam && (
              <div className="card p-4">
                <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
                  Posisi
                </p>
                <div className="space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-[var(--red)]">Merah (R)</span>
                    <span className="font-semibold text-[var(--text)]">
                      {String.fromCharCode(65 + gameState.red_x)}{gameState.red_y + 1}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--blue)]">Biru (B)</span>
                    <span className="font-semibold text-[var(--text)]">
                      {String.fromCharCode(65 + gameState.blue_x)}{gameState.blue_y + 1}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Win modal ── */}
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

// ── Sub-components ─────────────────────────────────────────────────────────────

function TurnCard({ team, player, isTurn, isMe }) {
  const col = team === "red" ? "var(--red)" : "var(--blue)";
  const bg  = team === "red" ? "rgba(217,79,61,0.08)" : "rgba(61,107,217,0.08)";
  const bd  = team === "red" ? "rgba(217,79,61,0.25)" : "rgba(61,107,217,0.25)";

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
      style={{
        background: isTurn ? bg : "transparent",
        border: `1.5px solid ${isTurn ? bd : "transparent"}`,
      }}
    >
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
        style={{ background: col }}
      >
        {team === "red" ? "R" : "B"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold" style={{ color: col }}>
          Tim {team === "red" ? "Merah" : "Biru"}
          {isMe && <span className="ml-1 text-[var(--muted)]">(Kamu)</span>}
        </p>
        <p className="text-sm text-[var(--text)] truncate">
          {player?.player_name ?? "Menunggu..."}
        </p>
      </div>
      {isTurn && (
        <div
          className="w-2.5 h-2.5 rounded-full animate-pulse flex-shrink-0"
          style={{ background: col }}
        />
      )}
    </div>
  );
}

function PhaseStep({ label, active, done, color }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
        style={{
          background: done ? "#22c55e" : active ? color : "var(--border)",
          transition: "background 0.3s",
        }}
      >
        {done ? "✓" : active ? "→" : "·"}
      </div>
      <span
        className="text-xs font-medium"
        style={{ color: active ? color : "var(--muted)" }}
      >
        {label}
      </span>
    </div>
  );
}

function WinModal({ winner, winnerName, myTeam, isHost, onRematch, onLeave }) {
  const isWinner = winner === myTeam;
  const col      = winner === "red" ? "#D94F3D" : "#3D6BD9";

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="card max-w-sm w-full p-8 text-center animate-pop-in">

        {/* Trophy */}
        <div className="text-6xl mb-4">{isWinner ? "🏆" : "💙"}</div>

        {/* Result */}
        <h2 className="font-display text-3xl font-black mb-1" style={{ color: col }}>
          {isWinner ? "Kamu Menang!" : "Kamu Kalah!"}
        </h2>
        <p className="text-[var(--muted)] text-sm mb-6">
          {winnerName || (winner === "red" ? "Tim Merah" : "Tim Biru")} meraih kemenangan
        </p>

        {/* Divider */}
        <div className="flex items-center gap-2 mb-6">
          <div className="flex-1 h-px bg-[var(--border)]" />
          <span className="text-xs text-[var(--muted)]">Selesai</span>
          <div className="flex-1 h-px bg-[var(--border)]" />
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {isHost && (
            <button className="btn btn-blue w-full text-base py-3.5" onClick={onRematch}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
              </svg>
              Main Lagi
            </button>
          )}
          {!isHost && (
            <p className="text-sm text-[var(--muted)] py-1">Menunggu host untuk main lagi...</p>
          )}
          <button className="btn btn-ghost w-full text-sm" onClick={onLeave}>
            Kembali ke Beranda
          </button>
        </div>
      </div>
    </div>
  );
}
