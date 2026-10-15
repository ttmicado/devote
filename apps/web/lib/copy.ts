/**
 * 画面の文言（コピーデッキ）。トーンは .claude/skills/devote-design/SKILL.md を参照。
 * 文言を変えるときはここだけを直す。数字は事実に基づくものだけを使う。
 */

export const BRAND = {
  promise: "あなたの時間には手をつけず、物件探しのすべてを引き受けます。",
  tagline: "物件探しに、献身を。",
} as const;

export const NAV = [
  { href: "/chat", en: "Concierge", ja: "コンシェルジュ" },
  { href: "/matches", en: "Selections", ja: "ご提案" },
  { href: "/inquiries", en: "Viewings", ja: "内見のご依頼" },
  { href: "/settings", en: "Preferences", ja: "お届け設定" },
  { href: "/account", en: "Account", ja: "アカウント" },
] as const;

/** ヘッダーと全画面メニュー */
export const HEADER_CTA = {
  guest: "物件探しを任せる",
  member: "最新のご提案",
  short: "相談する",
  skip: "本文へ",
  menu: "Menu",
  menuOpen: "メニューを開く",
  close: "Close",
  menuClose: "メニューを閉じる",
  menuLabel: "メニュー",
  login: "ログイン",
  logout: "ログアウト",
} as const;

export const AREAS = [
  { ja: "港区", en: "Minato" },
  { ja: "渋谷区", en: "Shibuya" },
  { ja: "千代田区", en: "Chiyoda" },
  { ja: "品川区", en: "Shinagawa" },
  { ja: "中央区 勝どき", en: "Kachidoki" },
  { ja: "中央区 晴海", en: "Harumi" },
  { ja: "江東区 豊洲", en: "Toyosu" },
] as const;

