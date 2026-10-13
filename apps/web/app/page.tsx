import Link from "next/link";

const STEPS = [
  {
    title: "AIと条件を壁打ち",
    body: "不動産のプロのように、予算・エリア・広さの「どこまでならOKか」まで一緒に詰めます。",
  },
  {
    title: "くまなく自動で巡回",
    body: "業者間サイトや不動産会社の自社サイトまで、ポータルに出る前の物件を定期的にチェックします。",
  },
  {
    title: "最速でお届け",
    body: "条件に合う新着だけを、選んだ頻度で LINE・メールにお知らせ。気になったらそのまま内見の問い合わせへ。",
  },
];

export default function Home() {
  return (
    <div className="space-y-12">
      <section className="rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 px-6 py-14 text-white sm:px-12">
        <p className="text-sm font-bold text-brand-100">AI 物件コンシェルジュ</p>
        <h1 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">
          あなたにピッタリ合う物件を、
          <br />
          最速で・手間なく・くまなく。
        </h1>
        <p className="mt-4 max-w-xl text-brand-100">
          港区・渋谷区・千代田区・品川区・中央区勝どき・江東区豊洲の賃貸／売買に対応しています。
        </p>
        <Link
          href="/chat"
          className="mt-8 inline-block rounded-full bg-white px-6 py-3 font-bold text-brand-700 shadow hover:bg-brand-50"
        >
          AIに相談をはじめる →
        </Link>
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <div key={s.title} className="rounded-xl border border-stone-200 bg-white p-5">
            <p className="text-sm font-bold text-brand-600">STEP {i + 1}</p>
            <h2 className="mt-1 font-bold">{s.title}</h2>
            <p className="mt-2 text-sm text-stone-600">{s.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
