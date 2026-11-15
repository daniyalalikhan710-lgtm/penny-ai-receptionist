"use client";

import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CalendarPlus,
  Camera,
  Check,
  CheckCircle2,
  CreditCard,
  Loader2,
  Lock,
  Mail,
  MapPin,
  PhoneCall,
  Receipt,
  ShieldAlert,
  Smartphone,
  UserRound,
  XCircle,
} from "lucide-react";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useClock } from "@/lib/client/hooks";
import { URGENCY_CLASS, tr, urgencyLabel } from "@/lib/client/i18n";
import { useDemo } from "@/lib/client/store";
import { COMPANY, DEMO_CUSTOMER } from "@/lib/domain/technicians";
import { fmtDayLong, fmtDayRelative, fmtMoney, fmtWindow, icsLocal } from "@/lib/domain/time";
import type { BookingView, Card, CustomerDetails, EstimateView, Lang, SlotOption } from "@/lib/domain/types";
import { TechAvatar } from "../owner/tech-avatar";

interface CardProps<K extends Card["kind"]> {
  card: Extract<Card, { kind: K }>;
  toolId: string;
  lang: Lang;
}

function Shell({
  icon,
  title,
  tone = "default",
  children,
  aside,
  testId,
}: {
  icon: ReactNode;
  title: string;
  tone?: "default" | "danger" | "success";
  children: ReactNode;
  aside?: ReactNode;
  testId?: string;
}) {
  return (
    <section
      data-testid={testId}
      aria-label={title}
      className={cn(
        "animate-pop-in overflow-hidden rounded-2xl border bg-white shadow-sm",
        tone === "danger" ? "border-red-300" : tone === "success" ? "border-emerald-200" : "border-ink-100",
      )}
    >
      <header
        className={cn(
          "flex items-center gap-2 px-3.5 py-2 text-[13px] font-semibold",
          tone === "danger"
            ? "bg-red-700 text-white"
            : tone === "success"
              ? "bg-emerald-50 text-emerald-900"
              : "bg-cream text-ink-900",
        )}
      >
        <span className="shrink-0" aria-hidden>
          {icon}
        </span>
        <h3 className="min-w-0 flex-1 truncate">{title}</h3>
        {aside}
      </header>
      <div className="px-3.5 py-3">{children}</div>
    </section>
  );
}

function EstimateBlock({ estimate, lang }: { estimate: EstimateView; lang: Lang }) {
  return (
    <div className="rounded-xl bg-ink-50 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 text-[12px] font-medium text-ink-600">{estimate.serviceName}</span>
        <span className="shrink-0 text-[10px] font-medium tracking-wide text-ink-500 uppercase">{tr(lang, "fromPriceBook")}</span>
      </div>
      <p className="mt-0.5 font-display text-[22px] leading-tight font-semibold text-ink-900 tabular-nums" data-testid="estimate-range">
        {fmtMoney(estimate.low)}–{fmtMoney(estimate.high)}
      </p>
      <p className="mt-1 text-[12px] leading-snug text-ink-600">
        {estimate.diagnosticFee > 0 ? (
          <>
            {tr(lang, "diagnosticFee")} <strong className="font-semibold text-ink-900">{fmtMoney(estimate.diagnosticFee)}</strong>, {tr(lang, "creditedNote")}.
          </>
        ) : (
          tr(lang, "member")
        )}
        {estimate.afterHoursApplied ? ` ${tr(lang, "afterHours")}.` : ""}
      </p>
    </div>
  );
}

/* ------------------------------ Diagnosis ------------------------------ */

