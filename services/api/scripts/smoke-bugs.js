const { initDb, getDb } = require("../dist/db.js");
const bugs = require("../dist/bugReports.js");
initDb();
const t = getDb()
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bug_reports'")
  .get();
console.log("table:", t);
// ensure insert path works with fake user if any exists
const u = getDb().prepare("SELECT id, profile_id FROM users LIMIT 1").get();
if (u) {
  const r = bugs.createBugReport({
    userId: u.id,
    profileId: u.profile_id,
    title: "Smoke test report",
    body: "Automated smoke test body for bug reports API.",
    category: "launcher",
    launcherVersion: "0.0.0-smoke",
  });
  console.log("created", r.id, r.status);
  const list = bugs.listBugReportsForUser(u.id);
  console.log("user reports", list.length);
} else {
  console.log("no users yet — schema ok");
}
console.log("smoke ok");
