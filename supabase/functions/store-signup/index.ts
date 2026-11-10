// Edge Function : création de compte magasin en autonomie (publique).
// Appelée depuis la page de connexion, SANS session : elle vérifie tout
// elle-même puis crée, en service_role :
//   1. la fiche magasin (stores) avec ses 1 à 3 adresses de réception ;
//   2. l'utilisateur Auth  <identifiant>@gefec.local  (identifiant = nom du
//      magasin normalisé, ex. « BUT Reims » -> « but-reims ») ;
//   3. le profil (rôle « store ») ;
//   4. la valorisation PDF (bucket « valorisations ») + ses métadonnées.
// Une étape qui échoue défait les précédentes : pas de compte à moitié créé.
//
// Corps attendu : multipart/form-data
//   store_name, password, emails (JSON : ["a@x.fr", …]), ean_count, file (PDF)
// À déployer avec verify_jwt = false (aucun utilisateur n'est encore connecté).

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

const MAX_PDF = 25 * 1024 * 1024;
const RESERVED = new Set(["admin", "robot-affiches", "robot", "administrateur"]);
const isMail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

// même normalisation que l'écran de connexion (app-auth.js : loginSlug)
function slugify(s: string) {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Méthode non autorisée." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  let form: FormData;
  try { form = await req.formData(); }
  catch { return json(400, { error: "Formulaire illisible." }); }

  // ---------- 1. Contrôles ----------
  const storeName = String(form.get("store_name") ?? "").trim().replace(/\s+/g, " ");
  const password = String(form.get("password") ?? "");
  const slug = slugify(storeName);
  let emails: string[] = [];
  try { emails = JSON.parse(String(form.get("emails") ?? "[]")); } catch { emails = []; }
  emails = [...new Set((Array.isArray(emails) ? emails : [])
    .map((e) => String(e ?? "").trim().toLowerCase()).filter(Boolean))];
  const eanCount = Number(form.get("ean_count")) || null;
  const file = form.get("file");

  if (storeName.length < 2 || storeName.length > 60 || slug.length < 2)
    return json(400, { error: "Nom du magasin invalide (2 à 60 caractères)." });
  if (RESERVED.has(slug))
    return json(400, { error: "Ce nom de magasin n'est pas disponible." });
  if (password.length < 8)
    return json(400, { error: "Le mot de passe doit faire au moins 8 caractères." });
  if (!emails.length) return json(400, { error: "Au moins une adresse e-mail est requise." });
  if (emails.length > 3) return json(400, { error: "Trois adresses e-mail au maximum." });
  if (emails.some((e) => !isMail(e))) return json(400, { error: "Adresse e-mail invalide." });
  if (!(file instanceof File) || !file.size)
    return json(400, { error: "La valorisation PDF est obligatoire." });
  if (file.size > MAX_PDF) return json(400, { error: "Valorisation trop lourde (25 Mo maximum)." });
  const bytes = new Uint8Array(await file.arrayBuffer());
  // signature « %PDF »
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46))
    return json(400, { error: "Le fichier déposé n'est pas un PDF." });

  // ---------- 2. Unicité ----------
  const { data: exStore } = await admin.from("stores").select("id").eq("id", slug).maybeSingle();
  const { data: exProf } = await admin.from("profiles").select("user_id").eq("username", slug).maybeSingle();
  if (exStore || exProf)
    return json(409, { error: "Un compte existe déjà pour ce magasin." });

  // ---------- 3. Création, avec retour arrière ----------
  let userId: string | null = null;
  const rollback = async () => {
    try { await admin.storage.from("valorisations").remove([`${slug}/valorisation.pdf`]); } catch { /* */ }
    if (userId) {
      try { await admin.from("profiles").delete().eq("user_id", userId); } catch { /* */ }
      try { await admin.auth.admin.deleteUser(userId); } catch { /* */ }
    }
    try { await admin.from("stores").delete().eq("id", slug); } catch { /* */ }
  };

  try {
    const { error: serr } = await admin.from("stores").insert({
      id: slug, name: storeName, emails, mail_enabled: true,
    });
    if (serr) throw new Error("Magasin : " + serr.message);

    const { data: created, error: cerr } = await admin.auth.admin.createUser({
      email: `${slug}@gefec.local`, password, email_confirm: true,
      user_metadata: { username: slug, display_name: storeName },
    });
    if (cerr || !created?.user) throw new Error(cerr?.message || "Compte non créé.");
    userId = created.user.id;

    const { error: perr } = await admin.from("profiles").insert({
      user_id: userId, username: slug, role: "store", store_id: slug, display_name: storeName,
    });
    if (perr) throw new Error("Profil : " + perr.message);

    const { error: uerr } = await admin.storage.from("valorisations")
      .upload(`${slug}/valorisation.pdf`, bytes, { upsert: true, contentType: "application/pdf" });
    if (uerr) throw new Error("Valorisation : " + uerr.message);

    const { error: verr } = await admin.from("valorisations").upsert({
      store_id: slug, file_path: `${slug}/valorisation.pdf`,
      file_name: file.name || "valorisation.pdf", ean_count: eanCount,
      updated_at: new Date().toISOString(), updated_by: userId,
    });
    if (verr) throw new Error("Valorisation : " + verr.message);

    return json(200, { ok: true, login: slug });
  } catch (e) {
    await rollback();
    return json(400, { error: String((e as Error)?.message || e) });
  }
});
