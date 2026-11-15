import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ink-900 px-6 text-center text-cream">
      <p className="text-[12px] font-semibold tracking-[0.18em] text-copper-300 uppercase">Page not found</p>
      <h1 className="font-display text-[34px] leading-tight font-semibold">That page isn&rsquo;t part of the demo.</h1>
      <p className="max-w-sm text-[15px] text-ink-200">Penny lives on the home page, and the write-up is on the case-study page.</p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <Link href="/" className="inline-flex h-11 items-center rounded-xl bg-copper-500 px-5 text-[14.5px] font-semibold text-ink-950 hover:bg-copper-400">
          Open the live demo
        </Link>
        <Link href="/case-study" className="inline-flex h-11 items-center rounded-xl px-5 text-[14.5px] font-semibold text-cream ring-1 ring-ink-500 hover:bg-ink-800">
          Read the case study
        </Link>
      </div>
    </main>
  );
}
