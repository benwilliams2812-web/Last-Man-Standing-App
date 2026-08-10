// api/import-round.js
// Imports one Premier League matchday as a new round for a competition.
//
// Called by the Admin tab's "Import Next Round" button:
//   POST /api/import-round   { competitionId, matchday }
//
// Round = one PL matchday's 10 fixtures. Re-running for the same matchday
// is safe — fixtures are keyed by football-data.org's match id, so it
// overwrites rather than duplicates.
//
// Uses the plain Firebase client SDK (same as the rest of the app) rather
// than firebase-admin, since Firestore rules are already open — see
// design doc Section 9. If that ever changes, this needs a service
// account instead.

const { initializeApp, getApps } = require("firebase/app");
const {
  getFirestore, collection, doc, setDoc, getDocs, serverTimestamp,
} = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyDeXliGWYCWDVwZZPSnkxcr7AVOSnC_rX4",
  authDomain: "last-man-standing-app-4ddc8.firebaseapp.com",
  projectId: "last-man-standing-app-4ddc8",
  storageBucket: "last-man-standing-app-4ddc8.firebasestorage.app",
  messagingSenderId: "419724139136",
  appId: "1:419724139136:web:cb9c49b200454f9625a465",
};

function getDb() {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  return getFirestore(app);
}

async function fetchMatchday(matchday) {
  const apiKey = process.env.FOOTBALL_DAT_API_KEY;
  if (!apiKey) throw Object.assign(new Error("FOOTBALL_DAT_API_KEY not configured"), { status: 500 });

  const res = await fetch(
    `https://api.football-data.org/v4/competitions/PL/matches?matchday=${matchday}`,
    { headers: { "X-Auth-Token": apiKey } }
  );

  // football-data.org's free tier is rate-limited — surface a clear error
  // rather than a generic failure if we've been throttled.
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

  const { competitionId, matchday } = req.body || {};
  if (!competitionId || !matchday) {
    return res.status(400).json({ error: "competitionId and matchday are required" });
  }

  try {
    const matches = await fetchMatchday(matchday);
    if (!matches.length) {
      return res.status(200).json({ message: `No fixtures found for matchday ${matchday}`, fixtures: 0 });
    }

    const db = getDb();
    const roundId = `round-${matchday}`;
    const roundRef = doc(db, `competitions/${competitionId}/rounds/${roundId}`);

    const kickoffs = matches.map(m => m.utcDate).sort();

    await setDoc(roundRef, {
      roundNumber: matchday,
      matchday,
      status: "pending",
      deadline: kickoffs[0],
      createdAt: serverTimestamp(),
    }, { merge: true });

    const fixturesCol = collection(db, `competitions/${competitionId}/rounds/${roundId}/fixtures`);
    for (const m of matches) {
      await setDoc(doc(fixturesCol, String(m.id)), {
        home: m.homeTeam.shortName || m.homeTeam.name,
        away: m.awayTeam.shortName || m.awayTeam.name,
        homeFull: m.homeTeam.name,
        awayFull: m.awayTeam.name,
        kickoff: m.utcDate,
        status: m.status,
        result: null, // 'home' | 'away' | 'draw', filled in once played
      });
    }

    return res.status(200).json({
      message: `Imported ${matches.length} fixtures for round ${matchday}`,
      roundId,
      fixtures: matches.length,
      deadline: kickoffs[0],
    });
  } catch (err) {
    console.error("import-round error:", err);
    return res.status(err.status || 500).json({ error: err.message });
  }
};
