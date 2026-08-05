"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function OwnerCityForm({ initialCity }: { initialCity: string }) {
  const router = useRouter();
  const [city, setCity] = useState(initialCity);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setSaved(false);

    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city }),
    });
    const data = await response.json();
    setPending(false);

    if (!response.ok) {
      setError(data.error || "Не удалось сохранить город");
      return;
    }

    setCity(data.city || "");
    setSaved(true);
    router.refresh();
  }

  return (
    <form className="panel profile-city-form" onSubmit={submit}>
      <div>
        <p className="eyebrow">Профиль владельца</p>
        <h2>Город проживания</h2>
        <p>Это отдельные данные автора. Они не меняют и не ограничивают точку мемориала на карте.</p>
      </div>
      <label>
        <span>Ваш город</span>
        <input
          name="city"
          autoComplete="address-level2"
          maxLength={120}
          value={city}
          onChange={(event) => { setCity(event.target.value); setSaved(false); }}
          placeholder="Например: Казань"
        />
        <small>Если поле заполнено, город показывается на мемориалах и доступен другим авторизованным пользователям для поиска друзей.</small>
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      {saved && <p className="form-success" role="status">Город сохранён.</p>}
      <button className="button button-small" disabled={pending} type="submit">
        {pending ? "Сохраняем…" : "Сохранить город"}
      </button>
    </form>
  );
}
