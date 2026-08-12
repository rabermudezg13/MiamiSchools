import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB3wJ2GuBuatp6hmpUzhsUDvJFQn25CmNo",
  authDomain: "miami-schools.firebaseapp.com",
  projectId: "miami-schools",
  storageBucket: "miami-schools.firebasestorage.app",
  messagingSenderId: "1011316740701",
  appId: "1:1011316740701:web:1a35c25cefd4a8dc0433b4",
  measurementId: "G-8LEQCJJNXN"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