export const HOME = {
  hero: {
    eyebrow: "Private Property Concierge",
    /** 英字ラベルの下に添える、対象の一行（5秒で「自分向けか」が分かるように） */
    scopeLine: "港区・渋谷区・千代田区ほか都心6エリア｜住まいの賃貸・売買、事業用賃貸",
    title: ["住まい探しは、", "任せていい。"],
    lead: "ご希望を一度伝えるだけ。ポータルに並ぶ前の情報まで30分ごとに見て回り、合う物件だけを LINE かメールでお届けします。",
    /** ヒーローの3つの価値（5秒で分かる違い） */
    values: [
      { no: "01", title: "ポータルより先に", note: "情報が最初に出る場所から" },
      { no: "02", title: "許容範囲まで汲み取る", note: "70㎡希望なら、69.5㎡も確かめる" },
      { no: "03", title: "必要な数だけ届く", note: "決めたい時期は、2〜3件に絞って" },
    ],
    /** 見本のスマホに添える注記 */
    delivered: {
      en: "Delivered",
      title: "出たら、届く。",
      body: "合う物件が見つかり次第、LINE かメールに。届いた中から、選ぶだけです。",
    },
    primary: "物件探しを任せる",
    /** CTA の下に小さく（料金） */
    pricing:
      "ご相談とお届けは無料です。ご成約の際に、宅地建物取引業法に定める範囲の仲介手数料を申し受けます。",
    scroll: "Scroll",
  },
  live: {
    eyebrow: "Today's Rounds",
    last: "最終確認",
    sources: "本日巡回した情報源",
    checked: "本日確認した物件",
    newToday: "本日の新着",
    active: "掲載中の物件",
    pending: "30分ごとに巡回しています",
    crawling: "巡回中",
    fallback: [
      { value: "30", unit: "分ごと", label: "昼夜を問わず巡回" },
      { value: "6", unit: "エリア", label: "よく知る街に絞って" },
      { value: "隅々", unit: "まで", label: "見落としのないよう巡回" },
    ],
  },
  flow: {
    eyebrow: "How It Works",
    title: "三つの手順で、あとはお任せください。",
    steps: [
      {
        no: "01",
        title: "ご希望を伺う",
        body: "コンシェルジュとの対話で、エリア・広さ・ご予算と、その許容範囲を整えます。数分で済みます。",
      },
      {
        no: "02",
        title: "届く先を決める",
        body: "LINE かメール、お届けの頻度、いまの検討段階をお選びください。",
      },
      {
        no: "03",
        title: "届いたら、選ぶだけ",
        body: "気になる物件は、そのまま内見をご依頼いただけます。空室の確認から日程の調整まで、こちらで行います。",
      },
    ],
    cta: "物件探しを任せる",
    /** 情報源（手順の下に続ける） */
    sources: {
      eyebrow: "Our Sources",
      title: "情報が最初に出る場所を、見ています。",
      body: "良い物件ほど、まず不動産会社の間で共有され、多くはそこで決まります。ポータルに並ぶのは、その後です。",
      groups: [
        {
          en: "Between Agents",
          ja: "不動産会社の間で共有される情報",
          body: "広く公開される前、不動産会社の間で最初に共有される物件情報。",
        },
        {
          en: "Direct from the Source",
          ja: "貸主・売主に近い場所",
          body: "名の知れたデベロッパーや管理会社が、自らの窓口だけで募集する物件。",
        },
        {
          en: "Every Corner",
          ja: "街の隅々まで",
          body: "エリアを絞っているからこそ、小さな募集まで見落としません。",
        },
      ],
      areasLabel: "対象エリア",
      note: "見ている場所は、これからも広げていきます。",
    },
  },
  compare: {
    eyebrow: "Compare",
    title: "探すのは、こちらの仕事です。",
    self: "ご自身で探す場合",
    devote: "Devote に任せる場合",
    rows: [
      {
        en: "Time",
        self: "毎朝、いくつものポータルを見て回る",
        devote: "何もしなくていい。届くのを待つだけ",
      },
      {
        en: "Timing",
        self: "ポータルに並んでから、ようやく知る",
        devote: "公開の早い段階から届く",
      },
      {
        en: "Range",
        self: "検索条件の境目で、69.5㎡の物件が漏れる",
        devote: "許せる幅まで汲み取り、境目の物件も拾う",
      },
      {
        en: "Volume",
        self: "通知が多すぎて、良い物件が埋もれる",
        devote: "検討段階に合わせて、必要な数だけ",
      },
      {
        en: "Viewing",
        self: "問い合わせも日程の調整も、自分で",
        devote: "空室の確認から日程の調整まで任せられる",
      },
    ],
  },
  promise: {
    eyebrow: "Our Promise",
    title: "三つのことを、お約束します。",
    items: [
      {
        no: "I",
        en: "Swift",
        ja: "最速",
        title: "最速で、あなたの指示で知らせる。",
        body: "昼夜を問わず巡回し、お届けは「すぐに」「1日1回」「週1回」から、お選びいただいたタイミングで。",
      },
      {
        no: "II",
        en: "Effortless",
        ja: "手間なく",
        title: "一度伝えれば、あとは待つだけ。",
        body: "経験豊富な担当者を再現したAIが、ご希望を対話で伺います。「70㎡以上」なら「69.5㎡はいかがですか」と、許せる幅まで確かめます。",
      },
      {
        no: "III",
        en: "Thorough",
        ja: "くまなく",
        title: "ポータルに出ない物件まで。",
        body: "情報が最初に出る場所を、隅々まで見て回ります。探す場所を、もう選ばなくて構いません。",
      },
    ],
  },
  curation: {
    eyebrow: "Curation",
    title: "いまの段階に、必要な数だけ。",
    body: "情報を集めている時期と、決めたい時期とでは、必要な件数が違います。合う物件だけを、必要な数に絞ってお届けします。",
    perDay: "1日",
    note: "件数は、1日にお届けする上限です。",
    assurances: [
      {
        en: "Daily Limit",
        title: "1日の上限を設けています",
        body: "情報収集中でも1日20件まで。決めたい段階なら、2〜3件に絞ります。",
      },
      {
        en: "Before We Begin",
        title: "条件がそろうまで、始めません",
        body: "エリア・ご予算・広さ（間取り）がそろってから確定します。該当が多すぎる時は、コンシェルジュが絞り込みをご提案します。",
      },
      {
        en: "Quiet Hours",
        title: "夜間は届けません",
        body: "22時から8時の間に見つかった物件は、朝にまとめてお届けします。",
      },
    ],
  },
  report: {
    eyebrow: "The Report",
    title: "届くのは、決めるための情報だけ。",
    body: "一件ごとに、管理費込みの総額・広さ・駅からの距離と、ご希望と違う点を一行で。長い物件ページを読み比べる必要はありません。",
    notes: [
      "管理費込みの総額で比べられます",
      "ご希望と違う点を、隠さず一行で",
      "そのまま内見を依頼できます",
    ],
    /** 見本のスマホ（ヒーロー） */
    phone: {
      name: "Devote",
      greeting: "本日のご提案です。ご希望に沿う物件を、総額の順にお持ちしました。",
      brief: "見本のご希望：港区・60㎡以上・総額60万円まで",
      sample: "見本",
      cta: "内見を依頼する",
      empty: "掲載中の物件が入ると、ここに見本を表示します。",
      caption: "表示している物件は、現在掲載中の実在の物件です。",
    },
  },
  staff: {
    eyebrow: "People Behind",
    title: "物件の確認とご案内は、宅地建物取引士が担当します。",
    body: "AIがご希望を整理し、合う物件を選びます。物件の確認・内見の調整・ご契約は、宅地建物取引士が担当します。",
    roles: [
      {
        en: "Concierge AI",
        title: "ご希望の整理と、物件の選定",
        body: "対話でご希望と許容範囲を伺い、巡回した物件の中から合うものを選びます。",
      },
      {
        en: "Licensed Agent",
        title: "物件の確認・内見・ご契約",
        body: "空室と条件を掲載元に確かめ、内見の日程を整え、ご契約まで立ち会います。",
      },
      {
        en: "Alternatives",
        title: "ご紹介できない時も、手ぶらでは戻りません",
        body: "貸主側のご事情などでご紹介できない場合は、近い条件の物件を改めてお持ちします。",
      },
    ],
    company: "運営会社について",
  },
  faq: {
    eyebrow: "Questions",
    title: "よくあるご質問",
    items: [
      {
        q: "料金はかかりますか。",
        a: "ご相談とお届けは無料です。ご成約の際に、宅地建物取引業法に定める範囲の仲介手数料を申し受けます。",
      },
      {
        q: "ポータルサイトとは何が違いますか。",
        a: "ポータルは、物件が広く公開された後の場です。Devote は各社の自社サイトや業者間の物件情報を直接巡回するため、ポータルに出る前の物件もお届けできます。",
      },
      {
        q: "条件がまだ固まっていなくても構いませんか。",
        a: "はい。漠然としたご希望からで結構です。対話の中で、優先したいことと譲れることを一緒に整理します。",
      },
      {
        q: "通知が多すぎて煩わしくなりませんか。",
        a: "お届けの頻度は「すぐに」「1日1回」「週1回」から選べます。件数は検討段階に応じて1日の上限を設け、夜間（22時〜8時）は朝にまとめます。設定はいつでも変更できます。",
      },
      {
        q: "届いた物件は、必ず内見できますか。",
        a: "空室の状況や貸主側のご意向により、ご紹介できない物件もあります。その場合は、担当者が近い条件の物件をご提案します。",
      },
      {
        q: "売買や、オフィス・店舗も探せますか。",
        a: "はい。対象の6エリアで、住まいの賃貸・売買に加え、オフィスや店舗などの事業用の賃貸にも対応しています。",
      },
      {
        q: "物件の情報はAIが作っているのですか。",
        a: "いいえ。賃料・広さ・空室などの事実は、巡回した情報源の掲載内容をそのままお伝えします。AIが担うのは、ご希望の整理と物件の選定です。",
      },
    ],
  },
  closing: {
    eyebrow: "Begin",
    title: "探す時間は、もう要りません。",
    body: "まずは、お探しの物件へのご希望をお聞かせください。数分の対話で、お届けの準備が整います。",
    cta: "物件探しを任せる",
  },
} as const;

