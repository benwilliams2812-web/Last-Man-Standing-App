// src/firebase.js
// ─────────────────────────────────────────────────────────────────
// STEP 1: Create a Firebase project at https://console.firebase.google.com
//         → Add a Web App → copy its config here.
// STEP 2: Enable Firestore (Build → Firestore Database → Create database).
// ─────────────────────────────────────────────────────────────────

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.firebasestorage.app",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
