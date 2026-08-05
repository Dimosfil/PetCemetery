import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";
import { isGoogleOAuthEnabled } from "@/lib/google-oauth";

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <section className="auth-page shell narrow-shell">
      <p className="eyebrow">Начать историю</p>
      <h1>Создайте пространство памяти</h1>
      <p className="subtle">Регистрация займёт меньше минуты.</p>
      <AuthForm mode="register" googleOAuthEnabled={isGoogleOAuthEnabled()} />
    </section>
  );
}
