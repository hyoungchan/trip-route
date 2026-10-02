import { NextRequest, NextResponse } from "next/server";

type NaverLocalItem = {
  title?: string;
  address?: string;
  roadAddress?: string;
  category?: string;
  mapx?: string;
  mapy?: string;
};

type NaverLocalResponse = {
  items?: NaverLocalItem[];
};

function stripHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query")?.trim() ?? "";
  if (!query) {
    return NextResponse.json({ error: "검색어를 입력해 주세요." }, { status: 400 });
  }

  const clientId = process.env.NAVER_SEARCH_CLIENT_ID?.trim();
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        error:
          "서버에 NAVER_SEARCH_CLIENT_ID와 NAVER_SEARCH_CLIENT_SECRET을 설정한 뒤 개발 서버를 다시 시작해 주세요.",
      },
      { status: 503 },
    );
  }

  const url = new URL("https://naverapihub.apigw.ntruss.com/search/v1/local");
  url.searchParams.set("query", query);
  url.searchParams.set("display", "5");
  url.searchParams.set("start", "1");
  url.searchParams.set("sort", "random");
  url.searchParams.set("format", "json");

  const response = await fetch(url, {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": clientId,
      "X-NCP-APIGW-API-KEY": clientSecret,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json(
      {
        error:
          "NAVER API HUB 지역 검색을 호출하지 못했습니다. Application의 검색 API 권한과 인증 정보를 확인해 주세요.",
      },
      { status: 502 },
    );
  }

  const data = (await response.json()) as NaverLocalResponse;
  const places = (data.items ?? [])
    .map((item) => {
      const name = stripHtml(item.title ?? "");
      const address = stripHtml(item.roadAddress || item.address || "");
      const mapx = String(item.mapx ?? "").trim();
      const mapy = String(item.mapy ?? "").trim();
      if (!name || !address || !mapx || !mapy) {
        return null;
      }
      return {
        name,
        address,
        category: item.category ? stripHtml(item.category) : undefined,
        mapx,
        mapy,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return NextResponse.json({ places });
}
