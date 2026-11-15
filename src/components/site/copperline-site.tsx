import { Clock, Droplets, Flame, MessageCircle, Phone, ShieldCheck, Snowflake, Star, ThermometerSun, Wrench } from "lucide-react";
import { COMPANY } from "@/lib/domain/technicians";

/**
 * Copperline's (fictional) marketing homepage: the thing a real client's site
 * would be, with Penny's widget sitting on top. It uses container queries so it
 * lays out for the width of the pane it is in, not the whole window.
 */

const SERVICES = [
  { icon: Droplets, title: "Water heaters", text: "Repairs, replacements and tankless installs, usually same day." },
  { icon: Wrench, title: "Drains & leaks", text: "Clogged drains, leaking joints, running toilets and burst pipes." },
  { icon: Flame, title: "Furnaces", text: "No-heat calls, tune-ups and safety checks before winter." },
  { icon: Snowflake, title: "Air conditioning", text: "Not cooling, frozen coils, tune-ups and mini-split service." },
  { icon: ThermometerSun, title: "Thermostats", text: "Blank screens, error codes and smart thermostat installs." },
  { icon: ShieldCheck, title: "Care Club", text: "Yearly tune-ups, no diagnostic fee and 15% off every repair." },
];

const REVIEWS = [
  { name: "Renee C.", town: "Millbrook", text: "Sink backed up at 7 am. I chatted with Penny, sent a photo, and Marcus was here by 10. Price was exactly what I was quoted." },
  { name: "Aisha B.", town: "Cedar Flats", text: "Furnace kept shutting off. Booked in two minutes without waiting on hold, and Priya had it fixed that afternoon." },
  { name: "Tom W.", town: "Alder Heights", text: "Straight answers on price before anyone came out. No surprises on the invoice. That's all I want." },
];

const TOWNS = ["Riverbend", "Alder Heights", "Copper Hill", "Millbrook", "Fairhaven", "Stonebridge", "Cedar Flats", "Larkspur", "Quarry Park", "Willow Landing"];

function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#b87333" />
        <path d="M9 21V13a4 4 0 0 1 4-4h2v4h-2v8H9Zm8 2v-4h2v-8h4v8a4 4 0 0 1-4 4h-2Z" fill="#fff" />
      </svg>
      <span className={`font-display text-[19px] leading-none font-semibold tracking-tight ${light ? "text-cream" : "text-ink-900"}`}>
        Copperline
        <span className={`block font-sans text-[9.5px] font-medium tracking-[0.18em] uppercase ${light ? "text-ink-300" : "text-ink-500"}`}>Plumbing &amp; Heating</span>
      </span>
    </span>
  );
}

