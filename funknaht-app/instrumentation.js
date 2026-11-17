// Runs once when the server starts: background check for due reminders (Web Push).
// Switch off with PUSH_SCHEDULER=0, e.g. when several server processes share one database.
export async function register() {
  // The import must sit inside this check, so that only the Node.js server bundles it (not the edge runtime).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.PUSH_SCHEDULER === "0" || process.env.NEXT_PHASE === "phase-production-build") return;
    // Times of day (alarms at 06:30, repeating appointments) are meant in German time, also on a server set to UTC.
    if (!process.env.TZ) process.env.TZ = "Europe/Berlin";
    const { startScheduler } = await import("./lib/push");
    startScheduler();
  }
}