export const CHAT = {
  eyebrow: "Concierge",
  title: "ご希望を伺います",
  greeting:
    "Devote のコンシェルジュです。物件探しは、お任せください。\nどの街で、どのような住まい・オフィスをお考えか、ひと言でお聞かせください。",
  placeholder: "ご希望をお聞かせください",
  starters: [
    "法人契約で港区の3LDKを",
    "勝どき・豊洲で眺望の良い部屋を",
    "渋谷で30坪前後のオフィスを",
    "車2台、駐車場付きで",
    "都心で購入を検討しています",
    "まだ漠然としています",
  ],
  briefEyebrow: "Your Brief",
  briefTitle: "承ったご希望",
  briefEmpty: "対話の中で伺ったご希望を、ここにまとめます。",
  confirm: "この条件でお任せする",
  confirming: "承っています…",
  confirmNote:
    "条件は、いつでもこの対話で改められます。お届けの方法は、確定後にお選びいただけます。",
  thinking: "確認しています",
  send: "送る",
  startersLabel: "たとえば",
  you: "You",
  briefBarEmpty: "ご希望は、対話の中でまとめます",
  briefOpen: "承ったご希望を開く",
  briefClose: "対話に戻る",
  briefMore: (n: number) => `ほか${n}項目`,
  briefSign: "Devote Concierge",
  briefPhase: "検討段階",
  error: "うまく伺えませんでした。少し置いて、もう一度お送りください。",
  confirmError: "ご希望を確定できませんでした。エリア・ご予算・広さか間取りを伺ってから承ります。",
  volume: {
    eyebrow: "On the Market Now",
    count: (n: number) => `この条件で、いま ${n.toLocaleString("ja-JP")} 件が掲載中です`,
    many: "少し多めです。お届けが煩わしくならないよう、コンシェルジュと絞り込めます。",
    none: "いまは該当がありません。新しく出た物件から、お届けします。",
    fine: "ちょうどよい件数です。新着が出るたびに、この中から厳選してお届けします。",
    cap: (n: number) => `1日にお届けするのは最大 ${n} 件まで（検討段階に応じて）。`,
    missing: (labels: string) => `確定の前に、${labels}を伺います。`,
  },
} as const;

