/**
 * Patch VPS dist_back (or server source build) so UpdateProperty JSON always includes refrId.
 *
 * Symptom: client MpClientPlugin throws
 *   [json.exception.out_of_range.403] key 'refrId' not found
 * after door Activate — server property packets missing refrId break door teleports.
 *
 * Run on VPS:
 *   node patch-update-property-refrid.js
 * then restart skymp / voa server.
 */
const fs = require("fs");
const path = require("path");

const candidates = [
  "/home/skymp/voa-server/dist_back",
  "/home/skymp/skymp-server/dist_back",
  process.env.VOA_DIST_BACK || "",
].filter(Boolean);

function walkJs(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".git") continue;
      walkJs(p, out);
    } else if (name.endsWith(".js")) {
      out.push(p);
    }
  }
  return out;
}

let patched = 0;
for (const base of candidates) {
  const files = walkJs(base);
  for (const file of files) {
    let src = fs.readFileSync(file, "utf8");
    if (!src.includes("UpdateProperty") && !src.includes("propName")) continue;
    if (src.includes('"refrId"') && src.includes("propName") && src.includes("UpdateProperty")) {
      // likely already has refrId somewhere; still try specific patterns
    }

    const before = src;

    // Pattern A: nlohmann-style CreatePropertyMessage in compiled JS dumps
    // { "idx": ..., "t": 7, "propName": name, "data": value }
    // → add refrId from form id when we can see GetFormId / getFormId nearby is hard in minified JS.

    // Pattern B: object literal without refrId
    src = src.replace(
      /\{\s*["']idx["']\s*:\s*([^,]+),\s*["']t["']\s*:\s*([^,]+),\s*["']propName["']\s*:\s*([^,]+),\s*["']data["']\s*:\s*([^}]+)\}/g,
      (m, idx, t, propName, data) => {
        if (m.includes("refrId")) return m;
        return `{ "idx": ${idx}, "t": ${t}, "propName": ${propName}, "data": ${data}, "refrId": 0 }`;
      }
    );

    // Pattern C: JS object for update property builder
    src = src.replace(
      /propName\s*:\s*name\s*,\s*data\s*:\s*value/g,
      'propName: name, data: value, refrId: (typeof self !== "undefined" && self && self.GetFormId) ? self.GetFormId() : 0'
    );

    if (src !== before) {
      fs.writeFileSync(file, src);
      console.log("patched", file);
      patched++;
    }
  }
}

if (!patched) {
  console.log(
    "No JS property-message patterns patched. If the server is native C++ (modern skymp),\n" +
      "UpdateProperty already includes refrId — door issue is client-side. Deploy latest skymp5-client.js instead.\n" +
      "If still on red-house C++ CreatePropertyMessage, rebuild with refrId field or use gamemode addon."
  );
} else {
  console.log("done, patched files:", patched);
}
