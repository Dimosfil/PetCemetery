import { MemorialForm } from "@/components/MemorialForm";
import { requireUser } from "@/lib/auth";

export default async function NewMemorialPage() {
  await requireUser();
  return (
    <section className="section shell form-page">
      <p className="eyebrow">Новая история</p>
      <h1>Создать мемориал</h1>
      <p className="subtle">Заполняйте только то, чем готовы поделиться.</p>
      <MemorialForm />
    </section>
  );
}
