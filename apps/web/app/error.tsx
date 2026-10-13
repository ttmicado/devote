"use client";

import { useEffect } from "react";
import { PageShell } from "@/components/page-shell";
import { Button, ButtonLink, Notice } from "@/components/ui";
import { ERRORS } from "@/lib/copy";

const E = ERRORS.error;

/** ページの表示中に起きたエラー（ヘッダー・フッターは残す） */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <PageShell>
      <Notice
        title={E.title}
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button onClick={reset} arrow>
              {E.retry}
            </Button>
            <ButtonLink href="/" variant="outline">
              {E.home}
            </ButtonLink>
          </div>
        }
      >
        {E.body}
      </Notice>
    </PageShell>
  );
}
