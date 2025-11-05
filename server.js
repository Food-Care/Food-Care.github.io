// server.js
import express from "express";
import axios from "axios";
import cors from "cors";
import "dotenv/config";

// ───────────────────────────────────────────────────────────────
// 기본 설정
// ───────────────────────────────────────────────────────────────
const app = express();

// 필요시 특정 도메인만 허용으로 변경하세요.
app.use(cors());
app.use(express.json());

// 정적 파일 (Render에서 product.json 등 서빙)
app.use("/data", express.static("./data"));
app.use(express.static("./")); // 원하면 프런트도 같이 호스팅

// 헬스체크 (Render 헬스 확인용)
app.get("/api/health", (req, res) => res.json({ ok: true }));

// ───────────────────────────────────────────────────────────────
// NAVER 이미지검색 API 준비
// ───────────────────────────────────────────────────────────────
const CID = process.env.NAVER_CLIENT_ID;
const CSECRET = process.env.NAVER_CLIENT_SECRET;
if (!CID || !CSECRET) {
  console.warn("[WARN] NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 미설정");
}

// 검색 가중치용 도메인 바이어스(스마트스토어/네이버쇼핑 우선)
const DOMAIN_BIASES = ["site:smartstore.naver.com", "site:shopping.naver.com"];

// 간단 캐시(메모리)
const CACHE_TTL = 1000 * 60 * 60 * 12; // 12시간
const cache = new Map();
const getCache = (k) => {
  const v = cache.get(k);
  if (v && Date.now() - v.ts < CACHE_TTL) return v.data;
  cache.delete(k);
  return null;
};
const setCache = (k, d) => cache.set(k, { ts: Date.now(), data: d });

