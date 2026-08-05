"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TributeForm({ memorialId, authenticated }: { memorialId: string; authenticated: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<"candle" | "flower" | "message">("candle");
  const [guestName, setGuestName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const response = await fetch(`/api/memorials/${memorialId}/tributes`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, guestName, message }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Не удалось оставить знак памяти");
      setPending(false);
      return;
    }
    setMessage("");
    setPending(false);
    router.refresh();
  }

  return (
    <form className="tribute-form" onSubmit={submit}>
      <div className="tribute-kinds" role="group" aria-label="Выберите знак памяти">
        <button className={kind === "candle" ? "selected" : ""} type="button" onClick={() => setKind("candle")}><span>🕯️</span>Свеча</button>
        <button className={kind === "flower" ? "selected" : ""} type="button" onClick={() => setKind("flower")}><span>🌿</span>Цветок</button>
        <button className={kind === "message" ? "selected" : ""} type="button" onClick={() => setKind("message")}><span>♡</span>Слова</button>
      </div>
      {!authenticated && <label><span>Ваше имя</span><input value={guestName} onChange={(e) => setGuestName(e.target.value)} required minLength={2} maxLength={80} /></label>}
      {kind === "message" && <label><span>Памятные слова</span><textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} required maxLength={700} /></label>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-small" disabled={pending} type="submit">{pending ? "Отправляем…" : "Оставить знак памяти"}</button>
    </form>
  );
}
