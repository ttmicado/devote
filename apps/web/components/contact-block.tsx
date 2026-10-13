import { COMPANY } from "@devote/core";
import { ButtonLink } from "@/components/ui";
import { CONTACT } from "@/lib/copy";

/**
 * 担当者への連絡先。会社の電話・メールが決まっていればそれを、無ければ LINE を案内する
 * （空の値やプレースホルダーは出さない）。
 */
export function ContactBlock() {
  const friendUrl = process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL;
  const rows: [string, string, string][] = [];
  if (COMPANY.phone)
    rows.push([
      CONTACT.phone,
      COMPANY.hours ? `${COMPANY.phone}（${COMPANY.hours}）` : COMPANY.phone,
      `tel:${COMPANY.phone.replace(/[^\d+]/g, "")}`,
    ]);
  if (COMPANY.email) rows.push([CONTACT.email, COMPANY.email, `mailto:${COMPANY.email}`]);
  return (
    <div className="text-sm leading-7 text-ink-700">
      {rows.length > 0 && (
        <dl className="space-y-2">
          {rows.map(([k, v, href]) => (
            <div key={k} className="flex flex-wrap items-baseline gap-x-4">
              <dt className="eyebrow w-16 text-ink-500">{k}</dt>
              <dd>
                <a
                  href={href}
                  className="border-b border-ink-900/30 transition-colors duration-500 hover:border-ink-900"
                >
                  {v}
                </a>
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className={rows.length > 0 ? "mt-4" : undefined}>{CONTACT.line}</p>
      <div className="mt-5">
        {friendUrl ? (
          <ButtonLink href={friendUrl} variant="outline" arrow target="_blank" rel="noreferrer">
            {CONTACT.lineCta}
          </ButtonLink>
        ) : (
          <ButtonLink href="/settings" variant="outline" arrow>
            {CONTACT.lineSettings}
          </ButtonLink>
        )}
      </div>
    </div>
  );
}
