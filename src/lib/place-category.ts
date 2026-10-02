import type { PlaceKind } from "@/types/trip";

const DEFAULT_PLACE_EMOJI = "📍";

type CategoryRule = {
  emoji: string;
  keywords: string[];
};

const CATEGORY_RULES: CategoryRule[] = [
  { emoji: "🥐", keywords: ["베이커리"] },
  { emoji: "☕", keywords: ["카페", "커피", "디저트"] },
  { emoji: "🏪", keywords: ["전통시장", "시장"] },
  { emoji: "🌳", keywords: ["공원", "수목원", "정원", "숲길", "숲", "생태"] },
  { emoji: "🏖️", keywords: ["해수욕장", "해수욕", "해변", "바닷가"] },
  { emoji: "🎢", keywords: ["테마파크", "놀이공원", "워터파크", "놀이시설"] },
  { emoji: "🐠", keywords: ["아쿠아리움", "수족관", "동물원"] },
  { emoji: "🖼️", keywords: ["박물관", "미술관", "전시관", "전시", "갤러리"] },
  { emoji: "🎬", keywords: ["영화관", "시네마"] },
  { emoji: "🎤", keywords: ["공연장", "콘서트홀", "음악당", "콘서트"] },
  { emoji: "🔭", keywords: ["전망대"] },
  { emoji: "⛺", keywords: ["캠핑"] },
  { emoji: "⛳", keywords: ["골프"] },
  { emoji: "♨️", keywords: ["온천", "스파"] },
  { emoji: "🥾", keywords: ["등산", "둘레길", "산악"] },
  {
    emoji: "⛩️",
    keywords: ["사찰", "템플스테이", "불교", "성당", "교회", "종교"],
  },
  {
    emoji: "🛏️",
    keywords: [
      "숙박",
      "호텔",
      "모텔",
      "펜션",
      "리조트",
      "게스트하우스",
      "호스텔",
      "여관",
    ],
  },
  { emoji: "✈️", keywords: ["공항", "항공"] },
  {
    emoji: "🚉",
    keywords: ["터미널", "정차역", "지하철", "전철", "기차", "철도", "버스정류"],
  },
  { emoji: "🏟️", keywords: ["경기장", "스포츠"] },
  {
    emoji: "🛍️",
    keywords: ["쇼핑몰", "백화점", "아울렛", "쇼핑", "유통", "상가", "아케이드", "마트"],
  },
  {
    emoji: "🍺",
    keywords: [
      "이자카야",
      "와인바",
      "주점",
      "술집",
      "포차",
      "호프",
      "펍",
      "바",
    ],
  },
  {
    emoji: "🍽️",
    keywords: [
      "음식점",
      "한식",
      "중식",
      "일식",
      "양식",
      "분식",
      "맛집",
      "식당",
      "치킨",
      "피자",
      "뷔페",
      "푸드코트",
      "고기요리",
      "퓨전음식",
    ],
  },
  {
    emoji: "🏛️",
    keywords: [
      "궁궐",
      "유적",
      "사적",
      "문화재",
      "국가유산",
      "문화시설",
      "기념물",
      "생가",
      "향교",
      "서원",
      "관광",
      "명소",
      "여행",
    ],
  },
];

function categoryLevels(category: string): string[] {
  return category
    .split(">")
    .map((part) => part.trim())
    .filter(Boolean);
}

function levelTokens(level: string): string[] {
  return level
    .split(/[,/|]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function tokenMatches(token: string, keyword: string): boolean {
  if (keyword === "절") {
    return token === "절";
  }
  if (keyword === "바다") {
    return token === "바다" || token.includes("바닷가");
  }
  if (keyword === "바") {
    const stripped = token.replace(/[()]/g, "");
    if (stripped === "바" || stripped === "BAR" || stripped === "bar") {
      return true;
    }
    if (
      token.includes("바(") ||
      token.includes("(BAR") ||
      token.includes("(bar")
    ) {
      return true;
    }
    return (
      token.endsWith("바") &&
      !token.includes("바다") &&
      !token.includes("바비") &&
      !token.includes("바베큐")
    );
  }
  return token.includes(keyword);
}

function emojiForToken(token: string): string | null {
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => tokenMatches(token, keyword))) {
      return rule.emoji;
    }
  }
  if (/역$/.test(token) && !token.includes("역사")) {
    return "🚉";
  }
  return null;
}

