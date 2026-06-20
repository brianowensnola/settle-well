import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const FROM_EMAIL = process.env.BREVO_FROM_EMAIL || "noreply@bastroplaundrypro.com";
const FROM_NAME = process.env.BREVO_FROM_NAME || "SettleWell";

const TYPE_LABEL = { vehicle: "Vehicle", real_estate: "Real estate", financial: "Financial", business: "Business", personal: "Personal", other: "Other" };
const money = n => n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const esc = s => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// The catalog of reports the executor can run. Keep keys in sync with the client.
export const REPORTS = {
  assets: "Asset List (full detail)",
  inventory: "Estate Inventory (accounts, assets, debts, net worth)",
  ledger: "Transaction Ledger / Accounting",
  liabilities: "Debts & Monthly Obligations",
  reimbursements: "Reimbursements (pending & paid)",
  contacts: "Contacts Directory",
  tasks: "Task & Progress Report",
  communications: "Communications Log (calls, emails, letters, meetings)",
};

// Channel/direction labels for the communications report (mirrors the app).
const CH_LABEL = { phone: "Phone call", email: "Email", text: "Text / SMS", letter: "Letter / mail", in_person: "In person", document: "Documents sent", other: "Note" };
const DIR_LABEL = { inbound: "Received", outbound: "Sent" };

// ---- shared data helpers ----
async function accountBalances(estateId) {
  const [{ data: accts }, { data: txns }] = await Promise.all([
    admin.from("estate_financials").select("id, name, amount").eq("estate_id", estateId).eq("category", "account").order("name"),
    admin.from("estate_transactions").select("account_id, amount, reimburse_status").eq("estate_id", estateId),
  ]);
  const posted = (txns ?? []).filter(t => t.reimburse_status !== "pending");
  const balById = {};
  for (const t of posted) if (t.account_id) balById[t.account_id] = (balById[t.account_id] ?? 0) + (t.amount ?? 0);
  return (accts ?? []).map(a => ({ ...a, current: (a.amount ?? 0) + (balById[a.id] ?? 0) }));
}

