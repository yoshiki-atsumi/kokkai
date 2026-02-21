import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outputPath = path.join(rootDir, "data", "parliament.json");
const FALLBACK_PALETTE = [
  "#135ae1",
  "#d43f3a",
  "#25a56b",
  "#f2992e",
  "#8f56ce",
  "#17a2b8",
  "#8a6f3c",
  "#6e7d8e",
  "#d84ea5",
  "#5c4bd8",
];

const SHEET_SYU_MEMBERS_URL = process.env.SHEET_SYU_MEMBERS_URL;
const SHEET_SAN_MEMBERS_URL = process.env.SHEET_SAN_MEMBERS_URL;
const SHEET_SYU_MASTER_URL = process.env.SHEET_SYU_MASTER_URL;
const SHEET_SAN_MASTER_URL = process.env.SHEET_SAN_MASTER_URL;
const SHEET_HISTORY_URL = process.env.SHEET_HISTORY_URL;

if (!SHEET_SYU_MEMBERS_URL || !SHEET_SAN_MEMBERS_URL || !SHEET_SYU_MASTER_URL || !SHEET_SAN_MASTER_URL || !SHEET_HISTORY_URL) {
  throw new Error(
    "SHEET_SYU_MEMBERS_URL / SHEET_SAN_MEMBERS_URL / SHEET_SYU_MASTER_URL / SHEET_SAN_MASTER_URL / SHEET_HISTORY_URL を GitHub Secrets に設定してください。",
  );
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

function normalizeKey(value) {
  return String(value ?? "").replace(/\s+/g, "").trim().toLowerCase();
}

function normalizeMemberRows(rows) {
  return rows
    .map((row) => {
      const name = pick(row, ["name", "氏名", "名前", "議員名"]);
      if (!name) {
        return null;
      }
      const reading = pick(row, ["reading", "よみ", "読み", "ふりがな"]);
      const party = pick(row, ["party", "党派", "政党"]);
      const district = pick(row, ["district", "選挙区"]);
      // kaiha はスプレッドシートの一番右列運用を想定。ヘッダー名で取得する。
      const kaiha = pick(row, ["kaiha", "会派", "会派名", "会派（集計用）"]) || party || "未分類";
      return { name, reading, party, district, kaiha };
    })
    .filter(Boolean);
}

function toNumber(value) {
  const normalized = String(value ?? "").replace(/,/g, "").trim();
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function normalizeBloc(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["government", "gov", "ruling", "与党"].includes(raw)) {
    return "government";
  }
  return "opposition";
}

function normalizeMasterRows(rows) {
  return rows
    .map((row, idx) => {
      const name = pick(row, ["name", "会派", "会派名", "kaiha"]);
      if (!name) {
        return null;
      }
      const orderRaw = pick(row, ["order", "displayOrder", "sortOrder", "順番", "表示順"]);
      const orderNum = toNumber(orderRaw);
      return {
        name,
        bloc: normalizeBloc(pick(row, ["bloc", "与野党分類", "区分"])),
        color: pick(row, ["color", "カラー", "colour"]) || undefined,
        shortLabel: pick(row, ["shortLabel", "abbr", "alias", "略称"]) || undefined,
        order: orderNum ?? idx + 1,
      };
    })
    .filter(Boolean);
}

function normalizeHistoryRows(rows) {
  return rows
    .map((row, idx) => {
      const noRaw = pick(row, ["No.", "No", "no", "番号"]);
      const noNum = toNumber(noRaw);
      const date = pick(row, ["date", "data", "日付", "更新日"]);
      const house = pick(row, ["house", "院", "議院", "対象院"]);
      const description = pick(row, ["description", "概要", "内容"]);
      const kaihaOld = pick(row, ["kaiha_old", "kaihaOld", "会派旧", "旧会派"]);
      const kaihaNew = pick(row, ["kaiha_new", "kaihaNew", "会派新", "新会派"]);
      const member = pick(row, ["member", "member_name", "議員", "議員名"]);
      if (!date && !house && !description && !kaihaOld && !kaihaNew && !member) {
        return null;
      }
      return {
        no: noNum ?? idx + 1,
        date,
        house,
        description,
        kaiha_old: kaihaOld,
        kaiha_new: kaihaNew,
        member,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.no || 0) - (a.no || 0));
}

function buildMasterMap(masterRows) {
  const map = new Map();
  masterRows.forEach((row) => {
    map.set(normalizeKey(row.name), row);
  });
  return map;
}

function sortGroups(groups) {
  return groups.sort((a, b) => {
    if (a.order !== null || b.order !== null) {
      const ao = a.order ?? Number.POSITIVE_INFINITY;
      const bo = b.order ?? Number.POSITIVE_INFINITY;
      if (ao !== bo) {
        return ao - bo;
      }
    }
    const aGov = a.bloc === "government" ? 0 : 1;
    const bGov = b.bloc === "government" ? 0 : 1;
    if (aGov !== bGov) {
      return aGov - bGov;
    }
    return b.seats - a.seats;
  });
}

function aggregateGroupsFromMembers(members, masterMap) {
  const counter = new Map();
  members.forEach((member) => {
    const kaiha = String(member?.kaiha ?? "").trim();
    if (!kaiha) {
      return;
    }
    counter.set(kaiha, (counter.get(kaiha) || 0) + 1);
  });
  const groups = Array.from(counter.entries()).map(([name, seats]) => {
    const meta = masterMap.get(normalizeKey(name));
    return {
      name: meta?.name || name,
      seats,
      bloc: meta?.bloc || "opposition",
      color: meta?.color || undefined,
      order: typeof meta?.order === "number" ? meta.order : null,
      shortLabel: meta?.shortLabel || undefined,
    };
  });
  sortGroups(groups);
  return groups.map((group, idx) => ({
    ...group,
    color: group.color || FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length],
  }));
}

async function fetchSheetCsvText(url) {
  const csvUrl = resolveSheetCsvUrl(url);
  const res = await fetch(csvUrl, { headers: { "user-agent": "kokkai-fetch-bot" } });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${csvUrl}: HTTP ${res.status}`);
  }
  const text = await res.text();
  if (text.startsWith("<!DOCTYPE html") || text.startsWith("<html")) {
    throw new Error(`Spreadsheet URL is not a CSV endpoint: ${csvUrl}`);
  }
  return text;
}

async function fetchMemberSheet(url) {
  const text = await fetchSheetCsvText(url);
  return normalizeMemberRows(parseCsv(text));
}

async function fetchMasterSheet(url) {
  const text = await fetchSheetCsvText(url);
  return normalizeMasterRows(parseCsv(text));
}

async function fetchHistorySheet(url) {
  const text = await fetchSheetCsvText(url);
  return normalizeHistoryRows(parseCsv(text));
}

async function main() {
  const [representativesMembers, councillorsMembers, representativesMasterRows, councillorsMasterRows, historyRows] = await Promise.all([
    fetchMemberSheet(SHEET_SYU_MEMBERS_URL),
    fetchMemberSheet(SHEET_SAN_MEMBERS_URL),
    fetchMasterSheet(SHEET_SYU_MASTER_URL),
    fetchMasterSheet(SHEET_SAN_MASTER_URL),
    fetchHistorySheet(SHEET_HISTORY_URL),
  ]);
  const representativesMasterMap = buildMasterMap(representativesMasterRows);
  const councillorsMasterMap = buildMasterMap(councillorsMasterRows);
  const representativesGroups = aggregateGroupsFromMembers(
    representativesMembers,
    representativesMasterMap,
  );
  const councillorsGroups = aggregateGroupsFromMembers(
    councillorsMembers,
    councillorsMasterMap,
  );

  const payload = {
    updatedAt: new Date().toISOString(),
    history: historyRows,
    chambers: [
      {
        key: "representatives",
        house: "衆議院（定数：465）",
        groups: representativesGroups,
        members: representativesMembers,
      },
      {
        key: "councillors",
        house: "参議院（定数：248）",
        groups: councillorsGroups,
        members: councillorsMembers,
      },
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
