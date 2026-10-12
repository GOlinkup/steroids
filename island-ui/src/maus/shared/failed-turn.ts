// Ported from OpenMausBot (Apache-2.0, github.com/milind-soni/OpenMausBot). Modified for Steroids island.
// NOTE (Steroids island): only the engineSignedOut predicate (needed by
// place-view.ts) is ported. Its helpers are copied verbatim from
// components/EngineSetup.tsx (needsSignIn, isApiKeyEngine, apiKeySetup) so
// the "Sign in first" wording keeps reading the same engine the setup card
// would show. The failed-turn row wording (activityPreview, signedOutEngine,
// botEngine) stays in openmaus src/lib/failed-turn.ts with ChatView.
import type { InstanceInfo } from "./store";

/** Installed but missing the cloud account session. */
function needsSignIn(instance: InstanceInfo | undefined): boolean {
  return instance?.snapshot.state === "available" && instance.snapshot.authenticated === false;
}

function isApiKeyEngine(instance: InstanceInfo | undefined): boolean {
  if (!instance || instance.access !== "api" || instance.managed) return false;
  return instance.driverKind !== "claudeAgent" || Boolean(instance.snapshot.version);
}

function apiKeySetup(instance: InstanceInfo): boolean {
  return (isApiKeyEngine(instance) || instance.install?.settings === "connections") && !instance.snapshot.authenticationUnavailableReason
    && (instance.snapshot.state !== "available" || instance.snapshot.authenticated === false);
}

/** The card EngineSetup shows for this engine is its sign-in — not an API
 * key row, an install, or a note that it cannot be set up here. */
function offersSignIn(instance: InstanceInfo | undefined): boolean {
  return Boolean(instance && needsSignIn(instance) && instance.install
    && !instance.snapshot.authenticationUnavailableReason && !apiKeySetup(instance));
}

/** Whether this engine is waiting on a sign-in: its setup card is the
 * sign-in. The one answer a failed turn's row and a place's "Sign in first"
 * both read. */
export function engineSignedOut(engine: InstanceInfo | undefined): boolean {
  return Boolean(engine?.snapshot) && offersSignIn(engine);
}
