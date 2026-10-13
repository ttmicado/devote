import { COMPANY } from "@devote/core";
import { ContactBlock } from "@/components/contact-block";
import { PageShell } from "@/components/page-shell";
import { ButtonLink, PageHeader } from "@/components/ui";
import { ACCOUNT, HEADER_CTA } from "@/lib/copy";
import { login } from "../account/actions";

export const dynamic = "force-dynamic";

const L = ACCOUNT.login;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const errorText = error ? L.errors[error as keyof typeof L.errors] : null;
  return (
    <PageShell>
      <PageHeader eyebrow={L.eyebrow} title={L.title} lead={L.lead} />
      <div className="mt-12 grid gap-16 lg:grid-cols-[1.2fr_1fr]">
        <form action={login} className="max-w-md space-y-8">
          <input type="hidden" name="next" value={next ?? "/matches"} />
          {errorText && (
            <p
              role="alert"
              className="border-l-2 border-signal bg-sand-100 px-5 py-4 text-sm text-signal"
            >
              {errorText}
            </p>
          )}
          <div>
            <label htmlFor="loginId" className="field-label">
              {ACCOUNT.loginId}
            </label>
            <input
              id="loginId"
              name="loginId"
              required
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="password" className="field-label">
              {ACCOUNT.password}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="field"
            />
          </div>
          <button
            type="submit"
            className="inline-flex min-h-14 w-full items-center justify-center rounded-full bg-evergreen-800 px-10 text-sm tracking-[0.12em] text-sand-50 transition-colors duration-500 hover:bg-evergreen-900"
          >
            {L.submit}
          </button>
        </form>
        <div className="space-y-6">
          <aside className="h-fit border border-ink-900/15 bg-sand-100/60 p-8">
            <p className="text-sm leading-7 text-ink-500">{L.noAccount}</p>
            <div className="mt-6">
              <ButtonLink href="/chat" arrow>
                {HEADER_CTA.guest}
              </ButtonLink>
            </div>
          </aside>
          <section aria-labelledby="forgot" className="border-t border-ink-900/15 pt-6">
            <h2 id="forgot" className="font-mincho text-lg text-evergreen-900">
              {L.forgotTitle}
            </h2>
            <p className="mt-2 text-sm leading-7 text-ink-500">
              {COMPANY.email || COMPANY.phone ? L.forgotContact : L.forgotLine}
            </p>
            {(COMPANY.email || COMPANY.phone) && (
              <div className="mt-4">
                <ContactBlock />
              </div>
            )}
          </section>
        </div>
      </div>
    </PageShell>
  );
}
