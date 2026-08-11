import Link from 'next/link';
import { HELP_RESOURCE_CATALOG } from '@/client/content/helpCatalog';

export default function ProfileHelpPage() {
  return (
    <main
      className="app-shell-narrow space-y-4 py-4 sm:py-7"
      data-help-catalog-version={HELP_RESOURCE_CATALOG.catalogVersion}
    >
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="app-muted text-xs">Личная справка</div>
          <h1 className="mt-1 text-2xl font-semibold">Как работает Forever</h1>
          <p className="app-muted mt-2 max-w-xl text-sm">
            Коротко о совместном цикле, приватности и ограничениях системы.
          </p>
        </div>
        <Link href="/profile/settings" className="app-btn-secondary shrink-0 px-3 py-2 text-sm">
          К настройкам
        </Link>
      </header>

      <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 sm:p-5">
        <div className="text-xs font-medium text-amber-800">Важно</div>
        <h2 className="mt-1 text-lg font-semibold">{HELP_RESOURCE_CATALOG.emergencyNotice.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          {HELP_RESOURCE_CATALOG.emergencyNotice.body}
        </p>
      </section>

      <section className="grid gap-3">
        {HELP_RESOURCE_CATALOG.sections.map((section, index) => (
          <article key={section.id} id={`help-${section.id}`} className="app-panel app-panel-solid scroll-mt-4 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="app-panel-soft app-panel-soft-solid flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                {index + 1}
              </div>
              <div>
                <h2 className="text-lg font-semibold">{section.title}</h2>
                <p className="app-muted mt-1 text-sm leading-relaxed">{section.body}</p>
              </div>
            </div>
            <ul className="app-muted mt-4 space-y-2 pl-5 text-sm leading-relaxed">
              {section.points.map((point) => (
                <li key={point} className="list-disc">
                  {point}
                </li>
              ))}
            </ul>
            {section.action && (
              <Link href={section.action.href} className="app-btn-primary mt-4 inline-flex px-4 py-2 text-sm">
                {section.action.label}
              </Link>
            )}
          </article>
        ))}
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href="/profile" className="app-btn-secondary px-4 py-2 text-sm">
          Вернуться в профиль
        </Link>
        <Link href="/profile/settings" className="app-btn-secondary px-4 py-2 text-sm">
          Данные и аккаунт
        </Link>
      </div>
    </main>
  );
}
