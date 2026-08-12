// src/App.js — v0.1.0 (scaffold)
import { useState, useEffect, useCallback } from "react";
import {
  collection, doc, addDoc, setDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp, writeBatch, getDoc, getDocs
} from "firebase/firestore";
import { db } from "./firebase";

const ENTRY_FEE = 10;
// Mirrors the same constant in api/settle-round.js -- duplicated because
// this side runs client-side (Amend Fixture) rather than in the serverless
// function, so there's no shared module between the two runtimes.
const LAST_MATCHDAY = 38;

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
.fisel{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='7' viewBox='0 0 10 7'%3E%3Cpath fill='%23003cdf' d='M5 7L0 0h10z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;}
.fisel option{background:#0a1050;}
.fisel option:disabled{color:rgba(138,147,184,.5);}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:13px;border:none;border-radius:9px;font-family:'Outfit',sans-serif;font-size:14px;font-weight:600;cursor:pointer;letter-spacing:.2px;}
.btn-g{background:linear-gradient(135deg,var(--rail) 0%,var(--rail2) 100%);color:#fff;}
.btn-sm{width:auto;padding:7px 14px;font-size:12px;border-radius:7px;}
.btn-d{background:rgba(234,2,26,.12);color:var(--lose);border:1px solid rgba(234,2,26,.3);}
.btn-gh{background:rgba(255,255,255,.05);color:var(--chalk);border:1px solid rgba(255,255,255,.12);}
.tabs{display:flex;gap:6px;margin-bottom:16px;}
.tab{flex:1;padding:9px 4px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;color:var(--mist);font-size:12px;font-weight:500;cursor:pointer;text-align:center;transition:all .15s;}
.tab.on{background:rgba(0,60,223,.15);border-color:rgba(0,60,223,.4);color:var(--rail2);font-weight:600;}
.btn:disabled{opacity:.4;cursor:not-allowed;}
.grid-wrap{overflow-x:auto;margin:-4px -4px 0;padding:4px;}
.grid-table{border-collapse:collapse;width:100%;font-size:12px;}
.grid-table th,.grid-table td{padding:8px 12px;text-align:left;border-bottom:1px solid rgba(255,255,255,.06);white-space:nowrap;}
.grid-table th{color:var(--mist);font-size:10px;text-transform:uppercase;letter-spacing:.5px;font-weight:600;}
.grid-table td.gname{position:sticky;left:0;background:var(--panel);font-weight:600;color:var(--chalk);}
.grid-win{color:var(--win);}
.grid-lose{color:var(--lose);text-decoration:line-through;text-decoration-color:rgba(234,2,26,.5);}
.grid-pending{color:var(--mist);}
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
function StandingsTab({ competition, players, members }) {
  if (!competition) {
    return (
      <div className="fade-in empty">
        <div className="ei">🏁</div>
        <div className="et">No competition running yet</div>
        <div className="es">Ask the Admin to start one from the Admin tab.</div>
      </div>
    );
  }

  const activePlayers = players.filter(p => p.active && !p.suspended);
  const pot = (competition.jackpot || 0) + activePlayers.length * ENTRY_FEE;
  const alive = activePlayers.filter(p => p.alive);
  const eliminated = activePlayers.filter(p => !p.alive);
  const nameFor = (id) => members.find(m => m.id === id)?.name || "Unknown";

  if (competition.status === "completed") {
    return (
      <div className="fade-in empty">
        <div className="ei">🏆</div>
        <div className="et">{competition.name} — Complete</div>
        <div className="es">
          {competition.winner
            ? `${nameFor(competition.winner)} won the pot!`
            : competition.splitWinners
              ? `£${competition.splitAmount || 0} split between ${competition.splitWinners.map(nameFor).join(", ")}`
              : "This competition has ended."}
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div className="ss">
        <div className="st"><div className="sv">£{pot}</div><div className="sl">Prize Pot</div></div>
        <div className="st"><div className="sv">{alive.length}</div><div className="sl">Players Alive</div></div>
      </div>
      <div className="card">
        <div className="ch">{competition.name}</div>
        {activePlayers.length === 0
          ? <div className="es" style={{ color: "var(--mist)" }}>No active players yet — the Admin is still activating entries.</div>
          : <>
            {alive.map(p => (
              <div key={p.id} className="mem-row">
                <div className="mem-l">
                  <div className="mem-av">{mkInitials(nameFor(p.id))}</div>
                  <div className="mem-name">{nameFor(p.id)}</div>
                </div>
                <span className="badge b-admin">alive</span>
              </div>
            ))}
            {eliminated.map(p => (
              <div key={p.id} className="mem-row">
                <div className="mem-l">
                  <div className="mem-av" style={{ background: "var(--mist)" }}>{mkInitials(nameFor(p.id))}</div>
                  <div className="mem-name" style={{ color: "var(--mist)" }}>{nameFor(p.id)}</div>
                </div>
                <span className="badge" style={{ background: "rgba(234,2,26,.12)", color: "var(--lose)" }}>out</span>
              </div>
            ))}
          </>}
      </div>
    </div>
  );
}

// ─── EMPTY STATE ────────────────────────────────────────────────────
// Reused for "coming soon" placeholders and for real Pick-tab states
// (not activated / eliminated / no open round etc).
function EmptyState({ icon = "⚽", title, sub }) {
  return (
    <div className="fade-in empty">
      <div className="ei">{icon}</div>
      <div className="et">{title}</div>
      <div className="es">{sub}</div>
    </div>
  );
}

// ─── PICK TAB ───────────────────────────────────────────────────────
function PickTab({ competition, openRound, fixtures, myPlayer, myPick, user, showToast }) {
  const [selectedKey, setSelectedKey] = useState("");
  const [saving, setSaving] = useState(false);

  // Keep the dropdown in sync with the saved pick — otherwise a reload
  // shows "Current pick: Arsenal" above a dropdown that's reset to blank.
  useEffect(() => {
    setSelectedKey(myPick ? `${myPick.fixtureId}:${myPick.team}` : "");
  }, [myPick?.fixtureId, myPick?.team]);

  if (!competition) return <EmptyState title="No competition running" sub="Ask the Admin to start one." />;
  if (!myPlayer) return <EmptyState title="Not in this competition" sub="Ask the Admin to add you as a player." />;
  if (myPlayer.suspended) return <EmptyState icon="⏸️" title="Entry suspended" sub="Contact the Admin to sort this out." />;
  if (!myPlayer.active) return <EmptyState icon="⏳" title="Not activated yet" sub="You'll be able to pick once the Admin confirms your entry is paid." />;
  if (!myPlayer.alive) return <EmptyState icon="🚪" title="You're out" sub="You were eliminated this competition — you can still follow Standings and the Grid." />;
  if (!openRound) return <EmptyState title="No round open" sub="Check back once the Admin opens the next round for picks." />;

  const teamsUsed = new Set(myPlayer.teamsUsed || []);
  const options = fixtures
    .flatMap(f => ([
      { key: `${f.id}:${f.home}`, fixtureId: f.id, team: f.home, disabled: teamsUsed.has(f.home) },
      { key: `${f.id}:${f.away}`, fixtureId: f.id, team: f.away, disabled: teamsUsed.has(f.away) },
    ]))
    .sort((a, b) => a.team.localeCompare(b.team));

  const submit = async () => {
    const opt = options.find(o => o.key === selectedKey);
    if (!opt) { showToast("Pick a team first"); return; }
    setSaving(true);
    try {
      await setDoc(doc(db, `competitions/${competition.id}/rounds/${openRound.id}/picks/${user.id}`), {
        team: opt.team, fixtureId: opt.fixtureId, outcome: "pending", submittedAt: serverTimestamp(),
      });
      showToast("Pick submitted");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fade-in">
      <div className="card">
        <div className="ch">Round {openRound.roundNumber} — Make Your Pick</div>
        {myPick && (
          <div className="es" style={{ color: "var(--mist)", marginBottom: 12 }}>
            Current pick: <strong style={{ color: "var(--chalk)" }}>{myPick.team}</strong> — you can change this until the round closes.
          </div>
        )}
        <select className="fi fisel" value={selectedKey} onChange={e => setSelectedKey(e.target.value)}>
          <option value="">Select a team…</option>
          {options.map(o => (
            <option key={o.key} value={o.key} disabled={o.disabled}>
              {o.team}{o.disabled ? " (already used)" : ""}
            </option>
          ))}
        </select>
        <button className="btn btn-g" disabled={saving} onClick={submit}>
          {saving ? "Saving…" : myPick ? "Change Pick" : "Submit Pick"}
        </button>
      </div>

      <div className="card">
        <div className="ch">Round {openRound.roundNumber} Fixtures</div>
        {[...fixtures].sort((a, b) => (a.kickoff || "").localeCompare(b.kickoff || "")).map(f => (
          <div key={f.id} className="mem-row">
            <div className="mem-l">
              <div>
                <div className="mem-name" style={{ fontSize: 13 }}>
                  {f.home}{teamsUsed.has(f.home) && <span style={{ color: "var(--mist)" }}> (used)</span>}
                  {" vs "}
                  {f.away}{teamsUsed.has(f.away) && <span style={{ color: "var(--mist)" }}> (used)</span>}
                </div>
                <div className="mem-sub">{fmtDeadline(f.kickoff)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ROUND TAB (This Round's Picks) ─────────────────────────────────
// Hidden while the round is still open (so nobody can copy a pick before
// the deadline) -- becomes visible the moment it's closed, with results
// layered in as the round gets settled.
function outcomeBadge(outcome) {
  if (outcome === "win") return <span className="badge b-admin">won</span>;
  if (outcome === "eliminated") return <span className="badge" style={{ background: "rgba(234,2,26,.12)", color: "var(--lose)" }}>lost</span>;
  return <span className="badge b-player">pending</span>;
}

function RoundTab({ competition, round, players, picks, members, isAdmin }) {
  if (!competition) return <EmptyState title="No competition running" sub="Ask the Admin to start one." />;
  if (!round) return <EmptyState title="No rounds yet" sub="Check back once the Admin imports the first round." />;
  if (!isAdmin && (round.status === "open" || round.status === "pending")) {
    return <EmptyState icon="🔒" title="Picks are hidden" sub="Everyone's pick for this round will show here once submissions close." />;
  }

  const activePlayers = players.filter(p => p.active && !p.suspended);
  const nameFor = (id) => members.find(m => m.id === id)?.name || "Unknown";
  const pickFor = (id) => picks.find(p => p.id === id) || null;

  return (
    <div className="fade-in">
      <div className="card">
        <div className="ch">Round {round.roundNumber} Picks {round.status === "settled" ? "— Settled" : "— Closed"}</div>
        {activePlayers.length === 0
          ? <div className="es" style={{ color: "var(--mist)" }}>No active players in this competition.</div>
          : activePlayers.map(p => {
            const pick = pickFor(p.id);
            return (
              <div key={p.id} className="mem-row">
                <div className="mem-l">
                  <div className="mem-av">{mkInitials(nameFor(p.id))}</div>
                  <div>
                    <div className="mem-name">{nameFor(p.id)}</div>
                    <div className="mem-sub">{pick ? `${pick.team}${pick.autoAssigned ? " (auto)" : ""}` : "No pick submitted"}</div>
                  </div>
                </div>
                {pick ? outcomeBadge(pick.outcome) : <span className="badge" style={{ background: "rgba(234,2,26,.1)", color: "#c07070" }}>missed</span>}
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ─── GRID TAB (Full History) ────────────────────────────────────────
// Mirrors the spreadsheet: one row per player, one column per round. Not
// wired to real-time listeners like everything else -- it's a look-back
// view, not something that needs millisecond sync, so it's a plain fetch
// per round that re-runs whenever the round list changes.
function GridTab({ competition, rounds, players, members, isAdmin }) {
  const [picksByRound, setPicksByRound] = useState({});
  const [loadingGrid, setLoadingGrid] = useState(false);
  const roundIds = rounds.map(r => r.id).join(",");

  useEffect(() => {
    if (!competition || rounds.length === 0) { setPicksByRound({}); return; }
    let cancelled = false;
    setLoadingGrid(true);
    (async () => {
      const entries = await Promise.all(rounds.map(async r => {
        const snap = await getDocs(collection(db, `competitions/${competition.id}/rounds/${r.id}/picks`));
        const map = {};
        snap.docs.forEach(d => { map[d.id] = d.data(); });
        return [r.id, map];
      }));
      if (!cancelled) { setPicksByRound(Object.fromEntries(entries)); setLoadingGrid(false); }
    })();
    return () => { cancelled = true; };
  }, [competition?.id, roundIds]);

  if (!competition) return <EmptyState title="No competition running" sub="Ask the Admin to start one." />;
  if (rounds.length === 0) return <EmptyState title="No rounds yet" sub="Check back once the Admin imports the first round." />;
  if (loadingGrid) return <EmptyState icon="⏳" title="Loading grid…" sub="" />;

  const activePlayers = players.filter(p => p.active && !p.suspended);
  const nameFor = (id) => members.find(m => m.id === id)?.name || "Unknown";
  const cellClass = (outcome) => outcome === "win" ? "grid-win" : outcome === "eliminated" ? "grid-lose" : "grid-pending";

  return (
    <div className="fade-in">
      <div className="card">
        <div className="ch">{competition.name} — Full Grid</div>
        {activePlayers.length === 0
          ? <div className="es" style={{ color: "var(--mist)" }}>No active players in this competition.</div>
          : (
            <div className="grid-wrap">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th className="gname">Player</th>
                    {rounds.map(r => <th key={r.id}>R{r.roundNumber}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {activePlayers.map(p => (
                    <tr key={p.id}>
                      <td className="gname">{nameFor(p.id)}</td>
                      {rounds.map(r => {
                        // Picks stay anonymous to everyone but the Admin
                        // until the Admin closes the round -- same rule as
                        // the Round tab, just applied per-column here since
                        // this view spans every round, not just the current one.
                        const hidden = !isAdmin && (r.status === "open" || r.status === "pending");
                        if (hidden) return <td key={r.id} className="grid-pending">🔒</td>;
                        const pick = picksByRound[r.id]?.[p.id];
                        return (
                          <td key={r.id} className={pick ? cellClass(pick.outcome) : "grid-pending"}>
                            {pick ? pick.team : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}

// ─── ROUNDS CARD (Admin) ────────────────────────────────────────────
// Always renders in UK time (Europe/London), regardless of the viewer's
// own device time zone -- otherwise a player abroad would see a kickoff
// time silently converted to their local zone with no indication it had
// been, which is exactly how you end up missing a deadline. Europe/London
// (rather than a fixed UTC/BST offset) correctly handles the GMT<->BST
// switch across the season on its own.
function fmtDeadline(iso) {
  if (!iso) return "";
  const formatted = new Date(iso).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/London",
  });
  return `${formatted} UK`;
}

// Reverses a settled round: pure Firestore reads/writes, no external API,
// so this runs client-side rather than through a serverless function.
// Restores every player this round eliminated back to alive, removes their
// team from teamsUsed, resets pick outcomes to pending, clears fixture
// results, and un-declares any winner/rollover-split prompt this round
// triggered — matching design doc Section 2.4 exactly.
async function undoRound(competitionId, round) {
  const picksSnap = await getDocs(collection(db, `competitions/${competitionId}/rounds/${round.id}/picks`));
  const batch = writeBatch(db);

  for (const pickDoc of picksSnap.docs) {
    const pick = pickDoc.data();
    if (pick.outcome === "pending") continue;

    batch.set(doc(db, `competitions/${competitionId}/rounds/${round.id}/picks/${pickDoc.id}`), { outcome: "pending" }, { merge: true });

    const playerRef = doc(db, `competitions/${competitionId}/players/${pickDoc.id}`);
    const playerSnap = await getDoc(playerRef);
    const player = playerSnap.data() || {};
    const teamsUsed = (player.teamsUsed || []).filter(t => t !== pick.team);
    batch.set(playerRef, { teamsUsed, alive: true }, { merge: true });
  }

  const fixturesSnap = await getDocs(collection(db, `competitions/${competitionId}/rounds/${round.id}/fixtures`));
  fixturesSnap.docs.forEach(f => batch.set(f.ref, { result: null, homeScore: null, awayScore: null }, { merge: true }));

  batch.set(doc(db, `competitions/${competitionId}/rounds/${round.id}`), { status: "closed", settledAt: null }, { merge: true });
  batch.set(doc(db, `competitions/${competitionId}`), {
    status: "active", winner: null, needsResolution: false, resolutionReason: null, resolutionCandidates: [],
  }, { merge: true });

  await batch.commit();
}

// Corrects a single fixture's result without touching the rest of the
// round -- for when the feed was wrong, a fixture was postponed, or a
// decision changed on review (design doc Section 2.4/8.5). Only the picks
// tied to this one fixture are recalculated; everything else in the round
// is left exactly as it was.
async function amendFixture(competitionId, round, fixture, newResult) {
  const picksSnap = await getDocs(collection(db, `competitions/${competitionId}/rounds/${round.id}/picks`));
  const affected = picksSnap.docs.filter(d => d.data().fixtureId === fixture.id);

  const batch = writeBatch(db);

  // Undo whatever this fixture's previous result did to these picks, if anything.
  for (const pickDoc of affected) {
    const pick = pickDoc.data();
    if (pick.outcome === "pending") continue;
    const playerRef = doc(db, `competitions/${competitionId}/players/${pickDoc.id}`);
    const playerSnap = await getDoc(playerRef);
    const player = playerSnap.data() || {};
    batch.set(playerRef, { teamsUsed: (player.teamsUsed || []).filter(t => t !== pick.team), alive: true }, { merge: true });
  }

  batch.set(doc(db, `competitions/${competitionId}/rounds/${round.id}/fixtures/${fixture.id}`), {
    result: newResult, homeScore: null, awayScore: null,
  }, { merge: true });

  // Apply the corrected result.
  for (const pickDoc of affected) {
    const pick = pickDoc.data();
    const pickedHome = pick.team === fixture.home;
    const won = (pickedHome && newResult === "home") || (!pickedHome && newResult === "away");
    batch.set(doc(db, `competitions/${competitionId}/rounds/${round.id}/picks/${pickDoc.id}`), { outcome: won ? "win" : "eliminated" }, { merge: true });

    const playerRef = doc(db, `competitions/${competitionId}/players/${pickDoc.id}`);
    const playerSnap = await getDoc(playerRef);
    const player = playerSnap.data() || {};
    const teamsUsed = new Set(player.teamsUsed || []);
    teamsUsed.add(pick.team);
    batch.set(playerRef, { teamsUsed: [...teamsUsed], alive: won }, { merge: true });
  }

  await batch.commit();

  // Re-check end-of-competition status, but only once every fixture in the
  // round has a result -- same gate settle-round.js uses.
  const fixturesSnap = await getDocs(collection(db, `competitions/${competitionId}/rounds/${round.id}/fixtures`));
  const allFinished = fixturesSnap.docs.every(d => d.data().result != null);
  if (!allFinished) return;

  const playersSnap = await getDocs(collection(db, `competitions/${competitionId}/players`));
  const activePlayers = playersSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.active && !p.suspended);
  const alivePlayers = activePlayers.filter(p => p.alive);

  if (alivePlayers.length === 1) {
    await setDoc(doc(db, `competitions/${competitionId}`), { status: "completed", winner: alivePlayers[0].id, needsResolution: false }, { merge: true });
  } else if (alivePlayers.length === 0) {
    await setDoc(doc(db, `competitions/${competitionId}`), {
      needsResolution: true, resolutionReason: "all-eliminated", resolutionCandidates: activePlayers.map(p => p.id),
    }, { merge: true });
  } else if (round.matchday >= LAST_MATCHDAY) {
    await setDoc(doc(db, `competitions/${competitionId}`), {
      needsResolution: true, resolutionReason: "season-ended", resolutionCandidates: alivePlayers.map(p => p.id),
    }, { merge: true });
  } else {
    // Amending may have un-resolved a previously declared winner/resolution.
    await setDoc(doc(db, `competitions/${competitionId}`), {
      status: "active", winner: null, needsResolution: false, resolutionReason: null, resolutionCandidates: [],
    }, { merge: true });
  }
}

function AmendPanel({ competitionId, round, showToast }) {
  const [open, setOpen] = useState(false);
  const [fixtures, setFixtures] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const toggle = async () => {
    if (!open && fixtures === null) {
      const snap = await getDocs(collection(db, `competitions/${competitionId}/rounds/${round.id}/fixtures`));
      setFixtures(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }
    setOpen(o => !o);
  };

  const apply = async (fixture, result) => {
    setBusyId(fixture.id);
    try {
      await amendFixture(competitionId, round, fixture, result);
      setFixtures(fs => fs.map(f => (f.id === fixture.id ? { ...f, result } : f)));
      showToast(`${fixture.home} vs ${fixture.away} corrected`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ marginTop: 8 }}>
      <button className="btn btn-sm btn-gh" style={{ width: "100%" }} onClick={toggle}>
        {open ? "Hide fixtures" : "Amend a fixture"}
      </button>
      {open && fixtures && fixtures.map(f => (
        <div key={f.id} className="mem-row">
          <div className="mem-l">
            <div>
              <div className="mem-name" style={{ fontSize: 13 }}>{f.home} vs {f.away}</div>
              <div className="mem-sub">current: {f.result || "no result yet"}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {["home", "draw", "away"].map(r => (
              <button
                key={r}
                className="btn btn-sm"
                disabled={busyId === f.id}
                style={{ background: f.result === r ? "var(--rail)" : "rgba(255,255,255,.06)", color: f.result === r ? "#fff" : "var(--mist)" }}
                onClick={() => apply(f, r)}
              >
                {r === "home" ? "Home" : r === "draw" ? "Draw" : "Away"}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Fills in a random unused team for every active, alive player who didn't
// submit a pick before the round closed — design doc Section 2.1. Runs
// automatically as part of closing a round (see setStatus below); there's
// no separate kickoff-time cron yet, so a round only gets this treatment
// when the Admin actually closes it.
async function autoAssignMissedPicks(competitionId, round) {
  const [playersSnap, fixturesSnap, picksSnap] = await Promise.all([
    getDocs(collection(db, `competitions/${competitionId}/players`)),
    getDocs(collection(db, `competitions/${competitionId}/rounds/${round.id}/fixtures`)),
    getDocs(collection(db, `competitions/${competitionId}/rounds/${round.id}/picks`)),
  ]);

  const fixtures = fixturesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const pickedIds = new Set(picksSnap.docs.map(d => d.id));
  const missed = playersSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => p.active && !p.suspended && p.alive && !pickedIds.has(p.id));

  if (missed.length === 0) return 0;

  const batch = writeBatch(db);
  let assigned = 0;
  for (const player of missed) {
    const teamsUsed = new Set(player.teamsUsed || []);
    const options = fixtures
      .flatMap(f => ([{ fixtureId: f.id, team: f.home }, { fixtureId: f.id, team: f.away }]))
      .filter(o => !teamsUsed.has(o.team));
    if (options.length === 0) continue; // no unused teams left -- shouldn't normally happen
    const choice = options[Math.floor(Math.random() * options.length)];
    batch.set(doc(db, `competitions/${competitionId}/rounds/${round.id}/picks/${player.id}`), {
      team: choice.team, fixtureId: choice.fixtureId, outcome: "pending", autoAssigned: true, submittedAt: serverTimestamp(),
    });
    assigned++;
  }
  await batch.commit();
  return assigned;
}

function RoundsCard({ competition, rounds, showToast }) {
  const [importing, setImporting] = useState(false);
  const [settlingId, setSettlingId] = useState(null);
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
    if (status === "closed") {
      const assigned = await autoAssignMissedPicks(competition.id, round);
      await setDoc(doc(db, `competitions/${competition.id}/rounds/${round.id}`), { status }, { merge: true });
      showToast(assigned > 0 ? `Round ${round.roundNumber} closed — ${assigned} random pick${assigned > 1 ? "s" : ""} auto-assigned` : `Round ${round.roundNumber} closed`);
      return;
    }
    await setDoc(doc(db, `competitions/${competition.id}/rounds/${round.id}`), { status }, { merge: true });
    showToast(`Round ${round.roundNumber} ${status}`);
  };

  const settleRound = async (round) => {
    setSettlingId(round.id);
    try {
      const res = await fetch("/api/settle-round", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitionId: competition.id, roundId: round.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Settle failed");
      showToast(data.message);
    } catch (e) {
      showToast(e.message);
    } finally {
      setSettlingId(null);
    }
  };

  const handleUndo = async (round) => {
    await undoRound(competition.id, round);
    showToast(`Round ${round.roundNumber} undone`);
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
          <div key={r.id} style={{ borderBottom: "1px solid rgba(255,255,255,.06)", paddingBottom: 8, marginBottom: 8 }}>
            <div className="mem-row" style={{ borderBottom: "none", paddingBottom: 0 }}>
              <div className="mem-l">
                <div>
                  <div className="mem-name">Round {r.roundNumber}</div>
                  <div className="mem-sub">{r.status} · deadline {fmtDeadline(r.deadline)}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {r.status !== "open" && r.status !== "closed" && r.status !== "settled" &&
                  <button className="btn btn-sm btn-g" onClick={() => setStatus(r, "open")}>Open</button>}
                {r.status === "open" &&
                  <button className="btn btn-sm btn-d" onClick={() => setStatus(r, "closed")}>Close</button>}
                {r.status === "closed" &&
                  <button className="btn btn-sm btn-g" disabled={settlingId === r.id} onClick={() => settleRound(r)}>
                    {settlingId === r.id ? "Settling…" : "Settle Results"}
                  </button>}
                {r.status === "settled" &&
                  <>
                    <span className="badge b-admin">settled</span>
                    <button className="btn btn-sm btn-d" onClick={() => handleUndo(r)}>Undo</button>
                  </>}
              </div>
            </div>
            {(r.status === "closed" || r.status === "settled") &&
              <AmendPanel competitionId={competition.id} round={r} showToast={showToast} />}
          </div>
        ))}
    </div>
  );
}

// ─── PLAYERS CARD (Admin) ───────────────────────────────────────────
// A "player" doc under the active competition is that member's status
// for THIS competition only (paid/active/suspended, alive, teamsUsed).
// It's created pending as soon as a member exists and a competition is
// active — either when the competition is created (for everyone already
// on the roster) or when a new member is added mid-competition.
function playerStatusLabel(p) {
  if (!p) return "no competition";
  if (p.suspended) return "suspended";
  if (p.active) return "active";
  return "pending";
}

function PlayersCard({ members, players, activeCompetition, showToast }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [removingId, setRemovingId] = useState(null);

  const playerFor = (memberId) => players.find(p => p.id === memberId);

  const addMember = async () => {
    if (!name.trim()) { showToast("Enter a name"); return; }
    if (!/^\d{4}$/.test(pin)) { showToast("PIN must be 4 digits"); return; }
    const memberRef = await addDoc(collection(db, "members"), {
      name: name.trim(), pin, role: "player",
    });
    if (activeCompetition) {
      await setDoc(doc(db, `competitions/${activeCompetition.id}/players/${memberRef.id}`), {
        paid: false, active: false, suspended: false, alive: true, teamsUsed: [],
      });
    }
    setName(""); setPin("");
    showToast(`${name.trim()} added`);
  };

  const activate = async (memberId) => {
    if (!activeCompetition) return;
    await setDoc(doc(db, `competitions/${activeCompetition.id}/players/${memberId}`), {
      paid: true, active: true, suspended: false,
    }, { merge: true });
    showToast("Player activated");
  };

  const suspend = async (memberId) => {
    if (!activeCompetition) return;
    await setDoc(doc(db, `competitions/${activeCompetition.id}/players/${memberId}`), {
      active: false, suspended: true,
    }, { merge: true });
    showToast("Player suspended");
  };

  // Removes the member entirely -- cleans up their player doc in every
  // competition they're part of (not just the active one, so past
  // competitions don't keep an orphaned reference), then deletes the
  // member record itself. Their pick history stays in place under each
  // round (it's keyed by memberId, not a live reference), it just won't
  // have a name to show against it any more.
  const removeMember = async (memberId, memberName) => {
    const compsSnap = await getDocs(collection(db, "competitions"));
    for (const c of compsSnap.docs) {
      const playerRef = doc(db, `competitions/${c.id}/players/${memberId}`);
      const playerSnap = await getDoc(playerRef);
      if (playerSnap.exists()) await deleteDoc(playerRef);
    }
    await deleteDoc(doc(db, "members", memberId));
    setRemovingId(null);
    showToast(`${memberName} removed`);
  };

  const roster = members.filter(m => m.role !== "admin");

  return (
    <div className="card">
      <div className="ch">Add a Player</div>
      <input className="fi" placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
      <input className="fi" placeholder="4-digit starting PIN" inputMode="numeric" maxLength={4}
        value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))} />
      <button className="btn btn-g" onClick={addMember}>Add Player</button>

      <div className="ch" style={{ marginTop: 20 }}>Players{activeCompetition ? ` — ${activeCompetition.name}` : ""}</div>
      {roster.length === 0
        ? <div className="es" style={{ color: "var(--mist)" }}>No players yet — add one above.</div>
        : roster.map(m => {
          const p = playerFor(m.id);
          const status = playerStatusLabel(p);
          const confirming = removingId === m.id;
          return (
            <div key={m.id} className="mem-row">
              <div className="mem-l">
                <div className="mem-av">{mkInitials(m.name)}</div>
                <div>
                  <div className="mem-name">{m.name}</div>
                  <div className="mem-sub">{confirming ? "Remove permanently?" : status}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {confirming ? (
                  <>
                    <button className="btn btn-sm btn-gh" onClick={() => setRemovingId(null)}>Cancel</button>
                    <button className="btn btn-sm btn-d" onClick={() => removeMember(m.id, m.name)}>Confirm</button>
                  </>
                ) : (
                  <>
                    {activeCompetition && status !== "active" &&
                      <button className="btn btn-sm btn-g" onClick={() => activate(m.id)}>Activate</button>}
                    {activeCompetition && status === "active" &&
                      <button className="btn btn-sm btn-d" onClick={() => suspend(m.id)}>Suspend</button>}
                    <button className="btn btn-sm btn-gh" onClick={() => setRemovingId(m.id)}>Remove</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
    </div>
  );
}

// Creates a competition and enrolls every existing (non-admin) member as a
// pending player in it. Shared by "Start a New Competition" and rollover,
// since a rollover is just this plus carrying the old pot forward.
async function startCompetition(name, members, startingJackpot = 0) {
  const compRef = await addDoc(collection(db, "competitions"), {
    name: name.trim(),
    status: "active",
    jackpot: startingJackpot,
    createdAt: serverTimestamp(),
  });
  const batch = writeBatch(db);
  members.filter(m => m.role !== "admin").forEach(m => {
    batch.set(doc(db, `competitions/${compRef.id}/players/${m.id}`), {
      paid: false, active: false, suspended: false, alive: true, teamsUsed: [],
    });
  });
  await batch.commit();
  return compRef.id;
}

// ─── RESOLUTION CARD (Admin) ────────────────────────────────────────
// Shown when a round settlement has left the competition without a clean
// single winner: either everyone left standing was eliminated together, or
// the season ran out of fixtures with multiple players still alive.
function ResolutionCard({ competition, members, players, showToast }) {
  const [busy, setBusy] = useState(false);
  if (!competition?.needsResolution) return null;

  const activePlayers = players.filter(p => p.active && !p.suspended);
  const pot = (competition.jackpot || 0) + activePlayers.length * ENTRY_FEE;
  const candidateNames = (competition.resolutionCandidates || [])
    .map(id => members.find(m => m.id === id)?.name || "Unknown")
    .join(", ");
  const reasonText = competition.resolutionReason === "all-eliminated"
    ? "Everyone left standing was eliminated in the same round."
    : "The season ran out of fixtures with more than one player still alive.";

  const rollOver = async () => {
    setBusy(true);
    try {
      await setDoc(doc(db, `competitions/${competition.id}`), { status: "completed", needsResolution: false }, { merge: true });
      const newName = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
      await startCompetition(newName, members, pot);
      showToast(`Rolled over — £${pot} carries into "${newName}"`);
    } finally {
      setBusy(false);
    }
  };

  const splitPot = async () => {
    setBusy(true);
    try {
      await setDoc(doc(db, `competitions/${competition.id}`), {
        status: "completed", needsResolution: false,
        splitWinners: competition.resolutionCandidates || [], splitAmount: pot,
      }, { merge: true });
      showToast(`£${pot} split between ${candidateNames}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ borderColor: "rgba(253,224,0,.4)", background: "rgba(253,224,0,.06)" }}>
      <div className="ch">⚠️ Competition Needs Resolving</div>
      <div className="es" style={{ color: "var(--chalk)", marginBottom: 6 }}>{reasonText}</div>
      <div className="es" style={{ color: "var(--mist)", marginBottom: 14 }}>
        Candidates: <strong style={{ color: "var(--chalk)" }}>{candidateNames || "none"}</strong> · Pot: <strong style={{ color: "var(--chalk)" }}>£{pot}</strong>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-g" style={{ flex: 1 }} disabled={busy} onClick={rollOver}>Roll Over</button>
        <button className="btn btn-d" style={{ flex: 1 }} disabled={busy} onClick={splitPot}>Split Pot</button>
      </div>
    </div>
  );
}

// ─── SHARE CARD (Admin) ─────────────────────────────────────────────
// Uses WhatsApp's own click-to-chat link (wa.me/?text=...) rather than any
// API integration -- there isn't a legitimate way to auto-post into a
// WhatsApp group (the official Business API only supports 1:1 messages,
// never groups). This opens WhatsApp with the message pre-filled; the
// Admin picks the group themselves and hits send. One tap, zero setup,
// nothing that can get an account banned.
function buildSuggestedMessage(competition, rounds, players, members) {
  if (!competition) return "Last Man Standing is starting soon — stay tuned!";
  const nameFor = (id) => members.find(m => m.id === id)?.name || "Unknown";
  const activePlayers = players.filter(p => p.active && !p.suspended);
  const pot = (competition.jackpot || 0) + activePlayers.length * ENTRY_FEE;

  if (competition.status === "completed") {
    if (competition.winner) return `🏆 ${nameFor(competition.winner)} has won the Last Man Standing pot of £${pot}!`;
    if (competition.splitWinners) return `The £${competition.splitAmount || pot} pot has been split between ${competition.splitWinners.map(nameFor).join(", ")}.`;
    return `${competition.name} has ended.`;
  }

  const openRound = rounds.find(r => r.status === "open");
  if (openRound) return `⚽ Round ${openRound.roundNumber} is open! Get your Last Man Standing pick in before kickoff.`;

  const lastRound = rounds[rounds.length - 1];
  if (lastRound?.status === "settled") {
    const eliminated = activePlayers.filter(p => !p.alive);
    const alive = activePlayers.filter(p => p.alive);
    const elimText = eliminated.length ? `${eliminated.map(p => nameFor(p.id)).join(", ")} eliminated.` : "No eliminations this round.";
    return `Round ${lastRound.roundNumber} results are in. ${elimText} ${alive.length} player${alive.length === 1 ? "" : "s"} remain — pot is now £${pot}.`;
  }
  if (lastRound?.status === "closed") return `Round ${lastRound.roundNumber} picks are locked — results coming soon!`;

  return `Last Man Standing — ${competition.name} is underway. Pot currently at £${pot}.`;
}

function ShareCard({ competition, rounds, players, members }) {
  const suggested = buildSuggestedMessage(competition, rounds, players, members);
  const [message, setMessage] = useState(suggested);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setMessage(suggested);
  }, [suggested, dirty]);

  const shareUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

  return (
    <div className="card">
      <div className="ch">Share Update to WhatsApp</div>
      <textarea
        className="fi"
        rows={4}
        value={message}
        onChange={e => { setMessage(e.target.value); setDirty(true); }}
        style={{ resize: "vertical", fontFamily: "'Outfit',sans-serif", lineHeight: 1.5 }}
      />
      <a className="btn btn-g" href={shareUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
        Share to WhatsApp
      </a>
    </div>
  );
}

// ─── ADMIN TAB ──────────────────────────────────────────────────────
// Deletes every competition and everything under it (players, rounds,
// fixtures, picks) but leaves the /members collection completely alone --
// player identities (name/PIN/role) are meant to persist across
// competitions, so a "start again" shouldn't force re-adding everyone.
// Deliberately separate from scripts/reset-data.js, which is the heavier
// CLI-only tool that also wipes members.
async function clearAllCompetitions() {
  const compsSnap = await getDocs(collection(db, "competitions"));
  for (const compDoc of compsSnap.docs) {
    const compId = compDoc.id;
    const roundsSnap = await getDocs(collection(db, `competitions/${compId}/rounds`));
    for (const roundDoc of roundsSnap.docs) {
      const fixturesSnap = await getDocs(collection(db, `competitions/${compId}/rounds/${roundDoc.id}/fixtures`));
      for (const f of fixturesSnap.docs) await deleteDoc(f.ref);
      const picksSnap = await getDocs(collection(db, `competitions/${compId}/rounds/${roundDoc.id}/picks`));
      for (const p of picksSnap.docs) await deleteDoc(p.ref);
      await deleteDoc(roundDoc.ref);
    }
    const playersSnap = await getDocs(collection(db, `competitions/${compId}/players`));
    for (const p of playersSnap.docs) await deleteDoc(p.ref);
    await deleteDoc(compDoc.ref);
  }
  return compsSnap.docs.length;
}

function DangerZoneCard({ showToast }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const count = await clearAllCompetitions();
      showToast(`Cleared ${count} competition${count === 1 ? "" : "s"} — players untouched`);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ borderColor: "rgba(234,2,26,.3)" }}>
      <div className="ch">Danger Zone</div>
      {!confirming ? (
        <button className="btn btn-d" onClick={() => setConfirming(true)}>Clear All Competition Data</button>
      ) : (
        <>
          <div className="es" style={{ color: "var(--chalk)", marginBottom: 12 }}>
            This deletes every competition, round, fixture and pick — permanently. Members (names/PINs) are kept. Are you sure?
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-gh" style={{ flex: 1 }} disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
            <button className="btn btn-d" style={{ flex: 1 }} disabled={busy} onClick={run}>
              {busy ? "Clearing…" : "Yes, Clear It"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── ADMIN TAB ──────────────────────────────────────────────────────
function AdminTab({ members, competitions, activeCompetition, rounds, players, showToast }) {
  const [section, setSection] = useState("fixtures");
  const [name, setName] = useState("");

  const createCompetition = async () => {
    if (!name.trim()) { showToast("Give the competition a name"); return; }
    await startCompetition(name, members);
    setName("");
    showToast("Competition created");
  };

  return (
    <div className="fade-in">
      <div className="tabs">
        <div className={`tab ${section === "fixtures" ? "on" : ""}`} onClick={() => setSection("fixtures")}>Fixtures</div>
        <div className={`tab ${section === "competition" ? "on" : ""}`} onClick={() => setSection("competition")}>Competition</div>
        <div className={`tab ${section === "users" ? "on" : ""}`} onClick={() => setSection("users")}>Users</div>
      </div>

      {section === "fixtures" && (
        <>
          <RoundsCard competition={activeCompetition} rounds={rounds} showToast={showToast} />
          {activeCompetition && <ShareCard competition={activeCompetition} rounds={rounds} players={players} members={members} />}
          {!activeCompetition && (
            <div className="empty">
              <div className="ei">📋</div>
              <div className="et">No active competition</div>
              <div className="es">Start one from the Competition tab first.</div>
            </div>
          )}
        </>
      )}

      {section === "competition" && (
        <>
          <ResolutionCard competition={activeCompetition} members={members} players={players} showToast={showToast} />

          <div className="card">
            <div className="ch">Start a New Competition</div>
            <input className="fi" placeholder="e.g. 22nd August 2026" value={name} onChange={e => setName(e.target.value)} />
            <button className="btn btn-g" onClick={createCompetition}>Create</button>
          </div>

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

          <DangerZoneCard showToast={showToast} />
        </>
      )}

      {section === "users" && (
        <PlayersCard members={members} players={players} activeCompetition={activeCompetition} showToast={showToast} />
      )}
    </div>
  );
}

// ─── ACCOUNT TAB ────────────────────────────────────────────────────
function AccountTab({ user, members, setUser, showToast }) {
  const [changing, setChanging] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setChanging(false); setCurrent(""); setNext(""); setConfirm(""); };

  const savePin = async () => {
    const me = members.find(m => m.id === user.id);
    if (String(me?.pin) !== current) { showToast("Current PIN is wrong"); return; }
    if (!/^\d{4}$/.test(next)) { showToast("New PIN must be 4 digits"); return; }
    if (next !== confirm) { showToast("New PINs don't match"); return; }
    setSaving(true);
    try {
      await setDoc(doc(db, "members", user.id), { pin: next }, { merge: true });
      showToast("PIN changed");
      reset();
    } finally {
      setSaving(false);
    }
  };

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

      {!changing ? (
        <>
          <button className="btn btn-gh" style={{ marginTop: 14 }} onClick={() => setChanging(true)}>Change PIN</button>
          <button className="btn btn-d" style={{ marginTop: 8 }} onClick={() => setUser(null)}>Log Out</button>
        </>
      ) : (
        <div style={{ marginTop: 14 }}>
          <input className="fi" type="password" inputMode="numeric" maxLength={4} placeholder="Current PIN"
            value={current} onChange={e => setCurrent(e.target.value.replace(/\D/g, ""))} />
          <input className="fi" type="password" inputMode="numeric" maxLength={4} placeholder="New PIN"
            value={next} onChange={e => setNext(e.target.value.replace(/\D/g, ""))} />
          <input className="fi" type="password" inputMode="numeric" maxLength={4} placeholder="Confirm new PIN"
            value={confirm} onChange={e => setConfirm(e.target.value.replace(/\D/g, ""))} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-gh" style={{ flex: 1 }} disabled={saving} onClick={reset}>Cancel</button>
            <button className="btn btn-g" style={{ flex: 1 }} disabled={saving} onClick={savePin}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
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
  const [players, setPlayers] = useState([]);
  const [fixtures, setFixtures] = useState([]);
  const [picks, setPicks] = useState([]);

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

  // Rounds and players both live under the active competition, so both
  // listeners re-subscribe whenever which competition is active changes
  // (including on rollover).
  useEffect(() => {
    if (!activeCompetitionId) { setRounds([]); return; }
    const u = onSnapshot(
      query(collection(db, `competitions/${activeCompetitionId}/rounds`), orderBy("roundNumber", "asc")),
      s => setRounds(s.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => u();
  }, [activeCompetitionId]);

  useEffect(() => {
    if (!activeCompetitionId) { setPlayers([]); return; }
    const u = onSnapshot(
      collection(db, `competitions/${activeCompetitionId}/players`),
      s => setPlayers(s.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => u();
  }, [activeCompetitionId]);

  // "Current" round = whichever is open, or failing that the most recent
  // one (so the Round tab still has something to show once a round closes,
  // right up until the next round opens). Pick tab only ever acts on a
  // genuinely *open* round — see openRound below.
  const currentRoundId = rounds.find(r => r.status === "open")?.id || rounds[rounds.length - 1]?.id || null;

  // Fixtures and picks both live under the current round, so both
  // re-subscribe whenever which round is current changes.
  useEffect(() => {
    if (!activeCompetitionId || !currentRoundId) { setFixtures([]); return; }
    const u = onSnapshot(
      collection(db, `competitions/${activeCompetitionId}/rounds/${currentRoundId}/fixtures`),
      s => setFixtures(s.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => u();
  }, [activeCompetitionId, currentRoundId]);

  useEffect(() => {
    if (!activeCompetitionId || !currentRoundId) { setPicks([]); return; }
    const u = onSnapshot(
      collection(db, `competitions/${activeCompetitionId}/rounds/${currentRoundId}/picks`),
      s => setPicks(s.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => u();
  }, [activeCompetitionId, currentRoundId]);

  if (loading) return (<><style>{CSS}</style><div className="loading"><div className="spin" /><span>Loading…</span></div></>);
  if (!user) return (<><style>{CSS}</style><LoginScreen members={members} onLogin={setUser} /></>);

  const activeCompetition = competitions.find(c => c.status === "active");
  // Standings falls back to the most recently finished competition (to show
  // a winner/split banner) when there's no active one — e.g. right after a
  // clean winner is declared, before the Admin starts anything new.
  const displayCompetition = activeCompetition || competitions[0] || null;
  const currentRound = rounds.find(r => r.id === currentRoundId) || null;
  const openRound = currentRound?.status === "open" ? currentRound : null;
  const myPlayer = players.find(p => p.id === user.id) || null;
  const myPick = picks.find(p => p.id === user.id) || null;

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
          {tab === "standings" && <StandingsTab competition={displayCompetition} players={players} members={members} />}
          {tab === "pick" && <PickTab competition={activeCompetition} openRound={openRound} fixtures={fixtures} myPlayer={myPlayer} myPick={myPick} user={user} showToast={showToast} />}
          {tab === "round" && <RoundTab competition={activeCompetition} round={currentRound} players={players} picks={picks} members={members} isAdmin={user.role === "admin"} />}
          {tab === "grid" && <GridTab competition={activeCompetition} rounds={rounds} players={players} members={members} isAdmin={user.role === "admin"} />}
          {tab === "account" && <AccountTab user={user} members={members} setUser={setUser} showToast={showToast} />}
          {tab === "admin" && user.role === "admin" && <AdminTab members={members} competitions={competitions} activeCompetition={activeCompetition} rounds={rounds} players={players} showToast={showToast} />}
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
