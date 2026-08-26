import { Client } from "pg";

const projectUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const connectionString = process.env.SUPABASE_DATABASE_URL;

if (!projectUrl || !serviceRoleKey || !connectionString) {
  throw new Error("As credenciais necessárias do Supabase não estão configuradas.");
}

const users = [
  { email: "marco.ramiro@megatec.com.br", displayName: "Marco Ramiro — Administrador técnico", profileKey: "development-admin", developmentAdmin: true },
  { email: "marcoramiro@gmail.com", displayName: "Marco Ramiro — Usuário operacional de teste", profileKey: "operator", developmentAdmin: false },
];

async function invite(email) {
  const response = await fetch(`${projectUrl}/auth/v1/invite`, {
    method: "POST",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, data: { portal_environment: "homologacao" } }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Não foi possível enviar convite para ${email}: ${body.msg ?? body.message ?? response.statusText}`);
  return body.user ?? body;
}

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  for (const user of users) {
    const existing = await client.query("select id, email from auth.users where lower(email) = lower($1) limit 1", [user.email]);
    const authUser = existing.rows[0] ?? await invite(user.email);

    const portalUser = await client.query(
      `insert into public.portal_users (auth_user_id, email, display_name, status, is_development_admin)
       values ($1, $2, $3, 'active', $4)
       on conflict (email) do update set auth_user_id = excluded.auth_user_id, display_name = excluded.display_name, status = 'active', is_development_admin = excluded.is_development_admin, updated_at = now()
       returning id`,
      [authUser.id, user.email, user.displayName, user.developmentAdmin],
    );
    const profile = await client.query("select id from public.access_profiles where profile_key = $1", [user.profileKey]);
    await client.query(
      `insert into public.user_profile_assignments (user_id, profile_id)
       values ($1, $2)
       on conflict do nothing`,
      [portalUser.rows[0].id, profile.rows[0].id],
    );
    await client.query(
      `insert into public.audit_events (actor_user_id, entity_type, entity_id, action, details)
       values ($1, 'portal_user', $1, 'provisioned', jsonb_build_object('environment', 'homologacao', 'profile', $2::text))`,
      [portalUser.rows[0].id, user.profileKey],
    );
  }
  console.log(JSON.stringify({ provisioned: users.map(user => user.email) }));
} finally {
  await client.end();
}
