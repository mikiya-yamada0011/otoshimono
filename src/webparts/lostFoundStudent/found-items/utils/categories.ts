/** 落とし物検索で共通利用するカテゴリ定義と純粋な検索ロジック。 */
export type ChildCategory = {
  code: string;
  name: string;
  aliases: string[];
};

export type CategoryGroup = {
  code: string;
  name: string;
  /** 学生向けの一覧・検索・新着通知で選択可能か */
  studentVisible: boolean;
  children: ChildCategory[];
};

type ChildDefinition = readonly [code: string, name: string, aliases?: readonly string[]];
type GroupDefinition = readonly [
  code: string,
  name: string,
  children: readonly ChildDefinition[],
  studentVisible?: boolean,
];

/** SharePoint の ItemCategories と同じ固定IDを使うカテゴリマスタ。 */
const DEFINITIONS: readonly GroupDefinition[] = [
  ["P01", "財布・現金", [
    ["P01_WALLET", "財布"],
    ["P01_COIN_CASE", "小銭入れ"],
    ["P01_CASH", "現金のみ"],
    ["P01_OTHER", "その他の財布・現金"],
  ], false],
  ["P02", "スマホ・電子機器", [
    ["P02_SMARTPHONE", "スマートフォン・携帯電話", ["スマホ", "携帯"]],
    ["P02_LAPTOP", "ノートPC", ["PC", "パソコン", "ノートパソコン"]],
    ["P02_TABLET", "タブレット"],
    ["P02_EARPHONE_WIRELESS", "ワイヤレスイヤホン", ["AirPods", "エアポッズ", "Bluetoothイヤホン"]],
    ["P02_EARPHONE_WIRED", "有線イヤホン・ヘッドホン", ["イヤホンコード"]],
    ["P02_CHARGER", "充電器・ケーブル・アダプター"],
    ["P02_MOBILE_BATTERY", "モバイルバッテリー"],
    ["P02_STORAGE_MEDIA", "USBメモリ・SDカード"],
    ["P02_CAMERA", "カメラ・撮影機器"],
    ["P02_CALCULATOR", "電卓・電子辞書"],
    ["P02_SMARTWATCH", "スマートウォッチ"],
    ["P02_OTHER", "その他の電子機器"],
  ]],
  ["P03", "かばん・入れ物", [
    ["P03_BACKPACK", "リュックサック", ["リュック", "バックパック", "ナップサック"]],
    ["P03_TOTE", "トートバッグ・手提げかばん"],
    ["P03_SHOULDER", "ショルダー・ハンドバッグ"],
    ["P03_POUCH", "ポーチ・巾着"],
    ["P03_CASE", "ケース・カバー"],
    ["P03_BAG_BOX", "紙袋・ビニール袋・封筒・箱"],
    ["P03_OTHER", "その他のかばん・入れ物"],
  ]],
  ["P04", "衣類・身につける物", [
    ["P04_OUTER", "上着・パーカー・カーディガン"],
    ["P04_CLOTHING", "シャツ・ズボン・その他衣類"],
    ["P04_HAT", "帽子"],
    ["P04_GLOVE_SCARF", "手袋・マフラー・耳あて"],
    ["P04_SHOES", "靴・履物"],
    ["P04_GLASSES", "眼鏡・サングラス"],
    ["P04_WATCH", "腕時計"],
    ["P04_ACCESSORY", "指輪・ネックレス・アクセサリー"],
    ["P04_HAIR_ACCESSORY", "ヘアアクセサリー"],
    ["P04_OTHER", "その他の衣類・身につける物"],
  ]],
  ["P05", "傘・雨具", [
    ["P05_UMBRELLA_LONG", "長傘"],
    ["P05_UMBRELLA_FOLDING", "折りたたみ傘"],
    ["P05_RAINWEAR", "レインコート・その他雨具"],
  ]],
  ["P06", "文具・本・書類", [
    ["P06_PENCIL_CASE", "ペンケース"],
    ["P06_WRITING_TOOL", "ペン・シャープペン・筆記用具", ["シャーペン", "シャープペンシル"]],
    ["P06_STATIONERY", "定規・消しゴム・その他文具"],
    ["P06_TEXTBOOK", "教科書・書籍・辞書"],
    ["P06_NOTEBOOK", "ノート・手帳・ルーズリーフ"],
    ["P06_DOCUMENT", "プリント・書類・ポスター"],
    ["P06_FILE", "ファイル・バインダー"],
    ["P06_OTHER", "その他の文具・本・書類"],
  ]],
  ["P07", "飲食物・容器", [
    ["P07_BOTTLE", "水筒・タンブラー・シェーカー", ["マイボトル", "タンブラー"]],
    ["P07_LUNCH_BOX", "弁当箱・食品容器"],
    ["P07_FOOD_DRINK", "食品・飲料"],
    ["P07_OTHER", "その他の飲食物・容器"],
  ]],
  ["P08", "生活・医療・化粧品", [
    ["P08_TOWEL", "ハンカチ・タオル"],
    ["P08_COSMETIC", "化粧品・鏡・くし"],
    ["P08_MEDICAL", "薬・医療用品"],
    ["P08_HYGIENE", "マスク・衛生用品"],
    ["P08_DAILY_GOODS", "お守り・その他生活用品"],
  ]],
  ["P09", "スポーツ・趣味・移動用品", [
    ["P09_SPORTS", "スポーツ用品"],
    ["P09_MUSIC", "楽器・音楽用品"],
    ["P09_HOBBY", "玩具・ぬいぐるみ・趣味用品"],
    ["P09_BICYCLE", "自転車・移動関連用品"],
    ["P09_OTHER", "その他のスポーツ・趣味・移動用品"],
  ]],
  ["P10", "カード・証明書", [
    ["P10_STUDENT_ID", "学生証・教職員証"],
    ["P10_TRANSIT_CARD", "定期券・交通系ICカード", ["定期", "Suica", "ICOCA", "PiTaPa"]],
    ["P10_OTHER_CARD", "クレジットカード・その他カード"],
    ["P10_PUBLIC_ID", "免許証・公的証明書"],
    ["P10_OTHER", "その他のカード・証明書"],
  ], false],
  ["P11", "鍵", [
    ["P11_KEY", "鍵・鍵束", ["かぎ", "カギ", "キー"]],
    ["P11_CARD_KEY", "カードキー・スマートキー"],
    ["P11_OTHER", "その他の鍵"],
  ], false],
  ["P12", "印鑑", [
    ["P12_SEAL", "印鑑"],
    ["P12_OTHER", "その他の印章"],
  ], false],
  ["P99", "その他・分類不明", [
    ["P99_OTHER", "その他"],
    ["P99_UNKNOWN", "分類不明"],
  ]],
];