function DiagnosisCard({ card, lang }: CardProps<"diagnosis">) {
  if (!card.homeRepair) {
    return (
      <Shell icon={<Camera className="size-4" />} title={tr(lang, "diagnosis")} testId="card-diagnosis">
        <p className="text-[13px] text-ink-700">{tr(lang, "notRepair")}</p>
      </Shell>
    );
  }
  const urgency = URGENCY_CLASS[card.severity];
  return (
    <Shell
      icon={<Camera className="size-4" />}
      title={tr(lang, "diagnosis")}
      testId="card-diagnosis"
      aside={
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", urgency.chip)}>
          {urgencyLabel(card.severity, lang)}
        </span>
      }
    >
      <p className="font-display text-[17px] leading-snug font-semibold text-ink-900">{card.issue}</p>
      <p className="mt-1 text-[13px] leading-snug text-ink-700">{card.whatISee}</p>
      <p className="mt-1.5 text-[11px] font-medium text-ink-500">
        {tr(lang, card.confidence)} {tr(lang, "confidence")}
        <span aria-hidden className="ml-1.5 inline-flex gap-0.5 align-middle">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={cn(
                "inline-block h-1.5 w-4 rounded-full",
                i < (card.confidence === "high" ? 3 : card.confidence === "medium" ? 2 : 1) ? "bg-copper-500" : "bg-ink-100",
              )}
            />
          ))}
        </span>
      </p>
      {card.steps.length > 0 && (
        <div className="mt-3">
          <h4 className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">{tr(lang, "doNow")}</h4>
          <ol className="mt-1.5 space-y-1.5">
            {card.steps.map((step, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-snug text-ink-800">
                <span className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full bg-copper-100 text-[11px] font-bold text-copper-800">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {card.estimate && (
        <div className="mt-3">
          <EstimateBlock estimate={card.estimate} lang={lang} />
        </div>
      )}
    </Shell>
  );
}

function EstimateCard({ card, lang }: CardProps<"estimate">) {
  return (
    <Shell icon={<Receipt className="size-4" />} title={tr(lang, "estimate")} testId="card-estimate">
      <EstimateBlock estimate={card.estimate} lang={lang} />
    </Shell>
  );
}

/* -------------------------------- Slots -------------------------------- */

function slotWhen(slot: Pick<SlotOption, "date" | "startMin" | "durationMin">, today: string, lang: Lang): { day: string; window: string } {
  return { day: fmtDayRelative(slot.date, today, lang), window: fmtWindow(slot.startMin, slot.durationMin) };
}

function SlotsCard({ card, toolId, lang }: CardProps<"slots">) {
  const clock = useClock();
  const chosen = useDemo((s) => s.cardState[toolId]?.chosenSlotId);
  const sending = useDemo((s) => s.sending);
  const paused = useDemo((s) => s.lead.status === "human");
  const setCardState = useDemo((s) => s.setCardState);
  const sendEvent = useDemo((s) => s.sendEvent);
  const locked = Boolean(chosen) || sending || paused;

  const pick = (slot: SlotOption) => {
    if (locked) return;
    setCardState(toolId, { chosenSlotId: slot.id });
    void sendEvent({ kind: "slot_selected", slotId: slot.id, purpose: card.purpose, bookingCode: card.bookingCode, serviceCode: card.serviceCode });
  };

  return (
    <Shell
      icon={<CalendarClock className="size-4" />}
      title={card.purpose === "reschedule" ? tr(lang, "moveTo") : tr(lang, "pickTime")}
      testId="card-slots"
    >
      <ul className="grid gap-2">
        {card.slots.map((slot) => {
          const when = slotWhen(slot, clock.today, lang);
          const isChosen = chosen === slot.id;
          return (
            <li key={slot.id}>
              <button
                type="button"
                data-testid="slot-option"
                data-slot-id={slot.id}
                aria-pressed={isChosen}
                disabled={locked && !isChosen}
                onClick={() => pick(slot)}
                className={cn(
                  "flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition",
                  isChosen
                    ? "border-copper-500 bg-copper-50 ring-2 ring-copper-500/30"
                    : "border-ink-100 bg-white hover:border-copper-400 hover:bg-copper-50/60",
                  locked && !isChosen && "cursor-not-allowed opacity-45 hover:border-ink-100 hover:bg-white",
                )}
              >
                <TechAvatar techId={slot.techId} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] leading-tight font-semibold text-ink-900">
                    {when.day} · {when.window}
                  </span>
                  <span className="block truncate text-[12px] text-ink-600">
                    {tr(lang, "with")} {slot.techName}
                  </span>
                </span>
                {isChosen ? (
                  <span className="flex items-center gap-1 text-[12px] font-semibold text-copper-700">
                    <Check className="size-4" aria-hidden /> {tr(lang, "selected")}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}

/* ------------------------------- Details ------------------------------- */

function Field({
  label,
  className,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-[11px] font-semibold text-ink-600">
        {label}
      </label>
      <input
        id={id}
        {...props}
        className="h-9 w-full rounded-lg border border-ink-200 bg-white px-2.5 text-[13.5px] text-ink-900 placeholder:text-ink-500 disabled:bg-ink-50 disabled:text-ink-600"
      />
    </div>
  );
}

function DetailsCard({ card, toolId, lang }: CardProps<"details">) {
  const clock = useClock();
  const submitted = useDemo((s) => s.cardState[toolId]?.submitted);
  const sending = useDemo((s) => s.sending);
  const setCardState = useDemo((s) => s.setCardState);
  const sendEvent = useDemo((s) => s.sendEvent);
  const [details, setDetails] = useState<CustomerDetails>(card.prefill);
  const [error, setError] = useState<string | null>(null);
  const when = slotWhen(card.slot, clock.today, lang);
  const locked = Boolean(submitted);

  const update = (key: keyof CustomerDetails) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDetails((d) => ({ ...d, [key]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (locked || sending) return;
    if (!details.name.trim() || details.address.trim().length < 3) {
      setError(lang === "es" ? "Indique su nombre y la dirección del servicio." : "Please enter your name and the service address.");
      return;
    }
    if (details.phone.replace(/\D/g, "").length < 7 || !/^[0-9+() .-]{7,30}$/.test(details.phone.trim())) {
      setError(lang === "es" ? "Indique un teléfono válido." : "Please enter a phone number we can reach you on.");
      return;
    }
    if (!/^\d{5}$/.test(details.zip.trim())) {
      setError(lang === "es" ? "El código postal debe tener 5 dígitos." : "ZIP code must be 5 digits.");
      return;
    }
    setError(null);
    setCardState(toolId, { submitted: true });
    void sendEvent({
      kind: "details_submitted",
      slotId: card.slot.id,
      serviceCode: card.serviceCode,
      details: { name: details.name.trim(), phone: details.phone.trim(), email: details.email.trim(), address: details.address.trim(), zip: details.zip.trim() },
    });
  };

  return (
    <Shell icon={<UserRound className="size-4" />} title={tr(lang, "yourDetails")} testId="card-details">
      <p className="mb-2.5 rounded-lg bg-copper-50 px-2.5 py-1.5 text-[12px] leading-snug text-copper-900">
        {card.serviceName} · {when.day}, {when.window} {tr(lang, "with")} {card.slot.techName.split(" ")[0]}
      </p>
      <form onSubmit={submit} className="grid grid-cols-6 gap-2">
        <Field className="col-span-6" label={tr(lang, "name")} name="name" autoComplete="name" required maxLength={80} value={details.name} onChange={update("name")} disabled={locked} />
        <Field className="col-span-3" label={tr(lang, "phone")} name="tel" type="tel" autoComplete="tel" required maxLength={30} value={details.phone} onChange={update("phone")} disabled={locked} />
        <Field className="col-span-3" label={tr(lang, "email")} name="email" type="email" autoComplete="email" maxLength={120} value={details.email} onChange={update("email")} disabled={locked} />
        <Field className="col-span-4" label={tr(lang, "address")} name="address" autoComplete="street-address" required maxLength={160} value={details.address} onChange={update("address")} disabled={locked} />
        <Field className="col-span-2" label={tr(lang, "zip")} name="zip" autoComplete="postal-code" inputMode="numeric" required maxLength={5} value={details.zip} onChange={update("zip")} disabled={locked} aria-invalid={Boolean(error)} />
        {error && (
          <p role="alert" className="col-span-6 text-[12px] font-medium text-red-700">
            {error}
          </p>
        )}
        <p className="col-span-6 text-[11px] leading-snug text-ink-500">{tr(lang, "demoPrefill")}</p>
        <button
          type="submit"
          data-testid="details-submit"
          disabled={locked || sending}
          className={cn(
            "col-span-6 flex h-10 items-center justify-center gap-1.5 rounded-xl text-[13.5px] font-semibold transition",
            locked ? "bg-emerald-50 text-emerald-800" : "bg-ink-900 text-cream hover:bg-ink-700 disabled:opacity-60",
          )}
        >
          {locked ? (
            <>
              <Check className="size-4" aria-hidden /> {tr(lang, "detailsSent")}
            </>
          ) : (
            tr(lang, "confirmDetails")
          )}
        </button>
      </form>
    </Shell>
  );
}

/* ------------------------------- Checkout ------------------------------ */

function BookingSummary({ booking, lang }: { booking: BookingView; lang: Lang }) {
  const clock = useClock();
  const when = slotWhen(booking, clock.today, lang);
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
      <dt className="text-ink-500">{tr(lang, "when")}</dt>
      <dd className="font-medium text-ink-900">
        {when.day}, {when.window}
      </dd>
      <dt className="text-ink-500">{tr(lang, "technician")}</dt>
      <dd className="font-medium text-ink-900">{booking.techName}</dd>
      <dt className="text-ink-500">{tr(lang, "where")}</dt>
      <dd className="font-medium text-ink-900">{booking.address}</dd>
    </dl>
  );
}

function CheckoutCard({ card, toolId, lang }: CardProps<"checkout">) {
  const paid = useDemo((s) => s.cardState[toolId]?.paid);
  const pay = useDemo((s) => s.pay);
  const view = useDemo((s) => s.view);
  const [form, setForm] = useState({ name: card.booking.customerName, number: "4242 4242 4242 4242", expiry: "12/30", cvc: "123" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const fee = card.booking.feeDue;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || paid) return;
    // A card number other than the public test card never leaves the browser.
    if (form.number.replace(/\D/g, "") !== "4242424242424242") {
      setError(lang === "es" ? "Esta demostración solo acepta la tarjeta de prueba 4242 4242 4242 4242. No use tarjetas reales." : "This demo only accepts the test card 4242 4242 4242 4242. No real cards, please.");
      return;
    }
    const expiry = form.expiry.trim().match(/^(\d{2})\s*\/\s*(\d{2})$/);
    const month = expiry ? Number(expiry[1]) : 0;
    const now = new Date();
    const expired = !expiry || month < 1 || month > 12 || 2000 + Number(expiry[2]) < now.getFullYear() || (2000 + Number(expiry[2]) === now.getFullYear() && month < now.getMonth() + 1);
    if (expired) {
      setError(lang === "es" ? "Revise la fecha de vencimiento (MM/AA): parece vencida o incompleta." : "Check the expiry date (MM/YY): it looks expired or incomplete.");
      return;
    }
    if (!/^\d{3,4}$/.test(form.cvc.trim())) {
      setError(lang === "es" ? "El código de seguridad debe tener 3 o 4 dígitos." : "The security code should be 3 or 4 digits.");
      return;
    }
    if (!form.name.trim()) {
      setError(lang === "es" ? "Escriba el nombre que aparece en la tarjeta." : "Please enter the name on the card.");
      return;
    }
    setBusy(true);
    setError(null);
    // The job card flies from here to the dispatch board when both are visible.
    const rect = view === "split" ? ref.current?.getBoundingClientRect() : undefined;
    const result = await pay(toolId, card.booking.code, form, rect ? { x: rect.left, y: rect.top, w: rect.width, h: rect.height } : null);
    setBusy(false);
    if (!result.ok) setError(result.reason ?? "Payment failed.");
  };

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div ref={ref} data-flight-source={card.booking.code}>
      <Shell
        icon={paid ? <CheckCircle2 className="size-4" /> : <CreditCard className="size-4" />}
        title={paid ? `${tr(lang, "paid")} · ${fmtMoney(fee)}` : tr(lang, "checkout")}
        tone={paid ? "success" : "default"}
        testId="card-checkout"
        aside={<span className="font-mono text-[11px] font-medium opacity-80">{card.booking.code}</span>}
      >
        <BookingSummary booking={card.booking} lang={lang} />
        <div className="my-3 flex items-baseline justify-between border-y border-dashed border-ink-200 py-2">
          <span className="text-[12.5px] text-ink-600">
            {tr(lang, "diagnosticFee")} <span className="text-ink-500">({tr(lang, "creditedNote")})</span>
          </span>
          <span className="font-display text-[20px] font-semibold text-ink-900 tabular-nums">{fmtMoney(fee)}</span>
        </div>
        {paid ? (
          <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-[13px] font-medium text-emerald-900" role="status">
            <span className="flex size-6 items-center justify-center rounded-full bg-emerald-600 text-white">
              <Check className="size-4" aria-hidden />
            </span>
            {tr(lang, "paid")} · Visa •••• 4242
          </p>
        ) : (
          <form onSubmit={submit} className="grid grid-cols-6 gap-2">
            {/* autoComplete is off on purpose: this is a demo, so the browser must
                not offer the visitor's real saved cards. */}
            <Field className="col-span-6" label={tr(lang, "card")} name="demo-card" inputMode="numeric" autoComplete="off" value={form.number} onChange={set("number")} disabled={busy} maxLength={23} />
            <Field className="col-span-3" label={tr(lang, "expiry")} name="demo-exp" inputMode="numeric" autoComplete="off" value={form.expiry} onChange={set("expiry")} disabled={busy} maxLength={7} />
            <Field className="col-span-3" label={tr(lang, "cvc")} name="demo-cvc" inputMode="numeric" autoComplete="off" value={form.cvc} onChange={set("cvc")} disabled={busy} maxLength={4} />
            <Field className="col-span-6" label={tr(lang, "cardName")} name="demo-name" autoComplete="off" value={form.name} onChange={set("name")} disabled={busy} maxLength={80} />
            {error && (
              <p role="alert" className="col-span-6 rounded-lg bg-red-50 px-2.5 py-1.5 text-[12px] font-medium text-red-800">
                {error}
              </p>
            )}
            <button
              type="submit"
              data-testid="pay-button"
              disabled={busy}
              className="col-span-6 flex h-11 items-center justify-center gap-2 rounded-xl bg-copper-600 text-[14px] font-semibold text-white transition hover:bg-copper-700 disabled:opacity-80"
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden /> {tr(lang, "processing")}
                </>
              ) : (
                <>
                  <Lock className="size-3.5" aria-hidden /> {tr(lang, "payNow")} {fmtMoney(fee)}
                </>
              )}
            </button>
            <p className="col-span-6 text-center text-[11px] leading-snug text-ink-500">{tr(lang, "testCard")}</p>
          </form>
        )}
      </Shell>
    </div>
  );
}

/* ----------------------------- Confirmation ---------------------------- */

function icsHref(booking: BookingView): string {
  const esc = (text: string) => text.replace(/([,;\\])/g, "\\$1").replace(/\r?\n|\r/g, "\\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Copperline//Penny demo//EN",
    "BEGIN:VEVENT",
    `UID:${booking.code}@copperline.demo`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
    `DTSTART:${icsLocal(booking.date, booking.startMin)}`,
    `DTEND:${icsLocal(booking.date, booking.startMin + booking.durationMin)}`,
    `SUMMARY:${esc(`${COMPANY.short}: ${booking.serviceName} (${booking.code})`)}`,
    `LOCATION:${esc(booking.address)}`,
    `DESCRIPTION:${esc(`Technician: ${booking.techName}. Demo booking from a fictional business.`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join("\r\n"))}`;
}

function ConfirmationCard({ card, lang }: CardProps<"confirmation">) {
  const { booking } = card;
  return (
    <Shell
      icon={<CheckCircle2 className="size-4" />}
      title={card.variant === "booked" ? tr(lang, "booked") : tr(lang, "rescheduled")}
      tone="success"
      testId="card-confirmation"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">{tr(lang, "bookingCode")}</p>
          <p className="font-mono text-[20px] font-semibold tracking-tight text-ink-900" data-testid="booking-code">
            {booking.code}
          </p>
        </div>
        <TechAvatar techId={booking.techId} size={40} />
      </div>
      <p className="mt-2 text-[13.5px] leading-snug font-medium text-ink-900">
        {booking.serviceName} · {fmtDayLong(booking.date, lang)}, {fmtWindow(booking.startMin, booking.durationMin)}
      </p>
      <p className="text-[12.5px] text-ink-600">
        {booking.techName} · {booking.address}
      </p>
      <div className="mt-3 rounded-xl border border-ink-100 bg-ink-50 p-2.5">
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-ink-600">
          <Smartphone className="size-3.5" aria-hidden /> {tr(lang, "smsSent")}
          <span className="font-normal text-ink-500">· {card.smsTo}</span>
        </p>
        <p className="rounded-2xl rounded-bl-md bg-white px-3 py-2 text-[12.5px] leading-snug text-ink-800 shadow-sm" data-testid="sms-preview">
          {card.smsPreview}
        </p>
        {card.variant === "booked" && card.emailTo ? (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-ink-600">
            <Mail className="size-3.5" aria-hidden /> {tr(lang, "emailSent")}
            <span className="truncate font-normal text-ink-500">· {card.emailTo}</span>
          </p>
        ) : null}
      </div>
      <a
        href={icsHref(booking)}
        download={`copperline-${booking.code}.ics`}
        className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 px-3 text-[13px] font-semibold text-ink-900 hover:bg-ink-50"
      >
        <CalendarPlus className="size-4" aria-hidden /> {tr(lang, "addToCalendar")}
      </a>
    </Shell>
  );
}

function BookingCard({ card, lang }: CardProps<"booking">) {
  const cancelled = card.booking.status === "cancelled";
  return (
    <Shell
      icon={<Receipt className="size-4" />}
      title={`${tr(lang, "yourBooking")} · ${card.booking.code}`}
      testId="card-booking"
      aside={
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", cancelled ? "bg-ink-100 text-ink-600" : "bg-emerald-100 text-emerald-900")}>
          {cancelled ? tr(lang, "cancelled") : card.booking.status === "pending_payment" ? tr(lang, "awaitingPayment") : tr(lang, "confirmed")}
        </span>
      }
    >
      <p className="mb-2 text-[13.5px] font-semibold text-ink-900">{card.booking.serviceName}</p>
      <BookingSummary booking={card.booking} lang={lang} />
    </Shell>
  );
}

function CancelledCard({ card, lang }: CardProps<"cancelled">) {
  return (
    <Shell icon={<Ban className="size-4" />} title={`${tr(lang, "cancelled")} · ${card.booking.code}`} testId="card-cancelled">
      <p className="text-[13.5px] font-semibold text-ink-900 line-through decoration-ink-400">{card.booking.serviceName}</p>
      <p className="mt-1 text-[12.5px] leading-snug text-ink-700">{card.refundNote}</p>
    </Shell>
  );
}

/* ------------------------------ Emergency ------------------------------ */

function EmergencyCard({ card, toolId, lang }: CardProps<"emergency">) {
  const sent = useDemo((s) => s.cardState[toolId]?.callbackSent);
  const sending = useDemo((s) => s.sending);
  const setCardState = useDemo((s) => s.setCardState);
  const sendEvent = useDemo((s) => s.sendEvent);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(DEMO_CUSTOMER.phone);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const phoneId = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (sent || sending) return;
    if (!/^[0-9+() .-]{7,30}$/.test(phone.trim()) || phone.replace(/\D/g, "").length < 7) {
      setPhoneError(lang === "es" ? "Escriba un número de teléfono al que podamos llamarle." : "Enter a phone number we can call you on.");
      return;
    }
    setPhoneError(null);
    setCardState(toolId, { callbackSent: true });
    void sendEvent({ kind: "callback_requested", phone: phone.trim() });
  };

  return (
    <section
      role="alert"
      data-testid="card-emergency"
      className="animate-pop-in overflow-hidden rounded-2xl border-2 border-red-700 bg-white shadow-md"
    >
      <header className="flex items-start gap-2.5 bg-red-700 px-3.5 py-3 text-white">
        <ShieldAlert className="mt-0.5 size-6 shrink-0" aria-hidden />
        <div>
          <h3 className="text-[15.5px] leading-tight font-bold">{card.headline}</h3>
          <p className="mt-0.5 text-[12.5px] font-medium text-red-50">{card.callLine}</p>
        </div>
      </header>
      <div className="px-3.5 py-3">
        <ol className="space-y-2">
          {card.steps.map((step, i) => (
            <li key={i} className="flex gap-2.5 text-[13.5px] leading-snug font-medium text-ink-900">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-red-700 text-[11px] font-bold text-white">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        {card.doNot.length > 0 && (
          <div className="mt-3 rounded-xl bg-red-50 px-3 py-2">
            <h4 className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-red-800 uppercase">
              <XCircle className="size-3.5" aria-hidden /> {tr(lang, "doNot")}
            </h4>
            <ul className="mt-1 space-y-0.5">
              {card.doNot.map((item, i) => (
                <li key={i} className="text-[12.5px] leading-snug text-red-900">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-ink-600">
          <AlertTriangle className="size-3.5 text-red-700" aria-hidden /> {tr(lang, "teamAlerted")}
        </p>
        {sent ? (
          <p className="mt-2 flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-50 text-[13.5px] font-semibold text-emerald-900" role="status">
            <Check className="size-4" aria-hidden /> {tr(lang, "callbackRequested")}
          </p>
        ) : open ? (
          <form onSubmit={submit} className="mt-2 flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <label htmlFor={phoneId} className="mb-1 block text-[11px] font-semibold text-ink-600">
                {tr(lang, "callbackNumber")}
              </label>
              <input
                id={phoneId}
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-10 w-full rounded-lg border border-ink-200 px-2.5 text-[14px]"
              />
            </div>
            <button
              type="submit"
              data-testid="callback-submit"
              disabled={sending}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-red-700 px-3.5 text-[13.5px] font-semibold text-white hover:bg-red-800 disabled:opacity-60"
            >
              <PhoneCall className="size-4" aria-hidden /> {tr(lang, "callMe")}
            </button>
            {phoneError ? (
              <p role="alert" className="w-full text-[12px] font-medium text-red-700">
                {phoneError}
              </p>
            ) : null}
          </form>
        ) : (
          <button
            type="button"
            data-testid="callback-open"
            onClick={() => setOpen(true)}
            className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-red-700 text-[13.5px] font-semibold text-white hover:bg-red-800"
          >
            <PhoneCall className="size-4" aria-hidden /> {tr(lang, "requestCallback")}
          </button>
        )}
      </div>
    </section>
  );
}

function HandoffCard({ card, lang }: CardProps<"handoff">) {
  return (
    <Shell icon={<PhoneCall className="size-4" />} title={tr(lang, "handoff")} testId="card-handoff" tone={card.priority === "emergency" ? "danger" : "default"}>
      <p className="text-[13.5px] leading-snug text-ink-900">
        <span className="font-mono font-semibold">{card.phone}</span> · {card.etaText}
      </p>
      <p className="mt-1 text-[12px] text-ink-600">{COMPANY.name}</p>
    </Shell>
  );
}

function ServiceAreaCard({ card, lang }: CardProps<"service_area">) {
  return (
    <Shell
      icon={<MapPin className="size-4" />}
      title={card.inArea ? tr(lang, "inArea") : tr(lang, "outArea")}
      tone={card.inArea ? "success" : "default"}
      testId="card-service-area"
    >
      <p className="text-[13.5px] text-ink-900">
        <span className="font-mono font-semibold">{card.zip}</span>
        {card.town ? ` · ${card.town}` : ""}
      </p>
      <p className="mt-1 text-[11px] text-ink-500">{tr(lang, "demoZip")}</p>
    </Shell>
  );
}

export function CardView({ card, toolId, lang }: { card: Card; toolId: string; lang: Lang }) {
  switch (card.kind) {
    case "diagnosis":
      return <DiagnosisCard card={card} toolId={toolId} lang={lang} />;
    case "estimate":
      return <EstimateCard card={card} toolId={toolId} lang={lang} />;
    case "slots":
      return <SlotsCard card={card} toolId={toolId} lang={lang} />;
    case "details":
      return <DetailsCard card={card} toolId={toolId} lang={lang} />;
    case "checkout":
      return <CheckoutCard card={card} toolId={toolId} lang={lang} />;
    case "confirmation":
      return <ConfirmationCard card={card} toolId={toolId} lang={lang} />;
    case "booking":
      return <BookingCard card={card} toolId={toolId} lang={lang} />;
    case "cancelled":
      return <CancelledCard card={card} toolId={toolId} lang={lang} />;
    case "emergency":
      return <EmergencyCard card={card} toolId={toolId} lang={lang} />;
    case "handoff":
      return <HandoffCard card={card} toolId={toolId} lang={lang} />;
    case "service_area":
      return <ServiceAreaCard card={card} toolId={toolId} lang={lang} />;
  }
}

