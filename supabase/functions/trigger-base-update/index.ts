// Edge Function : mise à jour manuelle de la base article NOSICA (administrateur).
// Lance le workflow GitHub « update-base.yml » (le même que la mise à jour de
// nuit) et renvoie l'état de la dernière exécution pour suivre l'avancement.
//
// Corps : { action: "run" | "status" }
// Secret requis (Edge Functions → Secrets) :
//   GH_DISPATCH_TOKEN  jeton GitHub « fine-grained » limité au dépôt
//                      Boite-Outils-GEFEC, permission Actions : Read and write.
// Facultatifs : GH_REPO (défaut y3n0-51100/Boite-Outils-GEFEC), GH_REF (défaut main).

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

const WORKFLOW = "update-base.yml";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1) appelant = administrateur connecté
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json(401, { error: "Non authentifié." });
    const admin = createClient(url, serviceKey);
    const { data: prof } = await admin.from("profiles").select("role").eq("user_id", user.id).single();
    if (!prof || prof.role !== "admin") return json(403, { error: "Action réservée à l'administrateur." });

    // 2) GitHub
    const token = Deno.env.get("GH_DISPATCH_TOKEN");
    if (!token) {
      return json(400, {
        error: "Secret GH_DISPATCH_TOKEN absent : ajoutez un jeton GitHub (permission Actions) dans Supabase → Edge Functions → Secrets.",
      });
    }
    const repo = Deno.env.get("GH_REPO") || "y3n0-51100/Boite-Outils-GEFEC";
    const ref = Deno.env.get("GH_REF") || "main";
    const gh = (path: string, init: RequestInit = {}) =>
      fetch(`https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "boite-outils-gefec",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
      });

    const body = await req.json().catch(() => ({}));

    if (body.action === "run") {
      const r = await gh("/dispatches", { method: "POST", body: JSON.stringify({ ref }) });
      if (r.status !== 204) {
        const t = await r.text();
        return json(400, { error: `GitHub a refusé le lancement (HTTP ${r.status}) : ${t.slice(0, 200)}` });
      }
      return json(200, { ok: true, started_at: new Date().toISOString() });
    }

    // statut : dernière exécution du workflow
    const r = await gh("/runs?per_page=1");
    if (!r.ok) return json(400, { error: `Lecture du statut impossible (HTTP ${r.status}).` });
    const j = await r.json();
    const run = j.workflow_runs?.[0];
    if (!run) return json(200, { ok: true, run: null });
    return json(200, {
      ok: true,
      run: {
        status: run.status,           // queued | in_progress | completed
        conclusion: run.conclusion,   // success | failure | cancelled | null
        event: run.event,             // schedule | workflow_dispatch
        created_at: run.created_at,
        updated_at: run.updated_at,
        url: run.html_url,
      },
    });
  } catch (e) {
    return json(500, { error: String(e) });
  }
});
