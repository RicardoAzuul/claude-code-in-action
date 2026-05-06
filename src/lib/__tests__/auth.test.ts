/**
 * @vitest-environment node
 */
import { test, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Use vi.hoisted to create mocks outside of vi.mock factories
const { mockSignJWT, mockSignJWTInstance, mockCookies, mockCookieStore } =
  vi.hoisted(() => {
    const instance = {
      setProtectedHeader: vi.fn().mockReturnThis(),
      setExpirationTime: vi.fn().mockReturnThis(),
      setIssuedAt: vi.fn().mockReturnThis(),
      sign: vi.fn().mockResolvedValue("mock-token"),
    };

    const signJWT = vi.fn(() => instance);
    const store = { set: vi.fn() };
    const cookies = vi.fn(() => Promise.resolve(store));

    return {
      mockSignJWT: signJWT,
      mockSignJWTInstance: instance,
      mockCookies: cookies,
      mockCookieStore: store,
    };
  });

vi.mock("jose", () => ({
  SignJWT: mockSignJWT,
}));

vi.mock("next/headers", () => ({
  cookies: mockCookies,
}));

import { createSession } from "@/lib/auth";

beforeEach(() => {
  vi.clearAllMocks();
});

test("creates a session with valid userId and email", async () => {
  const userId = "user-123";
  const email = "user@example.com";

  await createSession(userId, email);

  expect(mockSignJWT).toHaveBeenCalledWith(
    expect.objectContaining({
      userId,
      email,
      expiresAt: expect.any(Date),
    })
  );
});

test("sets correct JWT header and expiration", async () => {
  await createSession("user-123", "user@example.com");

  expect(mockSignJWTInstance.setProtectedHeader).toHaveBeenCalledWith({
    alg: "HS256",
  });
  expect(mockSignJWTInstance.setExpirationTime).toHaveBeenCalledWith("7d");
  expect(mockSignJWTInstance.setIssuedAt).toHaveBeenCalled();
});

test("sets httpOnly cookie with correct options in production", async () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  await createSession("user-123", "user@example.com");

  expect(mockCookieStore.set).toHaveBeenCalledWith(
    "auth-token",
    "mock-token",
    expect.objectContaining({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: expect.any(Date),
    })
  );

  process.env.NODE_ENV = originalEnv;
});

test("sets httpOnly cookie with secure false in development", async () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  await createSession("user-123", "user@example.com");

  expect(mockCookieStore.set).toHaveBeenCalledWith(
    "auth-token",
    "mock-token",
    expect.objectContaining({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      expires: expect.any(Date),
    })
  );

  process.env.NODE_ENV = originalEnv;
});

test("sets expiration to approximately 7 days from now", async () => {
  const beforeTime = Date.now();

  await createSession("user-123", "user@example.com");

  const callArgs = mockSignJWT.mock.calls[0][0];
  const expiresAt = new Date(callArgs.expiresAt).getTime();

  const expectedExpiry = 7 * 24 * 60 * 60 * 1000;
  const actualExpiry = expiresAt - beforeTime;

  expect(actualExpiry).toBeGreaterThan(expectedExpiry - 1000);
  expect(actualExpiry).toBeLessThan(expectedExpiry + 1000);
});
