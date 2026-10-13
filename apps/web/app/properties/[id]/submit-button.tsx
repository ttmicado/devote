"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

/** 送信中は「お送りしています…」にして押せなくする（二重送信を防ぐ） */
export function SubmitButton({ label, pending }: { label: string; pending: string }) {
  const status = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      arrow={!status.pending}
      disabled={status.pending}
      aria-disabled={status.pending}
      className="w-full"
    >
      {status.pending ? pending : label}
    </Button>
  );
}
