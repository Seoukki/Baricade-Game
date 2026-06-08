import { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabase";
import { generateCode, generateSessionId } from "../lib/gameLogic";

function getOrCreateSession() {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("barricade_session");
  if (!id) {
    id = generateSessionId();
    localStorage.setItem("barricade_session", id);
  }
  return id;
}

export default function Home() {
  const router = useRouter();
  const [mode, setMode]       = useState(null); // null | "create" | "join"
  const [name, setName]       = useState("");
  const [code, setCode]       = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => {
    // Pre-fill name if previously stored
    const saved = localStorage.getItem("barricade_name");
    if (saved) setName(saved);
  }, []);

  // ── Create a new room ────────────────────────────────────────────
  async function handleCreate() {
    if (!name.trim()) { setError("Masukkan nama kamu dulu!"); return; }
    setLoading(true);
    setError("");

    try {
      const sessionId = getOrCreateSession();
      const roomCode  = generateCode();

      const { data: room, error: re } = await supabase
        .from("rooms")
        .insert({ code: roomCode, host_session_id: sessionId, status: "waiting" })
        .select()
        .single();
      if (re) throw re;

      const { error: pe } = await supabase
        .from("players")
        .insert({ room_id: room.id, session_id: sessionId, player_name: name.trim(), team: "red" });
      if (pe) throw pe;

      localStorage.setItem("barricade_name", name.trim());
      router.push(`/lobby/${roomCode}`);
    } catch (err) {
      console.error(err);
      setError("Gagal membuat room. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  // ── Join an existing room ────────────────────────────────────────
  async function handleJoin() {
    if (!name.trim()) { setError("Masukkan nama kamu dulu!"); return; }
    if (!code.trim()) { setError("Masukkan kode room!"); return; }
    setLoading(true);
    setError("");

    try {
      const sessionId = getOrCreateSession();
      const upper     = code.toUpperCase().trim();

      const { data: room, error: re } = await supabase
        .from("rooms")
        .select("*, players(*)")
        .eq("code", upper)
        .single();

      if (re || !room) { setError("Room tidak ditemukan!"); return; }
      if (room.status === "playing") { setError("Game sudah berjalan!"); return; }
      if (room.status === "finished") { setError("Room sudah selesai."); return; }

      const existing = room.players.find((p) => p.session_id === sessionId);
      if (!existing) {
        if (room.players.length >= 2) { setError("Room sudah penuh!"); return; }

        const { error: pe } = await supabase
          .from("players")
          .insert({ room_id: room.id, session_id: sessionId, player_name: name.trim(), team: "blue" });
        if (pe) throw pe;
      }

      localStorage.setItem("barricade_name", name.trim());
      router.push(`/lobby/${upper}`);
    } catch (err) {
      console.error(err);
      setError("Gagal bergabung. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e, fn) {
    if (e.key === "Enter") fn();
  }

  return (
    <>
      <Head>
        <title>Barricade — Board Game Online</title>
      </Head>

      <div className="min-h-screen grid-bg flex flex-col items-center justify-center px-4 py-10">

        {/* ── Hero ── */}
        <div className="text-center mb-10 animate-fade-up">
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-white/70 border border-white/80 text-xs font-medium text-[var(--muted)] shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
            2 Pemain · Real-time
          </div>

          <h1 className="font-display text-7xl md:text-8xl font-black tracking-tight text-[var(--text)] leading-none mb-3">
            Bari<span className="text-[var(--red)]">ca</span><span className="text-[var(--blue)]">de</span>
          </h1>
          <p className="text-[var(--muted)] text-base font-body max-w-xs mx-auto leading-relaxed">
            Tantang teman kamu. Pasang rintangan. Jadilah yang pertama mencapai garis lawan.
          </p>
        </div>

        {/* ── Main card ── */}
        <div className="card w-full max-w-sm p-7 animate-fade-up-delay">

          {/* Name input (always visible) */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-[var(--muted)] mb-1.5 uppercase tracking-wider">
              Nama Kamu
            </label>
            <input
              className={`input ${error && !name.trim() ? "error" : ""}`}
              placeholder="Masukkan nama..."
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              onKeyDown={(e) => mode === "create" && handleKeyDown(e, handleCreate)}
              maxLength={30}
            />
          </div>

          {/* Mode: null → choose */}
          {mode === null && (
            <div className="flex flex-col gap-3">
              <button className="btn btn-red text-base py-3.5" onClick={() => { setMode("create"); setError(""); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Buat Room Baru
              </button>
              <button className="btn btn-blue text-base py-3.5" onClick={() => { setMode("join"); setError(""); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M3 12h12" />
                </svg>
                Masukkan Kode
              </button>
            </div>
          )}

          {/* Mode: create */}
          {mode === "create" && (
            <div className="animate-fade-in">
              <div className="flex items-center gap-1.5 mb-4 text-sm text-[var(--muted)]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4l2 2" />
                </svg>
                Kamu akan menjadi Tim Merah (tuan rumah)
              </div>

              <button
                className="btn btn-red w-full text-base py-3.5"
                onClick={handleCreate}
                disabled={loading}
              >
                {loading ? <span className="spinner" /> : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Buat Room
                  </>
                )}
              </button>

              <button
                className="btn btn-ghost w-full mt-2 text-sm"
                onClick={() => { setMode(null); setError(""); }}
                disabled={loading}
              >
                Kembali
              </button>
            </div>
          )}

          {/* Mode: join */}
          {mode === "join" && (
            <div className="animate-fade-in">
              <div className="mb-4">
                <label className="block text-xs font-semibold text-[var(--muted)] mb-1.5 uppercase tracking-wider">
                  Kode Room
                </label>
                <input
                  className={`input text-center text-lg font-bold tracking-widest uppercase ${error && !code.trim() ? "error" : ""}`}
                  placeholder="XXXXXX"
                  value={code}
                  onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(""); }}
                  onKeyDown={(e) => handleKeyDown(e, handleJoin)}
                  maxLength={8}
                />
              </div>

              <div className="flex items-center gap-1.5 mb-4 text-sm text-[var(--muted)]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4l2 2" />
                </svg>
                Kamu akan menjadi Tim Biru
              </div>

              <button
                className="btn btn-blue w-full text-base py-3.5"
                onClick={handleJoin}
                disabled={loading}
              >
                {loading ? <span className="spinner" /> : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M3 12h12" />
                    </svg>
                    Bergabung
                  </>
                )}
              </button>

              <button
                className="btn btn-ghost w-full mt-2 text-sm"
                onClick={() => { setMode(null); setError(""); setCode(""); }}
                disabled={loading}
              >
                Kembali
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm text-center animate-fade-in">
              {error}
            </div>
          )}
        </div>

        {/* ── How to play ── */}
        <div className="mt-10 max-w-sm w-full animate-fade-up-delay">
          <h3 className="text-center text-xs font-semibold text-[var(--muted)] uppercase tracking-widest mb-4">
            Cara Bermain
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: "🎯", title: "Bergerak", desc: "Pindahkan bidakmu 1 langkah" },
              { icon: "🚧", title: "Pasang Rintangan", desc: "Blokir jalan lawan" },
              { icon: "🏁", title: "Menang", desc: "Capai baris rumah lawan" },
            ].map((item) => (
              <div key={item.title} className="card p-3 text-center">
                <div className="text-2xl mb-1">{item.icon}</div>
                <div className="font-semibold text-xs text-[var(--text)] mb-0.5">{item.title}</div>
                <div className="text-xs text-[var(--muted)] leading-snug">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-8 text-xs text-[var(--muted)] text-center">
          Barricade Online · Real-time 2 Player
        </p>
      </div>
    </>
  );
}