export const SELECTIONS = {
  eyebrow: "Selections",
  title: "あなたへのご提案",
  lead: "承ったご希望に沿って、厳選した物件です。",
  confirmed: "承りました。30分ごとに巡回し、合う物件が見つかり次第お届けします。",
  noCondition: {
    title: "まだ、ご希望を伺っていません。",
    body: "コンシェルジュにご希望をお聞かせいただくと、ここに物件が並びます。",
    cta: "ご相談をはじめる",
  },
  noMatches: {
    title: "現在、ご希望に適う物件は見当たりません。",
    body: "30分ごとに巡回を続けています。見つかり次第、お届けします。",
    cta: "条件の幅を相談する",
  },
  fitLabel: "ご希望との適合度",
  moreNote: (n: number) => `ほかにも、ご希望の許容範囲に入る物件が ${n} 件あります。`,
  moreCta: "ほかの候補も見る",
  allMatch: "ご希望をすべて満たしています",
  differences: "ご希望との違い",
  /** 新着の目安（物件を初めて確認してからの時間） */
  fresh: (hours: number) =>
    hours < 1
      ? "新着 1時間以内"
      : hours < 24
        ? `新着 ${hours}時間前`
        : `新着 ${Math.floor(hours / 24)}日前`,
  /** 同じ建物の別の部屋をまとめる */
  sameBuilding: (n: number, range: string) => `同じ建物に、ほか ${n}室（総額 ${range}）`,
  sameBuildingLabel: "同じ建物の部屋",
  reportEyebrow: "Today's Report",
  reportTitle: "本日のご報告",
  report: {
    matched: "ご希望に適う物件",
    matchedNote: "掲載中のもの",
    sources: "見守っている物件",
    checked: "本日の確認（延べ）",
    newToday: "本日の新着",
    lastChecked: "最終確認",
    notYet: "本日の巡回はこれからです",
    delayed: "一部のサイトの確認が遅れています",
    next: "次回のお届け",
    instant: "見つかり次第お届けします",
    paused: "お届けを止めています",
    last: "前回のお届け",
    noDelivery: "まだお届けしていません",
    noChannel: "受け取り方を決める",
    today: "本日",
    tomorrow: "明日",
    details: "ご報告の詳細",
    newShort: (n: number) => `本日の新着 ${n.toLocaleString("ja-JP")}件`,
  },
  brief: "承ったご希望",
  review: "見直す",
  listEyebrow: "Shortlist",
  listTitle: "厳選した物件",
  listCount: "件",
  listOrder: "ご希望に近い順・新しい順・総額の低い順",
  more: "ほか",
} as const;

