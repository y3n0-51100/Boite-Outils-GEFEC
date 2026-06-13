// Edge Function : gestion des comptes magasins (réservée à l'administrateur).
// Actions : create | list | delete | reset_password.
// Le service_role n'est JAMAIS exposé au navigateur : il vit ici, côté serveur.
// Supabase injecte automatiquement SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY dans l'environnement de la fonction.

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1) Vérifier que l'appelant est bien un administrateur connecté
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

    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "create";

    if (action === "list") {
      const { data, error } = await admin
        .from("profiles")
        .select("user_id, username, role, store_id, display_name, created_at")
        .order("role").order("store_id");
      if (error) return json(400, { error: error.message });
      return json(200, { users: data });
    }

    if (action === "create") {
      const { username, password, role, store_id, store_name, region, display_name } = body;
      if (!username || !password || !role)
        return json(400, { error: "Champs requis : username, password, role." });
      if (!["admin", "director", "store"].includes(role))
        return json(400, { error: "Rôle invalide." });
      if (role === "store" && !store_id)
        return json(400, { error: "Un magasin requiert un code magasin (store_id)." });

      if (role === "store") {
        const { error: serr } = await admin.from("stores")
          .upsert({ id: store_id, name: store_name ?? store_id, region: region ?? null });
        if (serr) return json(400, { error: "Magasin : " + serr.message });
      }

      const email = `${String(username).toLowerCase().trim()}@gefec.local`;
      const { data: created, error: cerr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { username, display_name: display_name ?? username },
      });
      if (cerr) return json(400, { error: cerr.message });

      const { error: perr } = await admin.from("profiles").insert({
        user_id: created.user.id, username, role,
        store_id: role === "store" ? store_id : null,
        display_name: display_name ?? username,
      });
      if (perr) {
        await admin.auth.admin.deleteUser(created.user.id); // rollback
        return json(400, { error: "Profil : " + perr.message });
      }
      return json(200, { ok: true, user_id: created.user.id });
    }

    if (action === "delete") {
      const { user_id } = body;
      if (!user_id) return json(400, { error: "user_id requis." });
      const { error } = await admin.auth.admin.deleteUser(user_id);
      if (error) return json(400, { error: error.message });
      return json(200, { ok: true });
    }

    if (action === "reset_password") {
      const { user_id, password } = body;
      if (!user_id || !password) return json(400, { error: "user_id et password requis." });
      const { error } = await admin.auth.admin.updateUserById(user_id, { password });
      if (error) return json(400, { error: error.message });
      return json(200, { ok: true });
    }

    return json(400, { error: "Action inconnue." });
  } catch (e) {
    return json(500, { error: String(e) });
  }
});
