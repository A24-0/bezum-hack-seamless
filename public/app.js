const state = {
  role: "manager",
  projectId: "p1",
  epochId: "e1",
  apiBase: localStorage.getItem("apiBase") || "http://localhost:3000/api",
  context: { projects: [], epochs: [] },
};

const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const accessToken = localStorage.getItem("accessToken") || "";
  const response = await fetch(`${state.apiBase}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  return response.json();
}

function renderProjectSelectors() {
  $("projectSelect").innerHTML = state.context.projects
    .map((p) => `<option value="${p.id}" ${p.id === state.projectId ? "selected" : ""}>${p.name}</option>`)
    .join("");

  const epochs = state.context.epochs.filter((e) => e.projectId === state.projectId);
  if (!epochs.some((e) => e.id === state.epochId)) {
    state.epochId = epochs[0]?.id || "";
  }

  $("epochSelect").innerHTML = epochs
    .map((e) => `<option value="${e.id}" ${e.id === state.epochId ? "selected" : ""}>${e.name}</option>`)
    .join("");
}

function renderFlow() {
  const nodes = [
    ["Проект", ""],
    ["Эпоха", ""],
    ["Документ", ""],
    ["Задача", ""],
    ["Встреча", ""],
    ["PR/Релиз", ""],
  ];
  $("flowMap").innerHTML = nodes
    .map(([a, b]) => `<div class="node"><strong>${a}</strong><small>${b}</small></div>`)
    .join("");
}

function renderDocs(docs) {
  $("docsList").innerHTML =
    docs
      .map(
        (d) => `<article class="row"><h3>${d.title}</h3><div class="meta">scope: ${d.scope} · status: ${d.status} · version: v${d.version}</div><div class="pills">${d.taskLinks.map((x) => `<span class='pill'>task:${x.taskId}</span>`).join("")}${d.linkedMeetingId ? `<span class='pill'>meeting:${d.linkedMeetingId}</span>` : ""}</div></article>`,
      )
      .join("") || "<div class='row'><div class='meta'>Нет доступных документов</div></div>";
}

function renderKanban(tasks) {
  const cols = ["todo", "in_progress", "review", "done"];
  $("kanbanBoard").innerHTML = cols
    .map((c) => {
      const items = tasks.filter((t) => t.status === c);
      return `<section class="column"><h3>${c}</h3>${items.map((t) => `<div class="task"><strong>${t.id}</strong> ${t.title}<div class="meta">quote: ${t.docQuote}</div><div class="meta">pr: ${t.pr?.id ?? "-"}</div></div>`).join("") || "<div class='meta'>empty</div>"}</section>`;
    })
    .join("");
}

function renderMeetings(meetings) {
  $("meetingList").innerHTML = meetings
    .map(
      (m) => `<article class="row"><h3>${m.title}</h3><div class="meta">slots: ${m.slots.join(" / ")} · chosen: ${m.pickedSlot}</div><div class="meta">summary: ${m.summary}</div><div class="pills">${m.taskLinks.map((x) => `<span class='pill'>task:${x.taskId}</span>`).join("")}${m.docs.map((x) => `<span class='pill'>doc:${x.id}</span>`).join("")}</div></article>`,
    )
    .join("");
}

function renderCicd(section) {
  const prs = section.prs.map((p) => `<article class="row"><h3>PR ${p.id}</h3><div class="meta">task:${p.taskId} · status:${p.status}</div></article>`).join("");
  const rel = section.releases.map((r) => `<article class="row"><h3>${r.name}</h3><div class="meta">progress: ${r.tasksDone}/${r.total}</div></article>`).join("");
  $("cicdList").innerHTML = prs + rel;
}

function renderNotifications(notifications) {
  $("notificationsList").innerHTML = notifications
    .map((n) => `<article class="row"><h3>${n.type}</h3><div class="meta">${n.text}</div></article>`)
    .join("");
}

async function loadAll() {
  $("roleBadge").textContent = `Роль: ${state.role}`;
  $("apiBase").value = state.apiBase;

  const [overview, docs, kanban, meetings, cicd, notifications, graph] = await Promise.all([
    api(`/case/overview?projectId=${state.projectId}&epochId=${state.epochId}&role=${state.role}`),
    api(`/case/docs?epochId=${state.epochId}&role=${state.role}`),
    api(`/case/kanban?epochId=${state.epochId}`),
    api(`/case/meetings?epochId=${state.epochId}`),
    api(`/case/cicd?epochId=${state.epochId}`),
    api(`/case/notifications?projectId=${state.projectId}`),
    api(`/case/graph?projectId=${state.projectId}&epochId=${state.epochId}&role=${state.role}`),
  ]);

  $("mDocs").textContent = overview.docs;
  $("mTasks").textContent = overview.tasks;
  $("mMeetings").textContent = overview.meetings;

  renderFlow();
  renderDocs(docs);
  renderKanban(kanban);
  renderMeetings(meetings);
  renderCicd(cicd);
  renderNotifications(notifications);
  $("graphOutput").textContent = JSON.stringify(graph, null, 2);
}

async function bootstrap() {
  state.context = await api('/case/context');
  renderProjectSelectors();
  await loadAll();
}

async function runScenario(type) {
  const result = await api(`/case/scenario/${type}`, { method: 'POST' });
  $("scenarioOutput").textContent = JSON.stringify(result, null, 2);
  await loadAll();
}

$("roleSelect").addEventListener("change", async () => {
  state.role = $("roleSelect").value;
  await loadAll();
});

$("projectSelect").addEventListener("change", async () => {
  state.projectId = $("projectSelect").value;
  renderProjectSelectors();
  await loadAll();
});

$("epochSelect").addEventListener("change", async () => {
  state.epochId = $("epochSelect").value;
  await loadAll();
});

$("apiBase").addEventListener("change", async () => {
  state.apiBase = $("apiBase").value.trim().replace(/\/+$/, "");
  localStorage.setItem("apiBase", state.apiBase);
  await bootstrap();
});

$("scenarioTaskMeeting").addEventListener("click", () => runScenario("task-meeting"));
$("scenarioDocApprove").addEventListener("click", () => runScenario("doc-approve"));
$("scenarioPrSync").addEventListener("click", () => runScenario("pr-sync"));

document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    document.querySelectorAll(".pane").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    $(`tab-${t.dataset.tab}`).classList.add("active");
  });
});

$("roleSelect").value = state.role;
bootstrap().catch((error) => {
  $("scenarioOutput").textContent = `Ошибка загрузки: ${error.message}`;
});
