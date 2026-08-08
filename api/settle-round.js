// api/settle-round.js
// Settles a round: pulls real results for its fixtures from football-data.org,
// works out win/eliminated for every pick, and updates each player's alive
// status and teamsUsed. Safe to call more than once — fixtures that haven't
// finished yet are simply left alone (partial settlement), and a round only
// flips to "settled" once every fixture has a final result.
//
// Called by the Admin tab's "Settle Results" button:
//   POST /api/settle-round   { competitionId, roundId }
//
// Undoing a settlement is handled client-side (src/App.js) since it's pure
// Firestore reads/writes with no external API involved — see RoundsCard's
// undoRound().

const { initializeApp, getApps } = require("firebase/app");
const {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, writeBatch,
} = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyDeXliGWYCWDVwZZPSnkxcr7AVOSnC_rX4",
  authDomain: "last-man-standing-app-4ddc8.firebaseapp.com",
  projectId: "last-man-standing-app-4ddc8",
  storageBucket: "last-man-standing-app-4ddc8.firebasestorage.app",
  messagingSenderId: "419724139136",
  appId: "1:419724139136:web:cb9c49b200454f9625a465",
};

// The Premier League's regular season is 38 matchdays. Used as a simple
// heuristic for "the season has run out of fixtures" when deciding whether
// a competition needs the Admin to roll over or split the pot.
const LAST_MATCHDAY = 38;

function getDb() {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  return getFirestore(app);
}

