import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// TODO: Replace the following with your app's Firebase project configuration
// You can get this from the Firebase Console -> Project Settings -> General -> Your apps
const firebaseConfig = {
  apiKey: "AIzaSyAoUYFUhruDYbLKy48K8_Heq7inZK2Z1a4",
  authDomain: "cantonese-ai-transcriber.firebaseapp.com",
  projectId: "cantonese-ai-transcriber",
  storageBucket: "cantonese-ai-transcriber.firebasestorage.app",
  messagingSenderId: "651835686698",
  appId: "1:651835686698:web:7f8202429b235663ab6853",
  measurementId: "G-W10G8ZE8WT"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
export const auth = getAuth(app);

// Connect to the specific named database provided by the user: "cantonese-aitranscriber"
// Note: This must match exactly the Database ID in Firebase Console -> Firestore
export const db = getFirestore(app, "cantonese-aitranscriber");

export default app;