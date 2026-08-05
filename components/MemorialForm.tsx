"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useState } from "react";
import { MapPicker } from "@/components/MapPicker";

export type MemorialFormData = {
  id?: string;
  name: string;
  species: string;
  breed: string;
  birthDate: string;
  passingDate: string;
  story: string;
  epitaph: string;
  avatarUrl: string;
  visibility: "public" | "unlisted" | "private";
  locationMode: "exact" | "approximate" | "symbolic" | "hidden";
  latitude: number | null;
  longitude: number | null;
  locationLabel: string;
  ceremonyTitle: string;
  ceremonyMessage: string;
  ceremonyStartsAt: string;
};

const emptyMemorial: MemorialFormData = {
  name: "", species: "", breed: "", birthDate: "", passingDate: "", story: "",
  epitaph: "", avatarUrl: "", visibility: "public", locationMode: "hidden",
  latitude: null, longitude: null, locationLabel: "", ceremonyTitle: "",
  ceremonyMessage: "", ceremonyStartsAt: "",
};

export function MemorialForm({ initial }: { initial?: MemorialFormData }) {
  const router = useRouter();
  const [data, setData] = useState(initial ?? emptyMemorial);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);

  function field<K extends keyof MemorialFormData>(key: K, value: MemorialFormData[K]) {
    setData((current) => ({ ...current, [key]: value }));
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError("");
    const body = new FormData();
    body.append("file", file);
    const response = await fetch("/api/uploads", { method: "POST", body });
    const result = await response.json();
    setUploading(false);
    if (!response.ok) return setError(result.error || "Не удалось загрузить фотографию");
    field("avatarUrl", result.url);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const response = await fetch(initial?.id ? `/api/memorials/${initial.id}` : "/api/memorials", {
      method: initial?.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Не удалось сохранить мемориал");
      setPending(false);
      return;
    }
    router.push(`/memorials/${result.slug}`);
    router.refresh();
  }

  return (
    <form className="memorial-form" onSubmit={submit}>
      <section className="panel form-section">
        <div className="form-section-heading"><span>01</span><div><h2>О питомце</h2><p>Главное, что хочется сохранить в памяти.</p></div></div>
        <div className="form-grid two-columns">
          <label><span>Имя питомца *</span><input value={data.name} onChange={(e) => field("name", e.target.value)} required maxLength={80} /></label>
          <label><span>Вид *</span><input value={data.species} onChange={(e) => field("species", e.target.value)} placeholder="Кошка, собака…" required maxLength={80} /></label>
          <label><span>Порода</span><input value={data.breed} onChange={(e) => field("breed", e.target.value)} maxLength={120} /></label>
          <label><span>Основная фотография</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void upload(e.target.files?.[0])} /><small>{uploading ? "Загружаем…" : "JPEG, PNG или WebP, до 5 МБ"}</small></label>
          <label><span>Дата рождения</span><input type="date" value={data.birthDate} onChange={(e) => field("birthDate", e.target.value)} /></label>
          <label><span>Дата ухода</span><input type="date" value={data.passingDate} onChange={(e) => field("passingDate", e.target.value)} /></label>
        </div>
        {data.avatarUrl && <div className="upload-preview"><Image src={data.avatarUrl} alt="Предпросмотр" width={120} height={120} unoptimized /></div>}
        <label><span>История</span><textarea value={data.story} onChange={(e) => field("story", e.target.value)} rows={7} maxLength={10000} placeholder="Расскажите о характере, привычках и счастливых моментах…" /></label>
        <label><span>Эпитафия</span><input value={data.epitaph} onChange={(e) => field("epitaph", e.target.value)} maxLength={280} placeholder="Короткая фраза, которая останется рядом" /></label>
      </section>

      <section className="panel form-section">
        <div className="form-section-heading"><span>02</span><div><h2>Публикация и место</h2><p>Вы сами решаете, что увидят другие.</p></div></div>
        <div className="form-grid two-columns">
          <label><span>Доступ к мемориалу</span><select value={data.visibility} onChange={(e) => field("visibility", e.target.value as MemorialFormData["visibility"])}><option value="public">Публичный</option><option value="unlisted">Только по ссылке</option><option value="private">Только для меня</option></select></label>
          <label><span>Как показывать место</span><select value={data.locationMode} onChange={(e) => {
            const locationMode = e.target.value as MemorialFormData["locationMode"];
            setData((current) => ({
              ...current,
              locationMode,
              latitude: locationMode === "hidden" ? null : current.latitude,
              longitude: locationMode === "hidden" ? null : current.longitude,
            }));
          }}><option value="hidden">Не указывать</option><option value="exact">Точная выбранная точка</option><option value="approximate">Приблизительная область</option><option value="symbolic">Символическое место</option></select></label>
          <label className="full-column"><span>Подпись места</span><input value={data.locationLabel} onChange={(e) => field("locationLabel", e.target.value)} maxLength={180} placeholder="Например: любимый парк или Москва" /></label>
        </div>
        <MapPicker
          latitude={data.latitude}
          longitude={data.longitude}
          disabled={data.locationMode === "hidden"}
          onChange={(latitude, longitude) => setData((current) => ({ ...current, latitude, longitude }))}
        />
        {data.locationMode === "approximate" && <p className="privacy-note">Точная точка сохранится приватно. На публичной карте она будет автоматически смещена.</p>}
        {data.locationMode === "symbolic" && <p className="privacy-note">Эта точка будет обозначена как символическое место памяти, а не реальное захоронение.</p>}
      </section>

      <section className="panel form-section">
        <div className="form-section-heading"><span>03</span><div><h2>Церемония памяти</h2><p>Необязательно. Можно заполнить сейчас или позже.</p></div></div>
        <div className="form-grid two-columns">
          <label><span>Название церемонии</span><input value={data.ceremonyTitle} onChange={(e) => field("ceremonyTitle", e.target.value)} maxLength={140} placeholder="Вечер памяти" /></label>
          <label><span>Дата и время</span><input type="datetime-local" value={data.ceremonyStartsAt} onChange={(e) => field("ceremonyStartsAt", e.target.value)} /></label>
          <label className="full-column"><span>Прощальные слова</span><textarea value={data.ceremonyMessage} onChange={(e) => field("ceremonyMessage", e.target.value)} rows={5} maxLength={5000} /></label>
        </div>
      </section>

      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending || uploading}>{pending ? "Сохраняем…" : initial ? "Сохранить изменения" : "Создать мемориал"}</button>
        <button className="button button-ghost" type="button" onClick={() => router.back()}>Отмена</button>
      </div>
    </form>
  );
}
