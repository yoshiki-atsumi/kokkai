const PALETTE = [
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

const GROUP_SHORT_LABELS = {
  自由民主党: "自民",
  立憲民主党: "立憲",
  "立憲民主・社民": "立憲・社民",
  日本維新の会: "維新",
  公明党: "公明",
  国民民主党: "国民",
  日本共産党: "共産",
  れいわ新選組: "れいわ",
  その他: "他",
};

const MOCK_PARLIAMENT_DATA = [
  {
    key: "representatives",
    house: "衆議院（定数：465）",
    members: [
      { name: "山田 太郎", reading: "やまだ たろう", party: "自民", district: "東京1", kaiha: "自由民主党" },
      { name: "佐藤 花子", reading: "さとう はなこ", party: "立憲", district: "東京2", kaiha: "立憲民主党" },
    ],
    groups: [
      { name: "自由民主党", seats: 247 },
      { name: "立憲民主党", seats: 98 },
      { name: "日本維新の会", seats: 41 },
      { name: "公明党", seats: 32 },
      { name: "国民民主党", seats: 28 },
      { name: "れいわ新選組", seats: 9 },
      { name: "その他", seats: 10 },
    ],
  },
  {
    key: "councillors",
    house: "参議院（定数：248）",
    members: [
      { name: "鈴木 一郎", reading: "すずき いちろう", party: "自民", district: "比例", kaiha: "自由民主党" },
      { name: "高橋 恵", reading: "たかはし めぐみ", party: "公明", district: "比例", kaiha: "公明党" },
    ],
    groups: [
      { name: "自由民主党", seats: 114 },
      { name: "立憲民主・社民", seats: 38 },
      { name: "公明党", seats: 27 },
      { name: "日本維新の会", seats: 21 },
      { name: "国民民主党", seats: 12 },
      { name: "日本共産党", seats: 11 },
      { name: "その他", seats: 25 },
    ],
  },
];

const MOCK_HISTORY_DATA = [
  {
    no: 1,
    date: "令和8年2月18日",
    house: "衆議院",
    description: "第51回衆議院選挙に当選した議員の会派情報を反映しました。",
    kaiha_old: "",
    kaiha_new: "",
    member: "",
  },
];

const state = {
  chambers: [],
  highlightedByChamber: {},
  history: [],
  sourceUpdatedAt: null,
};

const CHAMBER_RULES = {
  representatives: { capacity: 465 },
  councillors: { capacity: 248 },
};

function getChamberRule(chamberKey) {
  return CHAMBER_RULES[chamberKey] || null;
}

function inferBloc(groupName) {
  return "opposition";
}

function shortLabel(groupName) {
  return GROUP_SHORT_LABELS[groupName] || groupName;
}

function pickOrderValue(group) {
  const raw = group.order ?? group.displayOrder ?? group.sortOrder;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function pickShortLabel(group) {
  return group.shortLabel ?? group.abbr ?? group.alias ?? null;
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
      const reading = String(member?.reading ?? "").trim();
      const party = String(member?.party ?? "").trim();
      const district = String(member?.district ?? "").trim();
      const kaiha = String(member?.kaiha ?? member?.group ?? party).trim();
      return { name, reading, party, district, kaiha };
    })
    .filter(Boolean);
}

function aggregateGroupsFromMembers(members) {
  const counter = new Map();
  members.forEach((member) => {
    const key = member.kaiha || "未分類";
    counter.set(key, (counter.get(key) || 0) + 1);
  });
  return Array.from(counter.entries()).map(([name, seats]) => ({
    name,
    seats,
  }));
}

function normalizeData(data) {
  return data.map((chamber) => ({
    key: chamber.key,
    house: chamber.house,
    members: normalizeMembers(chamber.members),
    groups: (Array.isArray(chamber.groups) && chamber.groups.length > 0
      ? chamber.groups
      : aggregateGroupsFromMembers(normalizeMembers(chamber.members)))
      .map((group, index) => ({
        name: group.name,
        seats: Number(group.seats) || 0,
        color: group.color || PALETTE[index % PALETTE.length],
        bloc: group.bloc || inferBloc(group.name),
        order: pickOrderValue(group),
        shortLabel: pickShortLabel(group),
      }))
      .filter((group) => group.seats > 0)
      .sort((a, b) => {
        // スプシ側で順番を指定している場合はそれを最優先にする。
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
      }),
  }));
}

