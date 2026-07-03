// Auth context: hydrates JWT from storage on mount, exposes user state + login/logout.
// Login calls user-api, stores access/refresh tokens, decodes the JWT for user info.

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, setOnSessionExpired } from "./api";
import { StorageKeys, storage } from "./storage";

interface AuthUser {
  userId: string;
  username: string;
  accessLevel: string;
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<RegisterResult>;
  logout: () => Promise<void>;
}

interface RegisterInput {
  username: string;
  email: string;
  password: string;
}

// user-api may either auto-confirm and return tokens, or require email
// confirmation first. The form decides what to do based on this shape.
type RegisterResult =
  | { autoSignedIn: true }
  | { autoSignedIn: false; message: string };

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Decode the user info from a JWT without verifying signature.
// Verification happens server-side; client only needs the claims for display.
function decodeJwt(token: string): AuthUser | null {
  try {
    const [, payload] = token.split(".");
    // RN/web both have atob; pad if needed
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const json = JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
    return {
      userId: json.sub,
      username: json.username,
      accessLevel: json.accessLevel,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Hydrate from storage on mount
  useEffect(() => {
    (async () => {
      const token = await storage.get(StorageKeys.accessToken);
      if (token) {
        const decoded = decodeJwt(token);
        setUser(decoded);
      }
      setLoading(false);
    })();
  }, []);

  // Register a session-expired callback with the api layer: when the
  // silent-refresh interceptor in api.ts can't get a new access token
  // (refresh token expired/revoked, network down for refresh only, etc.),
  // it invokes this and we wipe the React user state so the UI snaps
  // back to "logged out."
  useEffect(() => {
    setOnSessionExpired(() => {
      setUser(null);
    });
    return () => setOnSessionExpired(null);
  }, []);

  async function login(username: string, password: string) {
    const result = await api.user<LoginResponse>("/auth/login", {
      method: "POST",
      data: { username, password },
    });
    await storage.set(StorageKeys.accessToken, result.accessToken);
    await storage.set(StorageKeys.refreshToken, result.refreshToken);
    setUser(decodeJwt(result.accessToken));
  }

  async function register(input: RegisterInput): Promise<RegisterResult> {
    // user-api may return either tokens (auto-login) or just a message
    // (account created, email confirmation required). Handle both shapes.
    const result = await api.user<Partial<LoginResponse> & { message?: string }>(
      "/auth/register",
      { method: "POST", data: input }
    );

    if (result.accessToken && result.refreshToken) {
      await storage.set(StorageKeys.accessToken, result.accessToken);
      await storage.set(StorageKeys.refreshToken, result.refreshToken);
      setUser(decodeJwt(result.accessToken));
      return { autoSignedIn: true };
    }

    return {
      autoSignedIn: false,
      message: result.message ?? "Account created. Check your email to confirm.",
    };
  }

  async function logout() {
    await storage.remove(StorageKeys.accessToken);
    await storage.remove(StorageKeys.refreshToken);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
