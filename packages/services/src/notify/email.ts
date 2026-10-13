/**
 * メール送信（Resend の REST API）。
 * 送信元ドメインは Resend で DNS 認証（SPF/DKIM）しておくこと。
 * 将来 Amazon SES 等に替える場合はこのファイルだけを差し替える。
 */
export interface EmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** 冪等キー（同じ通知の再送で二重送信しない） */
  idempotencyKey?: string;
  unsubscribeUrl?: string;
}

export async function sendEmail(input: EmailInput): Promise<string | null> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) throw new Error("RESEND_API_KEY / MAIL_FROM is not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      ...(input.idempotencyKey ? { "idempotency-key": input.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      headers: input.unsubscribeUrl
        ? {
            "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }
        : undefined,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { id?: string };
  return json.id ?? null;
}
