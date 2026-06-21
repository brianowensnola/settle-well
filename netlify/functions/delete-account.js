import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Permanently delete the caller's account and all data they solely own.
// - Estates where the caller is the SOLE administrator are deleted (cascades all
//   their data; storage files removed first).
// - Estates with other administrators: the caller's membership is removed, the
//   estate is kept.
// Two-step: call with no/!=DELETE confirm to get a PREVIEW of impact; call with
// confirm:"DELETE" to execute. Apple Guideline 5.1.1(v) in-app deletion.
export const handler = async (event) => {
  let confirm;
  try { ({ confirm } = JSON.parse(event.body || "{}")); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "invalid body" }) }; }

  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: "not authenticated" }) };
  const { data: callerData, error: cErr } = await admin.auth.getUser(token);
  const user = callerData?.user;
  if (cErr || !user) return { statusCode: 401, body: JSON.stringify({ error: "invalid session" }) };

  // What the caller belongs to.
  const { data: memberships } = await admin.from("estate_users").select("estate_id, role").eq("auth_user_id", user.id);
  const adminEstateIds = (memberships || []).filter(m => ["administrator", "executor"].includes(m.role)).map(m => m.estate_id);

  // Which of those estates the caller solely administers (-> deleted).
  const soleAdmin = [];
  for (const eid of adminEstateIds) {
    const { data: admins } = await admin.from("estate_users").select("auth_user_id").eq("estate_id", eid).in("role", ["administrator", "executor"]);
    const others = (admins || []).filter(a => a.auth_user_id && a.auth_user_id !== user.id);
    if (others.length === 0) soleAdmin.push(eid);
  }
  const leaveOnly = (memberships || []).map(m => m.estate_id).filter(id => !soleAdmin.includes(id));

  const nameOf = async ids => {
    if (!ids.length) return [];
    const { data } = await admin.from("estates").select("id, deceased_name").in("id", ids);
    return (data || []).map(e => e.deceased_name || "Unnamed estate");
  };

  // PREVIEW
  if (confirm !== "DELETE") {
    return { statusCode: 200, body: JSON.stringify({
      preview: true,
      willDelete: await nameOf(soleAdmin),
      willLeave: await nameOf([...new Set(leaveOnly)]),
    }) };
  }

  // EXECUTE
  for (const eid of soleAdmin) {
    try {
      const paths = [];
      const { data: docs } = await admin.from("estate_documents").select("file_path").eq("estate_id", eid);
      for (const d of (docs || [])) if (d.file_path) paths.push(d.file_path);
      const { data: fins } = await admin.from("estate_financials").select("photo_paths").eq("estate_id", eid);
      for (const f of (fins || [])) for (const p of (f.photo_paths || [])) if (p) paths.push(p);
      if (paths.length) { try { await admin.storage.from("estate-documents").remove(paths); } catch (e) { console.warn("storage remove failed:", e?.message); } }
    } catch (e) { console.warn("gather paths failed:", e?.message); }
    const { error } = await admin.from("estates").delete().eq("id", eid); // cascades all child rows
    if (error) console.error("delete estate failed", eid, error.message);
  }

  // Remove the caller's remaining memberships, then the auth account.
  await admin.from("estate_users").delete().eq("auth_user_id", user.id);
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) return { statusCode: 500, body: JSON.stringify({ error: "Could not delete the account: " + delErr.message }) };

  return { statusCode: 200, body: JSON.stringify({ success: true, deletedEstates: soleAdmin.length }) };
};
