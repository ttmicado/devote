import { getDb, users } from "@devote/db";
import { eq } from "drizzle-orm";
import { PageShell } from "@/components/page-shell";
import { ButtonLink, PageHeader, Toast } from "@/components/ui";
import { ACCOUNT as A, SECURITY_COPY } from "@/lib/copy";
import { MIN_PASSWORD } from "@/lib/password";
import { currentUserId } from "@/lib/session";
import { logout, saveAccount } from "./actions";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string; saved?: string }>;
}) {
  const { error, created, saved } = await searchParams;
  const userId = await currentUserId();
  const [me] = userId ? await getDb().select().from(users).where(eq(users.id, userId)) : [];
  const hasAccount = Boolean(me?.loginId);
  const hasPassword = Boolean(me?.passwordHash);
  const errorText =
    error === "currentPassword"
      ? SECURITY_COPY.account.errors.currentPassword
      : error
        ? (A.errors[error as keyof typeof A.errors] ?? null)
        : null;

  return (
    <PageShell>
      <PageHeader eyebrow={A.eyebrow} title={A.title} lead={A.lead} />

      <div className="mt-8 space-y-4" aria-live="polite">
        {created && <Toast>{A.created}</Toast>}
        {saved && <Toast>{A.saved}</Toast>}
        {errorText && (
          <p
            role="alert"
            className="border-l-2 border-signal bg-sand-100 px-5 py-4 text-sm text-signal"
          >
            {errorText}
          </p>
        )}
      </div>

      <div className="mt-12 grid gap-16 lg:grid-cols-[1.2fr_1fr]">
        <section aria-labelledby="account-form">
          <h2 id="account-form" className="display font-mincho text-2xl text-evergreen-900">
            {hasAccount ? A.manageTitle : A.createTitle}
          </h2>
          {!hasAccount && <p className="mt-3 text-sm leading-7 text-ink-500">{A.createLead}</p>}

          <form action={saveAccount} className="mt-8 space-y-8">
            <div>
              <label htmlFor="nickname" className="field-label">
                {A.nickname}
              </label>
              <input
                id="nickname"
                name="nickname"
                required
                maxLength={30}
                defaultValue={me?.nickname ?? ""}
                autoComplete="nickname"
                className="field"
              />
              <p className="mt-2 text-xs leading-6 text-ink-500">{A.nicknameNote}</p>
            </div>

            <div>
              <label htmlFor="loginId" className="field-label">
                {A.loginId}
              </label>
              {hasAccount ? (
                <p className="py-3 font-serif text-xl text-ink-900">{me?.loginId}</p>
              ) : (
                <>
                  <input
                    id="loginId"
                    name="loginId"
                    required
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="field"
                  />
                  <p className="mt-2 text-xs leading-6 text-ink-500">{A.loginIdNote}</p>
                </>
              )}
            </div>

            {hasAccount && hasPassword && (
              <div>
                <label htmlFor="currentPassword" className="field-label">
                  {SECURITY_COPY.account.currentPassword}
                </label>
                <input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  className="field"
                />
                <p className="mt-2 text-xs leading-6 text-ink-500">
                  {SECURITY_COPY.account.currentPasswordNote}
                </p>
              </div>
            )}

            <div>
              <label htmlFor="password" className="field-label">
                {hasAccount ? A.newPassword : A.password}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required={!hasAccount}
                minLength={MIN_PASSWORD}
                autoComplete="new-password"
                className="field"
              />
              <p className="mt-2 text-xs leading-6 text-ink-500">{A.passwordNote}</p>
            </div>

            <button
              type="submit"
              className="inline-flex min-h-14 w-full items-center justify-center rounded-full bg-evergreen-800 px-10 text-sm tracking-[0.12em] text-sand-50 transition-colors duration-500 hover:bg-evergreen-900 sm:w-auto"
            >
              {hasAccount ? A.save : A.create}
            </button>
          </form>

          {hasAccount && (
            <form action={logout} className="mt-12 border-t border-ink-900/15 pt-8">
              <button
                type="submit"
                className="min-h-11 rounded-full border border-ink-900/20 px-6 text-xs tracking-[0.12em] text-ink-700 transition-colors hover:border-ink-900 hover:text-ink-900"
              >
                {A.logout}
              </button>
            </form>
          )}
        </section>

        {!hasAccount && (
          <aside className="h-fit border border-ink-900/15 bg-sand-100/60 p-8">
            <p className="font-mincho text-lg text-evergreen-900">{A.haveAccount}</p>
            <div className="mt-6">
              <ButtonLink href="/login" variant="outline" arrow>
                {A.toLogin}
              </ButtonLink>
            </div>
          </aside>
        )}
      </div>
    </PageShell>
  );
}
