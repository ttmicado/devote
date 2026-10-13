/**
 * 画面の文言（コピーデッキ）。トーンは .claude/skills/devote-design/SKILL.md を参照。
 * 文言を変えるときはここだけを直す。数字は事実に基づくものだけを使う。
 */

export const BRAND = {
  promise: "あなたの時間には手をつけず、住まい探しのすべてを引き受けます。",
  tagline: "住まい探しに、献身を。",
} as const;

export const NAV = [
  { href: "/chat", en: "Concierge", ja: "コンシェルジュ" },
  { href: "/matches", en: "Selections", ja: "ご提案" },
  { href: "/inquiries", en: "Viewings", ja: "内見のご依頼" },
  { href: "/settings", en: "Preferences", ja: "お届け設定" },
] as const;

export const HEADER_CTA = { guest: "ご相談をはじめる", member: "最新のご提案" } as const;

export const AREAS = [
  { ja: "港区", en: "Minato" },
  { ja: "渋谷区", en: "Shibuya" },
  { ja: "千代田区", en: "Chiyoda" },
  { ja: "品川区", en: "Shinagawa" },
  { ja: "中央区 勝どき", en: "Kachidoki" },
  { ja: "江東区 豊洲", en: "Toyosu" },
] as const;

export const HOME = {
  hero: {
    eyebrow: "Private Property Concierge",
    title: ["住まい探しは、", "任せていい。"],
    lead: "条件をお伝えいただくだけ。ポータルに出る前の物件まで、くまなく、いち早く、厳選してお届けします。",
    primary: "ご相談をはじめる",
    secondary: "お届けの見本を見る",
    circle: "ご相談をはじめる",
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
      { value: "6", unit: "社", label: "の自社サイトを巡回中" },
    ],
  },
  problem: {
    eyebrow: "The Flow of Information",
    title: "ポータルに並ぶ頃には、もう遅い。",
    body: "良い物件ほど、まず業者間の情報網に出て、多くはそこで決まります。大手デベロッパーや管理会社は、自社サイトだけで募集することも少なくありません。ポータルに並ぶのは、その後です。毎日すべてを見て回る時間は、あなたには要りません。",
    steps: [
      { en: "First", title: "業者間の情報網・自社サイト", note: "最初に情報が出る場所" },
      { en: "Then", title: "不動産会社の店頭", note: "一部が紹介される" },
      { en: "Finally", title: "ポータルサイト", note: "最後に、広く公開される" },
    ],
    caption: "Devote は、最初の段階から巡回します。",
  },
  promise: {
    eyebrow: "Our Promise",
    title: "三つのことを、お約束します。",
    items: [
      {
        no: "I",
        en: "Swift",
        ja: "最速",
        title: "出たその時に、知らせる。",
        body: "30分ごとに、昼夜を問わず巡回します。新しい物件が条件に合えば、ご指定のタイミングで LINE かメールでお届けします。",
        stat: { value: "30", unit: "分ごと", label: "昼夜を問わず巡回" },
      },
      {
        no: "II",
        en: "Effortless",
        ja: "手間なく",
        title: "一度伝えれば、あとは待つだけ。",
        body: "経験豊富な担当者を再現したAIが、ご希望を対話で伺います。「70㎡以上」なら「69.5㎡はいかがですか」と、許せる幅まで確かめます。検索条件を組み立てる必要はありません。",
        stat: { value: "3", unit: "段階", label: "お届けの頻度を選べます" },
      },
      {
        no: "III",
        en: "Thorough",
        ja: "くまなく",
        title: "ポータルに出ない物件まで。",
        body: "大手デベロッパーや管理会社の自社サイトに加えて、業者間の物件情報も見て回ります。探す場所を、もう選ばなくて構いません。",
        stat: { value: "6", unit: "社", label: "の自社サイトを巡回中" },
      },
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
    cta: "ご相談をはじめる",
  },
  report: {
    eyebrow: "The Report",
    title: "読むのは、数十秒で足ります。",
    body: "一件ごとに、管理費込みの総額・広さ・最寄り駅と、ご希望との適合度を添えます。ご希望と少し違う点も、隠さずに書き添えます。",
    notes: ["総額でお示しします", "ご希望との違いを一行で", "内見のご依頼はここから"],
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
  sources: {
    eyebrow: "Our Sources",
    title: "情報が最初に出る場所を、見ています。",
    body: "大手デベロッパー・管理会社の自社サイトと、不動産会社だけが見られる業者間の情報網。ポータルに出る前の物件も、ここから見つかります。",
    groups: [
      {
        en: "Developers & Managers",
        ja: "自社サイト",
        items: [
          "住友不動産",
          "住友不動産 ラ・トゥール",
          "森ビル",
          "ケン・コーポレーション",
          "REIT FIND",
          "アクセルホーム",
        ],
        note: null,
      },
      {
        en: "Member Networks",
        ja: "業者間の物件情報",
        items: ["レインズ", "ATBB", "ITANDI BB"],
        note: "順次接続します",
      },
    ],
  },
  curation: {
    eyebrow: "Curation",
    title: "いまのあなたに、必要な数だけ。",
    body: "情報を集めている時期と、決めたい時期とでは、必要な件数が違います。決めたい段階なら、お届けは2〜3件に絞ります。",
    note: "件数は1回のお届けの目安です。",
  },
  viewing: {
    eyebrow: "Viewings",
    title: "内見は、ワンタップで。",
    body: "気になる物件があれば、ご希望の日時を添えてご依頼ください。空室を確かめ、日程を整えてご連絡します。",
    subTitle: "ご紹介できない時も、手ぶらでは戻りません。",
    subBody:
      "貸主側のご事情などでご紹介できない場合は、担当者が近い条件の物件を改めてお持ちします。",
  },
  areas: {
    eyebrow: "Areas",
    title: "六つのエリアに、絞っています。",
    body: "広く浅くではなく、よく知る街だけを深く。賃貸・売買のどちらにも対応します。",
  },
  faq: {
    eyebrow: "Questions",
    title: "よくあるご質問",
    items: [
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
        a: "お届けの頻度は「すぐに」「1日1回」「週1回」から選べます。件数も検討段階に応じて絞ります。設定はいつでも変更できます。",
      },
      {
        q: "届いた物件は、必ず内見できますか。",
        a: "空室の状況や貸主側のご意向により、ご紹介できない物件もあります。その場合は、担当者が近い条件の物件をご提案します。",
      },
      {
        q: "売買の物件も探せますか。",
        a: "はい。対象の6エリアで、賃貸・売買のどちらにも対応しています。",
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
    body: "まずは、お住まいへのご希望をお聞かせください。数分の対話で、お届けの準備が整います。",
    cta: "ご相談をはじめる",
  },
} as const;

export const CHAT = {
  eyebrow: "Concierge",
  title: "ご希望を伺います",
  greeting:
    "Devote のコンシェルジュです。お住まい探しは、私にお任せください。\nまずは、どの街で、どのような暮らしをお考えか、ひと言で結構ですのでお聞かせください。",
  placeholder: "ご希望をお聞かせください",
  starters: [
    "港区で70㎡以上、2LDKを",
    "勝どき・豊洲で眺望の良い部屋を",
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
  confirmError: "ご希望を確定できませんでした。もう一度お試しください。",
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
  reportEyebrow: "Today's Report",
  reportTitle: "本日のご報告",
  report: {
    matched: "ご希望に適う物件",
    matchedNote: "掲載中のもの",
    sources: "本日確認したサイト",
    checked: "本日確認した物件",
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
  },
  brief: "承ったご希望",
  review: "見直す",
  listEyebrow: "Shortlist",
  listTitle: "厳選した物件",
  listCount: "件",
  listOrder: "ご希望に近い順",
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
    dates: "ご希望の日時",
    datesNote: "日時の補足（任意）",
    datesNotePlaceholder: "例: 土曜の午後、平日は19時以降",
    datesOptions: ["今週末", "平日の夜", "担当者に任せる"],
    message: "担当者へのご伝言（任意）",
    messagePlaceholder: "駐車場の空き、ペットの可否など、確かめたいことがあればお書きください。",
    contactNote: "お電話番号かメールアドレスのどちらかをお知らせください。",
    submit: "内見を依頼する",
    sticky: "内見を依頼する",
    invalid: "お名前と、ご連絡先（お電話番号またはメールアドレス）をお知らせください。",
  },
  closed: {
    badge: "募集終了",
    body: "この物件の募集は終了しました。近い条件の物件をお探しします。",
    cta: "近い物件を相談する",
  },
  source: "掲載元で見る",
  back: "ご提案に戻る",
  photos: "Photos",
  differencesEyebrow: "Against Your Brief",
  specEyebrow: "Specifications",
  specTitle: "物件の仕様",
} as const;

export const VIEWINGS = {
  eyebrow: "Viewings",
  title: "内見のご依頼",
  lead: "空室の確認から日程の調整まで、こちらで進めます。",
  created: "ご依頼を承りました。空室を確認のうえ、ご連絡します。",
  empty: "ご依頼はまだありません。気になる物件があれば、物件ページからどうぞ。",
  status: {
    new: { label: "承りました", note: "ご依頼を受け付けました。" },
    checking: { label: "確認しています", note: "空室と内見の可否を確かめています。" },
    available: { label: "ご案内できます", note: "日程を整えます。追ってご連絡します。" },
    viewing_scheduled: { label: "ご予約済み", note: "内見の日程が決まりました。" },
    unavailable: {
      label: "今回は見送り",
      note: "貸主側のご事情により、ご案内が叶いませんでした。",
    },
    closed: { label: "内見済み", note: "ご感想をお聞かせいただければ、次のご提案に活かします。" },
  },
  steps: ["承りました", "確認", "ご案内", "ご予約", "内見済み"],
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
  channelsTitle: "受け取り方",
  noChannel: "受け取り方がまだ決まっていません。LINE かメールをお選びください。",
  line: {
    title: "LINEで受け取る",
    recommended: "おすすめ",
    steps: [
      "Devote を友だちに追加します。",
      "連携コードを発行します。",
      "コードをトークに送ると、連携が完了します。",
    ],
    oneTap: "LINEで連携する",
    issue: "連携コードを発行する",
    codeNote: "有効期限は30分です。このコードを Devote のトークに送ってください。",
    addFriend: "Devote を友だちに追加",
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
    },
  },
  disconnect: "連携を解除する",
  frequencyTitle: "お届けの頻度",
  frequencies: [
    { v: "instant", label: "すぐに", note: "見つかり次第、その都度お届けします。" },
    { v: "daily", label: "1日1回", note: "1日分をまとめて、ご指定の時刻にお届けします。" },
    { v: "weekly", label: "週1回", note: "毎週月曜、選りすぐりをお届けします。" },
  ],
  sendHour: "お届けの時刻",
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
  active: "お届けを続ける",
  paused: "いまはお届けを止めています",
  save: "この内容で保存する",
  briefTitle: "承っているご希望",
  briefEdit: "コンシェルジュと見直す",
  noCondition: "先にコンシェルジュとご希望を整えてください。",
} as const;
