const fs = require("fs");
const path = require("path");
const { Jimp } = require("jimp");
const pngToIco = require("png-to-ico").default || require("png-to-ico");

(async () => {
  const root = path.join(__dirname, "..", "build");
  fs.mkdirSync(root, { recursive: true });
  const src = "C:\\Users\\wehrm\\Desktop\\voa_launcher.png";
  const img = await Jimp.read(src);
  const side = Math.min(img.width, img.height);
  const x = Math.floor((img.width - side) / 2);
  const y = Math.floor((img.height - side) / 2);
  img.crop({ x, y, w: side, h: side });

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const files = [];
  for (const s of sizes) {
    const p = path.join(root, `i${s}.png`);
    await img.clone().resize({ w: s, h: s }).write(p);
    files.push(p);
  }
  const ico = await pngToIco(files);
  fs.writeFileSync(path.join(root, "icon.ico"), ico);
  await img.clone().resize({ w: 256, h: 256 }).write(path.join(root, "icon.png"));
  console.log("Wrote icon.ico", ico.length, "bytes");
  for (const f of files) fs.unlinkSync(f);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