async function fetchMatchday(matchday) {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) throw Object.assign(new Error("FOOTBALL_DATA_API_KEY not configured"), { status: 500 });

  const res = await fetch(
    `https://api.football-data.org/v4/competitions/PL/matches?matchday=${matchday}`,
    { headers: { "X-Auth-Token": apiKey } }
  );

  const remaining = res.headers.get("x-requests-available-minute");
  if (remaining !== null && Number(remaining) <= 1) {
    console.warn(`football-data.org: only ${remaining} requests left this minute`);
  }
  if (res.status === 429) {
    const resetIn = res.headers.get("x-requestcounter-reset") || "60";
    throw Object.assign(new Error(`Rate limited by football-data.org — try again in ~${resetIn}s`), { status: 429 });
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw Object.assign(new Error(`football-data.org error ${res.status}: ${body}`), { status: res.status });
  }

  const data = await res.json();
  return data.matches || [];
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { competitionId, roundId } = req.body || {};
  if (!competitionId || !roundId) {
    return res.status(400).json({ error: "competitionId and roundId are required" });
  }

  try {
    const db = getDb();
    const roundRef = doc(db, `competitions/${competitionId}/rounds/${roundId}`);
    const roundSnap = await getDoc(roundRef);
    if (!roundSnap.exists()) return res.status(404).json({ error: "Round not found" });
    const round = roundSnap.data();
    if (round.status !== "closed" && round.status !== "settled") {
      return res.status(400).json({ error: `Round is "${round.status}" — close submissions before settling.` });
    }

    const fixturesSnap = await getDocs(collection(db, `competitions/${competitionId}/rounds/${roundId}/fixtures`));
    const fixtures = fixturesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const matches = await fetchMatchday(round.matchday);
    const matchById = new Map(matches.map(m => [String(m.id), m]));

    // Work out a result for every fixture that has actually finished.
    // Fixtures still SCHEDULED/IN_PLAY etc. are left null and skipped.
    const fixtureResults = {};
    let unfinished = 0;
    for (const f of fixtures) {
      const m = matchById.get(f.id);
      if (!m || m.status !== "FINISHED") { unfinished++; fixtureResults[f.id] = null; continue; }
      const { home, away } = m.score.fullTime;
      fixtureResults[f.id] = { result: home > away ? "home" : away > home ? "away" : "draw", home, away };
    }

    if (unfinished === fixtures.length) {
      return res.status(200).json({ message: "No fixtures have finished yet — nothing to settle." });
    }

    const picksSnap = await getDocs(collection(db, `competitions/${competitionId}/rounds/${roundId}/picks`));
    const playersSnap = await getDocs(collection(db, `competitions/${competitionId}/players`));
    const playersById = new Map(playersSnap.docs.map(d => [d.id, d.data()]));

    const batch = writeBatch(db);

    for (const f of fixtures) {
      const r = fixtureResults[f.id];
      if (!r) continue;
      batch.set(doc(db, `competitions/${competitionId}/rounds/${roundId}/fixtures/${f.id}`),
        { result: r.result, homeScore: r.home, awayScore: r.away }, { merge: true });
    }

    let settledCount = 0, skippedCount = 0;
    const wonIds = [], eliminatedIds = [];

    for (const pickDoc of picksSnap.docs) {
      const pick = pickDoc.data();
      const r = fixtureResults[pick.fixtureId];
      if (!r) { skippedCount++; continue; } // this pick's fixture hasn't finished yet

      const fixture = fixtures.find(f => f.id === pick.fixtureId);
      const pickedHome = pick.team === fixture.home;
      const won = (pickedHome && r.result === "home") || (!pickedHome && r.result === "away");
      const outcome = won ? "win" : "eliminated";

      batch.set(doc(db, `competitions/${competitionId}/rounds/${roundId}/picks/${pickDoc.id}`), { outcome }, { merge: true });

      const player = playersById.get(pickDoc.id) || {};
      const teamsUsed = new Set(player.teamsUsed || []);
      teamsUsed.add(pick.team);
      batch.set(doc(db, `competitions/${competitionId}/players/${pickDoc.id}`), {
        teamsUsed: [...teamsUsed],
        alive: won,
      }, { merge: true });

      settledCount++;
      (won ? wonIds : eliminatedIds).push(pickDoc.id);
    }

    const allFixturesFinished = unfinished === 0;
    batch.set(roundRef, {
      status: allFixturesFinished ? "settled" : "closed",
      settledAt: allFixturesFinished ? new Date().toISOString() : null,
    }, { merge: true });

    await batch.commit();

    let resolution = null;
    if (allFixturesFinished) {
      // Re-derive alive active players from what we just wrote, rather than
      // re-querying — playersById + this round's win/loss outcomes fully
      // determine current alive status for anyone who had a pick.
      const activePlayers = playersSnap.docs
        .map(d => ({ id: d.id, ...playersById.get(d.id) }))
        .filter(p => p.active && !p.suspended);
      const aliveIds = new Set(activePlayers.map(p => p.id).filter(id => !eliminatedIds.includes(id)));
      const aliveCount = aliveIds.size;

      if (aliveCount === 1) {
        const winnerId = [...aliveIds][0];
        await setDoc(doc(db, `competitions/${competitionId}`), {
          status: "completed", winner: winnerId, needsResolution: false,
        }, { merge: true });
        resolution = { type: "winner", winnerId };
      } else if (aliveCount === 0 && eliminatedIds.length > 0) {
        // Everyone left standing lost together this round — split/rollover
        // candidates are whoever was alive going into this round, i.e.
        // exactly the players this round just eliminated.
        await setDoc(doc(db, `competitions/${competitionId}`), {
          needsResolution: true, resolutionReason: "all-eliminated", resolutionCandidates: eliminatedIds,
        }, { merge: true });
        resolution = { type: "all-eliminated", candidates: eliminatedIds };
      } else if (round.matchday >= LAST_MATCHDAY && aliveCount > 1) {
        await setDoc(doc(db, `competitions/${competitionId}`), {
          needsResolution: true, resolutionReason: "season-ended", resolutionCandidates: [...aliveIds],
        }, { merge: true });
        resolution = { type: "season-ended", candidates: [...aliveIds] };
      }
    }

    return res.status(200).json({
      message: allFixturesFinished
        ? `Round settled: ${wonIds.length} survived, ${eliminatedIds.length} eliminated`
        : `Settled ${settledCount} picks, ${skippedCount} still waiting on unfinished fixtures`,
      settledCount, skippedCount, wonIds, eliminatedIds, resolution,
    });
  } catch (err) {
    console.error("settle-round error:", err);
    return res.status(err.status || 500).json({ error: err.message });
  }
};