export const PROPERTY = {
  viewing: {
    eyebrow: "Request a Viewing",
    title: "内見をご依頼いただけます",
    body: "ご希望の日時をお知らせください。空室を確認のうえ、担当者からご連絡します。",
    name: "お名前",
    phone: "お電話番号",
    email: "メールアドレス",
    prefilled: "前回のご連絡先を入れています。変わっていれば書き換えてください。",
    dates: "ご希望の日時",
    datesNote: "日時の補足（任意）",
    datesNotePlaceholder: "例: 土曜の午後、平日は19時以降",
    datesOptions: ["今週末", "平日の夜", "担当者に任せる"],
    contractName: "ご契約名義",
    contractNameOptions: ["個人", "法人（役員社宅）", "未定"],
    moveIn: "ご入居の希望時期",
    moveInOptions: ["1か月以内", "2〜3か月", "それ以降", "未定"],
    contactVia: "ご連絡の窓口",
    contactViaOptions: ["ご本人", "秘書・総務の方"],
    checks: "確認したいこと（任意）",
    checksOptions: [
      { label: "駐車場の空き", rentOnly: false },
      { label: "ペット", rentOnly: false },
      { label: "楽器", rentOnly: false },
      { label: "法人契約の可否", rentOnly: true },
      { label: "定期借家の期間", rentOnly: true },
      { label: "初期費用の見積り", rentOnly: true },
    ],
    message: "担当者へのご伝言（任意）",
    messagePlaceholder: "ほかに確かめたいことがあれば、お書きください。",
    contactNote: "お電話番号かメールアドレスのどちらかをお知らせください。",
    submit: "内見を依頼する",
    sending: "お送りしています…",
    sticky: "内見を依頼する",
    invalid: "お名前と、ご連絡先（お電話番号またはメールアドレス）をお知らせください。",
    consent: "ご入力の内容は、内見の調整のためだけに使います。",
  },
  closed: {
    badge: "募集終了",
    body: "この物件の募集は終了しました。近い条件の物件をお探しします。",
    cta: "近い物件を相談する",
  },
  /** 会員（ご提案を受けた方）だけにご案内する物件 */
  membersOnly: {
    eyebrow: "Private Listing",
    title: "会員の方にご案内している物件です",
    body: "掲載元との取り決めにより、広く公開していない物件です。ご希望を伺い、条件に合う方にお届けしています。",
    cta: "コンシェルジュに相談する",
    login: "ログインする",
  },
  back: "ご提案に戻る",
  lastChecked: "最終確認",
  photos: "Photos",
  photosAll: (n: number) => `すべての写真（${n}枚）`,
  photosLess: "写真を閉じる",
  differencesEyebrow: "Against Your Brief",
  specEyebrow: "Specifications",
  specTitle: "物件の仕様",
  spec: {
    rent: "賃料",
    price: "価格",
    managementFee: "管理費",
    repairReserveFee: "修繕積立金",
    deposit: "敷金",
    keyMoney: "礼金",
    ofRent: (months: string) => `（賃料の${months}ヶ月）`,
    none: "なし",
    address: "所在地",
    access: "交通",
    layout: "間取り",
    area: "専有面積",
    built: "築年月",
    floor: "階",
    structure: "構造",
    direction: "向き",
    totalUnits: "総戸数",
    availableFrom: "入居可能時期",
    contract: "契約形態",
    contractNormal: "普通借家",
    contractFixed: (months: number | null) =>
      months == null
        ? "定期借家"
        : months % 12 === 0
          ? `定期借家 ${months / 12}年`
          : `定期借家 ${months}ヶ月`,
    renewalFee: "更新料",
    parking: "駐車場",
    features: "設備・条件",
    transactionMode: "取引態様",
    updated: "情報更新日",
  },
  estimate: {
    eyebrow: "Move-in Estimate",
    title: "初期費用の概算（目安）",
    lead: "掲載されている金額から計算した目安です。正式な金額は、申込時にお見積りします。",
    deposit: "敷金",
    keyMoney: "礼金",
    brokerage: "仲介手数料",
    brokerageNote: "賃料1ヶ月分＋消費税",
    advanceRent: "前家賃",
    advanceRentNote: "1ヶ月分の総額（管理費込み）",
    others: "保証会社・火災保険・鍵交換",
    othersValue: "物件ごとに異なります（申込時にご案内）",
    unknown: "確認中",
    total: "合計（目安）",
    totalNote: "保証会社・火災保険・鍵交換は含みません",
    totalPartial: "確認中の項目と、保証会社・火災保険・鍵交換は含みません",
  },
} as const;

export const VIEWINGS = {
  eyebrow: "Viewings",
  title: "内見のご依頼",
  lead: "空室の確認から日程の調整まで、こちらで進めます。",
  created: "ご依頼を承りました。空室を確認し、担当よりお電話かメールでご連絡します。",
  empty: "ご依頼はまだありません。気になる物件があれば、物件ページからどうぞ。",
  status: {
    new: {
      label: "受け付けました",
      note: "次に、掲載元の不動産会社へ空室と内見の可否を問い合わせます。",
    },
    checking: {
      label: "空室を確認しています",
      note: "掲載元の不動産会社に確かめています。わかり次第、担当からご連絡します。",
    },
    available: {
      label: "日程を調整しています",
      note: "ご案内できます。ご希望の日時をもとに、担当から候補の日時をお知らせします。",
    },
    viewing_scheduled: {
      label: "内見の日が決まりました",
      note: "待ち合わせの場所と時刻は、担当からのご連絡でご確認ください。変更はお気軽にお申し付けください。",
    },
    unavailable: {
      label: "今回は見送り",
      note: "貸主側のご事情により、ご案内が叶いませんでした。",
    },
    closed: { label: "内見済み", note: "ご感想をお聞かせいただければ、次のご提案に活かします。" },
  },
  steps: ["受付", "空室確認", "日程調整", "内見日確定", "内見済み"],
  nextLabel: "次の段取り",
  alternativesEyebrow: "Alternatives",
  alternativesTitle: "代わりに、こちらをお持ちしました",
  alternativesLead: "担当者が、ご希望に近い物件を選び直しました。",
  emptyTitle: "ご依頼はまだありません。",
  emptyBody: "気になる物件があれば、物件ページからどうぞ。",
  emptyCta: "ご提案を見る",
  received: "受付",
  preferred: "ご希望の日時",
  declinedEyebrow: "Not Available",
  declinedFollow: "代わりの物件を、下にお持ちしました。",
} as const;

