import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import GameBoard from "../../components/GameBoard";
import {
  getValidMoves, checkWin, computeAIMove, MAX_BARRICADES,
} from "../../lib/gameLogic";

const INIT_STATE = {
  current_turn:    "red",
  red_x: 4,  red_y: 0,
  blue_x: 4, blue_y: 8,
  barricades:      [],
  red_barricades:  MAX_BARRICADES,
  blue_barricades: MAX_BARRICADES,
  winner:          null,
};

export default function AIGame() {
  const router = useRouter();

  const [gs,         setGs]         = useState(INIT_STATE);
  const [actionMode, setActionMode] = useState(null);   // null | "move" | "barricade"
  const [showWin,    setShowWin]    = useState(false);
  const [aiThinking, setAiThinking] = useState(false);

  const isMyTurn = gs.current_turn === "red" && !gs.winner;

  const myPos  = { x: gs.red_x,  y: gs.red_y  };
  const oppPos = { x: gs.blue_x, y: gs.blue_y };
  const bars   = Array.isArray(gs.barricades) ? gs.barricades : [];

  const hasValidMoves = getValidMoves(myPos, bars, oppPos).length > 0;
  const myBarsLeft    = gs.red_barricades ?? MAX_BARRICADES;

  // ── AI turn ────────────────────────────────────────────────────────
  useEffect(() => {
    if (gs.current_turn !== "blue" || gs.winner) return;
    setAiThinking(true);

    const t = setTimeout(() => {
      const decision = computeAIMove(gs);
      if (!decision) { setAiThinking(false); return; }

      setGs(prev => {
        let next = { ...prev };

        if (decision.action === "move") {
          next.blue_x      = decision.pos.x;
          next.blue_y      = decision.pos.y;
          next.current_turn = "red";
          const w = checkWin({ x: next.red_x, y: next.red_y }, { x: next.blue_x, y: next.blue_y });
          next.winner = w;
        } else {
          next.barricades      = [...(Array.isArray(prev.barricades) ? prev.barricades : []), decision.wall];
          next.blue_barricades = (prev.blue_barricades ?? MAX_BARRICADES) - 1;
          next.current_turn    = "red";
        }

        return next;
      });

      setAiThinking(false);
    }, 750);

    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs.current_turn, gs.winner]);

  // Trigger win modal when winner is set
  useEffect(() => {
    if (gs.winner) setShowWin(true);
  }, [gs.winner]);

  // ── Human MOVE ─────────────────────────────────────────────────────
  const handleMove = useCallback((toX, toY) => {
    if (!isMyTurn || actionMode !== "move") return;

    setGs(prev => {
      const newRedPos  = { x: toX,        y: toY        };
      const newBluePos = { x: prev.blue_x, y: prev.blue_y };
      const winner     = checkWin(newRedPos, newBluePos);
      return { ...prev, red_x: toX, red_y: toY, current_turn: "blue", winner: winner || null };
    });
    setActionMode(null);
  }, [isMyTurn, actionMode]);

  // ── Human BARRICADE ────────────────────────────────────────────────
  const handlePlaceBarricade = useCallback((wallKey) => {
    if (!isMyTurn || actionMode !== "barricade") return;
    if ((gs.red_barricades ?? 0) <= 0) return;

    setGs(prev => {
      const prevBars = Array.isArray(prev.barricades) ? prev.barricades : [];
      if (prevBars.includes(wallKey)) return prev;
      return {
        ...prev,
        barricades:     [...prevBars, wallKey],
        red_barricades: (prev.red_barricades ?? MAX_BARRICADES) - 1,
        current_turn:   "blue",
      };
    });
    setActionMode(null);
  }, [isMyTurn, actionMode, gs.red_barricades]);

  // ── Restart ────────────────────────────────────────────────────────
  function handleRestart() {
    setGs(INIT_STATE);
    setActionMode(null);
    setShowWin(false);
    setAiThinking(false);
  }

  const myColor = "var(--red)";

  return (
    <>
      <Head><title>vs AI — Barricade</title></Head>

      <div className="min-h-screen grid-bg flex flex-col">

        {/* Header */}
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
            <span className="ml-2 text-xs font-body font-semibold text-[var(--muted)] align-middle">vs AI</span>
          </h1>
          <button className="btn btn-ghost text-xs px-3 py-2" onClick={handleRestart}>
            🔁 Ulang
          </button>
        </header>

        {/* AI thinking banner */}
        {aiThinking && (
          <div className="bg-[var(--cream)] border-b border-[var(--border)] px-4 py-2 flex items-center justify-center gap-2 text-sm text-[var(--muted)]">
            <div style={{width:14,height:14,borderRadius:"50%",border:"2px solid #3D6BD9",borderTopColor:"transparent",animation:"spin .7s linear infinite"}} />
            AI sedang berpikir...
          </div>
        )}

        <div className="flex-1 flex flex-col lg:flex-row items-start justify-center gap-4 p-4 md:p-6">

          {/* Board */}
          <div className="w-full lg:flex-1 lg:max-w-[580px]">

            {/* Status banner */}
            <div className={`mb-3 px-5 py-2.5 rounded-2xl font-medium text-sm text-center text-white shadow-sm transition-all ${
              gs.winner ? (gs.winner === "red" ? "bg-[var(--red)]" : "bg-[var(--blue)]")
              : isMyTurn ? "bg-[var(--red)]" : "bg-[var(--blue)]"
            }`}>
              {gs.winner
                ? (gs.winner === "red" ? "🏆 Kamu Menang!" : "🤖 AI Menang!")
                : isMyTurn ? "Giliran kamu!" : "🤖 AI sedang berpikir..."}
            </div>

            <div className="card p-3 md:p-4">
              <GameBoard
                gameState={gs}
                myTeam="red"
                isMyTurn={isMyTurn}
                actionMode={actionMode}
                onMove={handleMove}
                onPlaceBarricade={handlePlaceBarricade}
              />
            </div>

            {/* Action chooser */}
            {isMyTurn && !gs.winner && (
              <div className="mt-3 card p-4 animate-fade-in">
                {actionMode === null ? (
                  <>
                    <p className="text-xs text-[var(--muted)] font-semibold uppercase tracking-wider text-center mb-3">
                      Pilih aksi kamu
                    </p>
                    <div className="flex gap-2">
                      <button
                        className="btn btn-red flex-1 py-3 text-sm"
                        onClick={() => setActionMode("move")}
                        disabled={!hasValidMoves}
                      >
                        🚶 Jalan
                      </button>
                      <button
                        className="btn btn-ghost flex-1 py-3 text-sm"
                        onClick={() => setActionMode("barricade")}
                        disabled={myBarsLeft <= 0}
                      >
                        🚧 Rintangan
                        <span className="ml-1 text-xs font-bold text-[var(--red)]">×{myBarsLeft}</span>
                      </button>
                    </div>
                    {!hasValidMoves && myBarsLeft <= 0 && (
                      <p className="mt-2 text-xs text-center text-red-500">
                        ⚠️ Tidak ada langkah — kamu kalah!
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
                    <button className="btn btn-ghost text-xs px-3 py-2 ml-2 flex-shrink-0"
                      onClick={() => setActionMode(null)}>
                      Batal
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Info panel */}
          <div className="w-full lg:w-64 space-y-3">

            {/* Players */}
            <div className="card p-4">
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">Pemain</p>

              {/* Human */}
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl mb-2"
                style={{
                  background: isMyTurn ? "rgba(217,79,61,0.08)" : "transparent",
                  border: `1.5px solid ${isMyTurn ? "rgba(217,79,61,0.25)" : "transparent"}`,
                }}>
                <div className="w-8 h-8 rounded-lg bg-[var(--red)] flex items-center justify-center text-xs font-bold text-white">R</div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-[var(--red)]">Kamu</p>
                  <p className="text-sm text-[var(--text)]">Tim Merah</p>
                </div>
                <span className="text-xs text-[var(--muted)]">🚧×{myBarsLeft}</span>
              </div>

              {/* AI */}
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{
                  background: !isMyTurn && !gs.winner ? "rgba(61,107,217,0.08)" : "transparent",
                  border: `1.5px solid ${!isMyTurn && !gs.winner ? "rgba(61,107,217,0.25)" : "transparent"}`,
                }}>
                <div className="w-8 h-8 rounded-lg bg-[var(--blue)] flex items-center justify-center text-xs font-bold text-white">B</div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-[var(--blue)]">AI</p>
                  <p className="text-sm text-[var(--text)]">Tim Biru</p>
                </div>
                <span className="text-xs text-[var(--muted)]">🚧×{gs.blue_barricades ?? MAX_BARRICADES}</span>
              </div>
            </div>

            {/* Stats */}
            <div className="card p-4">
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">Info</p>
              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-[var(--red)]">Kamu (R)</span>
                  <span>{String.fromCharCode(65 + gs.red_x)}{gs.red_y + 1}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--blue)]">AI (B)</span>
                  <span>{String.fromCharCode(65 + gs.blue_x)}{gs.blue_y + 1}</span>
                </div>
                <div className="flex justify-between pt-1 mt-1 border-t border-[var(--border)]">
                  <span className="text-[var(--muted)]">Rintangan</span>
                  <span>{bars.length} terpasang</span>
                </div>
              </div>
            </div>

            {/* How to play */}
            <div className="card p-4">
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">Cara Bermain</p>
              <ul className="space-y-1.5 text-xs text-[var(--muted)]">
                <li>① <strong className="text-[var(--text)]">Jalan</strong> — pindah 1 sel</li>
                <li>② <strong className="text-[var(--text)]">Rintangan</strong> — blokir dinding sel</li>
                <li>③ Hanya 1 aksi per giliran</li>
                <li>④ Maks <strong className="text-[var(--text)]">10 rintangan</strong> per pemain</li>
                <li>🏁 Capai baris lawan untuk menang</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Win modal */}
      {showWin && gs.winner && (
        <WinModal
          winner={gs.winner}
          onRestart={handleRestart}
          onLeave={() => router.push("/")}
        />
      )}
    </>
  );
}

function WinModal({ winner, onRestart, onLeave }) {
  const isWinner = winner === "red";
  const col      = winner === "red" ? "#D94F3D" : "#3D6BD9";

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="card max-w-sm w-full p-7 text-center animate-pop-in overflow-y-auto max-h-[90vh]">

        <div className="text-5xl mb-3">{isWinner ? "🏆" : "🤖"}</div>
        <h2 className="font-display text-3xl font-black mb-1" style={{ color: col }}>
          {isWinner ? "Kamu Menang!" : "AI Menang!"}
        </h2>
        <p className="text-[var(--muted)] text-sm mb-5">
          {isWinner ? "Selamat! Kamu berhasil mengalahkan AI 🎉" : "AI terlalu tangguh kali ini. Coba lagi! 💪"}
        </p>

        {/* Donate */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 text-left">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2">☕ Dukung Developer</p>
          <p className="text-xs text-amber-600 mb-3">Suka game ini? Traktir kopi biar semangat bikin fitur baru!</p>
          <a href="https://saweria.co/chaesseon" target="_blank" rel="noopener noreferrer"
            className="btn w-full text-sm py-2.5"
            style={{ background: "#FBBF24", color: "#78350F" }}>
            ☕ Donate via Saweria
          </a>
        </div>

        {/* Contact */}
        <div className="bg-[var(--cream)] rounded-2xl p-4 mb-5 text-left">
          <p className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider mb-2">📬 Kontak Developer</p>
          <div className="space-y-2">
            <a href="https://wa.me/62895402466525" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-[var(--text)] hover:text-green-600 transition-colors">
              <span className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">📱</span>
              WhatsApp: 0895402466525
            </a>
            <a href="mailto:fynnxxc@gmail.com"
              className="flex items-center gap-2 text-xs text-[var(--text)] hover:text-[var(--blue)] transition-colors">
              <span className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">✉️</span>
              fynnxxc@gmail.com
            </a>
            <a href="https://instagram.com/se_o_nn" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-[var(--text)] hover:text-pink-500 transition-colors">
              <span className="w-6 h-6 rounded-full bg-pink-100 flex items-center justify-center">📸</span>
              @se_o_nn
            </a>
          </div>
        </div>

        <div className="space-y-2">
          <button className="btn btn-red w-full py-3" onClick={onRestart}>🔁 Main Lagi</button>
          <button className="btn btn-ghost w-full text-sm" onClick={onLeave}>Beranda</button>
        </div>
      </div>
    </div>
  );
}
