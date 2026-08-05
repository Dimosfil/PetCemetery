import type { Metadata } from "next";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Pet Cemetery — память рядом",
  description: "Бережное пространство памяти о домашних животных",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();

  return (
    <html lang="ru" data-scroll-behavior="smooth">
      <body>
        <header className="site-header">
          <div className="shell header-inner">
            <Link className="brand" href="/" aria-label="Pet Cemetery, на главную">
              <span className="brand-mark" aria-hidden="true">✦</span>
              <span>Pet Cemetery</span>
            </Link>
            <nav className="main-nav" aria-label="Основная навигация">
              <Link href="/map">Карта памяти</Link>
              {user ? (
                <>
                  <Link href="/dashboard">Мои мемориалы</Link>
                  <Link href="/friends">Друзья</Link>
                  <form action="/api/auth/logout" method="post">
                    <button className="link-button" type="submit">Выйти</button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login">Войти</Link>
                  <Link className="button button-small" href="/register">Создать мемориал</Link>
                </>
              )}
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="shell footer-inner">
            <div>
              <strong>Pet Cemetery</strong>
              <p>Место, где любовь остаётся рядом.</p>
            </div>
            <div className="footer-links">
              <Link href="/map">Карта памяти</Link>
              <Link href="/privacy">Приватность</Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
