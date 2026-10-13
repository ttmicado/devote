import Link from "next/link";
import type { ReactNode } from "react";
import { createInquiry } from "@/app/actions";
import { ButtonLink, Eyebrow } from "@/components/ui";
import { LEGAL, PROPERTY, SECURITY_COPY } from "@/lib/copy";
import { SubmitButton } from "./submit-button";

const V = PROPERTY.viewing;

/** 楕円の選択肢（ラジオ・チェックボックス共通の見た目） */
const CHIP =
  "inline-flex min-h-11 cursor-pointer items-center rounded-full border border-ink-900/25 px-5 text-[13px] tracking-[0.06em] text-ink-700 transition-colors duration-500 hover:border-ink-900/60 has-[:checked]:border-evergreen-800 has-[:checked]:bg-evergreen-800 has-[:checked]:text-sand-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sand-500";

function Choices({
  legend,
  name,
  options,
  type = "radio",
  defaultValue,
}: {
  legend: ReactNode;
  name: string;
  options: readonly string[];
  type?: "radio" | "checkbox";
  defaultValue?: string;
}) {
  return (
    <fieldset>
      <legend className="field-label">{legend}</legend>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o} className={CHIP}>
            <input
              type={type}
              name={name}
              value={o}
              defaultChecked={o === defaultValue}
              className="sr-only"
            />
            {o}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export type InquiryPrefill = { name: string; phone: string; email: string };

/**
 * 内見依頼フォーム（Server Action createInquiry に送る）。
 * 項目名: name / phone / email / dates / datesNote / contractName / moveIn / contactVia / checks（複数） / message
 */
export function InquiryForm({
  propertyId,
  error,
  isRent,
  prefill,
}: {
  propertyId: string;
  error: "invalid" | "ratelimited" | null;
  isRent: boolean;
  prefill: InquiryPrefill;
}) {
  const prefilled = Boolean(prefill.name || prefill.phone || prefill.email);
  const checks = V.checksOptions.filter((c) => isRent || !c.rentOnly).map((c) => c.label);
  return (
    <section
      id="inquiry"
      aria-labelledby="inquiry-title"
      className="-mx-5 scroll-mt-28 border-y border-ink-900/15 bg-sand-100/70 px-5 py-12 sm:mx-0 sm:border sm:px-10 sm:py-10"
    >
      <Eyebrow rule>{V.eyebrow}</Eyebrow>
      <h2 id="inquiry-title" className="display mt-4 font-mincho text-2xl text-evergreen-900">
        {V.title}
      </h2>
      <p className="mt-3 text-sm leading-7 text-ink-700">{V.body}</p>

      <p
        aria-live="polite"
        className="empty:hidden mt-5 border-l-2 border-signal pl-4 text-sm leading-6 text-signal"
      >
        {error === "invalid"
          ? V.invalid
          : error === "ratelimited"
            ? SECURITY_COPY.rateLimit.inquiry
            : ""}
      </p>

      <form action={createInquiry} className="mt-8 space-y-8">
        <input type="hidden" name="propertyId" value={propertyId} />
        <label className="block">
          <span className="field-label">{V.name}</span>
          <input
            name="name"
            required
            autoComplete="name"
            defaultValue={prefill.name}
            maxLength={100}
            className="field"
          />
        </label>
        <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <label className="block">
            <span className="field-label">{V.phone}</span>
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              defaultValue={prefill.phone}
              maxLength={30}
              className="field"
            />
          </label>
          <label className="block">
            <span className="field-label">{V.email}</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={prefill.email}
              className="field"
            />
          </label>
        </div>
        <p className="-mt-4 text-xs leading-6 text-ink-500">
          {prefilled ? V.prefilled : V.contactNote}
        </p>

        <fieldset>
          <legend className="field-label">{V.dates}</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {V.datesOptions.map((o, i) => (
              <label key={o} className={CHIP}>
                <input
                  type="radio"
                  name="dates"
                  value={o}
                  defaultChecked={i === V.datesOptions.length - 1}
                  className="sr-only"
                />
                {o}
              </label>
            ))}
          </div>
          <label className="mt-4 block">
            <span className="sr-only">{V.datesNote}</span>
            <input
              name="datesNote"
              maxLength={200}
              placeholder={V.datesNotePlaceholder}
              className="field"
            />
            <span aria-hidden className="mt-1 block text-xs text-ink-500">
              {V.datesNote}
            </span>
          </label>
        </fieldset>

        <Choices legend={V.contractName} name="contractName" options={V.contractNameOptions} />
        <Choices legend={V.moveIn} name="moveIn" options={V.moveInOptions} />
        <Choices
          legend={V.contactVia}
          name="contactVia"
          options={V.contactViaOptions}
          defaultValue={V.contactViaOptions[0]}
        />
        <Choices legend={V.checks} name="checks" options={checks} type="checkbox" />

        <label className="block">
          <span className="field-label">{V.message}</span>
          <textarea
            name="message"
            rows={3}
            maxLength={2000}
            placeholder={V.messagePlaceholder}
            className="field resize-none leading-7"
          />
        </label>

        <div>
          <SubmitButton label={V.submit} pending={V.sending} />
          <p className="mt-4 text-xs leading-6 text-ink-500">
            {V.consent}
            <Link
              href="/privacy"
              className="ml-1 underline decoration-ink-900/30 underline-offset-4 transition-colors duration-500 hover:text-ink-900 hover:decoration-ink-900"
            >
              {LEGAL.consent.link}
            </Link>
          </p>
        </div>
      </form>
    </section>
  );
}

/** 募集終了のときにフォームの代わりに出す */
export function ClosedPanel() {
  return (
    <section className="border border-ink-900/15 bg-sand-100/70 px-6 py-10 sm:px-10">
      <span className="eyebrow inline-flex min-h-8 items-center rounded-full border border-ink-900/30 px-4 text-ink-700">
        {PROPERTY.closed.badge}
      </span>
      <p className="mt-5 text-sm leading-7 text-ink-700">{PROPERTY.closed.body}</p>
      <div className="mt-8">
        <ButtonLink href="/chat" arrow>
          {PROPERTY.closed.cta}
        </ButtonLink>
      </div>
    </section>
  );
}
