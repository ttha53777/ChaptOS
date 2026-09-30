const SETTINGS = [
  { id: "overview", group: "Overview", label: "Overview", code: "00", summary: "All settings", description: "Find anything and understand what is already configured.", keywords: "home index find search settings" },
  { id: "general", group: "Your chapter", label: "Chapter profile", code: "01", summary: "Lambda Phi Epsilon", description: "Identity, logo and chapter-wide preferences.", keywords: "name logo icon identity chapter general export" },
  { id: "vocabulary", group: "Your chapter", label: "Language & labels", code: "02", summary: "3 custom labels", description: "Use the words your organization actually uses.", keywords: "vocabulary words labels member brother semester period" },
  { id: "accounts", group: "People & access", label: "Member accounts", code: "03", summary: "42 connected", description: "Review sign-in connections and account access.", keywords: "google account email login unlink member brother" },
  { id: "invitations", group: "People & access", label: "Invitations", code: "04", summary: "2 active links", description: "Create invite links and review how people join.", keywords: "invite link join request admission approval member" },
  { id: "roles", group: "People & access", label: "Roles & permissions", code: "05", summary: "6 roles", description: "Define responsibilities and access by role.", keywords: "permissions officer admin access president treasurer role" },
  { id: "member-fields", group: "People & access", label: "Member fields", code: "06", summary: "4 custom fields", description: "Choose what your roster records about each member.", keywords: "custom field roster major pledge class graduation member" },
  { id: "thresholds", group: "Standards & reporting", label: "Good standing", code: "07", summary: "75% attendance", description: "Set attendance, GPA and service expectations.", keywords: "threshold at risk watch attendance gpa service hours standing" },
  { id: "semesters", group: "Standards & reporting", label: "Semesters", code: "08", summary: "Spring 2026 active", description: "Manage current and upcoming reporting periods.", keywords: "semester period term dates active reporting" },
  { id: "custom-metrics", group: "Standards & reporting", label: "Custom metrics", code: "09", summary: "2 metrics", description: "Track organization-specific goals beyond the defaults.", keywords: "metric recruitment points goals targets custom" },
  { id: "event-types", group: "Events & finance", label: "Event types", code: "10", summary: "7 categories", description: "Organize timeline events with meaningful categories.", keywords: "event type category color timeline meeting social service" },
  { id: "event-fields", group: "Events & finance", label: "Event fields", code: "11", summary: "12 fields", description: "Choose the information collected for every event.", keywords: "event field budget venue headcount contact programming" },
  { id: "calendar", group: "Events & finance", label: "Calendar subscription", code: "12", summary: "Enabled", description: "Publish live events and deadlines to member calendars.", keywords: "calendar feed ical google apple subscribe timeline" },
  { id: "money-categories", group: "Events & finance", label: "Money categories", code: "13", summary: "9 categories", description: "Structure treasury income and expense reporting.", keywords: "money finance treasury transaction category income expense" },
  { id: "workflows", group: "Events & finance", label: "Workspace & workflows", code: "14", summary: "7 of 9 visible", description: "Choose which tools appear in chapter navigation.", keywords: "workflow pages sidebar enable disable instagram parties treasury" },
  { id: "activity-log", group: "Administration", label: "Activity log", code: "15", summary: "Updated 8m ago", description: "Review who changed what, and when.", keywords: "audit history changes activity who when" },
  { id: "billing", group: "Administration", label: "Plan & billing", code: "16", summary: "Standard · active", description: "Manage the platform subscription and invoices.", keywords: "billing plan payment card invoice subscription price" },
  { id: "administration", group: "Administration", label: "Workspace administration", code: "17", summary: "Owner controls", description: "Transfer, leave or delete this workspace.", keywords: "danger delete organization leave transfer ownership admin" },
];

