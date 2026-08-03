import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

test("generate big csv fixture", async () => {
  const out = path.join(__dirname, "..", "files", "big.csv");
  const ws = fs.createWriteStream(out);
  ws.write("Date,Source,Total\n");
  const row = "2026-01-01,GoTab," + "9".repeat(50) + "\n";
  const target = 10 * 1024 * 1024;
  let written = 20;
  await new Promise<void>((resolve, reject) => {
    function writeMore() {
      let ok = true;
      while (written < target && ok) {
        ok = ws.write(row);
        written += row.length;
      }
      if (written < target) {
        ws.once("drain", writeMore);
      } else {
        ws.end();
      }
    }
    ws.on("finish", () => resolve());
    ws.on("error", reject);
    writeMore();
  });
  console.log("wrote", written, "bytes");
});
