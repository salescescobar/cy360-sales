import { readDay } from "../packages/knowledge/index";

async function main() {
  for (const date of ["2026-08-01", "2026-08-02", "2026-07-02"]) {
    const rows = await readDay("orlando", date);
    console.log(date, JSON.stringify(rows));
  }
}
main();
