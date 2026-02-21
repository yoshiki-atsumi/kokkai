const MOCK_PARLIAMENT_DATA = [
  {
    key: "representatives",
    house: "衆議院（定数：465）",
    members: [
      { name: "山田 太郎", reading: "やまだ たろう", party: "自民", district: "東京1", kaiha: "自由民主党" },
      { name: "佐藤 花子", reading: "さとう はなこ", party: "立憲", district: "東京2", kaiha: "立憲民主党" },
    ],
  },
  {
    key: "councillors",
    house: "参議院（定数：248）",
    members: [
      { name: "鈴木 一郎", reading: "すずき いちろう", party: "自民", district: "比例", kaiha: "自由民主党" },
      { name: "高橋 恵", reading: "たかはし めぐみ", party: "公明", district: "比例", kaiha: "公明党" },
    ],
  },
];

const state = {
  chambers: [],
  sourceUpdatedAt: null,
  filter: {
    chamber: "representatives",
    kaiha: "all",
    query: "",
  },
};

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeMembers(rawMembers) {
  if (!Array.isArray(rawMembers)) {
    return [];
  }
  return rawMembers
    .map((member) => {
      const name = String(member?.name ?? "").trim();
      if (!name) {
        return null;
      }
      return {
        name,
        reading: String(member?.reading ?? "").trim(),
        party: String(member?.party ?? "").trim(),
        district: String(member?.district ?? "").trim(),
        kaiha: String(member?.kaiha ?? member?.group ?? member?.party ?? "未分類").trim(),
      };
    })
    .filter(Boolean);
}

function normalizeData(data) {
  return data.map((chamber) => ({
    key: chamber.key,
    house: chamber.house,
    members: normalizeMembers(chamber.members),
  }));
}

function getCurrentChamber() {
  return state.chambers.find((chamber) => chamber.key === state.filter.chamber) || state.chambers[0] || null;
}

function collectKaihaOptions(chamber) {
  const map = new Map();
  chamber.members.forEach((member) => {
    map.set(member.kaiha, (map.get(member.kaiha) || 0) + 1);
  });
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
}

function memberMatchesQuery(member, query) {
  if (!query) {
    return true;
  }
  const target = `${member.name} ${member.reading} ${member.district} ${member.kaiha}`.toLowerCase();
  return target.includes(query);
}

function updateUrlParams() {
  const params = new URLSearchParams();
  params.set("chamber", state.filter.chamber);
  if (state.filter.kaiha !== "all") {
    params.set("kaiha", state.filter.kaiha);
  }
  if (state.filter.query.trim()) {
    params.set("q", state.filter.query.trim());
  }
  history.replaceState(null, "", `?${params.toString()}`);
}

function renderLastUpdated() {
  const node = document.getElementById("members-last-updated");
  const sourceTime = state.sourceUpdatedAt ? new Date(state.sourceUpdatedAt) : new Date();
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  node.textContent = `更新日時: ${formatter.format(sourceTime)}`;
}

function renderFilters() {
  const chamberNode = document.getElementById("members-page-chamber");
  const kaihaNode = document.getElementById("members-page-kaiha");
  const searchNode = document.getElementById("members-page-search");
  const chamber = getCurrentChamber();
  if (!chamberNode || !kaihaNode || !searchNode || !chamber) {
    return;
  }

  chamberNode.innerHTML = state.chambers
    .map((item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.house)}</option>`)
    .join("");
  if (!state.chambers.some((item) => item.key === state.filter.chamber)) {
    state.filter.chamber = state.chambers[0]?.key || "representatives";
  }
  chamberNode.value = state.filter.chamber;

  const kaihaOptions = collectKaihaOptions(chamber);
  if (state.filter.kaiha !== "all" && !kaihaOptions.includes(state.filter.kaiha)) {
    state.filter.kaiha = "all";
  }
  kaihaNode.innerHTML =
    `<option value="all">全会派</option>` +
    kaihaOptions.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
  kaihaNode.value = state.filter.kaiha;
  searchNode.value = state.filter.query;

  if (chamberNode.dataset.bound !== "1") {
    chamberNode.addEventListener("change", (event) => {
      state.filter.chamber = event.target.value;
      state.filter.kaiha = "all";
      renderPage();
    });
    chamberNode.dataset.bound = "1";
  }
  if (kaihaNode.dataset.bound !== "1") {
    kaihaNode.addEventListener("change", (event) => {
      state.filter.kaiha = event.target.value;
      renderPage();
    });
    kaihaNode.dataset.bound = "1";
  }
  if (searchNode.dataset.bound !== "1") {
    searchNode.addEventListener("input", (event) => {
      state.filter.query = event.target.value ?? "";
      renderPage();
    });
    searchNode.dataset.bound = "1";
  }
}

function renderTable() {
  const tbody = document.getElementById("members-page-body");
  const countNode = document.getElementById("members-page-count");
  const chamber = getCurrentChamber();
  if (!tbody || !countNode || !chamber) {
    return;
  }
  const members = chamber.members;
  const query = state.filter.query.trim().toLowerCase();
  const filtered = members.filter((member) => {
    if (state.filter.kaiha !== "all" && member.kaiha !== state.filter.kaiha) {
      return false;
    }
    return memberMatchesQuery(member, query);
  });
  countNode.textContent = `表示 ${filtered.length} / ${members.length} 人`;

  if (members.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="members-empty">データがありません（解散など）</td></tr>`;
    return;
  }
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="members-empty">条件に一致する議員がいません</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered
    .map(
      (member) => `
      <tr>
        <td><a class="member-name-link" href="https://go2senkyo.com/" target="_blank" rel="noopener noreferrer">${escapeHtml(member.name)}</a></td>
        <td>${escapeHtml(member.district || "-")}</td>
        <td>${escapeHtml(member.kaiha || "-")}</td>
      </tr>
    `,
    )
    .join("");
}

function renderPage() {
  renderFilters();
  renderTable();
  updateUrlParams();
}

function applyQueryFilter() {
  const params = new URLSearchParams(window.location.search);
  const chamber = params.get("chamber");
  const kaiha = params.get("kaiha");
  const query = params.get("q");
  if (chamber) {
    state.filter.chamber = chamber;
  }
  if (kaiha) {
    state.filter.kaiha = kaiha;
  }
  if (query) {
    state.filter.query = query;
  }
}

async function getParliamentData() {
  try {
    const response = await fetch("./data/parliament.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    const chambers = Array.isArray(payload) ? payload : payload.chambers;
    if (!Array.isArray(chambers)) {
      throw new Error("Invalid JSON structure: chambers is missing");
    }
    state.sourceUpdatedAt = payload.updatedAt || null;
    return chambers;
  } catch (error) {
    console.warn("静的JSONの取得に失敗したためモックデータを使用します", error);
    state.sourceUpdatedAt = null;
    return MOCK_PARLIAMENT_DATA;
  }
}

async function bootstrap() {
  const raw = await getParliamentData();
  state.chambers = normalizeData(raw);
  if (state.chambers.length === 0) {
    return;
  }
  applyQueryFilter();
  if (!state.chambers.some((chamber) => chamber.key === state.filter.chamber)) {
    state.filter.chamber = state.chambers[0].key;
  }
  renderLastUpdated();
  renderPage();
}

bootstrap().catch((error) => {
  console.error("議員一覧の初期化エラー", error);
});