export const PREFERENCES = {
  eyebrow: "Preferences",
  title: "お届け設定",
  lead: "受け取り方と、お届けの数を整えます。",
  saved: "設定を保存しました。",
  welcome: "承りました。合う物件が見つかり次第お届けします。最後に、受け取り方をお選びください。",
  linked: "LINE と連携しました。ご希望に適う物件を、LINE にお届けします。",
  channelsTitle: "受け取り方",
  noChannel: "まだ決まっていません。LINE かメールをお選びください。",
  connected: "お届け先",
  change: "変更する",
  changeClose: "閉じる",
  channelLine: "LINE",
  channelEmail: "メール",
  lineDelivers: "LINE にお届けします",
  line: {
    title: "LINEで受け取る",
    recommended: "おすすめ",
    linked: "LINE と連携済みです。",
    oneTapNote: "ボタンを押すと LINE が開きます。そのまま送信すると連携が完了します。",
    steps: [
      "Devote を友だちに追加します。",
      "連携コードを発行します。",
      "コードをトークに送ると、連携が完了します。",
    ],
    oneTap: "LINEで連携する",
    issue: "連携コードを発行する",
    codeLabel: "Link Code",
    codeNote: "有効期限は30分です。このコードを Devote のトークに送ってください。",
    addFriend: "Devote を友だちに追加",
    waiting: "トークへの送信をお待ちしています。届くと、この画面が自動で切り替わります。",
  },
  email: {
    title: "メールで受け取る",
    label: "メールアドレス",
    placeholder: "name@example.com",
    submit: "確認のメールを送る",
    note: "確認のメールをお送りします。",
    messages: {
      sent: "確認のメールをお送りしました。メール内のリンクを開くと完了します。",
      verified: "メールアドレスを確認しました。",
      invalid: "メールアドレスの形式をご確認ください。",
      expired: "確認の期限が切れています。もう一度お送りください。",
      failed:
        "確認のメールをお送りできませんでした。恐れ入りますが、時間をおいて再度お試しいただくか、LINE をご利用ください。",
    },
  },
  disconnect: "連携を解除する",
  disconnectConfirm: (label: string) =>
    `${label}への連携を解除します。解除すると、${label}には物件が届かなくなります。よろしいですか。`,
  frequencyTitle: "お届けの頻度",
  frequencies: [
    { v: "instant", label: "すぐに", note: "見つかり次第、その都度お届けします。" },
    { v: "daily", label: "1日1回", note: "1日分をまとめて、ご指定の時刻にお届けします。" },
    { v: "weekly", label: "週1回", note: "毎週月曜、選りすぐりをお届けします。" },
  ],
  sendHour: "お届けの時刻",
  nightNote: "夜間（22時〜8時）に見つかった物件は、朝8時にまとめてお届けします。",
  phaseTitle: "いまの検討段階",
  phaseLead: "段階に合わせて、お届けする件数を絞ります。",
  phases: {
    exploring: {
      label: "情報収集中",
      note: "相場を知るために、幅広くお届けします。",
      count: "最大20件",
    },
    considering: {
      label: "比較検討中",
      note: "候補を絞るために、要点を押さえてお届けします。",
      count: "最大8件",
    },
    ready: {
      label: "決めたい",
      note: "本命になりうる物件だけを、2〜3件に絞ります。",
      count: "2〜3件",
    },
  },
  pauseTitle: "お届けの一時停止",
  active: "お届けを続ける",
  activeNote: "チェックを外すと、ご希望はそのままに、お届けだけを止めます。",
  paused: "いまはお届けを止めています",
  save: "この内容で保存する",
  briefTitle: "承っているご希望",
  briefEdit: "コンシェルジュと見直す",
  noCondition: "先にコンシェルジュとご希望を整えてください。",
  startCta: "ご相談をはじめる",
  accountNote: "ほかの端末やブラウザからも同じ内容をご覧いただくには、アカウントをお作りください。",
  accountCta: "アカウントを作る",
} as const;

export const ACCOUNT = {
  eyebrow: "Account",
  title: "アカウント",
  lead: "ほかの端末やブラウザからも、同じご希望・ご提案をご覧いただけるようにします。",
  createTitle: "アカウントを作る",
  createLead: "いまご相談いただいている内容は、そのまま引き継ぎます。",
  manageTitle: "アカウント",
  nickname: "お呼びする名前",
  nicknameNote: "コンシェルジュやお知らせで「○○様」とお呼びします。",
  loginId: "ログインID",
  loginIdNote: "英数字4文字以上。メールアドレスでも構いません。",
  password: "パスワード",
  passwordNote: "8文字以上",
  newPassword: "新しいパスワード（変更する場合のみ）",
  create: "アカウントを作る",
  save: "保存する",
  created: "アカウントを作りました。ほかの端末からは、ログインIDとパスワードでお入りください。",
  saved: "保存しました。",
  logout: "この端末からログアウト",
  haveAccount: "すでにアカウントをお持ちの方",
  toLogin: "ログインする",
  errors: {
    nickname: "お呼びする名前をお知らせください。",
    loginId: "ログインIDは英数字4文字以上でお決めください（メールアドレスでも構いません）。",
    password: "パスワードは8文字以上でお決めください。",
    taken: "このログインIDはすでに使われています。別のIDをお決めください。",
  },
  login: {
    eyebrow: "Sign In",
    title: "ログイン",
    lead: "ほかの端末で作ったアカウントでお入りください。",
    submit: "ログインする",
    noAccount: "アカウントをお持ちでない方は、ご相談から始められます。",
    forgotTitle: "パスワードをお忘れの方",
    forgotContact:
      "お手数ですが、お問い合わせ窓口までご連絡ください。ご本人の確認のうえ、再設定をお手伝いします。",
    forgotLine:
      "お手数ですが、Devote の LINE のトークでお知らせください。ご本人の確認のうえ、再設定をお手伝いします。",
    errors: {
      invalid: "ログインIDかパスワードが違います。",
      locked: "続けて失敗したため、15分ほどログインを止めています。少し置いてお試しください。",
    },
  },
} as const;

