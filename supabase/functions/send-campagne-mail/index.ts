// Edge Function : « ENVOI CAMPAGNE MAIL » — le mail de campagne promo envoyé
// à un magasin, avec ses affiches EN PIÈCES JOINTES (un PDF par plan promo).
// Réservée à l'administrateur.
//
// Les PDF ne sont pas fabriqués ici : le navigateur de l'administrateur croise
// les plans promo publiés avec la valorisation du magasin, dépose les PDF dans
// le bucket privé « affiches » (<code magasin>/campagne/<plan>.pdf), puis
// appelle cette fonction avec les CHEMINS. La fonction relit les fichiers en
// service_role et les attache : les mégaoctets ne remontent jamais dans le
// corps de la requête.
//
// L'expéditeur vient de la table public.app_settings (clé « mail »), donc
// modifiable depuis ⚙️ Réglages sans redéployer. À défaut, le secret MAIL_FROM.
//
// Secrets (Edge Functions -> Secrets) — UNE des trois voies suffit, la
// première configurée l'emporte :
//   1. SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS  (votre messagerie)
//   2. RESEND_API_KEY
//   3. BREVO_API_KEY
// MAIL_FROM / MAIL_REPLY_TO : repli si rien n'est renseigné dans ⚙️ Réglages.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Buffer } from "node:buffer";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, obj: unknown) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );

// "Nom <adresse@domaine>" -> { name, email }
function parseFrom(from: string) {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m
    ? { name: m[1] || "Boîte à Outils GEFEC", email: m[2].trim() }
    : { name: "Boîte à Outils GEFEC", email: from.trim() };
}

// Uint8Array -> base64. L'encodeur natif de node:buffer est une trentaine de
// fois plus rapide que la boucle JS équivalente (≈20 ms contre ≈600 ms pour
// 4 Mo) : sur le budget CPU d'une Edge Function, c'est la différence entre un
// envoi qui passe et un « CPU Time exceeded ». La boucle reste en repli si le
// module n'est pas disponible.
function toBase64(bytes: Uint8Array) {
  try {
    return Buffer.from(bytes).toString("base64");
  } catch (_e) {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }
}

const ENC = new TextEncoder();
const b64text = (s: string) => toBase64(ENC.encode(s));

// "Nom <adresse>" -> ses deux moitiés, sans nom inventé
function splitAddr(v: string) {
  const m = String(v ?? "").match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || "", email: m[2].trim() } : { name: "", email: String(v ?? "").trim() };
}
const bareAddr = (v: string) => splitAddr(v).email;

// En-tête RFC 2047 : un accent ne passe pas en clair dans un en-tête SMTP.
function encodeHeader(s: string) {
  const t = String(s ?? "");
  if (!/[^\x20-\x7e]/.test(t)) return t;
  const words: string[] = [];
  let cur = "";
  for (const ch of t) {                       // par caractère : jamais couper un UTF-8
    if (ENC.encode(cur + ch).length > 42) { words.push(cur); cur = ch; }
    else cur += ch;
  }
  if (cur) words.push(cur);
  return words.map((w) => `=?UTF-8?B?${b64text(w)}?=`).join("\r\n ");
}
function headerAddr(v: string) {
  const a = splitAddr(v);
  return a.name ? `${encodeHeader(a.name)} <${a.email}>` : `<${a.email}>`;
}

// base64 en lignes de 76 caractères (limite de longueur de ligne SMTP),
// sans CRLF final : c'est l'appelant qui referme la dernière ligne.
function wrap76(s: string) {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += 76) out.push(s.slice(i, i + 76));
  return out.join("\r\n");
}

const isMail = (v: unknown) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v ?? "").trim());

// Seuls les PDF de campagne d'un magasin sont attachables : cette fonction
// poste au nom de la centrale, elle n'est pas un relais de fichiers.
const PATH_RE = /^[A-Za-z0-9_-]{1,32}\/campagne\/[A-Za-z0-9_-]{1,40}\.pdf$/;

// 20 Mo de pièces jointes : au-delà, la plupart des messageries rejettent.
const MAX_TOTAL = 20 * 1024 * 1024;

/* ── Client SMTP minimal ──────────────────────────────────────────────────
   denomailer écrivait le message ligne par ligne : sur 7 Mo de base64 cela
   fait près de 100 000 écritures, et le budget CPU d'une Edge Function (2 s)
   partait avant la fin — constaté en production, « CPU Time exceeded » sur
   5,4 Mo de pièces jointes alors que l'encodage, lui, prenait 11 ms.
   On parle donc SMTP directement, et le corps part en quelques écritures. */
class Smtp {
  conn: Deno.Conn;
  buf = "";
  dec = new TextDecoder();
  constructor(conn: Deno.Conn) { this.conn = conn; }

