import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";
import { isGoogleOAuthEnabled } from "@/lib/google-oauth";

const oauthErrors: Record<string, string> = {
  cancelled: "Вход через Google отменён.",
  invalid_request: "Запрос авторизации устарел или недействителен. Попробуйте снова.",
  failed: "Не удалось войти через Google. Попробуйте ещё раз.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ oauthError?: string }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { oauthError } = await searchParams;
  return (
    <section className="auth-page shell narrow-shell">
      <p className="eyebrow">С возвращением</p>
      <h1>Войти в Pet Cemetery</h1>
      <p className="subtle">Ваши истории и мемориалы ждут вас.</p>
      {oauthError && oauthErrors[oauthError] && <p className="form-error auth-page-error" role="alert">{oauthErrors[oauthError]}</p>}
      <AuthForm mode="login" googleOAuthEnabled={isGoogleOAuthEnabled()} />
    </section>
  );
}
