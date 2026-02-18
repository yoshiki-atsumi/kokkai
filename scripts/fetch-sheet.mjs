import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outputPath = path.join(rootDir, "data", "parliament.json");

const SHEET_SYU_URL = process.env.SHEET_SYU_URL;
const SHEET_SAN_URL = process.env.SHEET_SAN_URL;

if (!SHEET_SYU_URL || !SHEET_SAN_URL) {
  throw new Error("SHEET_SYU_URL と SHEET_SAN_URL を GitHub Secrets に設定してください。");
}

function resolveSheetCsvUrl(rawUrl) {
  const url = new URL(rawUrl);
  const isGoogleSheet = url.hostname.includes("docs.google.com") && url.pathname.includes("/spreadsheets/");
  if (!isGoogleSheet) {
    return rawUrl;
  }
  if (url.pathname.endsWith("/export") && url.searchParams.get("format") === "csv") {
    return url.toString();
  }
  const idMatch = /\/spreadsheets\/d\/([^/]+)/.exec(url.pathname);
  if (!idMatch?.[1]) {
    return rawUrl;
  }
  const hashMatch = /gid=(\d+)/.exec(url.hash || "");
  const gid = url.searchParams.get("gid") || hashMatch?.[1] || "0";
  return `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv&gid=${gid}`;
}

function parseCsvLine(line) {
  const out = [];
  let value = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && inQuotes && next === '"') {
      value += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(value);
      value = "";
      continue;
    }
    value += ch;
  }
  out.push(value);
  return out.map((v) => v.trim());
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  if (lines.length === 0) {
    return [];
  }
  const headers = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function pick(row, names) {
  for (const key of names) {
    if (row[key] !== undefined && row[key] !== "") {
      return row[key];
    }
  }
  return "";
}

function toNumber(value) {
  const normalized = String(value ?? "").replace(/,/g, "").trim();
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function normalizeRows(rows) {
  return rows
    .map((row, idx) => {
      const name = pick(row, ["name", "会派", "会派名", "党派"]);
      const seats = toNumber(pick(row, ["seats", "議席数", "議席"]));
      if (!name || seats <= 0) {
        return null;
      }
      const color = pick(row, ["color", "カラー", "colour"]) || undefined;
      const shortLabel = pick(row, ["shortLabel", "abbr", "alias", "略称"]) || undefined;
      const blocRaw = pick(row, ["bloc", "与野党分類", "区分"]).toLowerCase();
      let bloc = "opposition";
      if (["government", "gov", "ruling", "与党"].includes(blocRaw)) {
        bloc = "government";
      }
      const orderRaw = pick(row, ["order", "displayOrder", "sortOrder", "順番", "表示順"]);
      const orderNum = Number(orderRaw);
      const order = Number.isFinite(orderNum) ? orderNum : idx + 1;
      return { name, seats, bloc, color, order, shortLabel };
    })
    .filter(Boolean);
}

async function fetchSheet(url) {
  const csvUrl = resolveSheetCsvUrl(url);
  const res = await fetch(csvUrl, { headers: { "user-agent": "kokkai-fetch-bot" } });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${csvUrl}: HTTP ${res.status}`);
  }
  const text = await res.text();
  if (text.startsWith("<!DOCTYPE html") || text.startsWith("<html")) {
    throw new Error(`Spreadsheet URL is not a CSV endpoint: ${csvUrl}`);
  }
  const rows = normalizeRows(parseCsv(text));
  return rows;
}

async function main() {
  const [representativesRows, councillorsRows] = await Promise.all([
    fetchSheet(SHEET_SYU_URL),
    fetchSheet(SHEET_SAN_URL),
  ]);

  const payload = {
    updatedAt: new Date().toISOString(),
    chambers: [
      { key: "representatives", house: "衆議院（定数：465）", groups: representativesRows },
      { key: "councillors", house: "参議院（定数：248）", groups: councillorsRows },
    ],
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Updated: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
