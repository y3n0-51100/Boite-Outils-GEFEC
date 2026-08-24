// Edge Function : envoi du mail « vos affiches sont prêtes » au directeur
// d'un magasin (réservée à l'administrateur).
//
// Le PDF n'est PAS fabriqué ici : il est généré dans le navigateur de
// l'administrateur (le moteur d'étiquettes croise les plans promo publiés
// avec la valorisation du magasin), déposé dans le bucket privé « affiches »,
// puis signé. Cette fonction ne fait que poster le lien par mail, avec une
// clé d'API qui n'a rien à faire dans le site.
//
// Secrets à définir (Edge Functions -> Secrets), au choix du fournisseur :
//   RESEND_API_KEY   clé Resend        (https://resend.com)
//   BREVO_API_KEY    clé Brevo         (https://brevo.com)
//   MAIL_FROM        expéditeur, ex : "Boîte à Outils GEFEC <affiches@mondomaine.fr>"
//   MAIL_REPLY_TO    (facultatif) adresse de réponse
// Sans clé, la fonction répond { ok:false, code:'mail_not_configured' } :
// l'interface bascule alors sur la messagerie de l'administrateur, message
// déjà rédigé et lien dedans.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function body(o: {
  storeName: string; storeId: string; url: string; pages: number;
  products: number; plans: string; expires: string; note: string;
}) {
  const titre = `Vos affiches promo sont prêtes — ${o.storeName}`;
  const lignes = [
    `${o.products} affiche(s) — ${o.plans}`,
    `${o.pages} page(s) à imprimer`,
    o.expires ? `Lien valable jusqu'au ${o.expires}` : "",
  ].filter(Boolean);

  const text = [
    `Bonjour,`,
    ``,
    `Les affiches prix de votre magasin (${o.storeName} — ${o.storeId}) sont prêtes :`,
    `elles croisent les plans promo de la centrale avec la valorisation que vous`,
    `avez déposée. Il n'y a plus qu'à imprimer.`,
    ``,
    ...lignes.map((l) => `• ${l}`),
    ``,
    `Télécharger le PDF :`,
    o.url,
    ``,
    o.note,
    ``,
    `— Boîte à Outils GEFEC`,
  ].join("\n");

  const html = `<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.55;color:#111827;max-width:560px">
  <p>Bonjour,</p>
  <p>Les affiches prix de votre magasin (<b>${esc(o.storeName)}</b> — ${esc(o.storeId)})
     sont prêtes : elles croisent les plans promo de la centrale avec la
     valorisation que vous avez déposée. Il n'y a plus qu'à imprimer.</p>
  <ul style="padding-left:18px;margin:14px 0">
    ${lignes.map((l) => `<li>${esc(l)}</li>`).join("")}
  </ul>
  <p style="margin:24px 0">
    <a href="${esc(o.url)}" style="background:#e6071a;color:#fff;text-decoration:none;
       font-weight:700;padding:13px 22px;border-radius:10px;display:inline-block">
      ⬇ Télécharger les affiches (PDF)</a>
  </p>
  <p style="font-size:13px;color:#6b7280">${esc(o.note)}</p>
  <p style="font-size:13px;color:#6b7280">— Boîte à Outils GEFEC</p>
</div>`;

  return { titre, text, html };
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
    const link = String(b.url ?? "").trim();
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to))
      return json(400, { error: "Adresse du destinataire invalide." });
    // Le lien doit être une URL signée du bucket « affiches » : cette fonction
    // poste un mail au nom de la centrale, elle n'est pas un relais à envoyer
    // n'importe où. (L'hôte du projet peut différer de SUPABASE_URL en local :
    // on accepte aussi un sous-domaine supabase.co.)
    let linkOk = false;
    try {
      const u = new URL(link);
      const host = new URL(url).hostname;
      linkOk = u.protocol === "https:"
        && (u.hostname === host || u.hostname.endsWith(".supabase.co"))
        && u.pathname.startsWith("/storage/v1/object/sign/affiches/");
    } catch (_e) { linkOk = false; }
    if (!linkOk) return json(400, { error: "Lien de téléchargement invalide." });

    const mail = body({
      storeName: String(b.store_name ?? b.store_id ?? ""),
      storeId: String(b.store_id ?? ""),
      url: link,
      pages: Number(b.pages ?? 0),
      products: Number(b.products ?? 0),
      plans: String(b.plans ?? "plans promo"),
      expires: String(b.expires ?? ""),
      note: String(b.note ?? "Ce lien vous est personnel : il ouvre directement le PDF, sans connexion."),
    });

    const from = Deno.env.get("MAIL_FROM") ?? "";
    const replyTo = Deno.env.get("MAIL_REPLY_TO") ?? "";
    const resend = Deno.env.get("RESEND_API_KEY") ?? "";
    const brevo = Deno.env.get("BREVO_API_KEY") ?? "";

    // 3) Aucun fournisseur configuré : l'interface prendra le relais avec la
    //    messagerie de l'administrateur (ce n'est pas une erreur).
    if (!resend && !brevo)
      return json(200, {
        ok: false, code: "mail_not_configured",
        error: "Aucune clé d'envoi (RESEND_API_KEY ou BREVO_API_KEY) n'est définie pour la fonction.",
      });
    if (!from)
      return json(200, {
        ok: false, code: "mail_not_configured",
        error: "Le secret MAIL_FROM (adresse d'expédition) n'est pas défini.",
      });

    let res: Response;
    if (resend) {
      res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from, to: [to], subject: mail.titre, html: mail.html, text: mail.text,
          ...(replyTo ? { reply_to: replyTo } : {}),
        }),
      });
    } else {
      const sender = parseFrom(from);
      res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": brevo, "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender, to: [{ email: to }], subject: mail.titre,
          htmlContent: mail.html, textContent: mail.text,
          ...(replyTo ? { replyTo: { email: replyTo } } : {}),
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
    return json(200, { ok: true, id, provider: resend ? "resend" : "brevo" });
  } catch (e) {
    return json(500, { error: String(e) });
  }
});
