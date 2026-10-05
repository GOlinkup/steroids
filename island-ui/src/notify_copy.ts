// Notification scope copy (plain module so tests can audit the strings
// without a DOM): the web Notification API covers THIS BROWSER only.
export const NOTIFY_SCOPE_TITLE = "Island alerts live in this browser";
export const NOTIFY_SCOPE_BODY =
  "Get a ping here when the outbox fires or a pairing needs approval. " +
  "Phone notifications can't reach a web page — phone mirroring stays " +
  "a native card, never implied here.";
export const NOTIFY_DENIED_GUIDE =
  "Notifications are blocked. Island keeps working — re-enable them in " +
  "your browser's site settings if you want pings.";
