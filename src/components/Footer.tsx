export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="mt-20 border-t border-[rgba(110,146,255,0.18)] bg-white/85 px-4 pb-14 pt-10 text-slate-600 backdrop-blur-xl shadow-[0_-8px_30px_rgba(56,96,185,0.08)]">
      <div className="page-wrap flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
        <p className="m-0 text-sm text-slate-600">
          &copy; {year} FinSight AI. All rights reserved.
        </p>
        <p className="island-kicker m-0 text-slate-700">Built for FinSight AI users</p>
      </div>
      <div className="mt-4 flex justify-center gap-4">
        <a
          href="/demo/finances"
          className="rounded-2xl bg-white/80 px-4 py-3 text-sm text-slate-700 transition hover:bg-[rgba(93,142,255,0.14)] hover:text-slate-900"
        >
          <span className="sr-only">Follow TanStack on X</span>
          <svg viewBox="0 0 16 16" aria-hidden="true" width="32" height="32">
            <path
              fill="currentColor"
              d="M12.6 1h2.2L10 6.48 15.64 15h-4.41L7.78 9.82 3.23 15H1l5.14-5.84L.72 1h4.52l3.12 4.73L12.6 1zm-.77 12.67h1.22L4.57 2.26H3.26l8.57 11.41z"
            />
          </svg>
        </a>

      </div>
    </footer>
  )
}
