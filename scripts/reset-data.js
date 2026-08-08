#!/usr/bin/env node
// scripts/reset-data.js
//
// Wipes ALL Last Man Standing data from the live Firestore project and
// re-seeds a fresh Admin account. There is no separate test/dev project —
// this hits the same database the app talks to — so use it deliberately.
//
// Usage:
//   node scripts/reset-data.js            (asks for confirmation first)
//   node scripts/reset-data.js --force    (skips the confirmation prompt)

const readline = require("readline");
const { initializeApp } = require("firebase/app");
const {
  getFirestore, collection, getDocs, deleteDoc, doc, setDoc,
} = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyDeXliGWYCWDVwZZPSnkxcr7AVOSnC_rX4",
  authDomain: "last-man-standing-app-4ddc8.firebaseapp.com",
  projectId: "last-man-standing-app-4ddc8",
  storageBucket: "last-man-standing-app-4ddc8.firebasestorage.app",
  messagingSenderId: "419724139136",
  appId: "1:419724139136:web:cb9c49b200454f9625a465",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Matches the data model in the design doc — kept here even though the
// app doesn't create rounds/fixtures/picks yet, so this script doesn't
// need updating the moment those tabs are built.
const ROUND_SUBCOLLECTIONS = ["fixtures", "picks"];

async function deleteCollection(path) {
  const snap = await getDocs(collection(db, path));
  for (const d of snap.docs) await deleteDoc(d.ref);
  return snap.docs.length;
}

async function wipeCompetitions() {
  const snap = await getDocs(collection(db, "competitions"));
  let count = 0;
  for (const compDoc of snap.docs) {
    const compPath = `competitions/${compDoc.id}`;

    const roundsSnap = await getDocs(collection(db, `${compPath}/rounds`));
    for (const roundDoc of roundsSnap.docs) {
      const roundPath = `${compPath}/rounds/${roundDoc.id}`;
      for (const sub of ROUND_SUBCOLLECTIONS) {
        await deleteCollection(`${roundPath}/${sub}`);
      }
      await deleteDoc(roundDoc.ref);
    }

    await deleteCollection(`${compPath}/players`);
    await deleteDoc(compDoc.ref);
    count++;
  }
  return count;
}

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "yes");
    });
  });
}

(async () => {
  const force = process.argv.includes("--force");

  console.log(`This will permanently delete ALL data in Firebase project "${firebaseConfig.projectId}":`);
  console.log("  - every member");
  console.log("  - every competition, its players, rounds, fixtures and picks");
  console.log("A fresh Admin account (PIN 1234) will be re-seeded afterwards.\n");

  if (!force) {
    const ok = await confirm('Type "yes" to continue: ');
    if (!ok) {
      console.log("Cancelled — nothing was deleted.");
      process.exit(0);
    }
  }

  const competitionsDeleted = await wipeCompetitions();
  const membersDeleted = await deleteCollection("members");

  await setDoc(doc(db, "members", "admin"), {
    name: "Admin", pin: "1234", role: "admin",
  });

  console.log(`\nDone. Deleted ${membersDeleted} member(s) and ${competitionsDeleted} competition(s).`);
  console.log('Re-seeded a fresh Admin account — log in with name "Admin", PIN 1234.');
  process.exit(0);
})();
