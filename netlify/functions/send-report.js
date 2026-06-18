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

function assetReportHtml(estate, assets) {
  const rows = assets.map(a => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(a.name)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(TYPE_LABEL[a.asset_type] || a.asset_type || "")}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(a.vin_serial || "")}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${money(a.amount)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(a.status || "")}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(a.beneficiary || "")}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(a.location || "")}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(a.notes || "")}</td>
    </tr>`).join("");
  const total = assets.filter(a => !["sold", "distributed"].includes(a.status)).reduce((s, a) => s + (a.amount ?? 0), 0);
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:760px">
    <h2 style="color:#111827;margin-bottom:2px">${esc(estate.deceased_name)} — Asset List</h2>
    <div style="font-size:12px;color:#6b7280;margin-bottom:12px">Prepared ${new Date().toLocaleDateString()}${estate.state_of_residence ? " · " + esc(estate.state_of_residence) : ""} · ${assets.length} asset(s)</div>
    <table style="border-collapse:collapse;width:100%;font-size:13px">
      <thead><tr style="text-align:left;background:#f9fafb">
        <th style="padding:6px 8px;border-bottom:2px solid #ddd">Asset</th>
        <th style="padding:6px 8px;border-bottom:2px solid #ddd">Type</th>
        <th style="padding:6px 8px;border-bottom:2px solid #ddd">VIN / Serial</th>
        <th style="padding:6px 8px;border-bottom:2px solid #ddd;text-align:right">Value</th>
        <th style="padding:6px 8px;border-bottom:2px solid #ddd">Disposition</th>
        <th style="padding:6px 8px;border-bottom:2px solid #ddd">Beneficiary</th>
        <th style="padding:6px 8px;border-bottom:2px solid #ddd">Location / legal</th>
        <th style="padding:6px 8px;border-bottom:2px solid #ddd">Notes</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:10px;font-weight:bold">Total (excl. sold/distributed): ${money(total)}</div>
    <div style="margin-top:16px;font-size:11px;color:#9ca3af">Values are estimates unless an appraisal/statement is on file. Working summary, not a legal filing or appraisal. Sent via SettleWell.</div>
  </div>`;
}

export const handler = async (event) => {
  let estateId, recipientId, cc, bcc;
  try { ({ estateId, recipientId, cc, bcc } = JSON.parse(event.body)); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "invalid body" }) }; }
  if (!estateId || !recipientId) return { statusCode: 400, body: JSON.stringify({ error: "estateId and recipientId required" }) };

  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: "not authenticated" }) };
  const { data: callerData, error: cErr } = await admin.auth.getUser(token);
  if (cErr || !callerData?.user) return { statusCode: 401, body: JSON.stringify({ error: "invalid session" }) };
  const { data: roles } = await admin.from("estate_users").select("role, estate_id").eq("auth_user_id", callerData.user.id);
  if (!(roles || []).some(r => r.estate_id === estateId && (r.role === "administrator" || r.role === "executor")))
    return { statusCode: 403, body: JSON.stringify({ error: "executor access required" }) };

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: "BREVO_API_KEY is not configured" }) };

  // Recipient must be a contact on THIS estate (no arbitrary addresses).
  const { data: contact } = await admin.from("estate_contacts").select("name, email, emails").eq("id", recipientId).eq("estate_id", estateId).maybeSingle();
  const toEmail = contact?.email || (Array.isArray(contact?.emails) ? contact.emails[0] : null);
  if (!contact || !toEmail) return { statusCode: 400, body: JSON.stringify({ error: "that contact has no email on file" }) };

  const { data: estate } = await admin.from("estates").select("deceased_name, state_of_residence").eq("id", estateId).single();
  const { data: assets } = await admin.from("estate_financials").select("*").eq("estate_id", estateId).eq("category", "asset").eq("is_private", false).order("asset_type").order("name");

  const html = assetReportHtml(estate, assets ?? []);
  const ccList = (cc || "").split(",").map(s => s.trim()).filter(Boolean).map(email => ({ email }));
  const bccList = (bcc || "").split(",").map(s => s.trim()).filter(Boolean).map(email => ({ email }));

  try {
    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: { email: FROM_EMAIL, name: FROM_NAME },
        to: [{ email: toEmail, name: contact.name || undefined }],
        ...(ccList.length ? { cc: ccList } : {}),
        ...(bccList.length ? { bcc: bccList } : {}),
        subject: `Asset List — ${estate?.deceased_name || "Estate"}`,
        htmlContent: html,
      }),
    });
    if (!resp.ok) return { statusCode: 502, body: JSON.stringify({ error: "Email send failed: " + (await resp.text()).slice(0, 200) }) };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: "Email send failed: " + String(e).slice(0, 200) }) };
  }

  await admin.from("attorney_document_sends").insert({
    estate_id: estateId, document_ids: [], document_count: (assets ?? []).length,
    document_names: "Asset List Report (emailed)", sent_at: new Date().toISOString(),
    recipient_id: recipientId, recipient_name: contact.name || toEmail,
    recipient_cc: cc || null, recipient_bcc: bcc || null,
  });

  return { statusCode: 200, body: JSON.stringify({ success: true, to: toEmail }) };
};
