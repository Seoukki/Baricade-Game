import { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabase";
import { generateCode, generateSessionId } from "../lib/gameLogic";

function getOrCreateSession() {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("barricade_session");
  if (!id) { id = generateSessionId(); localStorage.setItem("barricade_session", id); }
  return id;
}

export default function Home() {
  const router = useRouter();
  const [mode,    setMode]    = useState(null); // null | "create" | "join"
  const [name,    setName]    = useState("");
  const [code,    setCode]    = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("barricade_name");
    if (saved) setName(saved);
  }, []);

  // ── Create room ───────────────────────────────────────────────────
  async function handleCreate() {
    if (!name.trim()) { setError("Masukkan nama kamu dulu!"); return; }
    setLoading(true); setError("");
    try {
      const sessionId = getOrCreateSession();
      const roomCode  = generateCode();
      const { data: room, error: re } = await supabase
        .from("rooms").insert({ code: roomCode, host_session_id: sessionId, status: "waiting" })
        .select().single();
      if (re) throw re;
      await supabase.from("players").insert({ room_id: room.id, session_id: sessionId, player_name: name.trim(), team: "red" });
      localStorage.setItem("barricade_name", name.trim());
      router.push(`/lobby/${roomCode}`);
    } catch (err) {
      console.error(err); setError("Gagal membuat room. Coba lagi.");
    } finally { setLoading(false); }
  }

  // ── Join room ─────────────────────────────────────────────────────
  async function handleJoin() {
    if (!name.trim()) { setError("Masukkan nama kamu dulu!"); return; }
    if (!code.trim()) { setError("Masukkan kode room!"); return; }
    setLoading(true); setError("");
    try {
      const sessionId = getOrCreateSession();
      const upper     = code.toUpperCase().trim();
      const { data: room, error: re } = await supabase
        .from("rooms").select("*, players(*)").eq("code", upper).single();
      if (re || !room)              { setError("Room tidak ditemukan!"); return; }
      if (room.status === "playing") { setError("Game sudah berjalan!"); return; }
      if (room.status === "finished"){ setError("Room sudah selesai."); return; }
      const existing = room.players.find(p => p.session_id === sessionId);
      if (!existing) {
        if (room.players.length >= 2) { setError("Room sudah penuh!"); return; }
        await supabase.from("players").insert({ room_id: room.id, session_id: sessionId, player_name: name.trim(), team: "blue" });
      }
      localStorage.setItem("barricade_name", name.trim());
      router.push(`/lobby/${upper}`);
    } catch (err) {
      console.error(err); setError("Gagal bergabung. Coba lagi.");
    } finally { setLoading(false); }
  }

  function onKey(e, fn) { if (e.key === "Enter") fn(); }

  return (
    <>
      <Head><title>Barricade — Board Game Online</title></Head>

      <div className="min-h-screen grid-bg flex flex-col items-center justify-center px-4 py-10">

        {/* Hero */}
        <div className="text-center mb-8 animate-fade-up">
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-white/70 border border-white/80 text-xs font-medium text-[var(--muted)] shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
            2 Pemain · Real-time · vs AI
          </div>
          <h1 className="font-display text-7xl md:text-8xl font-black tracking-tight leading-none mb-3">
            Bari<span style={{color:"var(--red)"}}>ca</span><span style={{color:"var(--blue)"}}>de</span>
          </h1>
          <p className="text-[var(--muted)] text-base max-w-xs mx-auto leading-relaxed">
            Tantang teman atau lawan AI. Pasang rintangan, halangi lawan, dan jadilah yang pertama mencapai baris lawan.
          </p>
        </div>

        {/* Main card */}
        <div className="card w-full max-w-sm p-7 animate-fade-up-delay">

          {/* Name */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-[var(--muted)] mb-1.5 uppercase tracking-wider">Nama Kamu</label>
            <input
              className={`input ${error && !name.trim() ? "error" : ""}`}
              placeholder="Masukkan nama..."
              value={name}
              onChange={e => { setName(e.target.value); setError(""); }}
              onKeyDown={e => mode === "create" ? onKey(e, handleCreate) : mode === "join" ? onKey(e, handleJoin) : null}
              maxLength={30}
            />
          </div>

          {/* Mode: null */}
          {mode === null && (
            <div className="flex flex-col gap-3">
              {/* vs AI — primary highlight */}
              <button
                className="btn w-full text-base py-3.5 font-semibold"
                style={{ background: "linear-gradient(135deg,var(--red),var(--blue))", color: "white", boxShadow: "0 4px 20px rgba(100,100,200,0.3)" }}
                onClick={() => { if (!name.trim()) { setError("Masukkan nama kamu dulu!"); return; } localStorage.setItem("barricade_name", name.trim()); router.push("/game/ai"); }}
              >
                🤖 Main vs AI
              </button>

              <div className="flex items-center gap-2 my-1">
                <div className="flex-1 h-px bg-[var(--border)]" />
                <span className="text-xs text-[var(--muted)]">atau main bareng teman</span>
                <div className="flex-1 h-px bg-[var(--border)]" />
              </div>

              <button className="btn btn-red text-base py-3.5" onClick={() => { setMode("create"); setError(""); }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                Buat Room
              </button>
              <button className="btn btn-blue text-base py-3.5" onClick={() => { setMode("join"); setError(""); }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M3 12h12" /></svg>
                Masukkan Kode
              </button>
            </div>
          )}

          {/* Mode: create */}
          {mode === "create" && (
            <div className="animate-fade-in">
              <div className="flex items-center gap-1.5 mb-4 text-sm text-[var(--muted)]">
                <span className="w-3 h-3 rounded-full bg-[var(--red)] inline-block" />
                Kamu akan menjadi Tim Merah (tuan rumah)
              </div>
              <button className="btn btn-red w-full text-base py-3.5" onClick={handleCreate} disabled={loading}>
                {loading ? <span className="spinner" /> : <><svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>Buat Room</>}
              </button>
              <button className="btn btn-ghost w-full mt-2 text-sm" onClick={() => { setMode(null); setError(""); }} disabled={loading}>Kembali</button>
            </div>
          )}

          {/* Mode: join */}
          {mode === "join" && (
            <div className="animate-fade-in">
              <div className="mb-4">
                <label className="block text-xs font-semibold text-[var(--muted)] mb-1.5 uppercase tracking-wider">Kode Room</label>
                <input
                  className={`input text-center text-lg font-bold tracking-widest uppercase ${error && !code.trim() ? "error" : ""}`}
                  placeholder="XXXXXX"
                  value={code}
                  onChange={e => { setCode(e.target.value.toUpperCase()); setError(""); }}
                  onKeyDown={e => onKey(e, handleJoin)}
                  maxLength={8}
                />
              </div>
              <div className="flex items-center gap-1.5 mb-4 text-sm text-[var(--muted)]">
                <span className="w-3 h-3 rounded-full bg-[var(--blue)] inline-block" />
                Kamu akan menjadi Tim Biru
              </div>
              <button className="btn btn-blue w-full text-base py-3.5" onClick={handleJoin} disabled={loading}>
                {loading ? <span className="spinner" /> : <><svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M3 12h12" /></svg>Bergabung</>}
              </button>
              <button className="btn btn-ghost w-full mt-2 text-sm" onClick={() => { setMode(null); setError(""); setCode(""); }} disabled={loading}>Kembali</button>
            </div>
          )}

          {error && (
            <div className="mt-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm text-center animate-fade-in">{error}</div>
          )}
        </div>

        {/* How to play */}
        <div className="mt-8 max-w-sm w-full animate-fade-up-delay">
          <h3 className="text-center text-xs font-semibold text-[var(--muted)] uppercase tracking-widest mb-4">Cara Bermain</h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: "🚶", title: "Jalan", desc: "Pindah 1 langkah ke sel sebelah" },
              { icon: "🚧", title: "Rintangan", desc: "Pasang 1 dari 10 rintangan" },
              { icon: "🏁", title: "Menang", desc: "Capai baris rumah lawan" },
            ].map(item => (
              <div key={item.title} className="card p-3 text-center">
                <div className="text-2xl mb-1">{item.icon}</div>
                <div className="font-semibold text-xs text-[var(--text)] mb-0.5">{item.title}</div>
                <div className="text-xs text-[var(--muted)] leading-snug">{item.desc}</div>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-[var(--muted)] mt-3">
            Setiap giliran: pilih <strong>Jalan</strong> atau <strong>Pasang Rintangan</strong> — bukan keduanya!
          </p>
        </div>

        {/* ── Footer contact ── */}
        <footer className="mt-10 w-full max-w-sm animate-fade-up-delay">
          <div className="card p-5">
            <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider text-center mb-4">Developer</p>
            <div className="flex flex-col gap-2.5">
              <a href="https://wa.me/62895402466525" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-green-50 border border-green-100 hover:bg-green-100 transition-colors">
                <span className="text-lg">📱</span>
                <div>
                  <p className="text-xs font-semibold text-green-700">WhatsApp</p>
                  <p className="text-xs text-green-600">0895402466525</p>
                </div>
              </a>
              <a href="mailto:fynnxxc@gmail.com"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-100 hover:bg-blue-100 transition-colors">
                <span className="text-lg">✉️</span>
                <div>
                  <p className="text-xs font-semibold text-blue-700">Email</p>
                  <p className="text-xs text-blue-600">fynnxxc@gmail.com</p>
                </div>
              </a>
              <a href="https://instagram.com/se_o_nn" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-pink-50 border border-pink-100 hover:bg-pink-100 transition-colors">
                <span className="text-lg">📸</span>
                <div>
                  <p className="text-xs font-semibold text-pink-700">Instagram</p>
                  <p className="text-xs text-pink-600">@se_o_nn</p>
                </div>
              </a>
              <a href="https://saweria.co/chaesseon" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors"
                style={{ background: "#FFFBEB", borderColor: "#FDE68A" }}>
                <span className="text-lg">☕</span>
                <div>
                  <p className="text-xs font-semibold" style={{ color: "#92400E" }}>Saweria Donate</p>
                  <p className="text-xs" style={{ color: "#B45309" }}>saweria.co/chaesseon</p>
                </div>
              </a>
            </div>
          </div>
          <p className="text-center text-xs text-[var(--muted)] mt-4">Barricade Online · Real-time 2 Player</p>
        </footer>

      </div>
    </>
  );
}
