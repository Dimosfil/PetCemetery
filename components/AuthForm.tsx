"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AuthForm({ mode, googleOAuthEnabled = false }: { mode: "login" | "register"; googleOAuthEnabled?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Не удалось выполнить запрос");
      setPending(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  const isRegister = mode === "register";
  return (
    <form className="panel form-stack auth-form" onSubmit={submit}>
      {googleOAuthEnabled && (
        <>
          <a className="button oauth-button" href="/api/auth/google">
            Продолжить с Google
          </a>
          <div className="form-divider"><span>или по email</span></div>
        </>
      )}
      {isRegister && (
        <>
          <label>
            <span>Как к вам обращаться</span>
            <input name="displayName" autoComplete="name" required minLength={2} maxLength={80} />
          </label>
          <label>
            <span>Ваш город</span>
            <input name="city" autoComplete="address-level2" maxLength={120} placeholder="Например: Казань" />
            <small>Необязательно. Если указан, город будет виден на созданных вами мемориалах.</small>
          </label>
        </>
      )}
      <label>
        <span>Email</span>
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        <span>Пароль</span>
        <input
          name="password"
          type="password"
          autoComplete={isRegister ? "new-password" : "current-password"}
          minLength={isRegister ? 10 : 1}
          required
        />
        {isRegister && <small>Не менее 10 символов</small>}
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button" disabled={pending} type="submit">
        {pending ? "Подождите…" : isRegister ? "Создать аккаунт" : "Войти"}
      </button>
      <p className="form-switch">
        {isRegister ? "Уже есть аккаунт?" : "Ещё нет аккаунта?"}{" "}
        <Link href={isRegister ? "/login" : "/register"}>
          {isRegister ? "Войти" : "Зарегистрироваться"}
        </Link>
      </p>
    </form>
  );
}
