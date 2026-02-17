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

const GOVERNMENT_GROUP_NAMES = new Set(["自由民主党", "公明党"]);
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
    house: "衆議院",
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
    house: "参議院",
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

const state = {
  chambers: [],
  highlightedByChamber: {},
};

function inferBloc(groupName) {
  return GOVERNMENT_GROUP_NAMES.has(groupName) ? "government" : "opposition";
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

function normalizeData(data) {
  return data.map((chamber) => ({
    key: chamber.key,
    house: chamber.house,
    groups: chamber.groups
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

function renderFactionBar(chamber) {
  const total = chamber.groups.reduce((sum, group) => sum + group.seats, 0);
  const container = document.getElementById(`faction-bar-${chamber.key}`);
  if (!container) {
    return;
  }
  container.innerHTML = "";

  chamber.groups.forEach((group) => {
    const pct = total > 0 ? (group.seats / total) * 100 : 0;
    const segment = document.createElement("div");
    segment.className = "faction-segment";
    segment.dataset.group = group.name;
    segment.style.width = `${pct}%`;
    segment.style.background = group.color;
    segment.title = `${group.name} ${group.seats}議席`;
    segment.textContent = group.shortLabel || shortLabel(group.name);
    segment.addEventListener("mouseenter", () => {
      state.highlightedByChamber[chamber.key] = group.name;
      updateHighlight(chamber);
    });
    segment.addEventListener("mouseleave", () => {
      state.highlightedByChamber[chamber.key] = "";
      updateHighlight(chamber);
    });
    container.appendChild(segment);
  });
}

function renderLegend(chamber) {
  const total = chamber.groups.reduce((sum, group) => sum + group.seats, 0);
  const tbody = document.getElementById(`legend-body-${chamber.key}`);
  if (!tbody) {
    return;
  }
  tbody.innerHTML = "";
  chamber.groups.forEach((group) => {
    const ratio = total > 0 ? ((group.seats / total) * 100).toFixed(1) : "0.0";
    const tr = document.createElement("tr");
    tr.className = "legend-row";
    tr.dataset.group = group.name;
    tr.innerHTML = `
      <td class="legend-name-cell">
        <span class="legend-dot" style="background:${group.color}"></span>
        <span>${group.name}</span>
      </td>
      <td>${group.bloc === "government" ? "与党" : "野党・他"}</td>
      <td>${group.seats}</td>
      <td>${ratio}%</td>
    `;
    tr.addEventListener("mouseenter", () => {
      state.highlightedByChamber[chamber.key] = group.name;
      updateHighlight(chamber);
    });
    tr.addEventListener("mouseleave", () => {
      state.highlightedByChamber[chamber.key] = "";
      updateHighlight(chamber);
    });
    tbody.appendChild(tr);
  });
}

function renderBlocSummary(chamber) {
  const total = chamber.groups.reduce((sum, group) => sum + group.seats, 0);
  const governmentSeats = chamber.groups
    .filter((group) => group.bloc === "government")
    .reduce((sum, group) => sum + group.seats, 0);
  const oppositionSeats = Math.max(0, total - governmentSeats);

  const govPct = total > 0 ? (governmentSeats / total) * 100 : 0;
  const oppPct = Math.max(0, 100 - govPct);

  const govNode = document.getElementById(`bloc-government-${chamber.key}`);
  const oppNode = document.getElementById(`bloc-opposition-${chamber.key}`);
  const majorityNode = document.getElementById(`marker-majority-${chamber.key}`);
  const twoThirdNode = document.getElementById(`marker-twothird-${chamber.key}`);

  if (!govNode || !oppNode || !majorityNode || !twoThirdNode) {
    return;
  }

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
        <div class="bloc-bar">
          <div id="bloc-government-${chamber.key}" class="bloc-segment bloc-government"></div>
          <div id="bloc-opposition-${chamber.key}" class="bloc-segment bloc-opposition"></div>
        </div>
        <div class="bloc-markers">
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
      </section>
      <aside class="legend-panel">
        <h3>会派一覧</h3>
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
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  node.textContent = `更新日時: ${formatter.format(new Date())}`;
}

async function getParliamentData() {
  // 将来は fetch("/api/kokkai-groups.json") に置き換え。
  return Promise.resolve(MOCK_PARLIAMENT_DATA);
}

async function bootstrap() {
  const raw = await getParliamentData();
  state.chambers = normalizeData(raw);
  renderAllScaffolds();
  state.chambers.forEach((chamber) => renderChamber(chamber));
  updateTimestamp();
}

bootstrap().catch((error) => {
  console.error("初期化エラー", error);
});
