import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabase";
import { useLang } from "../../context/LanguageContext";
import { generateSessionId } from "../../lib/gameLogic";

function getOrCreateSession() {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("barricade_session");
  if (!id) { id = generateSessionId(); localStorage.setItem("barricade_session", id); }
  return id;
}

export default function PublicLobby() {
  const router = useRouter();
  const { tr, toggleLang } = useLang();
  const [rooms,   setRooms]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(null);
  const [name,    setName]    = useState("");
  const [showName,setShowName]= useState(false);
  const [pendingRoom, setPendingRoom] = useState(null);
  const [error,   setError]   = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("barricade_name");
    if (saved) setName(saved);
  }, []);

  const fetchRooms = useCallback(async () => {
    const { data } = await supabase
      .from("rooms")
      .select("*, players(id, team, player_name)")
      .eq("status", "waiting")
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(20);
    setRooms((data || []).filter(r => r.players.length < 2));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 5000);
    return () => clearInterval(interval);
  }, [fetchRooms]);

  async function joinRoom(room) {
    if (!name.trim()) { setPendingRoom(room); setShowName(true); return; }
    setJoining(room.code); setError("");
    try {
      const sessionId = getOrCreateSession();
      const existing = room.players.find(p => p.session_id === sessionId);
      if (!existing) {
        const { error: pe } = await supabase.from("players").insert({
          room_id: room.id, session_id: sessionId,
          player_name: name.trim(), team: "blue",
        });
        if (pe) throw pe;
      }
      localStorage.setItem("barricade_name", name.trim());
      router.push(`/lobby/${room.code}`);
    } catch (err) { console.error(err); setError("Gagal bergabung."); }
    finally { setJoining(null); }
  }

  function confirmName() {
    if (!name.trim()) return;
    localStorage.setItem("barricade_name", name.trim());
    setShowName(false);
    if (pendingRoom) joinRoom(pendingRoom);
  }

  function timeAgo(dateStr) {
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff/60)}m`;
    return `${Math.floor(diff/3600)}h`;
  }

  return (
    <>
      <Head><title>{tr("public_lobby")} — Barricade</title></Head>
      <div className="min-h-screen grid-bg flex flex-col items-center px-4 py-8">

        <button onClick={toggleLang} className="fixed top-4 right-4 btn btn-ghost text-xs px-3 py-1.5 z-20">
          🌐 {tr("lang_toggle")}
        </button>

        {/* Header */}
        <div className="w-full max-w-sm mb-6 animate-fade-up">
          <button onClick={() => router.push("/")}
            className="flex items-center gap-1.5 text-[var(--muted)] text-sm mb-4 hover:text-[var(--text)] transition-colors">
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            {tr("back_home")}
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-3xl font-black text-[var(--text)]">🌐 {tr("public_lobby")}</h1>
              <p className="text-[var(--muted)] text-sm mt-0.5">{tr("lobby_desc")}</p>
            </div>
            <button onClick={fetchRooms} className="btn btn-ghost text-xs px-3 py-2">
              🔄 {tr("refresh")}
            </button>
          </div>
        </div>

        <div className="w-full max-w-sm animate-fade-up-delay">
          {/* Create new room button */}
          <button className="btn btn-red w-full mb-4 py-3" onClick={() => router.push("/?mode=create")}>
            + {tr("create_new")}
          </button>

          {loading ? (
            <div className="card p-8 flex flex-col items-center gap-4">
              <div style={{width:28,height:28,borderRadius:"50%",border:"3px solid #D94F3D",borderTopColor:"transparent",animation:"spin .7s linear infinite"}}/>
              <p className="text-[var(--muted)] text-sm">{tr("loading")}</p>
            </div>
          ) : rooms.length === 0 ? (
            <div className="card p-8 text-center">
              <div className="text-4xl mb-3">🏜️</div>
              <p className="text-[var(--muted)] text-sm">{tr("no_rooms")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rooms.map(room => {
                const host = room.players.find(p => p.team === "red");
                return (
                  <div key={room.id} className="card p-4 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-bold text-sm text-[var(--text)] tracking-wider">{room.code}</span>
                        <span className="text-xs text-[var(--muted)]">· {timeAgo(room.created_at)}</span>
                      </div>
                      <p className="text-xs text-[var(--muted)] truncate">
                        🔴 {host?.player_name || "Player"} · {room.players.length}/2 {tr("players_waiting")}
                      </p>
                    </div>
                    <button
                      className="btn btn-blue text-sm px-4 py-2 flex-shrink-0"
                      onClick={() => joinRoom(room)}
                      disabled={joining === room.code}>
                      {joining === room.code ? <span className="spinner" /> : tr("join_room_lobby")}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {error && <div className="mt-3 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm text-center">{error}</div>}
        </div>
      </div>

      {/* Name prompt modal */}
      {showName && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="card max-w-xs w-full p-6 animate-pop-in">
            <h3 className="font-semibold text-[var(--text)] mb-4">{tr("your_name")}</h3>
            <input className="input mb-4" placeholder={tr("name_placeholder")} value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && confirmName()} maxLength={30} autoFocus />
            <button className="btn btn-blue w-full" onClick={confirmName}>{tr("btn_join")}</button>
            <button className="btn btn-ghost w-full mt-2 text-sm" onClick={() => { setShowName(false); setPendingRoom(null); }}>{tr("btn_back")}</button>
          </div>
        </div>
      )}
    </>
  );
}
