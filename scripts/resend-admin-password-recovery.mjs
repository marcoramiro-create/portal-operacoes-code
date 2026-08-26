const projectUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = "marco.ramiro@megatec.com.br";
const redirectTo = "https://gestaolog-ehcfqbaf.manus.space";

if (!projectUrl || !serviceRoleKey) {
  throw new Error("A integração de identidade do Supabase não está configurada.");
}

const response = await fetch(`${projectUrl}/auth/v1/recover`, {
  method: "POST",
  headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({ email, redirect_to: redirectTo }),
});

if (!response.ok) throw new Error("Não foi possível solicitar o e-mail de redefinição para a conta administrativa.");
console.log(JSON.stringify({ recovery_requested_for: email, redirect_to: redirectTo }));
