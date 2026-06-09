import { useState, useEffect, useCallback, useRef } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabase";
import { MAX_BARRICADES } from "../../lib/gameLogic";

function getSession() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("barricade_session") || "";
}

export default function Lobby() {
  const router   = useRouter();
  const { code } = router.query;

  const [room,     setRoom]     = useState(null);
  const [players,  setPlayers]  = useState([]);
  const [myPlayer, setMyPlayer] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [starting, setStarting] = useState(false);
  const [copied,   setCopied]   = useState(false);
  const [error,    setError]    = useState("");

  const channelRef = useRef(null);
  const sessionId  = typeof window !== "undefined" ? getSession() : "";

  const fetchData = useCallback(async () => {
    if (!code) return;
    try {
      const { data: r, error: re } = await supabase
        .from("rooms").select("*").eq("code", code).single();
      if (re || !r) { setError("Room tidak ditemukan."); return; }

      const { data: ps } = await supabase
        .from("players").select("*").eq("room_id", r.id).order("joined_at", { ascending: true });

      setRoom(r);
      setPlayers(ps || []);
      setMyPlayer((ps || []).find(p => p.session_id === sessionId) || null);

      if (r.status === "playing" || r.status === "finished") {
        router.replace(`/game/${code}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [code, sessionId, router]);

  useEffect(() => {
    if (!code) return;
    fetchData();

    const channel = supabase
      .channel(`lobby:${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `code=eq.${code}` },
        payload => {
          if (payload.new?.status === "playing" || payload.new?.status === "finished") {
            router.replace(`/game/${code}`);
          } else { fetchData(); }
        }
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, () => fetchData())
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [code, fetchData, router]);

  async function toggleReady() {
    if (!myPlayer) return;
    await supabase.from("players").update({ is_ready: !myPlayer.is_ready }).eq("id", myPlayer.id);
    fetchData();
  }

  async function startGame() {
    if (!room || starting) return;
    if (players.length < 2) { setError("Tunggu pemain kedua bergabung!"); return; }
    if (!players.every(p => p.is_ready)) { setError("Semua pemain harus siap!"); return; }

    setStarting(true); setError("");
    try {
      const { error: gse } = await supabase.from("game_states").insert({
        room_id:         room.id,
        current_turn:    "red",
        red_x: 4,  red_y: 0,
        blue_x: 4, blue_y: 8,
        barricades:      [],
        red_barricades:  MAX_BARRICADES,
        blue_barricades: MAX_BARRICADES,
        winner:          null,
      });
      if (gse) throw gse;
      await supabase.from("rooms").update({ status: "playing" }).eq("id", room.id);
      router.push(`/game/${code}`);
    } catch (err) {
      console.error(err); setError("Gagal memulai game. Coba lagi.");
      setStarting(false);
    }
  }

  function copyCode() {
    navigator.clipboard.writeText(code || "").then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  }

  const isHost     = room && sessionId === room.host_session_id;
  const allReady   = players.length === 2 && players.every(p => p.is_ready);
  const redPlayer  = players.find(p => p.team === "red");
  const bluePlayer = players.find(p => p.team === "blue");

  if (loading) return (
    <div className="min-h-screen grid-bg flex items-center justify-center">
      <div className="card p-8 flex flex-col items-center gap-4">
        <div style={{width:32,height:32,borderRadius:"50%",border:"3px solid #3D6BD9",borderTopColor:"transparent",animation:"spin .7s linear infinite"}} />
        <p className="text-[var(--muted)] text-sm">Memuat lobby...</p>
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
      <Head><title>Lobby {code} — Barricade</title></Head>

      <div className="min-h-screen grid-bg flex flex-col items-center justify-center px-4 py-10">

        <div className="text-center mb-8 animate-fade-up">
          <button onClick={() => router.push("/")}
            className="inline-flex items-center gap-1.5 text-[var(--muted)] text-sm mb-5 hover:text-[var(--text)] transition-colors">
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Beranda
          </button>
          <h1 className="font-display text-4xl font-black text-[var(--text)]">Ruang Tunggu</h1>
          <p className="text-[var(--muted)] text-sm mt-1">Bagikan kode ke temanmu untuk bergabung</p>
        </div>

        <div className="w-full max-w-sm space-y-4 animate-fade-up-delay">

          {/* Code card */}
          <div className="card p-5">
            <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3 text-center">Kode Room</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 text-center text-3xl font-display font-black tracking-widest text-[var(--text)] bg-[var(--cream)] rounded-xl py-3 px-4 border border-[var(--border)]">
                {code}
              </div>
              <button onClick={copyCode} className="btn btn-ghost px-4 py-3 !rounded-xl flex-shrink-0">
                {copied
                  ? <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2.5} strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>
                  : <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>}
              </button>
            </div>
            {copied && <p className="text-center text-xs text-green-500 mt-2 animate-fade-in">✓ Kode tersalin!</p>}
          </div>

          {/* Players */}
          <div className="card p-5">
            <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-4">Pemain ({players.length}/2)</p>
            <div className="space-y-3">
              <PlayerSlot label="Tim Merah" color="#D94F3D" player={redPlayer} isMe={redPlayer?.session_id === sessionId} emoji="🔴" bgColor="rgba(217,79,61,0.08)" borderColor="rgba(217,79,61,0.2)" />
              <PlayerSlot label="Tim Biru"  color="#3D6BD9" player={bluePlayer} isMe={bluePlayer?.session_id === sessionId} emoji="🔵" bgColor="rgba(61,107,217,0.08)" borderColor="rgba(61,107,217,0.2)" />
            </div>
            {/* Barricade info */}
            <div className="mt-4 px-3 py-2.5 rounded-xl bg-[var(--cream)] border border-[var(--border)] text-xs text-center text-[var(--muted)]">
              🚧 Setiap pemain mendapat <strong className="text-[var(--text)]">{MAX_BARRICADES} rintangan</strong> · 1 aksi per giliran
            </div>
          </div>

          {/* Ready & Start */}
          <div className="card p-5 space-y-3">
            {myPlayer && (
              <button
                className={`btn w-full text-base py-3.5 ${myPlayer.is_ready ? "btn-ghost" : myPlayer.team === "red" ? "btn-red" : "btn-blue"}`}
                onClick={toggleReady}
              >
                {myPlayer.is_ready
                  ? <><svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>Batalkan Siap</>
                  : <><svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>Saya Siap!</>}
              </button>
            )}

            {isHost ? (
              <button
                className={`btn w-full text-base py-3.5 ${allReady ? "btn-blue" : "btn-ghost"}`}
                onClick={startGame}
                disabled={!allReady || starting || players.length < 2}
              >
                {starting ? <span className="spinner" />
                  : <><svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor" /></svg>
                    {allReady ? "Mulai Game!" : players.length < 2 ? "Tunggu pemain lain..." : "Tunggu semua siap..."}</>}
              </button>
            ) : (
              <div className="text-center text-sm text-[var(--muted)] py-1">
                {allReady ? "Menunggu host memulai..." : players.length < 2 ? "Menunggu pemain kedua..." : "Tandai dirimu siap untuk lanjut"}
              </div>
            )}
          </div>

          {/* Status dots */}
          <div className="flex items-center justify-center gap-6 py-2">
            {[
              { label: "Tersambung",    active: true,              color: "#22c55e" },
              { label: `${players.length}/2 Pemain`, active: players.length === 2, color: "#3D6BD9" },
              { label: "Semua Siap",    active: allReady,          color: "#D94F3D" },
            ].map(d => (
              <div key={d.label} className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                <span className="w-2 h-2 rounded-full" style={{ background: d.active ? d.color : "#D4CFC6" }} />
                {d.label}
              </div>
            ))}
          </div>

          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm text-center animate-fade-in">{error}</div>
          )}
        </div>
      </div>
    </>
  );
}

function PlayerSlot({ label, color, player, isMe, emoji, bgColor, borderColor }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{ background: bgColor, border: `1.5px solid ${borderColor}` }}>
      <span className="text-xl">{emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>{label}</p>
        {player
          ? <p className="text-sm font-medium text-[var(--text)] truncate">{player.player_name}{isMe && <span className="ml-1.5 text-[var(--muted)] text-xs">(Kamu)</span>}</p>
          : <p className="text-sm text-[var(--muted)] italic">Menunggu pemain...</p>}
      </div>
      {player
        ? <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${player.is_ready ? "bg-green-500" : "bg-[var(--border)]"}`}>{player.is_ready ? "✓" : "?"}</div>
        : <div className="flex-shrink-0 w-2 h-2 rounded-full bg-[var(--border)] animate-pulse" />}
    </div>
  );
}