export const CATEGORY_GROUPS: CategoryGroup[] = DEFINITIONS.map(
  ([code, name, children, studentVisible = true]) => ({
    code,
    name,
    studentVisible,
    children: children.map(([childCode, childName, aliases = []]) => ({
      code: childCode,
      name: childName,
      aliases: [...aliases],
    })),
  }),
);

/** 学生向け画面で一覧・検索・新着通知に使用できるカテゴリだけを返す。 */
export const STUDENT_CATEGORY_GROUPS = CATEGORY_GROUPS.filter(
  (group) => group.studentVisible,
);

const childByCode = new Map(
  CATEGORY_GROUPS.flatMap((group) =>
    group.children.map((child) => [child.code, child] as const),
  ),
);

const groupByCode = new Map(CATEGORY_GROUPS.map((group) => [group.code, group]));

/** 旧データの大まかな品目名を、新カテゴリで検索できる範囲へ寄せる。 */
const LEGACY_CATEGORY_MAP: Record<
  string,
  { parentCode: string; categoryCode?: string }
> = {
  "傘": { parentCode: "P05" },
  "水筒": { parentCode: "P07", categoryCode: "P07_BOTTLE" },
  "教科書・ノート": { parentCode: "P06" },
  "文房具": { parentCode: "P06", categoryCode: "P06_STATIONERY" },
  "衣類": { parentCode: "P04", categoryCode: "P04_CLOTHING" },
  "学生証・カード類": { parentCode: "P10" },
  "学生証・教職員証": { parentCode: "P10", categoryCode: "P10_STUDENT_ID" },
  "鍵": { parentCode: "P11", categoryCode: "P11_KEY" },
  "鍵・鍵束": { parentCode: "P11", categoryCode: "P11_KEY" },
  "カードキー・スマートキー": { parentCode: "P11", categoryCode: "P11_CARD_KEY" },
  "印鑑": { parentCode: "P12", categoryCode: "P12_SEAL" },
  "財布": { parentCode: "P01", categoryCode: "P01_WALLET" },
  "スマートフォン": { parentCode: "P02", categoryCode: "P02_SMARTPHONE" },
  "イヤホン": { parentCode: "P02" },
  "ハンカチ・タオル": { parentCode: "P08", categoryCode: "P08_TOWEL" },
};

