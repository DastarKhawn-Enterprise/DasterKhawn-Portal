export default function Home() {
  return (
    <main className="min-h-screen bg-[#F5F1EA] flex flex-col" style={{ color: '#1A1A1A' }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#1A1A1A] flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
              <path d="M7 2v20" />
              <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
            </svg>
          </div>
          <div>
            <span className="text-lg font-bold leading-tight">Dastarkhwan.</span>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 leading-tight">Multi-Brand POS Portal</div>
          </div>
        </div>
        <a
          href="/sign-in"
          className="text-sm font-semibold px-5 py-2 rounded-lg text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#D97B3F' }}
        >
          Sign In
        </a>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 text-center max-w-2xl mx-auto">
        <h1 className="text-5xl sm:text-6xl font-bold leading-tight mb-4" style={{ color: '#1A1A1A' }}>
          One portal.
          <br />
          Every brand&rsquo;s POS.
        </h1>
        <p className="text-lg sm:text-xl text-gray-600 mb-8 max-w-md">
          Manage point-of-sale for all your restaurant brands from a single dashboard.
        </p>
        <a
          href="/sign-in"
          className="text-base font-semibold px-8 py-3 rounded-lg text-white shadow-md transition-shadow hover:shadow-lg"
          style={{ backgroundColor: '#D97B3F' }}
        >
          Sign In to Your Portal
        </a>
      </section>
    </main>
  );
}