  async fill() {
    const chunk = new Uint8Array(8192);
    const n = await this.conn.read(chunk);
    if (n === null) throw new Error("connexion fermée par le serveur");
    this.buf += this.dec.decode(chunk.subarray(0, n), { stream: true });
  }
  // une réponse SMTP = des lignes « 250-… » puis une ligne « 250 … »
  async reply(): Promise<{ code: number; text: string }> {
    const lines: string[] = [];
    for (;;) {
      const nl = this.buf.indexOf("\n");
      if (nl < 0) { await this.fill(); continue; }
      const line = this.buf.slice(0, nl).replace(/\r$/, "");
      this.buf = this.buf.slice(nl + 1);
      lines.push(line);
      if (/^\d{3}(?: |$)/.test(line))
        return { code: Number(line.slice(0, 3)), text: lines.join(" ").trim() };
    }
  }
  async writeAll(bytes: Uint8Array) {
    let off = 0;
    while (off < bytes.length) {
      const n = await this.conn.write(bytes.subarray(off));
      if (n <= 0) throw new Error("écriture interrompue");
      off += n;
    }
  }
  async send(s: string) { await this.writeAll(ENC.encode(s)); }
  // l'erreur cite `label`, jamais `line` : la ligne peut être le mot de passe
  async cmd(line: string, ok: number[], label: string) {
    await this.send(line + "\r\n");
    const r = await this.reply();
    if (!ok.includes(r.code)) throw new Error(`${label} refusé — ${r.text}`);
    return r;
  }
}