const GROUPS = [
  { name: "Your chapter", description: "The identity and language everyone sees.", ids: ["general", "vocabulary"] },
  { name: "People & access", description: "Who belongs here, and what they can do.", ids: ["accounts", "invitations", "roles", "member-fields"] },
  { name: "Standards & reporting", description: "Define a successful semester.", ids: ["thresholds", "semesters", "custom-metrics"] },
  { name: "Events & finance", description: "Set up how your chapter operates.", ids: ["event-types", "event-fields", "calendar", "money-categories", "workflows"] },
  { name: "Administration", description: "Subscription, history and ownership controls.", ids: ["billing", "activity-log", "administration"] },
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const meta = id => SETTINGS.find(item => item.id === id) || SETTINGS[0];

const state = {
  current: "overview",
  dirty: false,
  savedMarkup: "",
  pendingRoute: null,
  searchIndex: 0,
  searchQuery: "",
};

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function head(item, lede = item.description, actions = "") {
  return `<header class="page-head">
    <div class="page-head-copy">
      <h2>${escapeHTML(item.label)}</h2>
      <p class="lede">${escapeHTML(lede)}</p>
    </div>
    ${actions ? `<div class="page-head-actions">${actions}</div>` : ""}
  </header>`;
}

function button(label, tone = "quiet", attrs = "") {
  return `<button type="button" class="button ${tone}" ${attrs}>${label}</button>`;
}

function card(title, description, content, footer = "", className = "") {
  return `<section class="settings-card ${className}">
    <header class="card-head"><h3>${title}</h3>${description ? `<p>${description}</p>` : ""}</header>
    <div>${content}</div>
    ${footer ? `<footer class="card-foot">${footer}</footer>` : ""}
  </section>`;
}

function row(label, description, control, className = "") {
  return `<div class="setting-row ${className}">
    <div class="setting-label"><b>${label}</b>${description ? `<p>${description}</p>` : ""}</div>
    <div class="control">${control}</div>
  </div>`;
}

function textInput(value, label, extra = "") {
  return `<input class="input" value="${escapeHTML(value)}" aria-label="${escapeHTML(label)}" data-dirty-control ${extra}>`;
}

function select(options, selected, label) {
  return `<select class="select" aria-label="${escapeHTML(label)}" data-dirty-control>${options.map(option => `<option ${option === selected ? "selected" : ""}>${escapeHTML(option)}</option>`).join("")}</select>`;
}

function toggle(checked, label) {
  return `<label class="toggle" aria-label="${escapeHTML(label)}"><input type="checkbox" ${checked ? "checked" : ""} data-dirty-control><span></span></label>`;
}

function contextRail(item, notes = []) {
  return `<aside class="context-rail" aria-label="About this setting">
    <section class="context-block">
      <h3>Scope</h3>
      <p>Changes apply to everyone in Lambda Phi Epsilon.</p>
    </section>
    <section class="context-block">
      <h3>Saved state</h3>
      <p class="context-status"><span class="status-dot"></span>${escapeHTML(item.summary)}</p>
    </section>
    ${notes.length ? `<section class="context-block"><h3>Good to know</h3><ul>${notes.map(note => `<li>${escapeHTML(note)}</li>`).join("")}</ul></section>` : ""}
    <section class="context-block">
      <a href="#/activity-log">View related changes →</a>
    </section>
  </aside>`;
}

function detail(item, cards, notes = [], actions = "") {
  return `${head(item, item.description, actions)}
    <div class="detail-layout">
      <div class="form-stack">${cards}</div>
    </div>`;
}

function overview() {
  const directory = GROUPS.map((group, index) => {
    const entries = group.ids.map(id => {
      const item = meta(id);
      return `<a class="directory-entry" href="#/${item.id}" data-directory-search="${escapeHTML(`${item.label} ${item.description} ${item.keywords}`.toLowerCase())}">
        <div><b>${escapeHTML(item.label)}</b><p>${escapeHTML(item.description)}</p><small>${escapeHTML(item.summary)}</small></div><span>›</span>
      </a>`;
    }).join("");
    return `<section class="directory-group" data-directory-group>
      <header class="directory-group-head"><span class="directory-group-num">0${index + 1}</span><div><h3>${escapeHTML(group.name)}</h3><p>${escapeHTML(group.description)}</p></div></header>
      <div class="directory-entries">${entries}</div>
    </section>`;
  }).join("");

  return `<div class="overview-intro">
      ${head({ ...meta("overview"), group: "Workspace settings", code: "Index" }, "One clear place for your chapter, people, standards and system controls.")}
      <aside class="chapter-snapshot">
        <div class="snapshot-top"><span class="snapshot-mark">ΛΦ</span><div><strong>Lambda Phi Epsilon</strong><span>Spring 2026 · active</span></div></div>
        <div class="snapshot-grid"><div><b>42</b><small>Members</small></div><div><b>17</b><small>Areas configured</small></div></div>
      </aside>
    </div>
    <section class="directory-search">
      <label for="directory-search-input">What would you like to change?</label>
      <div class="directory-search-box"><span>⌕</span><input id="directory-search-input" type="search" placeholder="Try “permissions”, “attendance”, “invoice” or “delete”…"><kbd>⌘ K</kbd></div>
    </section>
    <nav class="quick-links" aria-label="Common settings">
      <span class="eyebrow">Common</span>
      <a href="#/invitations">Invite members</a><a href="#/roles">Edit permissions</a><a href="#/semesters">Manage semester</a>
    </nav>
    <div class="settings-directory">${directory}</div>
    <div class="no-results" id="directory-empty"><h3>No settings found</h3><p>Try a broader phrase, such as “members”, “events” or “billing”.</p></div>`;
}

function generalPage() {
  const item = meta("general");
  const identity = card("Chapter identity", "Shown in navigation, reports and invitations.",
    row("Chapter name", "Changing the name does not change your URL.", textInput("Lambda Phi Epsilon", "Chapter name")) +
    row("Chapter mark", "Square PNG, JPG or SVG · maximum 2 MB.", `<div class="avatar-line"><i>ΛΦ</i>${button("Replace image", "quiet", "data-demo-action='Image picker opened'")}</div>`) +
    row("Active semester", "Drives dashboards and period-based reporting.", select(["Spring 2026", "Fall 2025", "Spring 2025"], "Spring 2026", "Active semester"))
  );
  const preferences = card("General preferences", "Defaults for new records and exports.",
    row("Timezone", "Used for event times and activity history.", select(["America/New_York", "America/Chicago", "America/Los_Angeles"], "America/New_York", "Timezone")) +
    row("Week starts on", "Affects calendars and weekly summaries.", select(["Sunday", "Monday"], "Sunday", "Week start")) +
    row("Include archived members", "Show archived members in exports by default.", toggle(false, "Include archived members"))
  );
  return detail(item, identity + preferences, ["Only org admins can rename the chapter.", "Your existing chapter URL stays the same."]);
}

function vocabularyPage() {
  const item = meta("vocabulary");
  return detail(item, card("Organization language", "Changes appear across navigation, forms and reports.",
    row("Member", "Default: Brother", textInput("Brother", "Member label")) +
    row("Organization", "Default: Chapter", textInput("Chapter", "Organization label")) +
    row("Reporting period", "Default: Semester", textInput("Semester", "Reporting period label")) +
    row("Service", "Default: Service", textInput("Service", "Service label")),
    button("Restore default labels", "quiet", "data-demo-action='Default labels restored'")
  ), ["Use singular labels; the app handles plural forms.", "Changes update member-facing screens too."]);
}

function accountsPage() {
  const item = meta("accounts");
  const people = [
    ["Daniel Kim", "DK", "daniel.kim@example.com", "Org admin"],
    ["Michael Chen", "MC", "michael.chen@example.com", "Connected"],
    ["Ethan Wu", "EW", "ethan.wu@example.com", "Connected"],
    ["Alex Nguyen", "AN", "alex.nguyen@example.com", "Connected"],
  ];
  const content = people.map(([name, initials, email, status]) => `<div class="setting-row"><div class="setting-label avatar-line"><i>${initials}</i><div><b>${name}</b><p>${email}</p></div></div><div class="row-actions"><span class="chip ${status === "Org admin" ? "warn" : "good"}">${status}</span>${button("Manage", "quiet small", `data-demo-action='Managing ${name}'`)}</div></div>`).join("");
  return detail(item, card("Connected members", "42 of 42 active members have a sign-in account.", content, button("Export account list", "quiet", "data-demo-action='Account list exported'")), ["Unlinking a person does not remove their roster record.", "Platform admins are managed separately."]);
}

function invitationsPage() {
  const item = meta("invitations");
  const content = [
    ["Fall recruitment", "14 requests · expires Oct 1", true],
    ["Officer referral", "3 requests · no expiration", true],
    ["Spring 2026 rush", "Closed · 28 requests", false],
  ].map(([name, description, active]) => row(name, description, `<div class="row-actions"><span class="chip ${active ? "good" : ""}">${active ? "Active" : "Closed"}</span>${button(active ? "Copy link" : "View", "quiet small", `data-demo-action='${active ? "Invite link copied" : "Invite details opened"}'`)}</div>`)).join("");
  return detail(item, card("Invite links", "Opening a link creates a request. An officer must approve every new member.", content, button("Create invite link", "primary", "data-demo-action='New invite flow opened'")), ["Pending requests do not create roster records.", "Seat limits are checked when a request is approved."], button("Review join requests", "quiet", "data-demo-action='Join requests opened'"));
}

function rolesPage() {
  const item = meta("roles");
  const roles = [
    ["President", "2 members", "All chapter settings", "#b49aef"],
    ["Treasurer", "1 member", "Treasury and reports", "#d6ad68"],
    ["Secretary", "2 members", "Events, attendance and records", "#8fafc5"],
    ["Recruitment", "3 members", "Invitations and member review", "#8fb49a"],
  ];
  const content = roles.map(([name, count, permissions, color]) => `<div class="setting-row"><span class="swatch" style="background:${color}"></span><div class="setting-label"><b>${name}</b><p>${permissions} · ${count}</p></div>${button("Edit role", "quiet small", `data-demo-action='Editing ${name}'`)}</div>`).join("");
  return detail(item, card("Roles", "Permissions are additive when a member has more than one role.", content, button("Create role", "primary", "data-demo-action='Role builder opened'")), ["Org admins can always manage billing and ownership.", "Removing every permission turns a role into a label only."]);
}

function memberFieldsPage() {
  const item = meta("member-fields");
  const fields = [
    ["Major", "Text · shown on roster", true],
    ["Graduation year", "Number · shown on roster", true],
    ["Pledge class", "Select · 8 options", true],
    ["Big brother", "Member · profile only", false],
  ];
  const content = fields.map(([name, description, required]) => row(name, description, `<div class="row-actions"><span class="chip">${required ? "Required" : "Optional"}</span>${button("Edit", "quiet small", `data-demo-action='Editing ${name}'`)}</div>`)).join("");
  return detail(item, card("Custom member fields", "Fields appear on every member profile and can optionally show in the roster.", content, button("Add member field", "primary", "data-demo-action='Field builder opened'")), ["Select fields now include an options editor.", "Deleting a field also deletes its saved values."]);
}

function thresholdsPage() {
  const item = meta("thresholds");
  const metricRows = (risk, watch, unit, prefix) =>
    row("At risk below", "Members below this value receive an At risk status.", `<div class="inline-control">${textInput(risk, `${prefix} at-risk threshold`, `type='number'`)}<span class="unit">${unit}</span></div>`) +
    row("Watch below", "Members below this value receive a Watch status.", `<div class="inline-control">${textInput(watch, `${prefix} watch threshold`, `type='number'`)}<span class="unit">${unit}</span></div>`);
  return detail(item,
    card("Attendance", "Calculated from required events in the active semester.", metricRows("75", "85", "%", "Attendance")) +
    card("GPA", "Used only when GPA tracking is enabled for a member.", metricRows("2.5", "2.8", "", "GPA")) +
    card("Service", "Semester goal for community-service hours.", row("Hours goal", "Progress appears on the dashboard and member profiles.", `<div class="inline-control">${textInput("20", "Service hours goal", "type='number'")}<span class="unit">h</span></div>`)),
    ["At risk must be lower than Watch.", "The preview updates after you save."]
  );
}

function semestersPage() {
  const item = meta("semesters");
  const terms = [
    ["Spring 2026", "Jan 12 – May 9, 2026", "Active"],
    ["Fall 2025", "Aug 25 – Dec 14, 2025", "Closed"],
    ["Spring 2025", "Jan 13 – May 10, 2025", "Closed"],
  ];
  const content = terms.map(([name, dates, status]) => row(name, dates, `<div class="row-actions"><span class="chip ${status === "Active" ? "good" : ""}">${status}</span>${button("Edit", "quiet small", `data-demo-action='Editing ${name}'`)}</div>`)).join("");
  return detail(item, card("Reporting periods", "Prepare the next semester without changing the active one.", content, button("Create semester", "primary", "data-demo-action='Semester builder opened'")), ["Only one semester can be active at a time.", "Closed semesters remain available in reports."]);
}

function customMetricsPage() {
  const item = meta("custom-metrics");
  const content = [
    ["Recruitment points", "Goal 12 · at risk below 5", "12 pts"],
    ["Study-table hours", "Goal 8 · at risk below 3", "8 h"],
  ].map(([name, description, goal]) => row(name, description, `<div class="row-actions"><span class="chip">${goal}</span>${button("Edit", "quiet small", `data-demo-action='Editing ${name}'`)}</div>`)).join("");
  return detail(item, card("Tracked metrics", "Additional goals appear beside attendance, GPA and service.", content, button("Add metric", "primary", "data-demo-action='Metric builder opened'")), ["Goals and at-risk values are validated together.", "Metrics can be archived without losing history."]);
}

function eventTypesPage() {
  const item = meta("event-types");
  const types = [["Chapter meeting", "#8fafc5"], ["Service", "#8fb49a"], ["Brotherhood", "#b49aef"], ["Social", "#e29aae"], ["Professional", "#d6ad68"]];
  const content = types.map(([name, color]) => `<div class="setting-row"><span class="swatch" style="background:${color}"></span><div class="setting-label"><b>${name}</b><p>Shown on Timeline and event reports</p></div>${button("Edit", "quiet small", `data-demo-action='Editing ${name}'`)}</div>`).join("");
  return detail(item, card("Event categories", "Colors are shared anywhere this event type appears.", content, button("Add event type", "primary", "data-demo-action='Event type builder opened'")), ["Built-in types can be renamed but not deleted.", "Use one color per meaning; avoid decorative color."]);
}

function eventFieldsPage() {
  const item = meta("event-fields");
  const fields = [["Venue", "Text · all events", true], ["Expected attendance", "Number · all events", true], ["Budget", "Currency · planning view", true], ["Transportation", "Long text · optional", false]];
  const content = fields.map(([name, description, enabled]) => row(name, description, toggle(enabled, `${name} enabled`))).join("");
  return detail(item, card("Event information", "Choose which questions officers answer when planning an event.", content, button("Add custom field", "primary", "data-demo-action='Event field builder opened'")), ["Disabled fields keep their historical values.", "Required fields must be completed before publishing."]);
}

function calendarPage() {
  const item = meta("calendar");
  return detail(item,
    card("Member calendar", "One subscription keeps events and deadlines up to date automatically.",
      row("Calendar feed", "Available to all active members.", toggle(true, "Calendar feed enabled")) +
      row("Include deadlines", "Add task and document deadlines to the feed.", toggle(true, "Include deadlines")) +
      row("Include optional events", "Members can hide individual calendars later.", toggle(false, "Include optional events")) +
      row("Subscription address", "Treat this link like a password.", `<div class="inline-control">${textInput("webcal://figurints.app/lpe/••••••", "Calendar URL", "readonly")} ${button("Copy", "quiet small", "data-demo-action='Calendar link copied'")}</div>`)
    ),
    ["Regenerating the link disconnects existing subscriptions.", "Calendar updates can take several minutes to appear."]
  );
}

function moneyCategoriesPage() {
  const item = meta("money-categories");
  const categories = [["Member dues", "Income", "#8fb49a"], ["Event revenue", "Income", "#8fafc5"], ["Programming", "Expense", "#b49aef"], ["Philanthropy", "Expense", "#d6ad68"], ["Operations", "Expense", "#e29aae"]];
  const content = categories.map(([name, kind, color]) => `<div class="setting-row"><span class="swatch" style="background:${color}"></span><div class="setting-label"><b>${name}</b><p>${kind} · available in Treasury</p></div>${button("Edit", "quiet small", `data-demo-action='Editing ${name}'`)}</div>`).join("");
  return detail(item, card("Transaction categories", "Use a short, stable list so reports remain comparable.", content, button("Add category", "primary", "data-demo-action='Category builder opened'")), ["System-generated categories cannot be deleted.", "Renaming a category updates historical reports."]);
}

function workflowsPage() {
  const item = meta("workflows");
  const workflows = [["Dashboard", "Chapter health and quick actions", true, true], ["Timeline", "Events, deadlines and calendar", true, true], ["Chapter", "Roster and member profiles", true, true], ["Treasury", "Transactions, dues and budgets", true, false], ["Documents", "Shared notes and files", true, false], ["Instagram", "Social publishing workflow", false, false], ["Parties", "Event revenue and wrap-up", true, false], ["Service", "Service events and hours", true, false]];
  const content = workflows.map(([name, description, checked, locked]) => row(name, description, locked ? `<span class="chip">Always on</span>` : toggle(checked, `${name} workflow enabled`))).join("");
  return detail(item, card("Workspace navigation", "Turn optional product areas on or off for everyone.", content), ["Dashboard, Timeline and Chapter are always available.", "Hidden workflows keep their existing data."]);
}

function activityPage() {
  const item = meta("activity-log");
  const events = [
    ["8m ago", "Daniel Kim", "updated Good standing thresholds"],
    ["42m ago", "Michael Chen", "approved a member request"],
    ["Yesterday", "Daniel Kim", "created the Fall recruitment invite"],
    ["Sep 27", "Ethan Wu", "renamed the Service event type"],
    ["Sep 26", "System", "renewed the Standard plan"],
  ];
  const content = events.map(([time, actor, action]) => `<div class="setting-row activity-row"><span class="activity-time">${time}</span><p class="activity-copy"><strong>${actor}</strong> ${action}.</p>${button("Details", "quiet small", "data-demo-action='Activity details opened'")}</div>`).join("");
  return detail(item, card("Recent changes", "An organization-wide record of settings and data changes.", content, button("Export activity", "quiet", "data-demo-action='Activity exported'")), ["Activity history is read-only.", "Use filters in production to narrow by person or area."], `${button("Filter", "quiet", "data-demo-action='Activity filters opened'")}`);
}

function billingPage() {
  const item = meta("billing");
  return detail(item,
    card("Standard plan", "$25 per month · up to 50 active members.",
      row("Plan status", "Renews automatically on October 1, 2026.", `<span class="chip good">Active</span>`) +
      row("Members", "Active roster seats used by this workspace.", `<span class="chip">42 / 50</span>`) +
      row("Payment method", "Visa ending in 4242.", button("Update", "quiet small", "data-demo-action='Billing portal opened'")),
      button("Manage subscription", "primary", "data-demo-action='Billing portal opened'")
    ) +
    card("Invoices", "Receipts are sent to the workspace owner.",
      row("September 2026", "Paid Sep 1", `<div class="row-actions"><span class="chip">$25.00</span>${button("View", "quiet small", "data-demo-action='Invoice opened'")}</div>`) +
      row("August 2026", "Paid Aug 1", `<div class="row-actions"><span class="chip">$25.00</span>${button("View", "quiet small", "data-demo-action='Invoice opened'")}</div>`)
    ),
    ["Billing is available only to the org owner and platform admins.", "Chapter treasury records are separate from this subscription."]
  );
}

function administrationPage() {
  const item = meta("administration");
  return detail(item,
    card("Ownership", "The owner is responsible for billing and final workspace control.",
      row("Workspace owner", "daniel.kim@example.com", `<div class="avatar-line"><i>DK</i>${button("Transfer", "quiet small", "data-demo-action='Ownership transfer opened'")}</div>`) +
      row("Your membership", "Leave this organization without deleting it.", button("Leave workspace", "danger small", "data-demo-action='Leave confirmation opened'"))
    ) +
    card("Delete workspace", "Permanently removes members, events, transactions, documents and history.",
      row("Lambda Phi Epsilon", "This action cannot be undone.", button("Delete organization", "danger", "data-demo-action='Delete confirmation opened'")),
      "", "danger-zone"
    ),
    ["Transfer ownership before leaving if you are the current owner.", "Exports should be downloaded before deletion."]
  );
}

const PAGE_RENDERERS = {
  overview,
  general: generalPage,
  vocabulary: vocabularyPage,
  accounts: accountsPage,
  invitations: invitationsPage,
  roles: rolesPage,
  "member-fields": memberFieldsPage,
  thresholds: thresholdsPage,
  semesters: semestersPage,
  "custom-metrics": customMetricsPage,
  "event-types": eventTypesPage,
  "event-fields": eventFieldsPage,
  calendar: calendarPage,
  "money-categories": moneyCategoriesPage,
  workflows: workflowsPage,
  "activity-log": activityPage,
  billing: billingPage,
  administration: administrationPage,
};

function buildNav() {
  const groups = [{ name: "", ids: ["overview"] }, ...GROUPS];
  $("#section-list").innerHTML = groups.map(group => `${group.name ? `<p class="nav-group-label">${group.name}</p>` : ""}${group.ids.map(id => {
    const item = meta(id);
    return `<a class="section-link" href="#/${item.id}" data-nav-id="${item.id}"><span class="nav-glyph">${item.code}</span><span>${escapeHTML(item.label)}</span>${id === "billing" ? `<span class="nav-meta">↗</span>` : ""}</a>`;
  }).join("")}`).join("");
}

function routeFromHash() {
  const id = location.hash.replace(/^#\//, "").split("?")[0] || "overview";
  return PAGE_RENDERERS[id] ? id : "overview";
}

function requestRoute(id) {
  if (!state.dirty) {
    if (location.hash !== `#/${id}`) location.hash = `#/${id}`;
    else render(id);
    return;
  }
  state.pendingRoute = id;
  $("#confirm-dialog").showModal();
}

function render(id = routeFromHash()) {
  const item = meta(id);
  state.current = id;
  state.dirty = false;
  $("#content-frame").innerHTML = PAGE_RENDERERS[id]();
  state.savedMarkup = $("#content-frame").innerHTML;
  $("#crumb-current").textContent = item.label;
  document.title = `${item.label} · Figurints settings mock`;
  $$('[data-nav-id]').forEach(link => {
    const active = link.dataset.navId === id;
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  });
  setDirty(false);
  $("#content-scroll").scrollTop = 0;
  closeNav();
  if (id === "overview") setupDirectorySearch();
}

function setDirty(dirty) {
  state.dirty = dirty;
  $("#save-tray").classList.toggle("is-visible", dirty);
  $(".sync-state").classList.toggle("is-dirty", dirty);
  $(".sync-state").innerHTML = dirty ? "<i></i> Unsaved changes" : "<i></i> All changes saved";
  $("#save-context").textContent = meta(state.current).label;
}

function setupDirectorySearch() {
  const input = $("#directory-search-input");
  if (!input) return;
  input.addEventListener("input", () => filterDirectory(input.value));
}

function filterDirectory(value) {
  const terms = value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  let visible = 0;
  $$("[data-directory-search]").forEach(entry => {
    const show = terms.every(term => entry.dataset.directorySearch.includes(term));
    entry.hidden = !show;
    if (show) visible += 1;
  });
  $$("[data-directory-group]").forEach(group => {
    group.hidden = !$$('[data-directory-search]', group).some(entry => !entry.hidden);
  });
  $("#directory-empty").classList.toggle("is-visible", visible === 0);
}

function searchMatches(query) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return SETTINGS.filter(item => item.id !== "overview").slice(0, 8);
  return SETTINGS.filter(item => item.id !== "overview" && terms.every(term => `${item.label} ${item.group} ${item.description} ${item.keywords}`.toLowerCase().includes(term)));
}

function renderSearchResults() {
  const results = searchMatches(state.searchQuery);
  state.searchIndex = Math.min(state.searchIndex, Math.max(results.length - 1, 0));
  $("#search-results").innerHTML = results.length ? results.map((item, index) => `<button type="button" class="search-result ${index === state.searchIndex ? "is-selected" : ""}" data-search-route="${item.id}">
    <span class="result-index">${item.code}</span><span><b>${escapeHTML(item.label)}</b><small>${escapeHTML(item.description)}</small></span><em>${escapeHTML(item.group)}</em>
  </button>`).join("") : `<div class="search-results-empty">No settings match “${escapeHTML(state.searchQuery)}”. Try a broader phrase.</div>`;
}

function openSearch(prefill = "") {
  state.searchQuery = prefill;
  state.searchIndex = 0;
  $("#global-search").value = prefill;
  renderSearchResults();
  if (!$("#search-dialog").open) $("#search-dialog").showModal();
  requestAnimationFrame(() => $("#global-search").focus());
}

function openNav() { $("#settings-nav").classList.add("is-open"); }
function closeNav() { $("#settings-nav").classList.remove("is-open"); }

let toastTimer;
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2600);
}