function normalizeHistory(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item, idx) => ({
      no: Number(item?.no) || idx + 1,
      date: String(item?.date ?? item?.data ?? "").trim(),
      house: String(item?.house ?? "").trim(),
      description: String(item?.description ?? "").trim(),
      kaiha_old: String(item?.kaiha_old ?? item?.kaihaOld ?? "").trim(),
      kaiha_new: String(item?.kaiha_new ?? item?.kaihaNew ?? "").trim(),
      member: String(item?.member ?? "").trim(),
    }))
    .filter((item) => item.date || item.house || item.description || item.kaiha_old || item.kaiha_new || item.member)
    .sort((a, b) => (b.no || 0) - (a.no || 0));
}

function renderFactionBar(chamber) {
  const total = chamber.groups.reduce((sum, group) => sum + group.seats, 0);
  const container = document.getElementById(`faction-bar-${chamber.key}`);
  if (!container) {
    return;
  }
  container.innerHTML = "";

  if (chamber.groups.length === 0) {
    const placeholder = document.createElement("div");
    placeholder.style.cssText = "width: 100%; text-align: center; padding: 40px 10px; color: #999; background: #f5f5f5;";
    placeholder.textContent = "データがありません（解散など）";
    container.appendChild(placeholder);
    return;
  }

  chamber.groups.forEach((group) => {
    const pct = total > 0 ? (group.seats / total) * 100 : 0;
    const segment = document.createElement("div");
    segment.className = "faction-segment";
    segment.dataset.group = group.name;
    segment.style.width = `${pct}%`;
    segment.style.background = group.color;
    segment.title = `${group.name} ${group.seats}議席`;
    segment.textContent = group.shortLabel || shortLabel(group.name);
    segment.style.cursor = "pointer";
    segment.addEventListener("mouseenter", () => {
      state.highlightedByChamber[chamber.key] = group.name;
      updateHighlight(chamber);
    });
    segment.addEventListener("mouseleave", () => {
      state.highlightedByChamber[chamber.key] = "";
      updateHighlight(chamber);
    });
    segment.addEventListener("click", () => {
      window.location.href = buildMembersPageUrl(chamber.key, group.name);
    });
    container.appendChild(segment);
  });
}