// ---- report builders: each returns { title, sections[] } ----
const builders = {
  async inventory(estateId) {
    const accts = await accountBalances(estateId);
    const { data: fin } = await admin.from("estate_financials").select("*").eq("estate_id", estateId).eq("is_private", false);
    const assets = (fin ?? []).filter(f => f.category === "asset" && !["sold", "distributed"].includes(f.status));
    const liabs = (fin ?? []).filter(f => f.category === "liability");
    const obls = (fin ?? []).filter(f => f.category === "obligation");
    const cash = accts.reduce((s, a) => s + a.current, 0);
    const assetTotal = assets.reduce((s, a) => s + (a.amount ?? 0), 0);
    const liabTotal = liabs.reduce((s, l) => s + (l.amount ?? 0), 0);
    const oblTotal = obls.reduce((s, o) => s + (o.amount ?? o.amount_max ?? o.amount_min ?? 0), 0);
    return {
      title: "Estate Inventory",
      sections: [
        { heading: "Bank accounts", columns: ["Account", RH("Balance")], rows: accts.map(a => [a.name, R(money(a.current))]), total: { label: "Total cash", value: money(cash) } },
        { heading: "Assets", columns: ["Asset", RH("Value")], rows: assets.map(a => [a.name, R(money(a.amount))]), total: { label: "Total assets", value: money(assetTotal) } },
        { heading: "Liabilities", columns: ["Liability", "Lender", RH("Amount")], rows: liabs.map(l => [l.name, l.lender || "", R(money(l.amount))]), total: { label: "Total liabilities", value: money(liabTotal) } },
        { heading: "Monthly obligations", columns: ["Obligation", RH("Monthly")], rows: obls.map(o => [o.name, R(money(o.amount ?? o.amount_max ?? o.amount_min))]), total: { label: "Total monthly", value: money(oblTotal) } },
        { heading: "Summary", pairs: [["Net (assets − liabilities)", money(assetTotal - liabTotal)], ["Net worth (incl. cash)", money(cash + assetTotal - liabTotal)]] },
      ],
    };
  },
  async ledger(estateId) {
    const accts = await accountBalances(estateId);
    const { data: txns } = await admin.from("estate_transactions").select("*").eq("estate_id", estateId).order("date", { ascending: false });
    const acctName = id => accts.find(a => a.id === id)?.name || "";
    const posted = (txns ?? []).filter(t => t.reimburse_status !== "pending");
    const received = posted.filter(t => (t.amount ?? 0) > 0).reduce((s, t) => s + t.amount, 0);
    const spent = posted.filter(t => (t.amount ?? 0) < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    return {
      title: "Transaction Ledger",
      sections: [
        { heading: "Account balances", columns: ["Account", RH("Balance")], rows: accts.map(a => [a.name, R(money(a.current))]) },
        { heading: "Transactions", columns: ["Date", "Description", "Account", RH("Amount")], rows: posted.map(t => [t.date, t.description, acctName(t.account_id), R((t.amount >= 0 ? "+" : "−") + money(Math.abs(t.amount)).replace("$", "$"))]), total: { label: `Received ${money(received)} · Paid ${money(spent)} · Net`, value: money(received - spent) } },
      ],
    };
  },
  async liabilities(estateId) {
    const { data: fin } = await admin.from("estate_financials").select("*").eq("estate_id", estateId).eq("is_private", false);
    const liabs = (fin ?? []).filter(f => f.category === "liability");
    const obls = (fin ?? []).filter(f => f.category === "obligation");
    return {
      title: "Debts & Monthly Obligations",
      sections: [
        { heading: "Liabilities / debts", columns: ["Debt", "Lender", "Status", RH("Amount owed")], rows: liabs.map(l => [l.name, l.lender || "", l.status || "", R(money(l.amount))]), total: { label: "Total owed", value: money(liabs.reduce((s, l) => s + (l.amount ?? 0), 0)) } },
        { heading: "Recurring monthly obligations", columns: ["Obligation", "Status", RH("Monthly")], rows: obls.map(o => [o.name, o.status || "", R(money(o.amount ?? o.amount_max ?? o.amount_min))]) },
      ],
    };
  },
  async communications(estateId) {
    const [{ data: ints }, { data: mtgs }, { data: contacts }] = await Promise.all([
      admin.from("estate_contact_interactions").select("occurred_at, created_at, direction, channel, subject, contact_id, is_private").eq("estate_id", estateId).eq("is_private", false),
      admin.from("estate_meetings").select("scheduled_at, meeting_type, status, contact_name").eq("estate_id", estateId),
      admin.from("estate_contacts").select("id, name").eq("estate_id", estateId),
    ]);
    const nameById = Object.fromEntries((contacts ?? []).map(c => [c.id, c.name]));
    const events = [
      ...(ints ?? []).map(i => ({
        when: i.occurred_at || i.created_at,
        who: nameById[i.contact_id] || "—",
        kind: CH_LABEL[i.channel] || "Note",
        dir: DIR_LABEL[i.direction] || "",
        subject: i.subject || "",
      })),
      ...(mtgs ?? []).map(m => ({
        when: m.scheduled_at,
        who: m.contact_name || "—",
        kind: "Meeting",
        dir: m.status || "",
        subject: `Meeting — ${(m.meeting_type || "meeting").replace(/_/g, " ")}`,
      })),
    ].sort((a, b) => new Date(b.when || 0) - new Date(a.when || 0));
    return {
      title: "Communications Log",
      sections: [{
        heading: "Correspondence & meetings",
        columns: ["Date", "Contact", "Type", "Direction", "Subject"],
        rows: events.map(e => [e.when ? new Date(e.when).toLocaleDateString() : "—", e.who, e.kind, e.dir, e.subject]),
      }],
    };
  },
};

// right-aligned cell + header helpers
const R = v => ({ v, align: "right" });
const RH = label => ({ label, align: "right" });

function cellHtml(c, tag = "td") {
  const v = c && typeof c === "object" ? (c.v ?? c.label) : c;
  const align = c && typeof c === "object" ? (c.align || "left") : "left";
  return `<${tag} style="padding:6px 8px;border-bottom:1px solid #eee;text-align:${align}">${esc(v)}</${tag}>`;
}
function sectionHtml(sec) {
  let h = sec.heading ? `<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;border-bottom:1px solid #ddd;padding-bottom:3px;margin:18px 0 8px">${esc(sec.heading)}</h3>` : "";
  if (sec.pairs) {
    h += sec.pairs.map(([k, v]) => `<div style="display:flex;justify-content:space-between;font-size:13px;padding:2px 0"><span style="color:#374151">${esc(k)}</span><span style="font-weight:600">${esc(v)}</span></div>`).join("");
    return h;
  }
  if (!sec.rows || sec.rows.length === 0) { return h + `<div style="font-size:13px;color:#9ca3af;padding:4px 0">None recorded.</div>`; }
  const thead = `<tr style="background:#f9fafb">${sec.columns.map(c => cellHtml(typeof c === "object" ? c : { v: c }, "th")).join("")}</tr>`;
  const body = sec.rows.map(r => `<tr>${r.map(c => cellHtml(c)).join("")}</tr>`).join("");
  h += `<table style="border-collapse:collapse;width:100%;font-size:13px"><thead>${thead}</thead><tbody>${body}</tbody></table>`;
  if (sec.total) h += `<div style="text-align:right;font-weight:bold;font-size:13px;margin-top:6px">${esc(sec.total.label)}: ${esc(sec.total.value)}</div>`;
  return h;
}
function reportHtml(estate, report) {
  const crumb = (report.path && report.path.length)
    ? `<div style="font-size:12px;color:#374151;margin-bottom:8px">Filtered: ${report.path.map(f => `${esc(f.label)} = <strong>${esc(f.value)}</strong>`).join(" › ")}</div>`
    : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:780px">
    <h2 style="color:#111827;margin-bottom:2px">${esc(estate.deceased_name)} — ${esc(report.title)}</h2>
    <div style="font-size:12px;color:#6b7280;margin-bottom:8px">Prepared ${new Date().toLocaleDateString()}${estate.state_of_residence ? " · " + esc(estate.state_of_residence) : ""}</div>
    ${crumb}
    ${report.sections.map(sectionHtml).join("")}
    <div style="margin-top:18px;font-size:11px;color:#9ca3af">Working summary, not a legal filing or appraisal. Values are estimates unless an appraisal/statement is on file. Prepared with SettleWell.</div>
  </div>`;
}

// ---- Drill-down engine: reports defined by ordered dimensions you can group
// by and filter into, level after level, until none remain (then a flat list).
const DRILL = {
  tasks: {
    title: "Task & Progress Report",
    async load(estateId) {
      const [{ data: tasks }, { data: secs }] = await Promise.all([
        admin.from("estate_tasks").select("text, status, section_id, assigned_to, is_private").eq("estate_id", estateId).eq("is_private", false).is("parent_task_id", null),
        admin.from("estate_sections").select("id, label").eq("estate_id", estateId).order("sort_order"),
      ]);
      const phaseLabel = id => (secs ?? []).find(s => s.id === id)?.label || "Unfiled";
      const rows = tasks ?? [];
      return {
        rows,
        dims: [
          { key: "assignee", label: "Assignee", value: t => t.assigned_to || "Unassigned" },
          { key: "phase", label: "Phase", value: t => phaseLabel(t.section_id) },
          { key: "status", label: "Status", value: t => (t.status || "").replace(/_/g, " ") || "—" },
        ],
        columns: ["Task", "Assignee", "Phase", "Status"],
        cell: t => [t.text, t.assigned_to || "Unassigned", phaseLabel(t.section_id), (t.status || "").replace(/_/g, " ")],
        summary: list => ({ heading: "Overall", pairs: [["Tasks shown", `${list.length}`], ["Complete", `${list.filter(x => x.status === "done").length} of ${list.length}`]] }),
      };
    },
  },
  assets: {
    title: "Asset List",
    async load(estateId) {
      const { data: assets } = await admin.from("estate_financials").select("*").eq("estate_id", estateId).eq("category", "asset").eq("is_private", false).order("asset_type").order("name");
      return {
        rows: assets ?? [],
        dims: [
          { key: "type", label: "Type", value: a => TYPE_LABEL[a.asset_type] || a.asset_type || "Other" },
          { key: "disposition", label: "Disposition", value: a => a.status || "undecided" },
        ],
        columns: ["Asset", "Type", "VIN/Serial", RH("Value"), "Disposition", "Beneficiary", "Location/Legal", "Notes"],
        cell: a => [a.name, TYPE_LABEL[a.asset_type] || a.asset_type || "", a.vin_serial || "", R(money(a.amount)), a.status && a.status !== "undecided" ? a.status : "", a.beneficiary || "", a.location || "", a.notes || ""],
        summary: list => ({ heading: "Total", pairs: [["Value (excl. sold/distributed)", money(list.filter(a => !["sold", "distributed"].includes(a.status)).reduce((s, a) => s + (a.amount ?? 0), 0))]] }),
      };
    },
  },
  reimbursements: {
    title: "Reimbursements",
    async load(estateId) {
      const { data: txns } = await admin.from("estate_transactions").select("*").eq("estate_id", estateId).not("reimburse_status", "is", null).order("date", { ascending: false });
      return {
        rows: txns ?? [],
        dims: [
          { key: "status", label: "Status", value: t => t.reimburse_status === "pending" ? "Pending" : "Reimbursed" },
          { key: "owed_to", label: "Owed to", value: t => t.paid_by || "—" },
        ],
        columns: ["Date", "Description", "Paid to", "Owed to", RH("Amount")],
        cell: t => [t.date, t.description, t.paid_to || "", t.paid_by || "", R(money(Math.abs(t.amount)))],
        summary: list => ({ heading: "Total", pairs: [["Owed (pending)", money(list.filter(t => t.reimburse_status === "pending").reduce((s, t) => s + Math.abs(t.amount ?? 0), 0))]] }),
      };
    },
  },
  contacts: {
    title: "Contacts Directory",
    async load(estateId) {
      const { data: contacts } = await admin.from("estate_contacts").select("*").eq("estate_id", estateId).order("role").order("name");
      return {
        rows: contacts ?? [],
        dims: [{ key: "role", label: "Role", value: c => c.role || "other" }],
        columns: ["Name", "Role", "Company", "Phone", "Email"],
        cell: c => [c.name, c.role || "", c.company || "", c.phone || (c.phones || [])[0] || "", c.email || (c.emails || [])[0] || ""],
      };
    },
  },
};

function buildDrillReport(title, loaded, path = [], groupKey) {
  const { rows, dims, columns, cell, summary } = loaded;
  let filtered = rows;
  const validPath = [];
  for (const f of (path || [])) {
    const d = dims.find(x => x.key === f.key);
    if (!d) continue;
    filtered = filtered.filter(r => d.value(r) === f.value);
    validPath.push({ key: d.key, label: d.label, value: f.value });
  }
  const used = new Set(validPath.map(f => f.key));
  const remaining = dims.filter(d => !used.has(d.key));
  const group = remaining.find(d => d.key === groupKey) || remaining[0] || null;
  const sections = [];
  if (summary) sections.push(summary(filtered));
  let drill;
  if (group) {
    const g = {};
    for (const r of filtered) (g[group.value(r)] ||= []).push(r);
    const keys = Object.keys(g).sort();
    for (const k of keys) sections.push({ heading: `${group.label}: ${k} (${g[k].length})`, columns, rows: g[k].map(cell) });
    drill = { groupKey: group.key, groupLabel: group.label, values: keys, remaining: remaining.map(d => [d.key, d.label]) };
  } else {
    sections.push({ columns, rows: filtered.map(cell) });
    drill = { groupKey: null, groupLabel: null, values: [], remaining: [] };
  }
  return { title, sections, drill, path: validPath };
}

export const handler = async (event) => {
  let estateId, reportType, recipientId, cc, bcc, options;
  try { ({ estateId, reportType = "assets", recipientId, cc, bcc, options = {} } = JSON.parse(event.body)); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "invalid body" }) }; }
  if (!estateId) return { statusCode: 400, body: JSON.stringify({ error: "estateId required" }) };
  if (!builders[reportType] && !DRILL[reportType]) return { statusCode: 400, body: JSON.stringify({ error: "unknown report type" }) };

  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: "not authenticated" }) };
  const { data: callerData, error: cErr } = await admin.auth.getUser(token);
  if (cErr || !callerData?.user) return { statusCode: 401, body: JSON.stringify({ error: "invalid session" }) };
  const { data: roles } = await admin.from("estate_users").select("role, estate_id").eq("auth_user_id", callerData.user.id);
  if (!(roles || []).some(r => r.estate_id === estateId && (r.role === "administrator" || r.role === "executor")))
    return { statusCode: 403, body: JSON.stringify({ error: "executor access required" }) };

  try {
    const { data: estate } = await admin.from("estates").select("deceased_name, state_of_residence").eq("id", estateId).single();
    let report;
    if (DRILL[reportType]) {
      const loaded = await DRILL[reportType].load(estateId);
      report = buildDrillReport(DRILL[reportType].title, loaded, options.path, options.group);
    } else {
      report = await builders[reportType](estateId, options || {});
    }
    const html = reportHtml(estate, report);

    // Preview / print only — no recipient.
    if (!recipientId) return { statusCode: 200, body: JSON.stringify({ html, title: report.title, drill: report.drill || null, path: report.path || [] }) };

    // Email path: recipient must be a contact on THIS estate.
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: "BREVO_API_KEY is not configured" }) };
    const { data: contact } = await admin.from("estate_contacts").select("name, email, emails").eq("id", recipientId).eq("estate_id", estateId).maybeSingle();
    const toEmail = contact?.email || (Array.isArray(contact?.emails) ? contact.emails[0] : null);
    if (!contact || !toEmail) return { statusCode: 400, body: JSON.stringify({ error: "that contact has no email on file" }) };
    const ccList = (cc || "").split(",").map(s => s.trim()).filter(Boolean).map(email => ({ email }));
    const bccList = (bcc || "").split(",").map(s => s.trim()).filter(Boolean).map(email => ({ email }));

    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: { email: FROM_EMAIL, name: FROM_NAME },
        to: [{ email: toEmail, name: contact.name || undefined }],
        ...(ccList.length ? { cc: ccList } : {}),
        ...(bccList.length ? { bcc: bccList } : {}),
        subject: `${report.title} — ${estate?.deceased_name || "Estate"}`,
        htmlContent: html,
      }),
    });
    if (!resp.ok) return { statusCode: 502, body: JSON.stringify({ error: "Email send failed: " + (await resp.text()).slice(0, 200) }) };

    await admin.from("attorney_document_sends").insert({
      estate_id: estateId, document_ids: [], document_count: 0,
      document_names: `${report.title} (report, emailed)`, sent_at: new Date().toISOString(),
      recipient_id: recipientId, recipient_name: contact.name || toEmail,
      recipient_cc: cc || null, recipient_bcc: bcc || null,
    });
    return { statusCode: 200, body: JSON.stringify({ success: true, to: toEmail }) };
  } catch (e) {
    console.error("send-report error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: "Could not build the report: " + String(e.message || e).slice(0, 200) }) };
  }
};
