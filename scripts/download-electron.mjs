import { spawn } from "node:child_process";
import {
  mkdirSync,
  existsSync,
  statSync,
  readFileSync,
  writeFileSync,
  openSync,
  writeSync,
  closeSync,
} from "node:fs";
import { createHash } from "node:crypto";
const size = 130394296,
  chunk = 1048576,
  count = Math.ceil(size / chunk),
  dir = "/private/tmp/jojo-electron-chunks";
mkdirSync(dir, { recursive: true });
let cursor = 0,
  done = 0;
async function part(i) {
  const start = i * chunk,
    end = Math.min(size - 1, start + chunk - 1),
    length = end - start + 1,
    path = dir + "/" + i;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (existsSync(path) && statSync(path).size === length) return;
    await new Promise((resolve) => {
      const p = spawn(
        "curl",
        [
          "--silent",
          "--show-error",
          "--fail",
          "--location",
          "--range",
          start + "-" + end,
          "--max-filesize",
          String(length),
          "--max-time",
          "90",
          "https://github.com/electron/electron/releases/download/v44.7.0/electron-v44.7.0-darwin-arm64.zip",
          "--output",
          path,
        ],
        { stdio: "ignore" },
      );
      p.once("close", resolve);
      p.once("error", resolve);
    });
    if (existsSync(path) && statSync(path).size === length) return;
  }
  throw Error("Electron chunk " + i + " failed");
}
await Promise.all(
  Array.from({ length: 16 }, async () => {
    while (cursor < count) {
      const i = cursor++;
      await part(i);
      done++;
      if (done % 8 === 0 || done === count)
        console.log("Electron download " + done + "/" + count);
    }
  }),
);
const file = "/private/tmp/jojo-electron-complete.zip",
  fd = openSync(file, "w");
for (let i = 0; i < count; i++) writeSync(fd, readFileSync(dir + "/" + i));
closeSync(fd);
const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
const expected = JSON.parse(
  readFileSync("node_modules/electron/checksums.json", "utf8"),
)["electron-v44.7.0-darwin-arm64.zip"];
if (hash !== expected) throw Error("Electron checksum mismatch");
mkdirSync("node_modules/electron/dist", { recursive: true });
await new Promise((resolve, reject) => {
  const p = spawn(
    "unzip",
    ["-q", "-o", file, "-d", "node_modules/electron/dist"],
    { stdio: "inherit" },
  );
  p.on("close", (code) =>
    code === 0 ? resolve() : reject(Error("extract failed")),
  );
});
writeFileSync(
  "node_modules/electron/path.txt",
  "Electron.app/Contents/MacOS/Electron",
);
console.log("Electron official checksum verified and runtime ready");