export function CopperlineSite({ onOpenChat }: { onOpenChat: () => void }) {
  return (
    <div className="@container bg-cream text-ink-900">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-ink-100 bg-cream/95 px-5 py-3 backdrop-blur @3xl:px-10">
        <Logo />
        <nav aria-label="Copperline site" className="hidden items-center gap-6 text-[13.5px] font-medium text-ink-700 @2xl:flex">
          <a href="#services" className="hover:text-copper-700">Services</a>
          <a href="#reviews" className="hover:text-copper-700">Reviews</a>
          <a href="#area" className="hover:text-copper-700">Service area</a>
        </nav>
        <a href="#area" className="flex items-center gap-1.5 rounded-full bg-ink-900 px-3.5 py-2 text-[13px] font-semibold text-cream">
          <Phone className="size-3.5" aria-hidden /> {COMPANY.phone}
        </a>
      </header>

      <section className="relative overflow-hidden bg-ink-900 px-5 py-12 text-cream @3xl:px-10 @3xl:py-16">
        <svg className="pointer-events-none absolute -right-10 -bottom-16 h-[340px] w-[520px] opacity-25" viewBox="0 0 520 340" fill="none" aria-hidden>
          <path d="M0 300h180a40 40 0 0 0 40-40V120a40 40 0 0 1 40-40h260" stroke="#b87333" strokeWidth="22" strokeLinecap="round" />
          <path d="M60 340V220a40 40 0 0 1 40-40h220a40 40 0 0 0 40-40V0" stroke="#dea66c" strokeWidth="10" strokeLinecap="round" />
          <circle cx="220" cy="120" r="16" fill="#b87333" />
          <circle cx="360" cy="180" r="10" fill="#dea66c" />
        </svg>
        <div className="relative max-w-xl @md:@max-3xl:max-w-[13.5rem]">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[12px] font-medium text-copper-200 ring-1 ring-white/15">
            <Clock className="size-3.5 shrink-0" aria-hidden />
            <span>
              Open 7 days · 8 AM to 6 PM<span className="@md:@max-3xl:hidden"> · Emergency dispatch 24/7</span>
            </span>
          </p>
          <h1 className="font-display text-[34px] leading-[1.05] font-semibold tracking-tight text-balance @md:@max-3xl:text-[28px] @3xl:text-[46px]">
            Fixed right, priced upfront, <span className="text-copper-300">booked in minutes.</span>
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-200 @md:@max-3xl:text-[14px]">
            Riverbend&rsquo;s plumbing, heating and cooling team. Tell Penny what&rsquo;s wrong, get an honest price range, and pick a time that suits you. No hold music.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onOpenChat}
              className="flex h-11 items-center gap-2 rounded-xl bg-copper-500 px-5 text-[14.5px] font-semibold text-ink-950 transition hover:bg-copper-400"
            >
              <MessageCircle className="size-4.5" aria-hidden /> Chat with Penny
            </button>
            <p className="flex items-center gap-1.5 text-[13px] text-ink-200">
              <span className="flex text-copper-300" aria-hidden>
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} className="size-4 fill-current" />
                ))}
              </span>
              4.9 from 1,240 Riverbend homes
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-px border-b border-ink-100 bg-ink-100 @xl:grid-cols-3">
        {[
          ["Upfront prices", "A price range before we come, a fixed price before we start."],
          ["2-year warranty", "Parts and labor on every repair we make."],
          ["Licensed & insured", "Background-checked technicians, every visit."],
        ].map(([title, text]) => (
          <div key={title} className="bg-white px-5 py-4 @3xl:px-10">
            <p className="font-display text-[16px] font-semibold text-ink-900">{title}</p>
            <p className="mt-0.5 text-[13px] leading-snug text-ink-600">{text}</p>
          </div>
        ))}
      </section>

      <section id="services" className="px-5 py-10 @3xl:px-10">
        <p className="text-[12px] font-semibold tracking-[0.16em] text-copper-700 uppercase">What we do</p>
        <h2 className="mt-1 font-display text-[26px] font-semibold tracking-tight">Plumbing, heating and cooling, under one roof</h2>
        <ul className="mt-6 grid grid-cols-1 gap-3 @lg:grid-cols-2 @3xl:grid-cols-3">
          {SERVICES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-2xl border border-ink-100 bg-white p-4">
              <span className="flex size-9 items-center justify-center rounded-xl bg-copper-100 text-copper-700">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-3 font-display text-[17px] font-semibold">{title}</h3>
              <p className="mt-1 text-[13.5px] leading-snug text-ink-600">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="reviews" className="bg-cream-deep px-5 py-10 @3xl:px-10">
        <p className="text-[12px] font-semibold tracking-[0.16em] text-copper-700 uppercase">Neighbors say</p>
        <h2 className="mt-1 font-display text-[26px] font-semibold tracking-tight">Booked fast. Priced fairly. Fixed properly.</h2>
        <ul className="mt-6 grid grid-cols-1 gap-3 @2xl:grid-cols-3">
          {REVIEWS.map((review) => (
            <li key={review.name} className="rounded-2xl bg-white p-4 shadow-sm">
              <span className="flex text-copper-500" aria-label="5 out of 5 stars" role="img">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} className="size-4 fill-current" aria-hidden />
                ))}
              </span>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-800">&ldquo;{review.text}&rdquo;</p>
              <p className="mt-3 text-[12.5px] font-semibold text-ink-900">
                {review.name} <span className="font-normal text-ink-500">· {review.town}</span>
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section id="area" className="px-5 py-10 @3xl:px-10">
        <p className="text-[12px] font-semibold tracking-[0.16em] text-copper-700 uppercase">Service area</p>
        <h2 className="mt-1 font-display text-[26px] font-semibold tracking-tight">Proudly serving the Riverbend metro</h2>
        <ul className="mt-5 flex flex-wrap gap-2">
          {TOWNS.map((town) => (
            <li key={town} className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[13px] font-medium text-ink-800">
              {town}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13px] text-ink-600">Not sure if we cover you? Ask Penny with your ZIP code. No trip charge anywhere in the area.</p>
      </section>

      <footer className="on-dark bg-ink-950 px-5 py-8 text-ink-300 @3xl:px-10">
        <Logo light />
        <p className="mt-4 max-w-md text-[12.5px] leading-relaxed">
          Copperline Plumbing &amp; Heating is a fictional business created for this demo. The people, reviews, phone numbers, towns and ZIP codes are not real.
        </p>
      </footer>
    </div>
  );
}
