import Link from "next/link";

export default function NotFound() {
  return <section className="section shell narrow-shell empty-state"><span>✦</span><h1>Страница не найдена</h1><p>Возможно, мемориал приватный или ссылка устарела.</p><Link className="button button-small" href="/">На главную</Link></section>;
}
