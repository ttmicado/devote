"use client";

/** 「連携を解除する」。誤って押しても解除されないよう、確かめてから送る */
export function DisconnectButton({ label, confirmText }: { label: string; confirmText: string }) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
      className="min-h-11 shrink-0 rounded-full border border-ink-900/20 px-5 text-xs tracking-[0.12em] text-ink-700 transition-colors duration-500 hover:border-ink-900 hover:text-ink-900"
    >
      {label}
    </button>
  );
}
