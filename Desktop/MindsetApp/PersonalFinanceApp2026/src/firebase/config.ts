import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyAB6qpHripNYmpRbXRDKzz0QHkhEd_OEvY",
    authDomain: "personalfin-69d1b.firebaseapp.com",
    projectId: "personalfin-69d1b",
    storageBucket: "personalfin-69d1b.firebasestorage.app",
    messagingSenderId: "538208669749",
    appId: "1:538208669749:web:e0b4b7890e32b1ad25217c",
    measurementId: "G-1E8ZJG6T07"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
export const auth = getAuth(app);
export const db = getFirestore(app); // Note: We might need to rename this or alias it to avoid conflict with Dexie 'db' import elsewhere

export default app;
