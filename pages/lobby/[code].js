import { useState, useEffect, useCallback, useRef } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabase";
import { MAX_BARRICADES } from "../../lib/gameLogic";
import { useLang } from "../../context/LanguageContext";

function getSession() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("barricade_session") || "";
}

export default function Lobby() {
  const router   = useRouter();
  const { code } = router.query;
  const { tr, toggleLang } = useLang();

  const [room,     setRoom]     = useState(null);
  const [players,  setPlayers]  = useState([]);
  const [myPlayer, setMyPlayer] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [starting, setStarting] = useState(false);
  const [copied,   setCopied]   = useState(false);
  const [showQR,   setShowQR]   = useState(false);
  const [error,    setError]    = useState("");
  const channelRef = useRef(null);
  const sessionId  = typeof window !== "undefined" ? getSession() : "";

  const fetchData = useCallback(async () => {
    if (!code) return;
    try {
      const { data: r } = await supabase.from("rooms").select("*").eq("code", code).single();
      if (!r) { setError(tr("room_not_found")); return; }
      const { data: ps } = await supabase.from("players").select("*").eq("room_id", r.id).order("joined_at", { ascending: true });
      setRoom(r); setPlayers(ps || []);
      setMyPlayer((ps || []).find(p => p.session_id === sessionId) || null);
      if (r.status === "playing" || r.status === "finished") router.replace(`/game/${code}`);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [code, sessionId, router, tr]);

  useEffect(() => {
    if (!code) return;
    fetchData();
    const channel = supabase.channel(`lobby:${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `code=eq.${code}` }, payload => {
        if (payload.new?.status === "playing") router.replace(`/game/${code}`);
        else fetchData();
      })
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
    if (players.length < 2) { setError(tr("waiting_others")); return; }
    if (!players.every(p => p.is_ready)) { setError(tr("waiting_all_ready")); return; }
    setStarting(true); setError("");
    try {
      const { error: gse } = await supabase.from("game_states").insert({
        room_id: room.id, current_turn: "red",
        red_x: 4, red_y: 0, blue_x: 4, blue_y: 8,
        barricades: [], red_barricades: MAX_BARRICADES, blue_barricades: MAX_BARRICADES, winner: null,
      });
      if (gse) throw gse;
      await supabase.from("rooms").update({ status: "playing" }).eq("id", room.id);
      router.push(`/game/${code}`);
    } catch (err) { console.error(err); setError("Gagal memulai."); setStarting(false); }
  }

  function copyCode() {
    navigator.clipboard.writeText(code || "").then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/lobby/${code}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const qrUrl = code ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(`${typeof window !== "undefined" ? window.location.origin : ""}/lobby/${code}`)}&color=2B2825&bgcolor=F7F2EA&margin=10` : "";

  const isHost   = room && sessionId === room.host_session_id;
  const allReady = players.length === 2 && players.every(p => p.is_ready);
  const redP     = players.find(p => p.team === "red");
  const blueP    = players.find(p => p.team === "blue");
  const isPrivate = room && room.is_public === false;

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
      <Head><title>Lobby {code} — Barricade</title></Head>
      <div className="min-h-screen grid-bg flex flex-col items-center justify-center px-4 py-10">

        <button onClick={toggleLang} className="fixed top-4 right-4 btn btn-ghost text-xs px-3 py-1.5 z-20">
          🌐 {tr("lang_toggle")}
        </button>

        <div className="text-center mb-8 animate-fade-up">
          <button onClick={() => router.push("/")} className="inline-flex items-center gap-1.5 text-[var(--muted)] text-sm mb-5 hover:text-[var(--text)] transition-colors">
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            {tr("back_home")}
          </button>
          <div className="flex items-center justify-center gap-2 mb-1">
            <h1 className="font-display text-4xl font-black text-[var(--text)]">{tr("waiting_room")}</h1>
            <span className="text-xs font-semibold px-2 py-1 rounded-full" style={isPrivate ? {background:"rgba(217,79,61,0.1)",color:"var(--red)"} : {background:"rgba(61,107,217,0.1)",color:"var(--blue)"}}>
              {isPrivate ? tr("private_badge") : tr("public_badge")}
            </span>
          </div>
          <p className="text-[var(--muted)] text-sm">{tr("share_code")}</p>
        </div>

        <div className="w-full max-w-sm space-y-4 animate-fade-up-delay">

          {/* Code + QR */}
          <div className="card p-5">
            <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3 text-center">{tr("room_code")}</p>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex-1 text-center text-3xl font-display font-black tracking-widest text-[var(--text)] bg-[var(--cream)] rounded-xl py-3 px-4 border border-[var(--border)]">{code}</div>
              <div className="flex flex-col gap-1.5">
                <button onClick={copyCode} className="btn btn-ghost px-3 py-2 !rounded-xl" title="Copy code">
                  {copied ? <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2.5} strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                  : <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
                </button>
                <button onClick={() => setShowQR(!showQR)} className="btn btn-ghost px-3 py-2 !rounded-xl text-base" title={tr("qr_code")}>
                  QR
                </button>
              </div>
            </div>
            {copied && <p className="text-center text-xs text-green-500 mb-2 animate-fade-in">{tr("copied")}</p>}

            {/* QR Code panel */}
            {showQR && (
              <div className="mt-3 animate-fade-in text-center border-t border-[var(--border)] pt-4">
                <p className="text-xs text-[var(--muted)] mb-3">{tr("qr_hint")}</p>
                {qrUrl && <img src={qrUrl} alt="QR Code" className="mx-auto rounded-xl border border-[var(--border)]" width={200} height={200} />}
                <button onClick={copyLink} className="btn btn-ghost text-xs mt-3 px-4 py-2">
                  🔗 Copy Link
                </button>
              </div>
            )}
          </div>

          {/* Players */}
          <div className="card p-5">
            <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-4">{tr("players_count")} ({players.length}/2)</p>
            <div className="space-y-3">
              {[
                { label: tr("team_red"), color:"#D94F3D", bg:"rgba(217,79,61,0.08)", bd:"rgba(217,79,61,0.2)", emoji:"🔴", player: redP, isMe: redP?.session_id === sessionId },
                { label: tr("team_blue"), color:"#3D6BD9", bg:"rgba(61,107,217,0.08)", bd:"rgba(61,107,217,0.2)", emoji:"🔵", player: blueP, isMe: blueP?.session_id === sessionId },
              ].map(slot => (
                <div key={slot.label} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                  style={{ background: slot.bg, border: `1.5px solid ${slot.bd}` }}>
                  <span className="text-xl">{slot.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{color:slot.color}}>{slot.label}</p>
                    {slot.player
                      ? <p className="text-sm font-medium text-[var(--text)] truncate">{slot.player.player_name}{slot.isMe && <span className="ml-1.5 text-[var(--muted)] text-xs">{tr("you")}</span>}</p>
                      : <p className="text-sm text-[var(--muted)] italic">{tr("waiting_player")}</p>}
                  </div>
                  {slot.player
                    ? <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${slot.player.is_ready ? "bg-green-500" : "bg-[var(--border)]"}`}>{slot.player.is_ready ? "✓" : "?"}</div>
                    : <div className="w-2 h-2 rounded-full bg-[var(--border)] animate-pulse"/>}
                </div>
              ))}
            </div>
            <div className="mt-4 px-3 py-2.5 rounded-xl bg-[var(--cream)] border border-[var(--border)] text-xs text-center text-[var(--muted)]">
              🚧 {MAX_BARRICADES} {tr("barrier_info")}
            </div>
          </div>

          {/* Ready + Start */}
          <div className="card p-5 space-y-3">
            {myPlayer && (
              <button className={`btn w-full text-base py-3.5 ${myPlayer.is_ready ? "btn-ghost" : myPlayer.team === "red" ? "btn-red" : "btn-blue"}`} onClick={toggleReady}>
                {myPlayer.is_ready
                  ? <><svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>{tr("cancel_ready")}</>
                  : <><svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>{tr("ready")}</>}
              </button>
            )}
            {isHost ? (
              <button className={`btn w-full text-base py-3.5 ${allReady ? "btn-blue" : "btn-ghost"}`} onClick={startGame} disabled={!allReady || starting || players.length < 2}>
                {starting ? <span className="spinner"/> : <><svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg>{allReady ? tr("start_game") : players.length < 2 ? tr("waiting_second") : tr("waiting_all_ready")}</>}
              </button>
            ) : (
              <div className="text-center text-sm text-[var(--muted)] py-1">
                {allReady ? tr("waiting_host") : players.length < 2 ? tr("waiting_second") : tr("mark_ready")}
              </div>
            )}
          </div>

          {/* Status dots */}
          <div className="flex items-center justify-center gap-6 py-2">
            {[[tr("connected"), true, "#22c55e"], [`${players.length}/2`, players.length===2, "#3D6BD9"], [tr("all_ready"), allReady, "#D94F3D"]].map(([label, active, color]) => (
              <div key={label} className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                <span className="w-2 h-2 rounded-full" style={{background: active ? color : "#D4CFC6"}}/>
                {label}
              </div>
            ))}
          </div>

          {error && <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm text-center animate-fade-in">{error}</div>}
        </div>
      </div>
    </>
  );
}
