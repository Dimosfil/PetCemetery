"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteMemorialButton({ memorialId, petName }: { memorialId: string; petName: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function remove() {
    const confirmed = window.confirm(`Удалить мемориал «${petName}»? Это действие нельзя отменить.`);
    if (!confirmed) return;
    setPending(true);
    setError("");
    const response = await fetch(`/api/memorials/${memorialId}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Не удалось удалить мемориал");
      setPending(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="danger-zone">
      <div><h2>Удаление мемориала</h2><p>История, церемония и все знаки памяти будут удалены безвозвратно.</p></div>
      <button className="danger-button" disabled={pending} type="button" onClick={remove}>{pending ? "Удаляем…" : "Удалить мемориал"}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