document.addEventListener("click", event => {
  const link = event.target.closest("a[href^='#/']");
  if (link) {
    const id = link.getAttribute("href").replace(/^#\//, "");
    if (PAGE_RENDERERS[id]) {
      event.preventDefault();
      requestRoute(id);
      return;
    }
  }
  if (event.target.closest("[data-open-nav]")) openNav();
  if (event.target.closest("[data-close-nav]")) closeNav();
  if (event.target.closest("[data-focus-search]")) openSearch(state.searchQuery);
  if (event.target.closest("[data-dismiss-note]")) $(".prototype-note").remove();
  const action = event.target.closest("[data-demo-action]");
  if (action) toast(action.dataset.demoAction);
  const result = event.target.closest("[data-search-route]");
  if (result) {
    $("#search-dialog").close();
    requestRoute(result.dataset.searchRoute);
  }
  if (event.target.closest("[data-save]")) {
    $$('[data-dirty-control]').forEach(control => {
      if (control.tagName === 'SELECT') [...control.options].forEach(option => option.toggleAttribute('selected', option.selected));
      else if (control.type === 'checkbox') control.toggleAttribute('checked', control.checked);
      else control.setAttribute('value', control.value);
    });
    state.savedMarkup = $("#content-frame").innerHTML;
    setDirty(false);
    toast(`${meta(state.current).label} saved for everyone.`);
  }
  if (event.target.closest("[data-discard]")) {
    $("#content-frame").innerHTML = state.savedMarkup;
    setDirty(false);
    toast("Changes discarded.");
  }
  if (event.target.closest("[data-cancel-confirm]")) {
    state.pendingRoute = null;
    $("#confirm-dialog").close();
  }
  if (event.target.closest("[data-accept-confirm]")) {
    const next = state.pendingRoute;
    state.pendingRoute = null;
    $("#confirm-dialog").close();
    setDirty(false);
    if (next) {
      location.hash = `#/${next}`;
      if (routeFromHash() === next) render(next);
    }
  }
});

document.addEventListener("input", event => {
  if (event.target.id === "global-search") {
    state.searchQuery = event.target.value;
    state.searchIndex = 0;
    renderSearchResults();
    return;
  }
  if (event.target.matches("[data-dirty-control]")) setDirty(true);
});

document.addEventListener("change", event => {
  if (event.target.matches("[data-dirty-control]")) setDirty(true);
});

document.addEventListener("keydown", event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openSearch(state.searchQuery);
    return;
  }
  if (!$("#search-dialog").open) return;
  const matches = searchMatches(state.searchQuery);
  if (event.key === "ArrowDown") {
    event.preventDefault();
    state.searchIndex = Math.min(state.searchIndex + 1, matches.length - 1);
    renderSearchResults();
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    state.searchIndex = Math.max(state.searchIndex - 1, 0);
    renderSearchResults();
  }
  if (event.key === "Enter" && matches[state.searchIndex]) {
    event.preventDefault();
    $("#search-dialog").close();
    requestRoute(matches[state.searchIndex].id);
  }
});

window.addEventListener("hashchange", () => {
  const next = routeFromHash();
  if (state.dirty && next !== state.current) {
    history.replaceState(null, "", `#/${state.current}`);
    requestRoute(next);
  } else {
    render(next);
  }
});

window.addEventListener("beforeunload", event => {
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

buildNav();
if (!location.hash) history.replaceState(null, "", "#/overview");
render(routeFromHash());