/* Le message complet, en quelques gros morceaux plutôt qu'en lignes. */
function mimeParts(o: {
  from: string; to: string; replyTo: string; subject: string;
  text: string; html: string;
  attachments: { filename: string; b64: string }[];
}) {
  const mix = `--gefec-mix-${crypto.randomUUID()}`;
  const alt = `--gefec-alt-${crypto.randomUUID()}`;
  const parts: string[] = [];

  parts.push([
    `From: ${headerAddr(o.from)}`,
    `To: <${o.to}>`,
    `Subject: ${encodeHeader(o.subject)}`,
    ...(o.replyTo ? [`Reply-To: <${bareAddr(o.replyTo)}>`] : []),
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@boite-outils-gefec>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mix}"`,
    "",
    `--${mix}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    `--${alt}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(b64text(o.text)),
    `--${alt}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(b64text(o.html)),
    `--${alt}--`,
    "",
  ].join("\r\n"));

  for (const a of o.attachments) {
    parts.push([
      `--${mix}`,
      `Content-Type: application/pdf; name="${a.filename}"`,
      `Content-Disposition: attachment; filename="${a.filename}"`,
      "Content-Transfer-Encoding: base64",
      "", "",
    ].join("\r\n"));
    parts.push(wrap76(a.b64));      // le gros morceau : une seule écriture
    parts.push("\r\n");
  }
  parts.push(`--${mix}--`);         // pas de CRLF final : le « \r\n.\r\n » suit
  return parts;
}

async function sendSmtp(o: {
  host: string; port: number; user: string; pass: string;
  from: string; to: string; replyTo: string; subject: string;
  text: string; html: string;
  attachments: { filename: string; b64: string }[];
}) {
  let conn: Deno.Conn = o.port === 465
    ? await Deno.connectTls({ hostname: o.host, port: o.port })
    : await Deno.connect({ hostname: o.host, port: o.port });
  try {
    let s = new Smtp(conn);
    const hello = await s.reply();
    if (hello.code !== 220) throw new Error(`accueil du serveur — ${hello.text}`);
    await s.cmd("EHLO boite-outils-gefec", [250], "EHLO");

    if (o.port !== 465) {                       // 587 : chiffrement après coup
      await s.cmd("STARTTLS", [220], "STARTTLS");
      conn = await Deno.startTls(conn as Deno.TcpConn, { hostname: o.host });
      s = new Smtp(conn);
      await s.cmd("EHLO boite-outils-gefec", [250], "EHLO");
    }
    if (o.user) {
      await s.cmd("AUTH LOGIN", [334], "AUTH LOGIN");
      await s.cmd(b64text(o.user), [334], "identifiant SMTP");
      await s.cmd(b64text(o.pass), [235], "mot de passe SMTP");
    }
    await s.cmd(`MAIL FROM:<${bareAddr(o.from)}>`, [250], "MAIL FROM");
    await s.cmd(`RCPT TO:<${o.to}>`, [250, 251], "RCPT TO");
    await s.cmd("DATA", [354], "DATA");

    for (const part of mimeParts(o)) await s.send(part);
    await s.send("\r\n.\r\n");
    const done = await s.reply();
    if (done.code !== 250) throw new Error(`message refusé — ${done.text}`);
    try { await s.cmd("QUIT", [221], "QUIT"); } catch (_e) { /* peu importe */ }
  } finally {
    try { conn.close(); } catch (_e) { /* déjà fermée */ }
  }
}

/* Le corps du message. Le texte est saisi par l'administrateur dans l'outil
   (⚙️ Réglages fournit le modèle par défaut) : on l'envoie tel quel en texte,
   et échappé + <br> en HTML. La liste des pièces jointes est ajoutée dessous,
   c'est elle qui « informe du plan promo envoyé ». */
function body(o: {
  message: string; storeName: string; storeId: string;
  files: { label: string; filename: string; pages: number; products: number }[];
}) {
  const lignes = o.files.map((f) =>
    `${f.label} — ${f.products} affiche(s), ${f.pages} page(s) — ${f.filename}`
  );

  const text = [
    o.message.trim(),
    ...(o.files.length
      ? ["", `Pièces jointes (${o.files.length}) :`, ...lignes.map((l) => `• ${l}`)]
      : []),
    "",
    "— Boîte à Outils GEFEC",
  ].join("\n");

  const jointes = o.files.length
    ? `<div style="margin:22px 0 8px;font-weight:700;font-size:14px">Pièces jointes (${o.files.length})</div>
  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
    ${o.files.map((f) => `<tr>
      <td style="padding:9px 12px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb">
        <b style="color:#e6071a">📎 ${esc(f.label)}</b><br>
        <span style="font-size:13px;color:#6b7280">${esc(f.filename)} — ${f.products} affiche(s), ${f.pages} page(s)</span>
      </td></tr><tr><td style="height:8px"></td></tr>`).join("")}
  </table>`
    : "";

  const html = `<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.55;color:#111827;max-width:600px">
  <div>${esc(o.message.trim()).replace(/\n/g, "<br>")}</div>
  ${jointes}
  <p style="font-size:13px;color:#6b7280;margin-top:22px">
     ${o.storeId ? esc(o.storeName) + " — " + esc(o.storeId) + "<br>" : ""}— Boîte à Outils GEFEC</p>
</div>`;

  return { text, html };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1) L'appelant est-il bien l'administrateur ?
    const authHeader = req.headers.get("Authorization") ?? "";
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uerr } = await caller.auth.getUser();
    if (uerr || !user) return json(401, { error: "Non authentifié." });

    const admin = createClient(url, serviceKey);
    const { data: prof } = await admin
      .from("profiles").select("role").eq("user_id", user.id).single();
    if (!prof || prof.role !== "admin")
      return json(403, { error: "Action réservée à l'administrateur." });

    // 2) Le message
    const b = await req.json().catch(() => ({}));
    const to = String(b.to ?? "").trim();
    if (!isMail(to)) return json(400, { error: "Adresse du destinataire invalide." });

    const storeId = String(b.store_id ?? "").trim();
    const storeName = String(b.store_name ?? storeId);
    const message = String(b.message ?? "").trim();
    if (!message) return json(400, { error: "Le message du mail est vide." });

    // 3) L'expéditeur : ⚙️ Réglages d'abord, secret MAIL_FROM en repli
    let fromName = "", fromEmail = "", replyTo = "", subject = String(b.subject ?? "").trim();
    try {
      const { data: st } = await admin
        .from("app_settings").select("value").eq("key", "mail").maybeSingle();
      const v = (st && st.value) || {};
      fromName = String(v.from_name ?? "").trim();
      fromEmail = String(v.from_email ?? "").trim();
      replyTo = String(v.reply_to ?? "").trim();
    } catch (_e) { /* table absente : on retombe sur les secrets */ }

    const envFrom = Deno.env.get("MAIL_FROM") ?? "";
    let from = "";
    if (isMail(fromEmail)) from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
    else if (envFrom) from = envFrom;
    if (!replyTo) replyTo = Deno.env.get("MAIL_REPLY_TO") ?? "";
    if (!from)
      return json(200, {
        ok: false, code: "mail_not_configured",
        error: "Aucune adresse d'expédition : renseignez-la dans ⚙️ Réglages → « Envoi des campagnes mail ».",
      });
    if (!subject) subject = `Votre plan promo — ${storeName}`;

    // 4) Les pièces jointes, relues côté serveur dans le bucket « affiches »
    const wanted: { path: string; filename: string; label: string; pages: number; products: number }[] =
      Array.isArray(b.files) ? b.files.slice(0, 6).map((f: Record<string, unknown>) => ({
        path: String(f.path ?? ""),
        filename: String(f.filename ?? "affiches.pdf").replace(/[^\w.\-]+/g, "_"),
        label: String(f.label ?? "Affiches"),
        pages: Number(f.pages ?? 0),
        products: Number(f.products ?? 0),
      })) : [];
    // Un envoi sans pièce jointe n'est légitime que dans deux cas, et l'appelant
    // doit le dire : le test de configuration (⚙️ Réglages) et la relance
    // « déposez votre valorisation ». Ailleurs, une campagne sans pièce jointe
    // est une erreur d'appel — mieux vaut la refuser que poster un mail vide.
    const sansPieces = b.test === true || b.no_attachment === true;
    if (!sansPieces && !wanted.length)
      return json(400, { error: "Aucune pièce jointe à envoyer." });

    const attachments: { filename: string; b64: string; bytes: number }[] = [];
    let total = 0;
    for (const f of wanted) {
      if (!PATH_RE.test(f.path))
        return json(400, { error: `Chemin de pièce jointe invalide : ${f.path}` });
      if (storeId && f.path.split("/")[0] !== storeId)
        return json(400, { error: "Pièce jointe hors du dossier de ce magasin." });
      const { data, error } = await admin.storage.from("affiches").download(f.path);
      if (error || !data)
        return json(400, { error: `Pièce jointe introuvable : ${f.path}` });
      const bytes = new Uint8Array(await data.arrayBuffer());
      total += bytes.length;
      if (total > MAX_TOTAL)
        return json(400, {
          error: "Pièces jointes trop lourdes (> 20 Mo) : choisissez le format A5 (2 affiches par page) ou envoyez un plan à la fois.",
        });
      const t0 = Date.now();
      const b64 = toBase64(bytes);
      console.log(`piece jointe ${f.filename} : ${(bytes.length / 1048576).toFixed(2)} Mo, encodee en ${Date.now() - t0} ms`);
      attachments.push({ filename: f.filename, b64, bytes: bytes.length });
    }
    console.log(`total pieces jointes : ${(total / 1048576).toFixed(2)} Mo pour ${attachments.length} fichier(s)`);

    const mail = body({
      message, storeName, storeId,
      files: wanted.map((f, i) => ({ ...f, filename: attachments[i]?.filename ?? f.filename })),
    });

    // 5) La voie d'envoi
    const resend = Deno.env.get("RESEND_API_KEY") ?? "";
    const brevo = Deno.env.get("BREVO_API_KEY") ?? "";
    const smtpHost = Deno.env.get("SMTP_HOST") ?? "";
    const smtpUser = Deno.env.get("SMTP_USER") ?? "";
    const smtpPass = Deno.env.get("SMTP_PASS") ?? "";
    if (!smtpHost && !resend && !brevo)
      return json(200, {
        ok: false, code: "mail_not_configured",
        error: "Aucune voie d'envoi (SMTP_HOST, RESEND_API_KEY ou BREVO_API_KEY) n'est définie pour la fonction — voir supabase/SETUP.md.",
      });

    // SMTP : la messagerie que vous avez déjà, parlée directement (voir Smtp).
    const tSend = Date.now();
    if (smtpHost) {
      const port = Number(Deno.env.get("SMTP_PORT") ?? 465);
      try {
        await sendSmtp({
          host: smtpHost, port, user: smtpUser, pass: smtpPass,
          from, to, replyTo, subject,
          text: mail.text, html: mail.html,
          attachments: attachments.map((a) => ({ filename: a.filename, b64: a.b64 })),
        });
        console.log(`envoi SMTP termine en ${Date.now() - tSend} ms`);
        return json(200, { ok: true, provider: "smtp", bytes: total });
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        return json(400, { error: `Envoi SMTP refusé par ${smtpHost}:${port} — ${m}` });
      }
    }

    let res: Response;
    if (resend) {
      res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from, to: [to], subject, html: mail.html, text: mail.text,
          ...(replyTo ? { reply_to: replyTo } : {}),
          attachments: attachments.map((a) => ({ filename: a.filename, content: a.b64 })),
        }),
      });
    } else {
      const sender = parseFrom(from);
      res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": brevo, "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender, to: [{ email: to }], subject,
          htmlContent: mail.html, textContent: mail.text,
          ...(replyTo ? { replyTo: { email: replyTo } } : {}),
          ...(attachments.length
            ? { attachment: attachments.map((a) => ({ name: a.filename, content: a.b64 })) }
            : {}),
        }),
      });
    }

    const raw = await res.text();
    if (!res.ok) {
      let detail = raw;
      try { const j = JSON.parse(raw); detail = j.message || j.error?.message || j.error || raw; } catch (_e) { /* texte brut */ }
      return json(400, { error: `Envoi refusé par le fournisseur de mail : ${detail}` });
    }
    let id: string | null = null;
    try { const j = JSON.parse(raw); id = j.id ?? j.messageId ?? null; } catch (_e) { /* réponse vide */ }
    return json(200, { ok: true, id, provider: resend ? "resend" : "brevo", bytes: total });
  } catch (e) {
    return json(500, { error: String(e) });
  }
});
