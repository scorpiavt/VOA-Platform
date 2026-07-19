const { initDb, getDb } = require("../dist/db.js");
const chars = require("../dist/characters.js");

initDb();
const db = getDb();
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all()
  .map((t) => t.name);
console.log("tables:", tables.join(", "));
const cols = db
  .prepare("PRAGMA table_info(characters)")
  .all()
  .map((c) => c.name);
console.log("characters cols:", cols.join(", "));
if (!tables.includes("character_wipes")) {
  console.error("FAIL: character_wipes missing");
  process.exit(1);
}
if (!cols.includes("actor_form_id") || !cols.includes("map_markers_json")) {
  console.error("FAIL: world state columns missing");
  process.exit(1);
}
console.log("smoke ok");
