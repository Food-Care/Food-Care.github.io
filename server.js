import express from "express";
import axios from "axios";
import cors from "cors";
import "dotenv/config";

// 스마트스토어/네이버쇼핑 우선 탐색
const DOMAIN_BIASES = ["site:smartstore.naver.com", "site:shopping.naver.com"];

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Render에서 product.json을 서빙할 수 있게 /data 공개
app.use("/data", express.static("./data"));

// (원하면 Render에서 프런트도 띄울 수 있게 유지)
app.use(express.static("./"));

const CID = process.env.NAVER_CLIENT_ID;
const CSECRET = process.env.NAVER_CLIENT_SECRET;
if (!CID || !CSECRET) console.warn("[WARN] NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 미설정");

const CACHE_TTL = 1000 * 60 * 60 * 12;
const cache = new Map();
const getCache = (k) => {
  const v = cache.get(k);
  if (v && Date.now() - v.ts < CACHE_TTL) return v.data;
  cache.delete(k);
  return null;
};
const setCache = (k, d) => cache.set(k, { ts: Date.now(), data: d });

let lastCall = 0;
const MIN_GAP_MS = 250;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stripTags = (s = "") => s.replace(/<\/?b>/g, "");
const normalize = (s = "") =>
  s
    .replace(/[®•·∙\u00B7\(\)\[\]\{\}\/\\\+\-\–\—\|,!?'"“”‘’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function tokenize(s = "") {
  return normalize(s).toLowerCase().split(" ").filter(Boolean);
}

function scoreItem(it, tokens) {
  const title = stripTags(it.title || "");
  const tks = tokenize(title);
  let match = 0;
  tokens.forEach((t) => {
    if (t && tks.includes(t)) match += 1;
  });

  const w = Number(it.sizewidth || 0);
  const h = Number(it.sizeheight || 0);
  let s = match * 3;
  if (w >= 300 && h >= 300) s += 2;
  else if (w >= 120 && h >= 120) s += 1;

  const u = (it.link || "").toLowerCase();
  if (u.includes("shopping.naver") || u.includes("smartstore")) s += 2;
  if (u.includes("coupang") || u.includes("gmarket") || u.includes("11st")) s += 1;

  return s;
}

function looksLikeImageUrl(u = "") {
  return /\.(jpg|jpeg|png|webp|gif)(\?|#|$)/i.test(u);
}
function shoppingSearchUrl(q = "") {
  return `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(q)}`;
}

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

async function searchBestImage(rawName, rawBrand, rawCat) {
  const name = normalize(rawName);
  const brand = normalize(rawBrand);
  const cat = normalize(rawCat);

  const baseQueries = [`${name} ${brand}`.trim(), `${name}`.trim(), `${brand} ${cat}`.trim()].filter(Boolean);

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
  const tokens = tokenize(name + " " + brand);

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
          };
        })
        .filter((it) => it.image && (it.sizewidth || 0) >= 120 && (it.sizeheight || 0) >= 120);

      filtered.forEach((it) => (it._score = scoreItem(it, tokens)));
      filtered.sort((a, b) => b._score - a._score);

      all = all.concat(filtered);
      if (filtered[0]) {
        best = filtered[0];
        break;
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

app.get("/api/search", async (req, res) => {
  try {
    const q = (req.query.query || "").toString();
    const brand = (req.query.brand || "").toString();
    const cat = (req.query.cat || "").toString();

    if (!q && !brand) return res.status(400).json({ error: "query or brand required" });

    const data = await searchBestImage(q, brand, cat);
    res.json(data);
  } catch (e) {
    const status = e.response?.status || 500;
    const detail = e.response?.data || e.message;
    console.error("API error:", status, detail);
    res.status(status).json({ error: "proxy_error", status, detail });
  }
});

const PORT = process.env.PORT || 5173;
app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
