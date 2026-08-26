const projectUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!projectUrl || !serviceRoleKey) {
  throw new Error("A integração de identidade do Supabase não está configurada.");
}

const emails = ["marco.ramiro@megatec.com.br", "marcoramiro@gmail.com"];
const redirectTo = "https://gestaolog-ehcfqbaf.manus.space";

const results = [];
for (const email of emails) {
  const response = await fetch(`${projectUrl}/auth/v1/recover`, {
    method: "POST",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, redirect_to: redirectTo }),
  });
  if (!response.ok) throw new Error(`Não foi possível enviar o link de ativação para ${email}.`);
  results.push(email);
}

console.log(JSON.stringify({ activation_links_requested: results, redirect_to: redirectTo }));
