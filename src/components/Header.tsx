import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { getCurrentUser, setCurrentUser } from '../lib/finsight-storage'

export default function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const currentUser = getCurrentUser()

  // Only show nav after login (exclude landing and login pages)
  if (!currentUser || location.pathname === '/' || location.pathname === '/login') {
    return null
  }

  const handleSignOut = () => {
    setCurrentUser(null)
    navigate({ to: '/', replace: true })
  }

  return (
    <header className="sticky top-0 z-50 border-b border-[rgba(110,146,255,0.16)] bg-[var(--header-bg)] px-4 backdrop-blur-xl shadow-[0_15px_45px_rgba(61,97,194,0.08)]">
      <nav className="page-wrap flex flex-wrap items-center gap-3 py-3 sm:py-4">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-[rgba(95,143,255,0.18)] bg-gradient-to-r from-[#5d82ff] to-[#30d3ff] px-4 py-2 text-sm font-semibold text-white no-underline shadow-[0_14px_35px_rgba(59,111,255,0.18)]"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-white/90 shadow-[0_0_16px_rgba(255,255,255,0.45)]" />
            FinSight AI
          </Link>
          <div className="hidden rounded-full bg-white/85 px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm shadow-slate-200/60 sm:inline-flex">
            Signed in
          </div>
        </div>

        <div className="order-3 flex w-full flex-wrap items-center gap-2 text-sm font-semibold sm:order-2 sm:w-auto sm:flex-nowrap">
          <Link
            to="/demo/finances"
            className="nav-link"
            activeProps={{ className: 'nav-link is-active' }}
          >
            Dashboard
          </Link>
          <Link
            to="/about"
            className="nav-link"
            activeProps={{ className: 'nav-link is-active' }}
          >
            About
          </Link>
          
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-full bg-gradient-to-r from-[#fc5a6e] to-[#ff856a] px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_40px_rgba(252,90,110,0.22)] transition-transform duration-200 hover:-translate-y-0.5 hover:from-[#ea4d67] hover:to-[#ff7a4a]"
          >
            Sign out
          </button>
        </div>
      </nav>
    </header>
  )
}
