// Edge Function : lance la tournée des affiches à 6 h pile (heure de Paris).
//
// Le planificateur de GitHub décale les tâches programmées de plusieurs
// heures : la tournée « de 6 h » partait vers midi. Ici, c'est pg_cron
// (Supabase, exact à la minute) qui appelle cette fonction, laquelle lance
// immédiatement le workflow GitHub « envoi-auto-affiches.yml » — un
// lancement à la demande, qui n'est pas mis en file d'attente comme les
// tâches programmées.
//
// Sécurité : l'appel doit porter un jeton à usage unique (en-tête
// x-cron-token) créé par la fonction SQL public.new_cron_token(), que seul
// le planificateur de la base peut exécuter. Jeton valable 10 minutes.
//
// Heure : pg_cron tourne en UTC. Deux passages (4 h et 5 h UTC) couvrent
// l'heure d'été et l'heure d'hiver ; seul celui qui tombe à 6 h à Paris
// lance la tournée. Le workflow lui-même refuse une seconde tournée
// automatique le même jour (le planificateur GitHub reste en secours).
//
// Secret requis (déjà utilisé par trigger-base-update) : GH_DISPATCH_TOKEN.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WORKFLOW = "envoi-auto-affiches.yml";
const json = (status: number, obj: unknown) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

function parisHour(d = new Date()): number {
  return +new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).format(d);
}

Deno.serve(async (req) => {
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);

    // 1) jeton à usage unique du planificateur
    const token = req.headers.get("x-cron-token") || "";
    if (!/^[0-9a-f-]{36}$/i.test(token)) return json(401, { error: "jeton absent" });
    const { data: row } = await admin.from("cron_tokens").delete().eq("token", token)
      .gt("expires_at", new Date().toISOString()).select("token").maybeSingle();
    if (!row) return json(401, { error: "jeton invalide ou expiré" });

    // 2) uniquement à 6 h, heure de Paris
    const h = parisHour();
    if (h !== 6) return json(200, { skipped: `il est ${h} h à Paris : la tournée part à 6 h` });

    // 3) lancement immédiat du workflow GitHub
    const gh = Deno.env.get("GH_DISPATCH_TOKEN");
    if (!gh) return json(500, { error: "secret GH_DISPATCH_TOKEN absent" });
    const repo = Deno.env.get("GH_REPO") || "y3n0-51100/Boite-Outils-GEFEC";
    const ref = Deno.env.get("GH_REF") || "main";
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${gh}`, Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "boite-outils-gefec", "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref }),
    });
    if (r.status !== 204) return json(502, { error: `GitHub a refusé le lancement (HTTP ${r.status}) : ${(await r.text()).slice(0, 200)}` });
    return json(200, { ok: true, started_at: new Date().toISOString() });
  } catch (e) {
    return json(500, { error: String(e) });
  }
});