export function emojiForPlaceCategory(category?: string | null): string {
  if (typeof category !== "string") {
    return DEFAULT_PLACE_EMOJI;
  }

  const trimmed = category.trim();
  if (!trimmed) {
    return DEFAULT_PLACE_EMOJI;
  }

  const levels = categoryLevels(trimmed);
  const ordered = levels.length > 0 ? [...levels].reverse() : [trimmed];

  for (const level of ordered) {
    for (const token of levelTokens(level)) {
      const emoji = emojiForToken(token);
      if (emoji) {
        return emoji;
      }
    }
  }

  return DEFAULT_PLACE_EMOJI;
}

export type { PlaceKind };

const SPECIAL_PLACE_EMOJI: Record<Exclude<PlaceKind, "visit">, string> = {
  home: "🏢",
  lodging: "🛏️",
  airport: "✈️",
};

const AIRPORT_KEYWORDS = ["공항", "항공"];
const LODGING_KEYWORDS = [
  "숙박",
  "호텔",
  "모텔",
  "펜션",
  "리조트",
  "게스트하우스",
  "호스텔",
  "여관",
];

const HOME_NAMES = new Set(["집", "우리집", "자택", "home"]);
const HOME_CATEGORY_KEYWORDS = ["주택"];

export function normalizePlaceKind(value: unknown): PlaceKind | undefined {
  if (
    value === "home" ||
    value === "airport" ||
    value === "lodging" ||
    value === "visit"
  ) {
    return value;
  }
  return undefined;
}

export function placeKindFromCategory(category?: string | null): PlaceKind {
  if (typeof category !== "string") {
    return "visit";
  }
  const trimmed = category.trim();
  if (!trimmed) {
    return "visit";
  }

  const levels = categoryLevels(trimmed);
  const ordered = levels.length > 0 ? [...levels].reverse() : [trimmed];
  for (const level of ordered) {
    for (const token of levelTokens(level)) {
      if (AIRPORT_KEYWORDS.some((keyword) => tokenMatches(token, keyword))) {
        return "airport";
      }
      if (LODGING_KEYWORDS.some((keyword) => tokenMatches(token, keyword))) {
        return "lodging";
      }
    }
  }
  return "visit";
}

export function placeKindOf(place: {
  kind?: string | null;
  category?: string | null;
}): PlaceKind {
  return normalizePlaceKind(place.kind) ?? placeKindFromCategory(place.category);
}

export function isNoStayPlace(place: {
  kind?: string | null;
  category?: string | null;
}): boolean {
  const kind = placeKindOf(place);
  return kind === "airport" || kind === "lodging" || kind === "home";
}

export function looksLikeHomePlace(place: {
  name?: string | null;
  category?: string | null;
}): boolean {
  const name = typeof place.name === "string" ? place.name.trim().toLowerCase() : "";
  if (name && HOME_NAMES.has(name)) {
    return true;
  }
  if (typeof place.category !== "string") {
    return false;
  }
  const levels = categoryLevels(place.category.trim());
  const ordered = levels.length > 0 ? [...levels].reverse() : [place.category.trim()];
  for (const level of ordered) {
    for (const token of levelTokens(level)) {
      if (HOME_CATEGORY_KEYWORDS.some((keyword) => tokenMatches(token, keyword))) {
        return true;
      }
    }
  }
  return false;
}

export function emojiForPlace(place: {
  kind?: string | null;
  category?: string | null;
}): string {
  const kind = placeKindOf(place);
  if (kind !== "visit") {
    return SPECIAL_PLACE_EMOJI[kind];
  }
  return emojiForPlaceCategory(place.category);
}
