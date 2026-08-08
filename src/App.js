// src/App.js — v0.1.0 (scaffold)
import { useState, useEffect, useCallback } from "react";
import {
  collection, doc, addDoc, setDoc,
  onSnapshot, query, orderBy, serverTimestamp
} from "firebase/firestore";
import { db } from "./firebase";

/* ═══════════════════════════════════════════════════════════════════
   LAST MAN STANDING — Premier League survivor pool
   Firebase collections:
     /members                          { name, pin, role }
     /competitions                     { name, status, jackpot, createdAt }
       .../players/{memberId}          { paid, active, suspended, alive, teamsUsed }
       .../rounds/{roundId}            { roundNumber, deadline, status }
         .../fixtures/{fixtureId}      { home, away, kickoff, result }
         .../picks/{memberId}          { team, fixtureId, outcome }

   This is the initial scaffold: login, nav shell, and just enough
   Admin/Standings wiring to prove the Firestore round-trip works.
   Pick / Round Picks / Full Grid tabs are placeholders to be built
   out next.
═══════════════════════════════════════════════════════════════════ */

// ─── STYLES (Sky Sports palette) ───────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Outfit:wght@300;400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--ink:#05061a;--panel:#000244;--mid:#0a1050;--rail:#003cdf;--rail2:#3d6fff;--chalk:#f2f3f5;--mist:#8a93b8;--win:#3dba72;--lose:#ea021a;--pending:#fde000;--r:14px;}
html,body{height:100%;background:var(--ink);-webkit-tap-highlight-color:transparent;overscroll-behavior:none;}
.app{font-family:'Outfit',sans-serif;background:var(--ink);color:var(--chalk);min-height:100vh;max-width:480px;margin:0 auto;display:flex;flex-direction:column;}
.splash{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 24px;background:radial-gradient(ellipse at 30% 20%,rgba(0,60,223,.25) 0%,transparent 60%),radial-gradient(ellipse at 80% 80%,rgba(234,2,26,.1) 0%,transparent 50%),var(--ink);text-align:center;}
.splash-title{font-family:'Space Grotesk',sans-serif;font-size:40px;font-weight:700;color:var(--chalk);letter-spacing:-1px;line-height:1.05;margin-bottom:6px;}
.splash-title span{color:var(--rail);}
.splash-sub{font-size:12px;color:var(--mist);letter-spacing:2.5px;text-transform:uppercase;margin-bottom:40px;}
.login-box{width:100%;max-width:340px;}
.ll{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--mist);margin-bottom:8px;display:block;text-align:left;}
.lsel{width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(0,60,223,.35);border-radius:10px;padding:14px 16px;color:var(--chalk);font-family:'Outfit',sans-serif;font-size:15px;margin-bottom:16px;outline:none;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23003cdf' d='M6 8L0 0h12z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 16px center;}
.lsel option{background:#0a1050;}
.pin-single{width:100%;height:58px;background:rgba(255,255,255,.05);border:1px solid rgba(0,60,223,.3);border-radius:10px;color:var(--rail2);font-size:28px;font-weight:700;text-align:center;letter-spacing:12px;font-family:'Outfit',sans-serif;outline:none;transition:border .2s;margin-bottom:20px;}
.pin-single:focus{border-color:var(--rail);background:rgba(0,60,223,.08);}
.btn-login{width:100%;padding:15px;background:linear-gradient(135deg,var(--rail) 0%,var(--rail2) 100%);color:#fff;border:none;border-radius:10px;font-family:'Outfit',sans-serif;font-size:15px;font-weight:700;cursor:pointer;transition:all .2s;}
.btn-login:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(0,60,223,.4);}
.lerr{color:var(--lose);font-size:13px;text-align:center;margin-top:10px;}
.loading{display:flex;align-items:center;justify-content:center;min-height:100vh;font-size:14px;color:var(--mist);flex-direction:column;gap:12px;}
.spin{width:32px;height:32px;border:3px solid rgba(0,60,223,.2);border-top-color:var(--rail);border-radius:50%;animation:sp .8s linear infinite;}
@keyframes sp{to{transform:rotate(360deg)}}
.header{padding:16px 18px 0;background:linear-gradient(180deg,var(--panel) 0%,var(--ink) 100%);border-bottom:1px solid rgba(0,60,223,.25);}
.header-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;}
.brand{font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;color:var(--chalk);letter-spacing:-.5px;}
.brand span{color:var(--rail2);}
.av{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;background:var(--rail);flex-shrink:0;cursor:pointer;}
.nav{display:flex;position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;background:var(--panel);border-top:1px solid rgba(0,60,223,.2);z-index:100;padding-bottom:env(safe-area-inset-bottom,0px);}
.ni{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:10px 4px 12px;background:none;border:none;color:var(--mist);font-family:'Outfit',sans-serif;font-size:10px;font-weight:500;letter-spacing:.4px;text-transform:uppercase;cursor:pointer;}
.ni.active{color:var(--rail2);}
.content{flex:1;padding:18px 16px 100px;overflow-y:auto;overscroll-behavior:none;}
.card{background:rgba(0,60,223,.07);border:1px solid rgba(0,60,223,.2);border-radius:var(--r);padding:16px;margin-bottom:14px;}
.ch{font-family:'Space Grotesk',sans-serif;font-size:16px;color:var(--chalk);margin-bottom:14px;font-weight:600;}
.ss{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;}
.st{background:rgba(0,60,223,.1);border:1px solid rgba(0,60,223,.2);border-radius:10px;padding:13px 10px;text-align:center;}
.sv{font-family:'Space Grotesk',sans-serif;font-size:26px;font-weight:700;color:var(--rail2);line-height:1;}
.sl{font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--mist);margin-top:4px;}
.mem-row{display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.06);}
.mem-row:last-child{border-bottom:none;}
.mem-l{display:flex;align-items:center;gap:11px;}
.mem-av{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;background:var(--rail);flex-shrink:0;}
.mem-name{font-size:14px;font-weight:500;}
.mem-sub{font-size:11px;color:var(--mist);margin-top:1px;}
.badge{display:inline-flex;align-items:center;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600;}
.b-admin{background:rgba(0,60,223,.15);color:var(--rail2);}
.b-player{background:rgba(255,255,255,.08);color:var(--mist);}
.fi{width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(0,60,223,.25);border-radius:9px;padding:12px 14px;color:var(--chalk);font-family:'Outfit',sans-serif;font-size:14px;outline:none;margin-bottom:10px;}
.fi:focus{border-color:var(--rail);}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:13px;border:none;border-radius:9px;font-family:'Outfit',sans-serif;font-size:14px;font-weight:600;cursor:pointer;letter-spacing:.2px;}
.btn-g{background:linear-gradient(135deg,var(--rail) 0%,var(--rail2) 100%);color:#fff;}
.btn-sm{width:auto;padding:7px 14px;font-size:12px;border-radius:7px;}
.btn-d{background:rgba(234,2,26,.12);color:var(--lose);border:1px solid rgba(234,2,26,.3);}
.btn:disabled{opacity:.4;cursor:not-allowed;}
.empty{text-align:center;padding:36px 20px;color:var(--mist);}
.ei{font-size:34px;margin-bottom:10px;}
.et{font-size:15px;font-weight:600;color:var(--chalk);margin-bottom:5px;}
.es{font-size:13px;}
.toast{position:fixed;bottom:84px;left:50%;transform:translateX(-50%);background:var(--mid);border:1px solid rgba(0,60,223,.4);color:var(--chalk);padding:12px 22px;border-radius:30px;font-size:13px;font-weight:500;z-index:500;white-space:nowrap;box-shadow:0 8px 30px rgba(0,0,0,.5);}
@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.fade-in{animation:fadeIn .3s ease;}
`;

function mkInitials(name) {
  return (name || "").trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

// ─── LOGIN ──────────────────────────────────────────────────────────
function LoginScreen({ members, onLogin }) {
  const [sel, setSel] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  const attempt = () => {
    const m = members.find(x => x.id === sel);
    if (!m) { setErr("Pick your name"); return; }
    if (String(m.pin) !== pin) { setErr("Wrong PIN"); return; }
    onLogin({ id: m.id, name: m.name, role: m.role, initials: mkInitials(m.name) });
  };

  return (
    <div className="splash">
      <div className="splash-title">Last Man<br /><span>Standing</span></div>
      <div className="splash-sub">Premier League Survivor Pool</div>
      <div className="login-box">
        <label className="ll">Who are you?</label>
        <select className="lsel" value={sel} onChange={e => { setSel(e.target.value); setErr(""); }}>
          <option value="">Select your name…</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <label className="ll">PIN</label>
        <input
          className="pin-single"
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={e => { setPin(e.target.value.replace(/\D/g, "")); setErr(""); }}
        />
        <button className="btn-login" onClick={attempt}>Log In</button>
        {err && <div className="lerr">{err}</div>}
      </div>
    </div>
  );
}

// ─── STANDINGS TAB ──────────────────────────────────────────────────
function StandingsTab({ competition }) {
  if (!competition) {
    return (
      <div className="fade-in empty">
        <div className="ei">🏁</div>
        <div className="et">No competition running yet</div>
        <div className="es">Ask the Admin to start one from the Admin tab.</div>
      </div>
    );
  }
  return (
    <div className="fade-in">
      <div className="ss">
        <div className="st"><div className="sv">£{competition.jackpot || 0}</div><div className="sl">Prize Pot</div></div>
        <div className="st"><div className="sv">{competition.status}</div><div className="sl">Status</div></div>
      </div>
      <div className="card">
        <div className="ch">{competition.name}</div>
        <div className="es" style={{ color: "var(--mist)" }}>Standings will appear here once rounds are underway.</div>
      </div>
    </div>
  );
}

// ─── PLACEHOLDER TAB ────────────────────────────────────────────────
function ComingSoon({ title, sub }) {
  return (
    <div className="fade-in empty">
      <div className="ei">⚽</div>
      <div className="et">{title}</div>
      <div className="es">{sub}</div>
    </div>
  );
}

// ─── ROUNDS CARD (Admin) ────────────────────────────────────────────
function fmtDeadline(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function RoundsCard({ competition, rounds, showToast }) {
  const [importing, setImporting] = useState(false);
  if (!competition) return null;

  const nextMatchday = (rounds[rounds.length - 1]?.matchday || 0) + 1;

  const importRound = async () => {
    setImporting(true);
    try {
      const res = await fetch("/api/import-round", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitionId: competition.id, matchday: nextMatchday }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      showToast(data.message);
    } catch (e) {
      showToast(e.message);
    } finally {
      setImporting(false);
    }
  };

  const setStatus = async (round, status) => {
    await setDoc(doc(db, `competitions/${competition.id}/rounds/${round.id}`), { status }, { merge: true });
    showToast(`Round ${round.roundNumber} ${status}`);
  };

  return (
    <div className="card">
      <div className="ch">Rounds — {competition.name}</div>
      <button className="btn btn-g" disabled={importing} onClick={importRound} style={{ marginBottom: 14 }}>
        {importing ? "Importing…" : `Import Round ${nextMatchday} Fixtures`}
      </button>
      {rounds.length === 0
        ? <div className="es" style={{ color: "var(--mist)" }}>No rounds yet — import the first one above.</div>
        : rounds.map(r => (
          <div key={r.id} className="mem-row">
            <div className="mem-l">
              <div>
                <div className="mem-name">Round {r.roundNumber}</div>
                <div className="mem-sub">{r.status} · deadline {fmtDeadline(r.deadline)}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {r.status !== "open" && r.status !== "closed" &&
                <button className="btn btn-sm btn-g" onClick={() => setStatus(r, "open")}>Open</button>}
              {r.status === "open" &&
                <button className="btn btn-sm btn-d" onClick={() => setStatus(r, "closed")}>Close</button>}
              {r.status === "closed" &&
                <span className="badge b-player">closed</span>}
            </div>
          </div>
        ))}
    </div>
  );
}

// ─── ADMIN TAB ──────────────────────────────────────────────────────
function AdminTab({ members, competitions, activeCompetition, rounds, showToast }) {
  const [name, setName] = useState("");

  const createCompetition = async () => {
    if (!name.trim()) { showToast("Give the competition a name"); return; }
    await addDoc(collection(db, "competitions"), {
      name: name.trim(),
      status: "active",
      jackpot: 0,
      createdAt: serverTimestamp(),
    });
    setName("");
    showToast("Competition created");
  };

  return (
    <div className="fade-in">
      <div className="card">
        <div className="ch">Start a New Competition</div>
        <input className="fi" placeholder="e.g. 22nd August 2026" value={name} onChange={e => setName(e.target.value)} />
        <button className="btn btn-g" onClick={createCompetition}>Create</button>
      </div>

      <RoundsCard competition={activeCompetition} rounds={rounds} showToast={showToast} />

      <div className="card">
        <div className="ch">Competitions</div>
        {competitions.length === 0
          ? <div className="es" style={{ color: "var(--mist)" }}>None yet.</div>
          : competitions.map(c => (
            <div key={c.id} className="mem-row">
              <div className="mem-l"><div className="mem-name">{c.name}</div></div>
              <span className={`badge ${c.status === "active" ? "b-admin" : "b-player"}`}>{c.status}</span>
            </div>
          ))}
      </div>

      <div className="card">
        <div className="ch">Members</div>
        {members.map(m => (
          <div key={m.id} className="mem-row">
            <div className="mem-l">
              <div className="mem-av">{mkInitials(m.name)}</div>
              <div>
                <div className="mem-name">{m.name}</div>
                <div className="mem-sub">{m.role}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ACCOUNT TAB ────────────────────────────────────────────────────
function AccountTab({ user }) {
  return (
    <div className="fade-in card">
      <div className="ch">Account</div>
      <div className="mem-row">
        <div className="mem-l">
          <div className="mem-av">{user.initials}</div>
          <div>
            <div className="mem-name">{user.name}</div>
            <div className="mem-sub">{user.role}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ROOT ───────────────────────────────────────────────────────────
export default function App() {
  const [members, setMembers] = useState([]);
  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUserState] = useState(() => {
    try {
      const stored = localStorage.getItem("lmsUser");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const setUser = (u) => {
    setUserState(u);
    if (u) localStorage.setItem("lmsUser", JSON.stringify(u));
    else localStorage.removeItem("lmsUser");
  };
  const [tab, setTab] = useState("standings");
  const [toast, setToast] = useState("");
  const [rounds, setRounds] = useState([]);

  const showToast = useCallback((msg) => {
    setToast(msg); setTimeout(() => setToast(""), 3200);
  }, []);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, "members"), s => {
      setMembers(s.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    const u2 = onSnapshot(query(collection(db, "competitions"), orderBy("createdAt", "desc")), s =>
      setCompetitions(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { u1(); u2(); };
  }, []);

  // Seed a default admin on first run so there's a way to log in.
  useEffect(() => {
    if (!loading && members.length === 0) {
      setDoc(doc(db, "members", "admin"), {
        name: "Admin", pin: "1234", role: "admin"
      });
    }
  }, [loading, members.length]);

  const activeCompetitionId = competitions.find(c => c.status === "active")?.id || null;

  // Rounds live under the active competition, so this listener re-subscribes
  // whenever which competition is active changes (including on rollover).
  useEffect(() => {
    if (!activeCompetitionId) { setRounds([]); return; }
    const u = onSnapshot(
      query(collection(db, `competitions/${activeCompetitionId}/rounds`), orderBy("roundNumber", "asc")),
      s => setRounds(s.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => u();
  }, [activeCompetitionId]);

  if (loading) return (<><style>{CSS}</style><div className="loading"><div className="spin" /><span>Loading…</span></div></>);
  if (!user) return (<><style>{CSS}</style><LoginScreen members={members} onLogin={setUser} /></>);

  const activeCompetition = competitions.find(c => c.status === "active");

  const tabs = [
    { id: "standings", label: "Standings" },
    ...(user.role !== "admin" ? [{ id: "pick", label: "Pick" }] : []),
    { id: "round", label: "Round" },
    { id: "grid", label: "Grid" },
    { id: "account", label: "Account" },
    ...(user.role === "admin" ? [{ id: "admin", label: "Admin" }] : []),
  ];

  return (
    <><style>{CSS}</style>
      <div className="app fade-in">
        <div className="header">
          <div className="header-top">
            <div className="brand">Last Man <span>Standing</span></div>
            <div className="av" onClick={() => setTab("account")}>{user.initials}</div>
          </div>
        </div>
        <div className="content">
          {tab === "standings" && <StandingsTab competition={activeCompetition} />}
          {tab === "pick" && <ComingSoon title="Pick" sub="Team selection is coming next." />}
          {tab === "round" && <ComingSoon title="This Round's Picks" sub="Visible once submissions close." />}
          {tab === "grid" && <ComingSoon title="Full History Grid" sub="Player x round grid, coming soon." />}
          {tab === "account" && <AccountTab user={user} />}
          {tab === "admin" && user.role === "admin" && <AdminTab members={members} competitions={competitions} activeCompetition={activeCompetition} rounds={rounds} showToast={showToast} />}
        </div>
        {toast && <div className="toast">{toast}</div>}
        <div className="nav">
          {tabs.map(t => (
            <button key={t.id} className={`ni ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
