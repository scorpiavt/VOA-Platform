from pathlib import Path

b = Path("/home/skymp/voa-server/gamemode.with-console.js").read_text(encoding="ascii", errors="replace")
print("len", len(b))
i2 = b.find("/* === VOA")
print("first VOA marker", i2)
if i2 >= 0:
    print("context before VOA:", repr(b[max(0, i2 - 80) : i2 + 60]))
print("tail:", repr(b[-250:]))

# Check if stock ends with valid JS
stock = Path("/home/skymp/voa-server/gamemode.js.stockbak")
if not stock.exists():
    stock = Path("/home/skymp/voa-server/gamemode.stock.js")
s = stock.read_text(encoding="utf-8", errors="replace")
print("stock len", len(s), "tail", repr(s[-120:]))
print("stock nonascii", sum(1 for c in s if ord(c) > 127))

# Count how many times parcelRequire appears
print("parcelRequire count", b.count("parcelRequire"))
print("starts with", repr(b[:80]))
