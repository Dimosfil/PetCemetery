"use client";

import { useState } from "react";

export function ReportButton({ memorialId, authenticated }: { memorialId: string; authenticated: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/reports", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memorialId, reason }),
    });
    const data = await response.json();
    if (!response.ok) return setStatus(data.error || "Не удалось отправить жалобу");
    setStatus("Спасибо. Жалоба отправлена на рассмотрение.");
    setReason("");
  }

  if (!open) return <button className="muted-button" type="button" onClick={() => setOpen(true)}>Пожаловаться</button>;
  if (!authenticated) return <p className="report-note">Чтобы отправить жалобу, войдите в аккаунт.</p>;
  return (
    <form className="report-form" onSubmit={submit}>
      <label><span>Причина жалобы</span><textarea value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} maxLength={500} required rows={3} /></label>
      {status && <p className="report-note">{status}</p>}
      <button className="button button-small button-ghost" type="submit">Отправить</button>
    </form>
  );
}