const LEGACY_CATEGORY_CODE_MAP: Record<
  string,
  { parentCode: string; categoryCode: string }
> = {
  P01_STUDENT_ID: { parentCode: "P10", categoryCode: "P10_STUDENT_ID" },
  P01_TRANSIT_CARD: { parentCode: "P10", categoryCode: "P10_TRANSIT_CARD" },
  P01_OTHER_CARD: { parentCode: "P10", categoryCode: "P10_OTHER_CARD" },
  P01_PUBLIC_ID: { parentCode: "P10", categoryCode: "P10_PUBLIC_ID" },
  P01_KEY: { parentCode: "P11", categoryCode: "P11_KEY" },
  P01_CARD_KEY: { parentCode: "P11", categoryCode: "P11_CARD_KEY" },
  P01_SEAL: { parentCode: "P12", categoryCode: "P12_SEAL" },
};

export const COLORS = [
  "黒", "白", "赤", "青", "緑", "黄", "茶", "灰", "紫", "ピンク", "透明", "その他",
];

export function getCategoryGroup(code?: string): CategoryGroup | undefined {
  return code ? groupByCode.get(code) : undefined;
}

export function getChildCategory(code?: string): ChildCategory | undefined {
  return code ? childByCode.get(code) : undefined;
}

/** 旧P01配下のコードを分割後のコードへ読み替える。 */
export function normalizeCategoryCodes(
  parentCode: string | undefined,
  categoryCode: string | undefined,
  categoryName: string,
): { parentCode?: string; categoryCode?: string } {
  if (categoryCode && LEGACY_CATEGORY_CODE_MAP[categoryCode]) {
    return LEGACY_CATEGORY_CODE_MAP[categoryCode];
  }
  if (parentCode && categoryCode) return { parentCode, categoryCode };

  const inferred = inferCategoryCodes(categoryName);
  return {
    parentCode: parentCode ?? inferred.parentCode,
    categoryCode: categoryCode ?? inferred.categoryCode,
  };
}

export function isStudentVisibleCategory(
  parentCode?: string,
  categoryCode?: string,
): boolean {
  const normalized = categoryCode
    ? LEGACY_CATEGORY_CODE_MAP[categoryCode]
    : undefined;
  const effectiveParentCode = normalized?.parentCode ?? parentCode;
  const group = getCategoryGroup(effectiveParentCode);
  return group?.studentVisible ?? false;
}

export function inferCategoryCodes(name: string): {
  parentCode?: string;
  categoryCode?: string;
} {
  const legacy = LEGACY_CATEGORY_MAP[name];
  if (legacy) return legacy;

  const normalizedName = normalizeSearchText(name);
  for (const group of CATEGORY_GROUPS) {
    for (const child of group.children) {
      if (normalizeSearchText(child.name) === normalizedName) {
        return { parentCode: group.code, categoryCode: child.code };
      }
    }
  }
  return {};
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .replace(/[\u30a1-\u30f6]/g, (character) =>
      String.fromCharCode(character.charCodeAt(0) - 0x60),
    )
    .replace(/[\s\u3000・･_\-/]/g, "");
}

/** 入力語が表す子カテゴリ。親カテゴリ名なら、その配下をすべて返す。 */
function findCategoryCodesByTextInGroups(
  query: string,
  groups: readonly CategoryGroup[],
): Set<string> {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return new Set();

  const result = new Set<string>();
  for (const group of groups) {
    const groupTerms = group.name
      .split(/[・･／/]/)
      .map(normalizeSearchText)
      .filter(Boolean);
    const groupMatches = groupTerms.some(
      (term) => term.includes(normalizedQuery) || normalizedQuery.includes(term),
    );
    for (const child of group.children) {
      const terms = [child.name, ...child.aliases].map(normalizeSearchText);
      if (
        groupMatches ||
        terms.some(
          (term) => term.includes(normalizedQuery) || normalizedQuery.includes(term),
        )
      ) {
        result.add(child.code);
      }
    }
  }
  return result;
}

export function findCategoryCodesByText(query: string): Set<string> {
  return findCategoryCodesByTextInGroups(query, CATEGORY_GROUPS);
}

export function findStudentCategoryCodesByText(query: string): Set<string> {
  return findCategoryCodesByTextInGroups(query, STUDENT_CATEGORY_GROUPS);
}

export function findNonPublicCategoryCodesByText(query: string): Set<string> {
  return findCategoryCodesByTextInGroups(
    query,
    CATEGORY_GROUPS.filter((group) => !group.studentVisible),
  );
}