/** 担当者への直接のご相談 */
export const CONTACT = {
  direct: "担当者に直接相談する",
  eyebrow: "Contact",
  title: "お問い合わせ",
  lead: "物件のこと、ご契約のこと、このサービスのこと。担当者がお答えします。",
  email: "メール",
  phone: "電話",
  form: "フォーム",
  formLabel: "お問い合わせフォーム",
  line: "LINE のトークから、担当者に直接ご相談いただけます。",
  lineCta: "LINE で相談する",
  lineSettings: "LINE を連携する",
} as const;

/** 会社概要・個人情報の取り扱い・利用規約（法務の確認が必要な文面） */
export const LEGAL = {
  footer: {
    operator: "運営会社",
    license: "宅地建物取引業",
    company: "会社概要",
    privacy: "個人情報の取り扱い",
    terms: "利用規約",
    login: "ログイン",
    legalNav: "会社と規約",
  },
  consent: {
    chat: "対話の内容は、物件探しのためだけに使います。",
    link: "個人情報の取り扱い",
  },
  company: {
    eyebrow: "Company",
    title: "会社概要",
    lead: "Devote は、宅地建物取引業者として、物件のご紹介から内見・ご契約までをお手伝いします。",
    rowsTitle: "運営会社",
    transactionMode: "取引態様",
    areas: "対応エリア",
    areasValue: "港区・渋谷区・千代田区・品川区・中央区勝どき・晴海・江東区豊洲",
    kinds: "対応種別",
    kindsValue: "住まいの賃貸・売買、オフィスや店舗などの事業用の賃貸",
    site: "コーポレートサイト",
    role: "Our Role",
    roleBody:
      "Devote がご紹介する物件は、いずれも Devote が仲介（媒介）としてお取り次ぎします。物件の貸主・売主ではありません。空室・条件は、掲載元の不動産会社に確かめたうえでご案内します。",
  },
  privacy: {
    eyebrow: "Privacy",
    title: "個人情報の取り扱い",
    lead: "お預かりする情報と、その使い道をまとめています。",
    enacted: "制定日 2026年10月13日",
    sections: [
      {
        h: "お預かりする情報",
        items: [
          "お呼びする名前、ログインID",
          "メールアドレス、LINE のユーザーID",
          "内見をご依頼の際のお名前・お電話番号・メールアドレス",
          "ご希望の条件（エリア・ご予算・広さなど）",
          "コンシェルジュとの対話の内容",
        ],
      },
      {
        h: "使い道",
        items: [
          "ご希望に合う物件を探し、お届けするため",
          "内見の日程を調整し、ご契約までをお手伝いするため",
          "お問い合わせにお答えするため",
          "サービスを改善するため（個人を特定しない形に加工して使います）",
        ],
      },
      {
        h: "第三者への提供",
        body: "内見を調整するため、物件の掲載元の不動産会社（元付業者）に、お名前とご連絡先など必要な範囲をお伝えします。それ以外に、ご本人の同意なく第三者へ提供することはありません（法令に基づく場合を除きます）。",
      },
      {
        h: "取り扱いを委託する先",
        body: "サービスの提供のため、次の事業者に情報の取り扱いを委託しています。委託先とは適切な契約を結び、管理します。",
        items: [
          "対話の応答（AI）: Anthropic",
          "メールの配信: Resend",
          "LINE でのお届け: LINEヤフー",
          "サイトの運用（ホスティング）: Vercel",
          "データベース: Neon",
        ],
        note: "一部の委託先は、海外にサーバーを置いています。",
      },
      {
        h: "安全のための取り組み",
        body: "通信は暗号化し、パスワードは復元できない形で保存します。情報にふれる担当者を限り、アクセスの記録を残します。",
      },
      {
        h: "開示・訂正・削除のご請求",
        body: "ご本人の情報の開示・訂正・利用の停止・削除をご希望の場合は、下記の窓口までお申し付けください。ご本人であることを確かめたうえで、速やかに対応します。",
      },
    ],
    contactTitle: "お問い合わせ窓口",
  },
  terms: {
    eyebrow: "Terms",
    title: "利用規約",
    lead: "Devote をご利用いただく際の約束ごとです。",
    enacted: "制定日 2026年10月13日",
    sections: [
      {
        h: "第1条　サービスの内容",
        body: "Devote は、ご希望を伺い、不動産会社の公開情報や業者間の物件情報から合う物件を選び、LINE またはメールでお届けします。内見のご依頼を受けて、空室の確認と日程の調整を行います。",
      },
      {
        h: "第2条　物件情報について",
        body: "物件の情報は、掲載元の不動産会社が公開している内容に基づきます。空室や条件は変わることがあるため、内見・お申し込みの前に、担当者が確認のうえでご案内します。",
      },
      {
        h: "第3条　AI の回答について",
        body: "コンシェルジュ（AI）の回答は、物件探しの参考としてお使いください。契約に関わる事項は、担当者（宅地建物取引士を含みます）がご説明します。",
      },
      {
        h: "第4条　禁止事項",
        items: [
          "虚偽の情報での登録や、他人になりすましての利用",
          "お届けした物件情報の転載・再配布・営業目的での利用",
          "サービスの運営を妨げる行為（過度な自動アクセスを含みます）",
          "法令や公序良俗に反する行為",
        ],
      },
      {
        h: "第5条　免責",
        body: "掲載元の情報の誤りや、物件の募集状況の変化により生じた損害について、当社の故意または重大な過失による場合を除き、責任を負いません。通信環境や外部サービスの障害により、お届けが遅れることがあります。",
      },
      {
        h: "第6条　規約の変更",
        body: "この規約は、必要に応じて変更することがあります。変更する場合は、このページでお知らせします。",
      },
      {
        h: "第7条　準拠法と管轄",
        body: "この規約は日本法に基づきます。紛争が生じた場合は、東京地方裁判所を第一審の専属的合意管轄裁判所とします。",
      },
    ],
  },
} as const;

