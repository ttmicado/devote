import { FEATURE_DICTIONARY, formatYen, priceLabel } from "@devote/core";
import { notFound } from "next/navigation";
import { createInquiry } from "@/app/actions";
import { PropertyImage } from "@/components/property-card";
import { propertyWithSources } from "@/lib/data";

export const dynamic = "force-dynamic";

const featureLabel = (f: string) =>
  FEATURE_DICTIONARY[f]?.label ?? (f === "south_facing" ? "南向き" : f);
const TRANSACTION: Record<string, string> = {
  owner: "貸主・売主",
  agent: "代理",
  exclusive_agency: "専任媒介",
  general_agency: "一般媒介",
  brokerage: "仲介",
  unknown: "—",
};

export default async function PropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ inquiry?: string }>;
}) {
  const { id } = await params;
  const { inquiry } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const p = await propertyWithSources(id);
  if (!p) notFound();
  const l = p.listing;

  const rows: [string, string | null][] = [
    [l.dealType === "rent" ? "賃料" : "価格", priceLabel(l)],
    [
      "敷金／礼金",
      l.dealType === "rent"
        ? `${l.deposit != null ? formatYen(l.deposit) : "—"}／${l.keyMoney != null ? formatYen(l.keyMoney) : "—"}`
        : null,
    ],
    ["修繕積立金", l.repairReserveFee ? formatYen(l.repairReserveFee) : null],
    ["所在地", l.address.raw],
    [
      "交通",
      l.stations
        .map(
          (s) =>
            `${s.line ? `${s.line} ` : ""}${s.station}駅 ${s.walkMinutes != null ? `徒歩${s.walkMinutes}分` : s.busMinutes != null ? `バス${s.busMinutes}分` : ""}`,
        )
        .join("\n") || null,
    ],
    ["間取り", l.layout],
    ["専有面積", l.areaSqm != null ? `${l.areaSqm}㎡` : null],
    ["築年月", l.builtYearMonth ? `${l.builtYearMonth.replace("-", "年")}月` : null],
    [
      "階",
      l.floor != null
        ? `${l.floor < 0 ? `地下${-l.floor}` : l.floor}階${l.totalFloors ? `／${l.totalFloors}階建` : ""}`
        : null,
    ],
    ["構造", l.structure],
    ["向き", l.direction],
    ["設備・条件", l.features.map(featureLabel).join("、") || null],
    ["取引態様", TRANSACTION[l.transactionMode] ?? null],
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold text-brand-700">
          {l.dealType === "rent" ? "賃貸" : "売買"}
        </p>
        <h1 className="text-2xl font-bold">{l.title ?? "物件"}</h1>
        <p className="mt-1 text-2xl font-bold text-red-700">{priceLabel(l)}</p>
        {p.status === "closed" && (
          <p className="mt-2 rounded bg-stone-200 px-2 py-1 text-sm">
            この物件は掲載が終了しています
          </p>
        )}
      </div>

      {l.imageUrls.length > 0 && (
        <div className="flex snap-x gap-2 overflow-x-auto pb-2">
          {l.imageUrls.map((u) => (
            <PropertyImage
              key={u}
              url={u}
              alt="物件写真"
              className="h-56 w-80 flex-none snap-start rounded-lg"
            />
          ))}
        </div>
      )}

      <dl className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
        {rows
          .filter((r): r is [string, string] => r[1] != null && r[1] !== "")
          .map(([k, v]) => (
            <div key={k} className="grid grid-cols-[7rem_1fr] gap-3 px-4 py-2.5 text-sm">
              <dt className="text-stone-500">{k}</dt>
              <dd className="whitespace-pre-line">{v}</dd>
            </div>
          ))}
      </dl>

      <section id="inquiry" className="rounded-xl border-2 border-brand-600 bg-white p-5">
        <h2 className="text-lg font-bold">内見を問い合わせる</h2>
        <p className="mt-1 text-sm text-stone-600">
          担当者が空室状況を確認してご連絡します。ご紹介できない場合は、似た条件の物件をお探しします。
        </p>
        {inquiry === "invalid" && (
          <p className="mt-2 text-sm text-red-600">お名前を入力してください。</p>
        )}
        <form action={createInquiry} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="propertyId" value={p.id} />
          <label className="text-sm">
            お名前（必須）
            <input
              name="name"
              required
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            電話番号
            <input
              name="phone"
              type="tel"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            メールアドレス
            <input
              name="email"
              type="email"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            内見のご希望日時
            <input
              name="dates"
              placeholder="例: 土日の午後"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            ご質問・ご要望
            <textarea
              name="message"
              rows={3}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-brand-700 py-3 font-bold text-white sm:col-span-2"
          >
            問い合わせる
          </button>
        </form>
      </section>
    </div>
  );
}
