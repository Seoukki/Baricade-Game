import { useState, useEffect, useRef } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabase";
import { generateCode, generateSessionId } from "../lib/gameLogic";
import { useLang } from "../context/LanguageContext";

function getOrCreateSession() {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("barricade_session");
  if (!id) { id = generateSessionId(); localStorage.setItem("barricade_session", id); }
  return id;
}

export default function Home() {
  const router = useRouter();
  const { tr, lang, toggleLang } = useLang();
  const [mode,      setMode]      = useState(null); // null|create|join
  const [name,      setName]      = useState("");
  const [code,      setCode]      = useState("");
  const [isPublic,  setIsPublic]  = useState(true);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [showQRScan,setShowQRScan]= useState(false);
  const videoRef  = useRef(null);
  const scannerRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem("barricade_name");
    if (saved) setName(saved);
  }, []);

  async function handleCreate() {
    if (!name.trim()) { setError(tr("err_name")); return; }
    setLoading(true); setError("");
    try {
      const sessionId = getOrCreateSession();
      const roomCode  = generateCode();
      const { data: room, error: re } = await supabase
        .from("rooms")
        .insert({ code: roomCode, host_session_id: sessionId, status: "waiting", is_public: isPublic })
        .select().single();
      if (re) throw re;
      await supabase.from("players").insert({ room_id: room.id, session_id: sessionId, player_name: name.trim(), team: "red" });
      localStorage.setItem("barricade_name", name.trim());
      router.push(`/lobby/${roomCode}`);
    } catch (err) { console.error(err); setError(tr("err_create")); }
    finally { setLoading(false); }
  }

  async function handleJoin() {
    if (!name.trim()) { setError(tr("err_name")); return; }
    if (!code.trim()) { setError(tr("err_code")); return; }
    setLoading(true); setError("");
    try {
      const sessionId = getOrCreateSession();
      const upper = code.toUpperCase().trim();
      const { data: room, error: re } = await supabase
        .from("rooms").select("*, players(*)").eq("code", upper).single();
      if (re || !room)               { setError(tr("err_not_found")); return; }
      if (room.status === "playing") { setError(tr("err_started"));   return; }
      const existing = room.players.find(p => p.session_id === sessionId);
      if (!existing) {
        if (room.players.length >= 2) { setError(tr("err_full")); return; }
        await supabase.from("players").insert({ room_id: room.id, session_id: sessionId, player_name: name.trim(), team: "blue" });
      }
      localStorage.setItem("barricade_name", name.trim());
      router.push(`/lobby/${upper}`);
    } catch (err) { console.error(err); setError(tr("err_join")); }
    finally { setLoading(false); }
  }

  // ── QR Scanner ──────────────────────────────────────────────────────
  async function startQRScan() {
    setShowQRScan(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        scannerRef.current = stream;
      }
      // Use Html5Qrcode if available
      const { Html5Qrcode } = await import("html5-qrcode").catch(() => null) || {};
      if (Html5Qrcode) {
        const qr = new Html5Qrcode("qr-video-container");
        qr.start({ facingMode: "environment" }, { fps: 10, qrbox: 220 },
          (text) => {
            qr.stop();
            stopQRScan();
            const match = text.match(/\/lobby\/([A-Z0-9]+)/i);
            if (match) { setMode("join"); setCode(match[1].toUpperCase()); }
            else setCode(text.toUpperCase().trim().slice(0, 8));
          },
          () => {}
        );
        scannerRef.current = { qr, stream };
      }
    } catch { setShowQRScan(false); }
  }

  function stopQRScan() {
    if (scannerRef.current?.qr) scannerRef.current.qr.stop().catch(() => {});
    if (scannerRef.current?.getTracks) scannerRef.current.getTracks().forEach(t => t.stop());
    setShowQRScan(false);
  }

  function onKey(e, fn) { if (e.key === "Enter") fn(); }

  return (
    <>
      <Head><title>Barricade — Board Game Online</title></Head>

      <div className="min-h-screen grid-bg flex flex-col items-center justify-center px-4 py-10">

        {/* Lang toggle */}
        <button onClick={toggleLang}
          className="fixed top-4 right-4 btn btn-ghost text-xs px-3 py-1.5 z-20">
          🌐 {tr("lang_toggle")}
        </button>

        {/* Hero */}
        <div className="text-center mb-8 animate-fade-up">
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-white/70 border border-white/80 text-xs font-medium text-[var(--muted)] shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
            {tr("badge")}
          </div>
          <h1 className="font-display text-7xl md:text-8xl font-black tracking-tight leading-none mb-3">
            Bari<span style={{color:"var(--red)"}}>ca</span><span style={{color:"var(--blue)"}}>de</span>
          </h1>
          <p className="text-[var(--muted)] text-base max-w-xs mx-auto leading-relaxed">{tr("tagline")}</p>
        </div>

        {/* Main card */}
        <div className="card w-full max-w-sm p-7 animate-fade-up-delay">

          {/* Name */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-[var(--muted)] mb-1.5 uppercase tracking-wider">{tr("your_name")}</label>
            <input className={`input ${error && !name.trim() ? "error" : ""}`}
              placeholder={tr("name_placeholder")} value={name} maxLength={30}
              onChange={e => { setName(e.target.value); setError(""); }}
              onKeyDown={e => mode === "create" ? onKey(e, handleCreate) : mode === "join" ? onKey(e, handleJoin) : null} />
          </div>

          {/* Mode: null */}
          {mode === null && (
            <div className="flex flex-col gap-3">
              <button className="btn w-full text-base py-3.5 font-semibold"
                style={{ background: "linear-gradient(135deg,var(--red),var(--blue))", color: "white", boxShadow: "0 4px 20px rgba(100,100,200,0.3)" }}
                onClick={() => { if (!name.trim()) { setError(tr("err_name")); return; } localStorage.setItem("barricade_name", name.trim()); router.push("/game/ai"); }}>
                🤖 {tr("vs_ai")}
              </button>

              <div className="flex items-center gap-2 my-1">
                <div className="flex-1 h-px bg-[var(--border)]" />
                <span className="text-xs text-[var(--muted)]">{tr("or_play_with_friend")}</span>
                <div className="flex-1 h-px bg-[var(--border)]" />
              </div>

              <button className="btn btn-red text-base py-3" onClick={() => { setMode("create"); setError(""); }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                {tr("create_room")}
              </button>
              <button className="btn btn-blue text-base py-3" onClick={() => { setMode("join"); setError(""); }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M3 12h12"/></svg>
                {tr("join_room")}
              </button>
              <button className="btn btn-ghost text-sm py-2.5" onClick={() => router.push("/lobby")}>
                🌐 {tr("live_lobby")}
              </button>
            </div>
          )}

          {/* Mode: create */}
          {mode === "create" && (
            <div className="animate-fade-in">
              <div className="flex items-center gap-1.5 mb-4 text-sm text-[var(--muted)]">
                <span className="w-3 h-3 rounded-full bg-[var(--red)] inline-block"/>
                {tr("create_as_red")}
              </div>
              {/* Public / Private toggle */}
              <div className="mb-4">
                <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">{tr("room_type")}</p>
                <div className="flex gap-2">
                  {[{ val: true, icon: "🌐", label: tr("public_room"), hint: tr("public_hint") },
                    { val: false, icon: "🔒", label: tr("private_room"), hint: tr("private_hint") }].map(opt => (
                    <button key={String(opt.val)} onClick={() => setIsPublic(opt.val)}
                      className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-medium border transition-all ${isPublic === opt.val ? "border-[var(--blue)] bg-blue-50 text-[var(--blue)]" : "border-[var(--border)] bg-white text-[var(--muted)]"}`}>
                      {opt.icon} {opt.label}
                      <div className="text-[10px] mt-0.5 opacity-70 font-normal">{opt.hint}</div>
                    </button>
                  ))}
                </div>
              </div>
              <button className="btn btn-red w-full text-base py-3.5" onClick={handleCreate} disabled={loading}>
                {loading ? <span className="spinner"/> : <>{tr("btn_create")}</>}
              </button>
              <button className="btn btn-ghost w-full mt-2 text-sm" onClick={() => { setMode(null); setError(""); }} disabled={loading}>{tr("btn_back")}</button>
            </div>
          )}

          {/* Mode: join */}
          {mode === "join" && (
            <div className="animate-fade-in">
              <div className="mb-4">
                <label className="block text-xs font-semibold text-[var(--muted)] mb-1.5 uppercase tracking-wider">{tr("enter_code")}</label>
                <div className="flex gap-2">
                  <input className={`input text-center text-lg font-bold tracking-widest uppercase flex-1 ${error && !code.trim() ? "error" : ""}`}
                    placeholder={tr("code_placeholder")} value={code} maxLength={8}
                    onChange={e => { setCode(e.target.value.toUpperCase()); setError(""); }}
                    onKeyDown={e => onKey(e, handleJoin)} />
                  <button className="btn btn-ghost px-3 flex-shrink-0" onClick={startQRScan} title={tr("scan_qr")}>
                    📷
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mb-4 text-sm text-[var(--muted)]">
                <span className="w-3 h-3 rounded-full bg-[var(--blue)] inline-block"/>
                {tr("join_as_blue")}
              </div>
              <button className="btn btn-blue w-full text-base py-3.5" onClick={handleJoin} disabled={loading}>
                {loading ? <span className="spinner"/> : tr("btn_join")}
              </button>
              <button className="btn btn-ghost w-full mt-2 text-sm" onClick={() => { setMode(null); setError(""); setCode(""); }} disabled={loading}>{tr("btn_back")}</button>
            </div>
          )}

          {error && <div className="mt-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm text-center animate-fade-in">{error}</div>}
        </div>

        {/* How to play */}
        <div className="mt-8 max-w-sm w-full animate-fade-up-delay">
          <h3 className="text-center text-xs font-semibold text-[var(--muted)] uppercase tracking-widest mb-4">{tr("how_to")}</h3>
          <div className="grid grid-cols-3 gap-3">
            {[["🚶", tr("step_walk"), tr("step_walk_desc")], ["🚧", tr("step_barrier"), tr("step_barrier_desc")], ["🏁", tr("step_win"), tr("step_win_desc")]].map(([icon, title, desc]) => (
              <div key={title} className="card p-3 text-center">
                <div className="text-2xl mb-1">{icon}</div>
                <div className="font-semibold text-xs text-[var(--text)] mb-0.5">{title}</div>
                <div className="text-xs text-[var(--muted)] leading-snug">{desc}</div>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-[var(--muted)] mt-3">{tr("one_action")}</p>
        </div>

        {/* Contact */}
        <footer className="mt-8 w-full max-w-sm animate-fade-up-delay">
          <div className="card p-5">
            <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider text-center mb-4">{tr("developer")}</p>
            <div className="flex flex-col gap-2">
              {[
                { href: "https://wa.me/62895402466525", icon: "📱", label: "WhatsApp", val: "0895402466525", cls: "bg-green-50 border-green-100 text-green-700 hover:bg-green-100" },
                { href: "mailto:fynnxxc@gmail.com", icon: "✉️", label: "Email", val: "fynnxxc@gmail.com", cls: "bg-blue-50 border-blue-100 text-blue-700 hover:bg-blue-100" },
                { href: "https://instagram.com/se_o_nn", icon: "📸", label: "Instagram", val: "@se_o_nn", cls: "bg-pink-50 border-pink-100 text-pink-700 hover:bg-pink-100" },
                { href: "https://saweria.co/chaesseon", icon: "☕", label: "Saweria", val: "saweria.co/chaesseon", cls: "bg-amber-50 border-amber-100 text-amber-700 hover:bg-amber-100" },
              ].map(c => (
                <a key={c.label} href={c.href} target="_blank" rel="noopener noreferrer"
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${c.cls}`}>
                  <span className="text-lg">{c.icon}</span>
                  <div>
                    <p className="text-xs font-semibold">{c.label}</p>
                    <p className="text-xs opacity-80">{c.val}</p>
                  </div>
                </a>
              ))}
            </div>
          </div>
          <p className="text-center text-xs text-[var(--muted)] mt-4">Barricade Online · Real-time 2 Player</p>
        </footer>
      </div>

      {/* QR Scanner modal */}
      {showQRScan && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="card max-w-sm w-full p-6 text-center">
            <h3 className="font-semibold text-[var(--text)] mb-3">📷 {tr("scan_qr")}</h3>
            <div id="qr-video-container" className="w-full rounded-xl overflow-hidden bg-black mb-4" style={{ minHeight: 250 }}>
              <video ref={videoRef} className="w-full" playsInline muted />
            </div>
            <p className="text-xs text-[var(--muted)] mb-4">Arahkan kamera ke QR Code</p>
            <button className="btn btn-ghost w-full" onClick={stopQRScan}>Batal</button>
          </div>
        </div>
      )}
    </>
  );
}
