import PostalMime from "postal-mime";
import { createClient } from "@supabase/supabase-js";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const admin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function firstEmail(raw) {
  if (!raw) return null;
  const s = Array.isArray(raw) ? raw.map(x => (x && x.address) ? x.address : x).join(",") : (raw.address || String(raw));
  const m = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0].toLowerCase() : null;
}

// Fetch the raw email from S3 (used when SES stores the message there — the
// reliable path for anything with attachments, which exceed SNS's inline limit).
async function fetchFromS3(bucket, key) {
  const region = process.env.SES_S3_REGION || "us-east-1";
  const s3 = new S3Client({
    region,
    credentials: { accessKeyId: process.env.SES_S3_KEY, secretAccessKey: process.env.SES_S3_SECRET },
  });
  const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return Buffer.from(await obj.Body.transformToByteArray());
}

// Save an email attachment into the estate's Documents (storage + a row).
async function saveAttachment(estateId, contactId, subject, att) {
  try {
    const safe = (att.filename || "attachment").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    const path = `estate-${estateId}/inbound/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
    const buf = Buffer.from(att.content);
    const { error: upErr } = await admin.storage.from("estate-documents")
      .upload(path, buf, { contentType: att.mimeType || "application/octet-stream", upsert: false });
    if (upErr) throw upErr;
    await admin.from("estate_documents").insert({
      estate_id: estateId,
      name: att.filename || "Email attachment",
      doc_type: "other",
      file_path: path,
      have: true,
      is_private: false,
      linked_contact_id: contactId || null,
      notes: `Received via email${subject ? `: “${subject}”` : ""}`,
    });
    return true;
  } catch (e) {
    console.warn("attachment save failed", att?.filename, e?.message);
    return false;
  }
}

// Inbound email via Amazon SES → SNS. Confirms the SNS handshake, then for each
// notification reads the message (from SES inline content, or fetched from S3
// when SES stored it there), parses it, files it on the contact's timeline, and
// saves any real attachments into the estate's Documents.
export const handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let sns;
  try { sns = JSON.parse(event.body); } catch { return { statusCode: 400, body: "invalid body" }; }

  const expectedTopic = process.env.SES_SNS_TOPIC_ARN;
  if (expectedTopic && sns.TopicArn && sns.TopicArn !== expectedTopic) {
    return { statusCode: 401, body: "unexpected topic" };
  }

  if (sns.Type === "SubscriptionConfirmation" && sns.SubscribeURL) {
    try { await fetch(sns.SubscribeURL); } catch (e) { console.error("SNS confirm failed", e?.message); }
    return { statusCode: 200, body: "subscription confirmed" };
  }
  if (sns.Type !== "Notification") return { statusCode: 200, body: "ignored" };

  let ses;
  try { ses = JSON.parse(sns.Message); } catch { return { statusCode: 200, body: "no SES message" }; }

  const mail = ses.mail || {};
  const ch = mail.commonHeaders || {};
  const toAddr = firstEmail(ses.receipt?.recipients?.[0] || mail.destination?.[0] || ch.to);
  const fromAddr = firstEmail(mail.source || ch.from);
  const subject = (ch.subject || "(no subject)").slice(0, 300);

  // Get the raw MIME: prefer SES inline content; otherwise fetch from S3.
  let raw = null;
  if (ses.content) {
    raw = Buffer.from(ses.content, "base64");
  } else {
    const act = ses.receipt?.action || {};
    if (act.type === "S3" && act.bucketName && act.objectKey && process.env.SES_S3_KEY) {
      try { raw = await fetchFromS3(act.bucketName, act.objectKey); }
      catch (e) { console.warn("S3 fetch failed", e?.message); }
    }
  }

  let bodyText = "";
  let attachments = [];
  if (raw) {
    try {
      const parsed = await PostalMime.parse(raw);
      bodyText = (parsed.text || parsed.html || "").toString();
      // Real attachments only — skip inline signature images and unnamed parts.
      attachments = (parsed.attachments || []).filter(a => a.filename && a.disposition !== "inline");
    } catch (e) { console.warn("MIME parse failed", e?.message); }
  }

  const token = toAddr ? toAddr.split("@")[0].trim().toLowerCase() : null;
  if (!token) return { statusCode: 200, body: "no recipient token" };

  const { data: estate } = await admin.from("estates").select("id").eq("inbound_token", token).maybeSingle();
  if (!estate) { console.warn("inbound-email: no estate for token", token); return { statusCode: 200, body: "no matching estate" }; }

  let contactId = null;
  if (fromAddr) {
    const { data: contacts } = await admin.from("estate_contacts")
      .select("id, emails, estate_id, shared_with")
      .or(`estate_id.eq.${estate.id},shared_with.cs.{${estate.id}}`);
    const match = (contacts || []).find(c => (c.emails || []).some(e => (e || "").toLowerCase() === fromAddr));
    contactId = match?.id ?? null;
  }

  // Save attachments to Documents, then note them on the timeline entry.
  let savedCount = 0;
  for (const att of attachments) {
    if (await saveAttachment(estate.id, contactId, subject, att)) savedCount++;
  }
  const attachNote = savedCount ? ` [${savedCount} attachment${savedCount !== 1 ? "s" : ""} → Documents]` : "";

  await admin.from("estate_contact_interactions").insert({
    estate_id: estate.id,
    contact_id: contactId,
    direction: "inbound",
    channel: "email",
    subject,
    from_email: fromAddr || null,
    summary: `From ${fromAddr || "unknown sender"}${attachNote}: ${bodyText.slice(0, 280)}${bodyText.length > 280 ? "…" : ""}`,
    body: bodyText,
    is_private: false,
    source: "inbound",
    occurred_at: new Date().toISOString(),
  });

  return { statusCode: 200, body: JSON.stringify({ filed: true, matched: !!contactId, attachments: savedCount }) };
};