// API rate 제한 대응
let lastCall = 0;
const MIN_GAP_MS = 250;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────────────────────────────────────────────
// 유틸
// ───────────────────────────────────────────────────────────────
const stripTags = (s = "") => s.replace(/<\/?b>/g, "");
const normalize = (s = "") =>
  s
    .replace(/[®•·∙\u00B7\(\)\[\]\{\}\/\\\+\-\–\—\|,!?'"“”‘’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function tokenize(s = "") {
  return normalize(s).toLowerCase().split(" ").filter(Boolean);
}

function looksLikeImageUrl(u = "") {
  return /\.(jpg|jpeg|png|webp|gif)(\?|#|$)/i.test(u);
}

function shoppingSearchUrl(q = "") {
  return `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(q)}`;
}

function scoreItem(it, tokens) {
  const title = stripTags(it.title || "");
  const tks = tokenize(title);

  let match = 0;
  tokens.name.forEach((t) => {
    if (t && tks.includes(t)) match += 3;
  });
  tokens.brand.forEach((t) => {
    if (t && tks.includes(t)) match += 2;
  });

  const w = Number(it.sizewidth || 0);
  const h = Number(it.sizeheight || 0);
  let s = match;
  if (w >= 300 && h >= 300) s += 2;
  else if (w >= 120 && h >= 120) s += 1;

  const u = (it.link || "").toLowerCase();
  if (u.includes("shopping.naver") || u.includes("smartstore")) s += 2;
  if (u.includes("coupang") || u.includes("gmarket") || u.includes("11st")) s += 1;

  return s;
}

// ───────────────────────────────────────────────────────────────
// NAVER 이미지 검색 호출
// ───────────────────────────────────────────────────────────────
async function callImageAPI(query, display = 10) {
  let tries = 0;
  while (true) {
    const elapsed = Date.now() - lastCall;
    if (elapsed < MIN_GAP_MS) await sleep(MIN_GAP_MS - elapsed);
    try {
      const r = await axios.get("https://openapi.naver.com/v1/search/image.json", {
        params: { query, display },
        headers: { "X-Naver-Client-Id": CID, "X-Naver-Client-Secret": CSECRET },
        timeout: 10000,
      });
      lastCall = Date.now();
      return r.data?.items || [];
    } catch (e) {
      const status = e.response?.status;
      if (status === 429 && tries < 3) {
        tries++;
        await sleep(300 * tries);
        continue;
      }
      throw e;
    }
  }
}

// ───────────────────────────────────────────────────────────────
// 베스트 이미지 탐색 로직
// ───────────────────────────────────────────────────────────────
async function searchBestImage(rawName, rawBrand, rawCat) {
  const name = normalize(rawName);
  const brand = normalize(rawBrand);
  const cat = normalize(rawCat);

  const nameTokens = tokenize(name);
  const brandTokens = tokenize(brand);

  // name 안에 brand 토큰이 없으면 검색문에 브랜드를 덧붙여줌
  const needBrandAppend =
    brandTokens.length && !nameTokens.some((t) => brandTokens.includes(t));

  const baseQueries = [
    (needBrandAppend ? `${name} ${brand}` : name).trim(),
    name.trim(),
    `${brand} ${cat}`.trim(),
  ].filter(Boolean);

  const queries = [];
  for (const bq of baseQueries) {
    for (const bias of DOMAIN_BIASES) {
      queries.push(`${bq} ${bias}`.trim());
    }
  }
  queries.push(...baseQueries);

  const key = `img:${queries.join("|")}`;
  const hit = getCache(key);
  if (hit) return hit;

  let best = null;
  let all = [];
  const tokens = { name: nameTokens, brand: brandTokens };

  for (const q of queries) {
    try {
      const items = await callImageAPI(q, 10);
      const filtered = items
        .map((it) => {
          const raw = it.link || "";
          const page = looksLikeImageUrl(raw) ? null : raw;
          const img = it.link || it.thumbnail || null;
          return {
            title: stripTags(it.title || ""),
            page,
            image: img,
            sizewidth: it.sizewidth || null,
            sizeheight: it.sizeheight || null,
            link: it.link || "",
          };
        })
        .filter((it) => {
          if (!it.image) return false;
          if ((it.sizewidth || 0) < 120 || (it.sizeheight || 0) < 120) return false;
          // 브랜드가 주어졌다면 제목/URL에 브랜드 토큰이 하나라도 있어야 함
          if (brandTokens.length) {
            const hay = (it.title + " " + (it.page || "") + " " + it.link).toLowerCase();
            const ok = brandTokens.some((t) => t && hay.includes(t));
            if (!ok) return false;
          }
          return true;
        });

      filtered.forEach(
        (it) => (it._score = scoreItem(it, { name: nameTokens, brand: brandTokens }))
      );
      filtered.sort((a, b) => b._score - a._score);

      all = all.concat(filtered);
      if (filtered[0]) {
        best = filtered[0];
        break; // 충분히 좋은 결과 찾으면 빠르게 종료
      }
    } catch (e) {
      const status = e.response?.status;
      if (status === 429 || (status >= 500 && status < 600)) {
        await sleep(400);
        continue;
      } else {
        throw e;
      }
    }
  }

  if (!best && all.length) {
    all.sort((a, b) => b._score - a._score);
    best = all[0];
  }

  if (best && !best.page) {
    best.page = shoppingSearchUrl(baseQueries[0] || name);
  }

  const payload = { queries, best: best || null };
  setCache(key, payload);
  return payload;
}

// ───────────────────────────────────────────────────────────────
// API 엔드포인트
// ───────────────────────────────────────────────────────────────
app.get("/api/search", async (req, res) => {
  try {
    // 프런트에서 q 또는 query 둘 다 지원
    const q = (req.query.q || req.query.query || "").toString();
    const brand = (req.query.brand || "").toString();
    const cat = (req.query.cat || "").toString();

    if (!q && !brand) {
      return res.status(400).json({ error: "query or brand required" });
    }

    const data = await searchBestImage(q, brand, cat);
    res.json(data);
  } catch (e) {
    const status = e.response?.status || 500;
    const detail = e.response?.data || e.message;
    console.error("API error:", status, detail);
    res.status(status).json({ error: "proxy_error", status, detail });
  }
});

// ───────────────────────────────────────────────────────────────
// 서버 시작 (Render는 PORT를 환경변수로 내려줌)
// ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5173;
app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
