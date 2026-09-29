import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cert: vi.fn(),
  getApps: vi.fn(),
  initializeApp: vi.fn(),
  getFirestore: vi.fn(),
  requiredEnv: vi.fn(),
  settings: vi.fn()
}));

vi.mock("firebase-admin/app", () => ({
  cert: mocks.cert,
  getApps: mocks.getApps,
  initializeApp: mocks.initializeApp
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: mocks.getFirestore
}));

vi.mock("./env", () => ({
  requiredEnv: mocks.requiredEnv
}));

const values = {
  FIREBASE_PROJECT_ID: "test-project",
  FIREBASE_CLIENT_EMAIL: "firebase-admin@example.test",
  FIREBASE_PRIVATE_KEY: "line-one\\nline-two"
};

const globalForTest = globalThis as typeof globalThis & { firestoreDb?: unknown };

describe("Firebase Admin initialization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete globalForTest.firestoreDb;
    mocks.getApps.mockReturnValue([]);
    mocks.cert.mockReturnValue({ testCredential: true });
    mocks.getFirestore.mockReturnValue({ settings: mocks.settings });
    mocks.requiredEnv.mockImplementation((name: keyof typeof values) => values[name]);
  });

  afterEach(() => {
    delete globalForTest.firestoreDb;
  });

  it("normalizes the private key and initializes and configures Firestore only once", async () => {
    const { getDb } = await import("./firebase-admin");

    const firstResult = getDb();
    const secondResult = getDb();

    expect(mocks.cert).toHaveBeenCalledWith({
      projectId: "test-project",
      clientEmail: "firebase-admin@example.test",
      privateKey: "line-one\nline-two"
    });
    expect(mocks.initializeApp).toHaveBeenCalledOnce();
    expect(mocks.initializeApp).toHaveBeenCalledWith({ credential: { testCredential: true } });
    expect(mocks.getFirestore).toHaveBeenCalledOnce();
    expect(mocks.settings).toHaveBeenCalledWith({ ignoreUndefinedProperties: true });
    expect(mocks.settings).toHaveBeenCalledOnce();
    expect(secondResult).toBe(firstResult);
  });

  it("reuses an initialized default app while configuring Firestore", async () => {
    mocks.getApps.mockReturnValue([{ name: "[DEFAULT]" }]);
    const { getDb } = await import("./firebase-admin");

    getDb();

    expect(mocks.initializeApp).not.toHaveBeenCalled();
    expect(mocks.cert).not.toHaveBeenCalled();
    expect(mocks.requiredEnv).not.toHaveBeenCalled();
    expect(mocks.getFirestore).toHaveBeenCalledOnce();
    expect(mocks.settings).toHaveBeenCalledOnce();
    expect(mocks.settings).toHaveBeenCalledWith({ ignoreUndefinedProperties: true });
  });
});