/** 見つからない・うまく表示できないとき */
export const ERRORS = {
  notFound: {
    eyebrow: "Not Found",
    title: "お探しのページは見つかりませんでした。",
    body: "募集が終わったか、アドレスが変わった可能性があります。",
    primary: "ご提案に戻る",
    secondary: "コンシェルジュに相談する",
  },
  error: {
    eyebrow: "Something Went Wrong",
    title: "うまく表示できませんでした。",
    body: "少し置いて、もう一度お試しください。続くようでしたら、担当者までお知らせください。",
    retry: "もう一度表示する",
    home: "トップに戻る",
  },
  loading: "読み込んでいます",
} as const;

/** セキュリティまわり（回数制限・アカウントの切り替え・メール確認）の文言 */
export const SECURITY_COPY = {
  rateLimit: {
    chat: "少し続けてお送りいただいたため、いったんお休みしています。時間をおいて、もう一度お試しください。",
    chatBusy: "前のメッセージに応答しています。少しお待ちください。",
    email: "確認メールの送信が続いたため、いったんお休みしています。時間をおいてお試しください。",
    inquiry: "内見のご依頼が続いたため、いったんお休みしています。時間をおいてお試しください。",
    lineCode:
      "連携コードの確認が続いたため、いったんお休みしています。1時間ほどおいて、もう一度お送りください。",
  },
  account: {
    currentPassword: "いまのパスワード",
    currentPasswordNote: "パスワードを変える場合のみ",
    errors: {
      currentPassword: "いまのパスワードが違います。",
    },
  },
  sessionSwitch: {
    eyebrow: "Account",
    title: "アカウントの切り替え",
    lead: "この端末では、別のアカウントでご利用中です。お届けしたリンクのアカウントに切り替えますか。",
    note: "切り替えると、いまのアカウントからはこの端末でログアウトします。",
    submit: "切り替える",
    stay: "いまのまま続ける",
    expiredTitle: "リンクの有効期限が切れています",
    expired: "お手数ですが、最新のお届けからもう一度お開きください。",
  },
  emailVerify: {
    eyebrow: "Email",
    title: "メールアドレスのご確認",
    lead: "下のボタンを押すと、物件のお届けをこのメールアドレスで受け取れるようになります。",
    submit: "メールアドレスを確認する",
    takenTitle: "このメールアドレスは登録済みです",
    taken:
      "別のアカウントのお届け先として登録されています。そちらでお届け先から外したうえで、もう一度お試しください。",
    expiredTitle: "確認リンクの有効期限が切れています",
    expired: "お手数ですが、お届け設定から確認メールをもう一度お送りください。",
    toSettings: "お届け設定へ",
  },
  lineLink: {
    taken:
      "このLINEは、すでに別のアカウントと連携しています。そちらの連携を解除したうえで、もう一度お試しください。",
  },
} as const;
