const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");

/**
 * Embed VOA icon into the Windows .exe after electron-builder packs it.
 * Prefer ResEdit (works on modern Electron PE); fall back to rcedit.
 */
async function applyIconWithResEdit(exe, ico) {
  // ResEdit is pure-JS PE resource editor — more reliable than rcedit on Electron 30+
  let ResEdit;
  let peLibrary;
  try {
    ResEdit = require("resedit");
    peLibrary = require("pe-library");
  } catch {
    // monorepo hoist
    ResEdit = require(path.join(__dirname, "../../node_modules/resedit"));
    peLibrary = require(path.join(__dirname, "../../node_modules/pe-library"));
  }

  const exeBuf = fs.readFileSync(exe);
  const icoBuf = fs.readFileSync(ico);

  const exeFile = peLibrary.NtExecutable.from(exeBuf, { ignoreCert: true });
  const res = peLibrary.NtExecutableResource.from(exeFile);
  const iconFile = ResEdit.Data.IconFile.from(icoBuf);

  // Remove old RT_GROUP_ICON / RT_ICON entries then put ours in as ID 1
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    1, // icon group id used by Windows shell
    1033, // en-US
    iconFile.icons.map((item) => item.data)
  );

  res.outputResource(exeFile);
  const out = Buffer.from(exeFile.generate());
  fs.writeFileSync(exe, out);
}

function applyIconWithRcedit(exe, ico) {
  let rcedit;
  try {
    const pkg = require.resolve("rcedit/package.json");
    rcedit = path.join(path.dirname(pkg), "bin", "rcedit-x64.exe");
  } catch {
    rcedit = path.join(__dirname, "../../node_modules/rcedit/bin/rcedit-x64.exe");
  }
  if (!fs.existsSync(rcedit)) throw new Error("rcedit-x64.exe not found");
  execFileSync(rcedit, [exe, "--set-icon", ico], { stdio: "inherit" });
  try {
    execFileSync(rcedit, [exe, "--set-version-string", "ProductName", "VisionsOfAetherius"], {
      stdio: "inherit",
    });
    execFileSync(
      rcedit,
      [exe, "--set-version-string", "FileDescription", "Visions of Aetherius Launcher"],
      { stdio: "inherit" }
    );
  } catch (_) {
    /* version strings are nice-to-have */
  }
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;

  const exeName = context.packager.appInfo.productFilename + ".exe";
  const exe = path.join(context.appOutDir, exeName);
  const ico = path.join(__dirname, "build", "icon.ico");

  // Always ship icon next to the binary + under resources for BrowserWindow
  const resourcesDir = path.join(context.appOutDir, "resources");
  fs.mkdirSync(resourcesDir, { recursive: true });
  if (fs.existsSync(ico)) {
    fs.copyFileSync(ico, path.join(context.appOutDir, "icon.ico"));
    fs.copyFileSync(ico, path.join(resourcesDir, "icon.ico"));
    const png = path.join(__dirname, "build", "icon.png");
    if (fs.existsSync(png)) {
      fs.copyFileSync(png, path.join(resourcesDir, "icon.png"));
      fs.copyFileSync(png, path.join(context.appOutDir, "icon.png"));
    }
  }

  console.log("afterPack icon targets:", { exe, ico, existsExe: fs.existsSync(exe), existsIco: fs.existsSync(ico) });

  if (!fs.existsSync(exe) || !fs.existsSync(ico)) {
    console.warn("afterPack: missing exe or ico — skip PE icon embed");
    return;
  }

  let iconOk = false;
  try {
    await applyIconWithResEdit(exe, ico);
    console.log("afterPack: ResEdit icon applied successfully");
    iconOk = true;
  } catch (e) {
    console.warn("afterPack: ResEdit failed:", e && e.message ? e.message : e);
  }

  // Always try rcedit for version strings; also use as icon fallback
  try {
    applyIconWithRcedit(exe, ico);
    console.log("afterPack: rcedit icon/version applied successfully");
    iconOk = true;
  } catch (e2) {
    if (!iconOk) {
      console.error("afterPack: all icon embed methods failed:", e2 && e2.message ? e2.message : e2);
    } else {
      console.warn("afterPack: rcedit version strings skipped:", e2 && e2.message ? e2.message : e2);
    }
  }
};