function renderLegend(chamber) {
  const total = chamber.groups.reduce((sum, group) => sum + group.seats, 0);
  const rule = getChamberRule(chamber.key);
  const capacity = rule?.capacity ?? total;
  const baseSeats = Math.max(total, capacity);
  const vacancySeats = Math.max(0, capacity - total);
  const tbody = document.getElementById(`legend-body-${chamber.key}`);
  if (!tbody) {
    return;
  }
  tbody.innerHTML = "";
  if (chamber.groups.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4" style="text-align: center; color: #999; padding: 20px;">データがありません（解散など）</td>`;
    tbody.appendChild(tr);
    return;
  }
  chamber.groups.forEach((group) => {
    const ratio = baseSeats > 0 ? ((group.seats / baseSeats) * 100).toFixed(1) : "0.0";
    const tr = document.createElement("tr");
    tr.className = "legend-row";
    tr.dataset.group = group.name;
    tr.innerHTML = `
      <td class="legend-name-cell">
        <span class="legend-dot" style="background:${group.color}"></span>
        <a class="group-link" href="${buildMembersPageUrl(chamber.key, group.name)}">${group.name}</a>
      </td>
      <td>${group.bloc === "government" ? "与党" : "野党・他"}</td>
      <td>${group.seats}</td>
      <td>${ratio}%</td>
    `;
    const activateHighlight = () => {
      state.highlightedByChamber[chamber.key] = group.name;
      updateHighlight(chamber);
    };
    const deactivateHighlight = () => {
      state.highlightedByChamber[chamber.key] = "";
      updateHighlight(chamber);
    };
    tr.addEventListener("mouseenter", activateHighlight);
    tr.addEventListener("mouseleave", deactivateHighlight);
    tr.addEventListener("touchstart", activateHighlight, { passive: true });
    tr.addEventListener("touchend", deactivateHighlight, { passive: true });
    tbody.appendChild(tr);
  });

  if (vacancySeats > 0) {
    const ratio = baseSeats > 0 ? ((vacancySeats / baseSeats) * 100).toFixed(1) : "0.0";
    const tr = document.createElement("tr");
    tr.className = "legend-row legend-row-vacancy";
    tr.dataset.group = "__vacancy__";
    tr.innerHTML = `
      <td class="legend-name-cell">
        <span class="legend-dot" style="background:#9aa0a6"></span>
        <span>欠員</span>
      </td>
      <td>欠員</td>
      <td>${vacancySeats}</td>
      <td>${ratio}%</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderBlocSummary(chamber) {
  const total = chamber.groups.reduce((sum, group) => sum + group.seats, 0);
  const governmentSeats = chamber.groups
    .filter((group) => group.bloc === "government")
    .reduce((sum, group) => sum + group.seats, 0);
  const oppositionSeats = Math.max(0, total - governmentSeats);

  const govPct = total > 0 ? (governmentSeats / total) * 100 : 50;
  const oppPct = total > 0 ? (oppositionSeats / total) * 100 : 50;

  const barNode = document.getElementById(`bloc-bar-${chamber.key}`);
  const markersWrapNode = document.getElementById(`bloc-markers-${chamber.key}`);
  const emptyNode = document.getElementById(`bloc-empty-${chamber.key}`);
  const govNode = document.getElementById(`bloc-government-${chamber.key}`);
  const oppNode = document.getElementById(`bloc-opposition-${chamber.key}`);
  const majorityNode = document.getElementById(`marker-majority-${chamber.key}`);
  const twoThirdNode = document.getElementById(`marker-twothird-${chamber.key}`);

  if (!barNode || !markersWrapNode || !emptyNode || !govNode || !oppNode || !majorityNode || !twoThirdNode) {
    return;
  }

  if (total === 0) {
    barNode.style.display = "none";
    markersWrapNode.style.display = "none";
    emptyNode.style.display = "block";
    emptyNode.textContent = "データがありません（解散など）";
    return;
  }

  barNode.style.display = "flex";
  markersWrapNode.style.display = "block";
  emptyNode.style.display = "none";
  majorityNode.style.display = "block";
  twoThirdNode.style.display = "block";
  govNode.style.width = `${govPct}%`;
  oppNode.style.width = `${oppPct}%`;
  govNode.textContent = `与党 ${governmentSeats}`;
  oppNode.textContent = `野党・他 ${oppositionSeats}`;
  const majoritySeats = Math.floor(total / 2) + 1;
  const twoThirdSeats = Math.ceil((total * 2) / 3);
  const majorityPct = total > 0 ? (majoritySeats / total) * 100 : 0;
  const twoThirdPct = total > 0 ? (twoThirdSeats / total) * 100 : 0;

  majorityNode.style.left = `${Math.min(100, Math.max(0, majorityPct))}%`;
  twoThirdNode.style.left = `${Math.min(100, Math.max(0, twoThirdPct))}%`;
  majorityNode.querySelector(".bloc-marker-value").textContent = String(majoritySeats);
  twoThirdNode.querySelector(".bloc-marker-value").textContent = String(twoThirdSeats);
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildMembersPageUrl(chamberKey, kaihaName) {
  const params = new URLSearchParams();
  params.set("chamber", chamberKey);
  params.set("kaiha", kaihaName);
  return `./members.html?${params.toString()}`;
}

function renderHistory() {
  const node = document.getElementById("history-list");
  if (!node) {
    return;
  }
  if (!Array.isArray(state.history) || state.history.length === 0) {
    node.innerHTML = `<div class="history-empty">履歴データがありません</div>`;
    return;
  }
  node.innerHTML = state.history
    .map((item) => {
      const details = [
        item.kaiha_old ? `旧会派: ${item.kaiha_old}` : "",
        item.kaiha_new ? `新会派: ${item.kaiha_new}` : "",
        item.member ? `議員: ${item.member}` : "",
      ]
        .filter(Boolean)
        .join(" / ");
      return `
      <article class="history-item">
        <div class="history-item-head">
          <span class="history-date">${escapeHtml(item.date || "-")}</span>
          <span class="history-house">${escapeHtml(item.house || "-")}</span>
        </div>
        <div class="history-description">${escapeHtml(item.description || "-")}</div>
        ${details ? `<div class="history-detail">${escapeHtml(details)}</div>` : ""}
      </article>
    `;
    })
    .join("");
}

function updateHighlight(chamber) {
  const root = document.getElementById(`chamber-${chamber.key}`);
  if (!root) {
    return;
  }
  const allFactionSegments = root.querySelectorAll(".faction-segment");
  const allLegendItems = root.querySelectorAll(".legend-row");
  const activeName = state.highlightedByChamber[chamber.key] || "";

  allFactionSegments.forEach((segment) => {
    if (!activeName) {
      segment.style.opacity = "1";
      return;
    }
    segment.style.opacity = segment.dataset.group === activeName ? "1" : "0.25";
  });

  allLegendItems.forEach((item) => {
    item.classList.toggle("is-active", Boolean(activeName) && item.dataset.group === activeName);
  });
}

function renderChamber(chamber) {
  state.highlightedByChamber[chamber.key] = "";
  renderFactionBar(chamber);
  renderBlocSummary(chamber);
  renderLegend(chamber);
  updateHighlight(chamber);
}

function renderChamberScaffold(chamber) {
  return `
    <section id="chamber-${chamber.key}" class="chamber-block" data-chamber-key="${chamber.key}">
      <h2 class="chamber-title">${chamber.house}</h2>
      <section class="faction-card">
        <div class="bar-title">会派</div>
        <div id="faction-bar-${chamber.key}" class="faction-bar"></div>
      </section>
      <section class="bloc-card">
        <div class="bar-title">与野党</div>
        <div id="bloc-bar-${chamber.key}" class="bloc-bar">
          <div id="bloc-government-${chamber.key}" class="bloc-segment bloc-government"></div>
          <div id="bloc-opposition-${chamber.key}" class="bloc-segment bloc-opposition"></div>
        </div>
        <div id="bloc-markers-${chamber.key}" class="bloc-markers">
          <div id="marker-majority-${chamber.key}" class="bloc-marker">
            <div class="bloc-marker-arrow"></div>
            <div class="bloc-marker-label">過半数</div>
            <div class="bloc-marker-value">-</div>
          </div>
          <div id="marker-twothird-${chamber.key}" class="bloc-marker">
            <div class="bloc-marker-arrow"></div>
            <div class="bloc-marker-label">3分の2</div>
            <div class="bloc-marker-value">-</div>
          </div>
        </div>
        <div id="bloc-empty-${chamber.key}" class="bloc-empty-message"></div>
      </section>
      <aside class="legend-panel">
        <h3>会派一覧</h3>
        <div class="legend-table-wrapper">
          <table class="legend-table">
            <thead>
              <tr>
                <th>会派</th>
                <th>与野党分類</th>
                <th>議席数</th>
                <th>議席割合</th>
              </tr>
            </thead>
            <tbody id="legend-body-${chamber.key}"></tbody>
          </table>
        </div>
      </aside>
    </section>
  `;
}

function renderAllScaffolds() {
  const container = document.getElementById("chambers");
  const order = { representatives: 0, councillors: 1 };
  const sorted = [...state.chambers].sort((a, b) => (order[a.key] ?? 9) - (order[b.key] ?? 9));
  container.innerHTML = sorted.map(renderChamberScaffold).join("");
  state.chambers = sorted;
}

function updateTimestamp() {
  const node = document.getElementById("last-updated");
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
    return {
      chambers,
      history: Array.isArray(payload?.history) ? payload.history : [],
    };
  } catch (error) {
    console.warn("静的JSONの取得に失敗したためモックデータを使用します", error);
    state.sourceUpdatedAt = null;
    return {
      chambers: MOCK_PARLIAMENT_DATA,
      history: MOCK_HISTORY_DATA,
    };
  }
}

async function bootstrap() {
  const payload = await getParliamentData();
  state.chambers = normalizeData(payload.chambers);
  state.history = normalizeHistory(payload.history);
  renderAllScaffolds();
  state.chambers.forEach((chamber) => renderChamber(chamber));
  renderHistory();
  updateTimestamp();
}

bootstrap().catch((error) => {
  console.error("初期化エラー", error);
});
