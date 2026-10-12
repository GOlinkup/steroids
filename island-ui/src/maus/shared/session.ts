// Ported from OpenMausBot (Apache-2.0, github.com/milind-soni/OpenMausBot). Modified for Steroids island.
// NOTE (Steroids island): trimmed cut of lib/session.ts — only what
// use-owner-or-admin.ts needs. Pairing helpers (takePairingCodeFromLocation),
// SERVICE_TRUST_REASON and isConnected stay in openmaus src/lib/session.ts.

export interface EnvironmentDescriptor {
  environmentId: string;
  label: string;
  platform: string;
  version: string;
  capabilities: { remoteSessions: true; selfUpdate: "desktop-managed" | "operator"; emailSignIn?: boolean; sharedComputers?: true; cloudHome?: true };
}

export type SessionState =
  | { kind: "loopback"; trust?: "service" }
  | { kind: "session"; id: string; label: string; scopes: string[]; expiresAt: number; cloudGuest?: true; openedThreads?: string[] }
  | { kind: "unauthenticated"; error: string }
  | { kind: "unreachable"; error: string };

/** Ask the server who we are. A 401/403 means "go pair"; a network failure
 * is reported separately so the pair page can say the server is down. */
export async function readSessionState(fetchImpl: typeof fetch = fetch): Promise<SessionState> {
  let res: Response;
  try {
    res = await fetchImpl("/api/auth/session", { credentials: "same-origin" });
  } catch (error) {
    return { kind: "unreachable", error: error instanceof Error ? error.message : String(error) };
  }
  const body: unknown = await res.json().catch(() => ({}));
  const record = Object(body) as Record<string, unknown>; // SAFETY: read with typeof checks below; never trusted as a shape
  if (res.status === 401 || res.status === 403) {
    return { kind: "unauthenticated", error: typeof record.error === "string" ? record.error : `${res.status}` };
  }
  if (!res.ok) return { kind: "unreachable", error: `${res.status} ${res.statusText}` };
  if (record.kind === "session" && typeof record.id === "string") {
    return {
      kind: "session",
      id: record.id,
      label: typeof record.label === "string" ? record.label : "",
      scopes: Array.isArray(record.scopes) ? record.scopes.filter((s): s is string => typeof s === "string") : [],
      expiresAt: typeof record.expiresAt === "number" ? record.expiresAt : 0,
      ...(record.cloudGuest === true ? {
        cloudGuest: true as const,
        openedThreads: Array.isArray(record.openedThreads) ? record.openedThreads.filter((id): id is string => typeof id === "string") : [],
      } : {}),
    };
  }
  return record.trust === "service" ? { kind: "loopback", trust: "service" } : { kind: "loopback" };
}

export function isOwnerOrAdmin(state: SessionState | null): boolean {
  if (!state) return false;
  return state.kind === "loopback" ? state.trust !== "service" : state.kind === "session" && state.scopes.includes("admin");
}
