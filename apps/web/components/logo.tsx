import Link from "next/link";

/** ワードマーク。細身のセリフ＋小さな英字ラベル */
export function Logo({ tone = "light" }: { tone?: "light" | "dark" }) {
  return (
    <Link
      href="/"
      aria-label="Devote トップへ"
      className="group inline-flex flex-col items-center leading-none"
    >
      <span
        className={`font-serif text-[1.9rem] font-light tracking-[-0.01em] transition-colors ${
          tone === "dark" ? "text-sand-100" : "text-evergreen-900"
        }`}
      >
        Devote
      </span>
      <span
        className={`mt-1 font-sans text-[8.5px] uppercase tracking-[0.42em] ${
          tone === "dark" ? "text-sand-300" : "text-sand-600"
        }`}
      >
        Property Concierge
      </span>
    </Link>
  );
}
