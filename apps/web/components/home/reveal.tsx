import type { ReactNode } from "react";

/**
 * 画面に入るにつれて、下からゆっくり現れる（CSS のスクロール連動アニメーション）。
 * JS を使わない。未対応のブラウザや「動きを減らす」設定では、最初から表示したまま。
 * delay はスクロール量に対する出始めのずれ（並んだ要素を少しずつ遅らせる）。
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const shift = Math.round(delay / 20);
  return (
    <div
      className={`motion-safe:[animation-name:rise] motion-safe:[animation-fill-mode:both] motion-safe:[animation-timing-function:var(--ease-luxe)] motion-safe:[animation-timeline:view()] ${className ?? ""}`}
      style={{ animationRange: `entry ${shift}% cover ${28 + shift}%` }}
    >
      {children}
    </div>
  );
}
