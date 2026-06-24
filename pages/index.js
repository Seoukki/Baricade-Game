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
  const { tr } = useLang();
  const [mode,      setMode]      = useState(null);
  const [name,      setName]      = useState("");
  const [code,      setCode]      = useState("");
  const [isPublic,  setIsPublic]  = useState(true);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [showQR,    setShowQR]    = useState(false);
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const rafRef    = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem("barricade_name");
    if (saved) setName(saved);
  }, []);

  // Live rooms for public lobby on homepage
  const [liveRooms, setLiveRooms] = useState([]);
  useEffect(() => {
    async function fetchRooms() {
      const { data } = await supabase
        .from("rooms").select("*, players(id,team,player_name)")
        .eq("status","waiting").eq("is_public",true)
        .order("created_at",{ascending:false}).limit(5);
      setLiveRooms((data||[]).filter(r=>r.players.length<2));
    }
    fetchRooms();
    const t = setInterval(fetchRooms, 6000);
    return () => clearInterval(t);
  }, []);

  async function handleCreate() {
    if (!name.trim()) { setError(tr("err_name")); return; }
    setLoading(true); setError("");
    try {
      const sessionId = getOrCreateSession();
      const roomCode  = generateCode();
      const { data: room, error: re } = await supabase.from("rooms")
        .insert({ code:roomCode, host_session_id:sessionId, status:"waiting", is_public:isPublic })
        .select().single();
      if (re) throw re;
      await supabase.from("players").insert({ room_id:room.id, session_id:sessionId, player_name:name.trim(), team:"red" });
      localStorage.setItem("barricade_name", name.trim());
      router.push(`/lobby/${roomCode}`);
    } catch(e) { console.error(e); setError(tr("err_create")); }
    finally { setLoading(false); }
  }

  async function handleJoin(roomCode) {
    const joinCode = roomCode || code;
    if (!name.trim()) { setError(tr("err_name")); return; }
    if (!joinCode.trim()) { setError(tr("err_code")); return; }
    setLoading(true); setError("");
    try {
      const sessionId = getOrCreateSession();
      const upper = joinCode.toUpperCase().trim();
      const { data: room, error: re } = await supabase
        .from("rooms").select("*,players(*)").eq("code",upper).single();
      if (re||!room) { setError(tr("err_not_found")); return; }
      if (room.status==="playing") { setError(tr("err_started")); return; }
      const ex = room.players.find(p=>p.session_id===sessionId);
      if (!ex) {
        if (room.players.length>=2) { setError(tr("err_full")); return; }
        await supabase.from("players").insert({ room_id:room.id, session_id:sessionId, player_name:name.trim(), team:"blue" });
      }
      localStorage.setItem("barricade_name", name.trim());
      router.push(`/lobby/${upper}`);
    } catch(e) { console.error(e); setError(tr("err_join")); }
    finally { setLoading(false); }
  }

  async function startQR() {
    setShowQR(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:"environment" } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      if (!("BarcodeDetector" in window)) return;
      const det = new window.BarcodeDetector({ formats:["qr_code"] });
      const canvas = document.createElement("canvas");
      const tick = async () => {
        const vid = videoRef.current;
        if (!vid||!vid.srcObject) return;
        if (vid.readyState >= 2) {
          canvas.width=vid.videoWidth; canvas.height=vid.videoHeight;
          canvas.getContext("2d").drawImage(vid,0,0);
          try {
            const res = await det.detect(canvas);
            if (res.length>0) {
              const text = res[0].rawValue;
              stopQR();
              const match = text.match(/\/lobby\/([A-Z0-9]{4,8})/i);
              const extracted = match?match[1].toUpperCase():text.replace(/[^A-Z0-9]/g,"").slice(0,8);
              setMode("join"); setCode(extracted);
              return;
            }
          } catch {}
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch(e) { console.error(e); stopQR(); }
  }
  function stopQR() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop());
    streamRef.current = null;
    setShowQR(false);
  }

  const goAI = () => {
    if (!name.trim()) { setError(tr("err_name")); return; }
    localStorage.setItem("barricade_name", name.trim());
    router.push("/game/ai");
  };

  function onKey(e,fn) { if (e.key==="Enter") fn(); }

  return (
    <>
      <Head><title>Barricade — Board Game Online</title></Head>
      <div className="min-h-screen grid-bg flex flex-col items-center px-4 py-12 pb-20">

        {/* Hero */}
        <div className="text-center mb-8 animate-fade-up" style={{marginTop:16}}>
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-white/70 border border-white/60 text-xs font-medium text-[var(--muted)] shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block"/>
            {tr("badge")}
          </div>
          <h1 className="font-display text-6xl md:text-8xl font-black tracking-tight leading-none mb-3">
            Bari<span style={{color:"var(--red)"}}>ca</span><span style={{color:"var(--blue)"}}>de</span>
          </h1>
          <p className="text-[var(--muted)] text-sm max-w-xs mx-auto leading-relaxed">{tr("tagline")}</p>
        </div>

        {/* vs AI — hero button */}
        <div className="w-full max-w-sm mb-6 animate-fade-up">
          <button onClick={goAI} className="btn w-full text-base py-4 font-bold"
            style={{background:"linear-gradient(135deg,var(--red),var(--blue))",color:"white",boxShadow:"0 6px 24px rgba(100,100,200,0.35)",borderRadius:20}}>
            🤖 {tr("vs_ai")}
          </button>
        </div>

        {/* Main card */}
        <div className="card w-full max-w-sm p-6 animate-fade-up-delay mb-5">

          {/* Name */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-[var(--muted)] mb-1.5 uppercase tracking-wider">{tr("your_name")}</label>
            <input className={`input ${error&&!name.trim()?"error":""}`} placeholder={tr("name_placeholder")}
              value={name} maxLength={30} onChange={e=>{setName(e.target.value);setError("");}}
              onKeyDown={e=>mode==="create"?onKey(e,handleCreate):mode==="join"?onKey(e,()=>handleJoin()):null}/>
          </div>

          {mode===null&&(
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <button className="btn btn-red flex-1 py-3" onClick={()=>{setMode("create");setError("");}}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                  {tr("create_room")}
                </button>
                <button className="btn btn-blue flex-1 py-3" onClick={()=>{setMode("join");setError("");}}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M3 12h12"/></svg>
                  {tr("join_room")}
                </button>
              </div>
            </div>
          )}

          {mode==="create"&&(
            <div className="animate-fade-in">
              <div className="flex items-center gap-1.5 mb-4 text-xs text-[var(--muted)]">
                <span className="w-3 h-3 rounded-full bg-[var(--red)] inline-block"/>
                {tr("create_as_red")}
              </div>
              <div className="mb-4">
                <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">{tr("room_type")}</p>
                <div className="flex gap-2">
                  {[{v:true,icon:"🌐",l:tr("public_room"),h:tr("public_hint")},{v:false,icon:"🔒",l:tr("private_room"),h:tr("private_hint")}].map(o=>(
                    <button key={String(o.v)} onClick={()=>setIsPublic(o.v)}
                      className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-medium border transition-all text-left ${isPublic===o.v?"border-[var(--blue)] bg-blue-50 text-[var(--blue)]":"border-[var(--border)] bg-white text-[var(--muted)]"}`}>
                      {o.icon} {o.l}<div className="text-[10px] mt-0.5 opacity-70 leading-tight">{o.h}</div>
                    </button>
                  ))}
                </div>
              </div>
              <button className="btn btn-red w-full py-3" onClick={handleCreate} disabled={loading}>
                {loading?<span className="spinner"/>:tr("btn_create")}
              </button>
              <button className="btn btn-ghost w-full mt-2 text-sm" onClick={()=>{setMode(null);setError("");}} disabled={loading}>{tr("btn_back")}</button>
            </div>
          )}

          {mode==="join"&&(
            <div className="animate-fade-in">
              <div className="mb-4">
                <label className="block text-xs font-semibold text-[var(--muted)] mb-1.5 uppercase tracking-wider">{tr("enter_code")}</label>
                <div className="flex gap-2">
                  <input className={`input text-center text-lg font-bold tracking-widest uppercase flex-1 ${error&&!code.trim()?"error":""}`}
                    placeholder={tr("code_placeholder")} value={code} maxLength={8}
                    onChange={e=>{setCode(e.target.value.toUpperCase());setError("");}}
                    onKeyDown={e=>onKey(e,()=>handleJoin())}/>
                  <button className="btn btn-ghost px-3 text-xl" onClick={startQR} title={tr("scan_qr")}>📷</button>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mb-4 text-xs text-[var(--muted)]">
                <span className="w-3 h-3 rounded-full bg-[var(--blue)] inline-block"/>
                {tr("join_as_blue")}
              </div>
              <button className="btn btn-blue w-full py-3" onClick={()=>handleJoin()} disabled={loading}>
                {loading?<span className="spinner"/>:tr("btn_join")}
              </button>
              <button className="btn btn-ghost w-full mt-2 text-sm" onClick={()=>{setMode(null);setError("");setCode("");}} disabled={loading}>{tr("btn_back")}</button>
            </div>
          )}

          {error&&<div className="mt-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm text-center animate-fade-in">{error}</div>}
        </div>

        {/* Live public lobby on homepage */}
        {liveRooms.length>0&&(
          <div className="w-full max-w-sm mb-5 animate-fade-up-delay">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">🌐 {tr("live_lobby")}</p>
              <span className="text-xs text-[var(--muted)]">{liveRooms.length} room</span>
            </div>
            <div className="space-y-2">
              {liveRooms.map(room=>{
                const host=room.players.find(p=>p.team==="red");
                return (
                  <div key={room.id} className="card p-3.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <span className="font-mono font-bold text-sm tracking-wider text-[var(--text)]">{room.code}</span>
                      <p className="text-xs text-[var(--muted)] truncate mt-0.5">🔴 {host?.player_name||"Player"}</p>
                    </div>
                    <button className="btn btn-blue text-xs px-4 py-2 flex-shrink-0"
                      onClick={()=>{ if(!name.trim()){setError(tr("err_name"));return;} handleJoin(room.code); }}
                      disabled={loading}>
                      {tr("join_room_lobby")}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* How to play */}
        <div className="w-full max-w-sm animate-fade-up-delay mb-5">
          <h3 className="text-center text-xs font-semibold text-[var(--muted)] uppercase tracking-widest mb-4">{tr("how_to")}</h3>
          <div className="grid grid-cols-3 gap-3">
            {[["🚶",tr("step_walk"),tr("step_walk_desc")],["🚧",tr("step_barrier"),tr("step_barrier_desc")],["🏁",tr("step_win"),tr("step_win_desc")]].map(([icon,title,desc])=>(
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
        <div className="w-full max-w-sm animate-fade-up-delay">
          <div className="card p-5">
            <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider text-center mb-4">{tr("developer")}</p>
            <div className="flex flex-col gap-2">
              {[
                {href:"https://wa.me/62895402466525",icon:"📱",l:"WhatsApp",v:"0895402466525",cls:"bg-green-50 border-green-100 text-green-700 hover:bg-green-100"},
                {href:"mailto:fynnxxc@gmail.com",icon:"✉️",l:"Email",v:"fynnxxc@gmail.com",cls:"bg-blue-50 border-blue-100 text-blue-700 hover:bg-blue-100"},
                {href:"https://instagram.com/se_o_nn",icon:"📸",l:"Instagram",v:"@se_o_nn",cls:"bg-pink-50 border-pink-100 text-pink-700 hover:bg-pink-100"},
                {href:"https://saweria.co/chaesseon",icon:"☕",l:"Saweria",v:"saweria.co/chaesseon",cls:"bg-amber-50 border-amber-100 text-amber-700 hover:bg-amber-100"},
              ].map(c=>(
                <a key={c.l} href={c.href} target="_blank" rel="noopener noreferrer"
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${c.cls}`}>
                  <span className="text-lg">{c.icon}</span>
                  <div><p className="text-xs font-semibold">{c.l}</p><p className="text-xs opacity-80">{c.v}</p></div>
                </a>
              ))}
            </div>
          </div>
          <p className="text-center text-xs text-[var(--muted)] mt-4">Barricade Online · Real-time 2 Player</p>
        </div>
      </div>

      {/* QR Scanner */}
      {showQR&&(
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="card max-w-sm w-full p-6 text-center">
            <h3 className="font-semibold text-[var(--text)] mb-1">📷 {tr("scan_qr")}</h3>
            <p className="text-xs text-[var(--muted)] mb-4">Arahkan kamera ke QR Code</p>
            <div className="w-full rounded-2xl overflow-hidden bg-black mb-4 relative" style={{aspectRatio:"1"}}>
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted/>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-44 h-44 border-2 border-white/70 rounded-2xl" style={{boxShadow:"0 0 0 9999px rgba(0,0,0,0.5)"}}/>
              </div>
            </div>
            <button className="btn btn-ghost w-full" onClick={stopQR}>Batal</button>
          </div>
        </div>
      )}
    </>
  );
}
