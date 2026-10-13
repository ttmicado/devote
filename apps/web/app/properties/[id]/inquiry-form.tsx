import { createInquiry } from "@/app/actions";
import { Button, ButtonLink, Eyebrow } from "@/components/ui";
import { PROPERTY } from "@/lib/copy";

const V = PROPERTY.viewing;

/** 内見依頼フォーム（Server Action createInquiry に送る） */
export function InquiryForm({ propertyId, invalid }: { propertyId: string; invalid: boolean }) {
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
        {invalid ? V.invalid : ""}
      </p>

      <form action={createInquiry} className="mt-8 space-y-7">
        <input type="hidden" name="propertyId" value={propertyId} />
        <label className="block">
          <span className="field-label">{V.name}</span>
          <input name="name" required autoComplete="name" className="field" />
        </label>
        <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <label className="block">
            <span className="field-label">{V.phone}</span>
            <input name="phone" type="tel" autoComplete="tel" inputMode="tel" className="field" />
          </label>
          <label className="block">
            <span className="field-label">{V.email}</span>
            <input name="email" type="email" autoComplete="email" className="field" />
          </label>
        </div>
        <p className="-mt-3 text-xs leading-6 text-ink-500">{V.contactNote}</p>

        <fieldset>
          <legend className="field-label">{V.dates}</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {V.datesOptions.map((o, i) => (
              <label
                key={o}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-ink-900/25 px-5 text-[13px] tracking-[0.06em] text-ink-700 transition-colors duration-500 hover:border-ink-900/60 has-[:checked]:border-evergreen-800 has-[:checked]:bg-evergreen-800 has-[:checked]:text-sand-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sand-500"
              >
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
            <input name="datesNote" placeholder={V.datesNotePlaceholder} className="field" />
            <span aria-hidden className="mt-1 block text-xs text-ink-500">
              {V.datesNote}
            </span>
          </label>
        </fieldset>

        <label className="block">
          <span className="field-label">{V.message}</span>
          <textarea
            name="message"
            rows={3}
            placeholder={V.messagePlaceholder}
            className="field resize-none leading-7"
          />
        </label>

        <Button type="submit" size="lg" arrow className="w-full">
          {V.submit}
        </Button>
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
