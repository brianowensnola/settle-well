import { createClient } from "@supabase/supabase-js";

// Service-role client — can set any user's password. Never exposed to the browser.
const admin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Executor-only: reset another user's password. The caller must present their
// own access token; we verify they are an administrator before doing anything.
export const handler = async (event) => {
  let targetUserId, newPassword;
  try {
    ({ targetUserId, newPassword } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid body" }) };
  }
  if (!targetUserId || !newPassword || newPassword.length < 6) {
    return { statusCode: 400, body: JSON.stringify({ error: "targetUserId and a 6+ char password are required" }) };
  }

  // 1. Identify the caller from their bearer token
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: "not authenticated" }) };

  const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
  const caller = callerData?.user;
  if (callerErr || !caller) return { statusCode: 401, body: JSON.stringify({ error: "invalid session" }) };

  // 2. Caller must be an administrator/executor on at least one estate
  const { data: roles } = await admin
    .from("estate_users")
    .select("role")
    .eq("auth_user_id", caller.id);
  const isAdmin = (roles || []).some(r => r.role === "administrator" || r.role === "executor");
  if (!isAdmin) return { statusCode: 403, body: JSON.stringify({ error: "executor access required" }) };

  // 3. Set the target user's password
  const { error: updErr } = await admin.auth.admin.updateUserById(targetUserId, { password: newPassword });
  if (updErr) return { statusCode: 500, body: JSON.stringify({ error: updErr.message }) };

  return { statusCode: 200, body: JSON.stringify({ success: true }) };
};
