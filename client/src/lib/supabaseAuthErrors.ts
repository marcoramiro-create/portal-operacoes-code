export function isEmailRateLimitError(message?: string) {
  return /email rate limit exceeded/i.test(message ?? "");
}

export function recoveryErrorMessage(message?: string) {
  if (isEmailRateLimitError(message)) {
    return "O Supabase limitou temporariamente o envio de e-mails. Aguarde antes de solicitar outro link e use apenas o e-mail mais recente.";
  }
  return "Não foi possível solicitar a redefinição de senha agora. Tente novamente mais tarde.";
}
