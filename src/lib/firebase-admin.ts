import { cert, getApps, initializeApp } from "firebase-admin/app";
import { Firestore, getFirestore } from "firebase-admin/firestore";
import { requiredEnv } from "./env";

const globalForFirestore = globalThis as typeof globalThis & {
  firestoreDb?: Firestore;
};

export function getDb(): Firestore {
  if (globalForFirestore.firestoreDb) {
    return globalForFirestore.firestoreDb;
  }

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: requiredEnv("FIREBASE_PROJECT_ID"),
        clientEmail: requiredEnv("FIREBASE_CLIENT_EMAIL"),
        privateKey: requiredEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n")
      })
    });
  }

  const db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });
  globalForFirestore.firestoreDb = db;
  return db;
}
