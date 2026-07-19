const fs = require("fs");
const s = fs.readFileSync(
  "C:/Users/wehrm/Desktop/ProjectAetherius/voa-platform/client-dist/skymp5-client.js",
  "utf8"
);
let depth = 0;
let max = 0;
let min = 0;
let inS = false;
let inD = false;
let inT = false;
let esc = false;
for (let i = 0; i < s.length; i++) {
  const ch = s[i];
  if (esc) {
    esc = false;
    continue;
  }
  if (ch === "\\" && (inS || inD || inT)) {
    esc = true;
    continue;
  }
  if (!inD && !inT && ch === "'") {
    inS = !inS;
    continue;
  }
  if (!inS && !inT && ch === '"') {
    inD = !inD;
    continue;
  }
  if (!inS && !inD && ch === "`") {
    inT = !inT;
    continue;
  }
  if (inS || inD || inT) continue;
  if (ch === "{") {
    depth++;
    if (depth > max) max = depth;
  }
  if (ch === "}") {
    depth--;
    if (depth < min) min = depth;
  }
}
console.log(
  JSON.stringify({ endDepth: depth, max, min, size: s.length, ok: depth === 0 && min >= 0 })
);
process.exit(depth === 0 && min >= 0 ? 0 : 1);
