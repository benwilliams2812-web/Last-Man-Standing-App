// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDeXliGWYCWDVwZZPSnkxcr7AVOSnC_rX4",
  authDomain: "last-man-standing-app-4ddc8.firebaseapp.com",
  projectId: "last-man-standing-app-4ddc8",
  storageBucket: "last-man-standing-app-4ddc8.firebasestorage.app",
  messagingSenderId: "419724139136",
  appId: "1:419724139136:web:cb9c49b200454f9625a465"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
