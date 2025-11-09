console.log("build=2025-10-09-03: fix search logic & remove 6-preview");

/* =================================================================== */
/* 0) API BASE                                                         */
/* =================================================================== */
const API_BASE = location.hostname.includes('localhost')
  ? ''
  : 'https://food-care-github-io.onrender.com';

/* =================================================================== */
/* 1) Allergy rules & matcher                                           */
/* =================================================================== */

/** Allergy.json 경로 */
const ALLERGY_URL = location.hostname.includes('localhost')
  ? '/data/Allergy.json?v=20251009'
  : `${API_BASE}/data/Allergy.json?v=20251009`;

/** 코드 → Allergy.json 키 매핑 (모달의 data-code 기준) */
const CODE_TO_RULEKEY = {
  egg: "난류(계란)",
  milk: "우유",
  buckwheat: "메밀",
  peanut: "땅콩",
  wheat: "밀",
  soybean: "대두",
  mackerel: "고등어",
  crab: "게",
  shrimp: "새우",
  pork: "돼지고기",
  tomato: "토마토",
  peach: "복숭아",
  alcohols: "아황산류",
  walnut: "호두",
  chicken: "닭고기",
  beef: "쇠고기",
  squid: "오징어",
  shellfish: "조개류",
  "nut-pine": "잣",
  barley: "보리",     // HTML 버튼이 '보리' 라벨이므로 보리로 매핑
  // rye: "호밀",     // 호밀 버튼이 생기면 사용
};

/** 전역 룰 로딩 버퍼 */
let ALLERGY_RULES = null;

/** 저장된 사용자 알레르기 읽기 (AllergyStore 사용) */
function getUserAllergies() {
  try {
    if (typeof AllergyStore === 'undefined' || !AllergyStore?.load) return [];  // ← 추가
    const s = AllergyStore.load();
    return Array.isArray(s?.items) ? s.items : [];
  } catch { return []; }
}

/** 텍스트 정규화 */
function norm(s='') {
  return String(s).replace(/\u00A0/g, ' ').trim();
}
function normLower(s='') { return norm(s).toLowerCase(); }

/** 원재료 배열 → 검사용 토큰 세트(소문자) */
function toTokens(ings=[]) {
  const tokens = new Set();
  for (const raw of ings) {
    const a = norm(raw);
    if (!a) continue;
    tokens.add(normLower(a));
    // 쉼표/슬래시/점/중점/괄호/공백 등으로 분할 토큰 추가
    a.split(/[,/·()|\[\]\-+*·.]/).forEach(t=>{
      const tt = normLower(t);
      if (tt) tokens.add(tt);
    });
  }
  return tokens;
}

/** 부분 포함: 문자열 포함 여부 */
function containsAnySubstring(ings=[], needles=[]) {
  const joined = (ings||[]).map(x=>normLower(x));
  for (const n of (needles||[])) {
    const nn = normLower(n);
    if (!nn) continue;
    if (joined.some(s => s.includes(nn))) return {hit: n};
  }
  return null;
}

/** exact_match: 토큰 완전일치 */
function matchesAnyToken(tokenSet, list=[]) {
  for (const w of (list||[])) {
    const ww = normLower(w);
    if (ww && tokenSet.has(ww)) return {hit: w};
  }
  return null;
}

/** prefix/suffix + exclusions */
function matchPrefixSuffix(ings=[], {prefix=[], suffix=[], prefix_exclusions=[], suffix_exclusions=[]}={}) {
  const LIST = (ings||[]).map(x=>norm(x));
  const lower = LIST.map(x=>x.toLowerCase());

  // prefix
  for (const p of (prefix||[])) {
    const pp = normLower(p);
    if (!pp) continue;
    for (let i=0;i<lower.length;i++){
      if (lower[i].startsWith(pp)) {
        const original = LIST[i];
        if ((prefix_exclusions||[]).some(ex => original.includes(ex))) continue;
        return {type:'prefix', term:p, hit:original};
      }
    }
  }
  // suffix
  for (const s of (suffix||[])) {
    const ss = normLower(s);
    if (!ss) continue;
    for (let i=0;i<lower.length;i++){
      if (lower[i].endsWith(ss)) {
        const original = LIST[i];
        if ((suffix_exclusions||[]).some(ex => original.includes(ex))) continue;
        return {type:'suffix', term:s, hit:original};
      }
    }
  }
  return null;
}

/** 한 알레르기 규칙으로 제품 원재료 판정 */
function evalOneAllergy(ings=[], ruleKey, rules) {
  const rule = rules?.[ruleKey];
  if (!rule) return {danger:null, caution:null};

  const { danger={}, caution={}, exclusions=[] } = rule;

  // exclusions: 예외 단어가 포함되면(해당 알레르기에 한해) 안전 처리
  if (Array.isArray(exclusions) && exclusions.length) {
    const ex = containsAnySubstring(ings, exclusions);
    if (ex) return {danger:null, caution:null, excludedByExclusion:true};
  }

  const tokens = toTokens(ings);

  // DANGER
  const d_exact = matchesAnyToken(tokens, danger.exact_match);
  if (d_exact) return {danger:{by:'exact_match', term:danger.exact_match, hit:d_exact.hit}, caution:null};

  const d_ps = matchPrefixSuffix(ings, danger);
  if (d_ps) return {danger:{by:d_ps.type, term:d_ps.term, hit:d_ps.hit}, caution:null};

  const d_list = containsAnySubstring(ings, danger.list);
  if (d_list) return {danger:{by:'list', term:d_list.hit, hit:d_list.hit}, caution:null};

  // CAUTION
  const c_exact = matchesAnyToken(tokens, caution.exact_match);
  if (c_exact) return {danger:null, caution:{by:'exact_match', term:caution.exact_match, hit:c_exact.hit}};

  const c_ps = matchPrefixSuffix(ings, caution);
  if (c_ps) return {danger:null, caution:{by:c_ps.type, term:c_ps.term, hit:c_ps.hit}};

  const c_list = containsAnySubstring(ings, caution.list);
  if (c_list) return {danger:null, caution:{by:'list', term:c_list.hit, hit:c_list.hit}};

  return {danger:null, caution:null};
}

/** 선택된 모든 알레르기에 대해 종합 판정
 *  - 사용자가 severity= 'danger' → danger 매칭 시 제외
 *  - severity= 'caution' → danger 매칭도 경고로 강등(제외 안 함)
 */
function evaluateAllergies(ings=[], userAllergies=[], rules) {
  const out = { excluded:false, dangerMatches:[], cautionMatches:[] };

  for (const it of (userAllergies||[])) {
    const key = CODE_TO_RULEKEY[it.code] || it.label || it.code;
    const severity = (it.severity === 'caution') ? 'caution' : 'danger';
    const r = evalOneAllergy(ings, key, rules);

    if (r?.excludedByExclusion) continue;

    if (severity === 'danger') {
      if (r?.danger) {
        out.excluded = true;
        out.dangerMatches.push({allergy:key, ...r.danger});
        continue;
      }
      if (r?.caution) out.cautionMatches.push({allergy:key, ...r.caution});
    } else {
      if (r?.danger) { // 강등
        out.cautionMatches.push({allergy:key, ...r.danger, downgraded:true});
        continue;
      }
      if (r?.caution) out.cautionMatches.push({allergy:key, ...r.caution});
    }
  }
  return out;
}

/* =================================================================== */
/* 2) 제품 데이터 로딩 & 검색                                           */
/* =================================================================== */

// ===== DOM =====
const $q     = document.getElementById('q');
const $count = document.getElementById('count');
const $sort  = document.getElementById('sort');
const $list  = document.getElementById('list');
const $empty = document.getElementById('empty');

// ===== 상태 =====
const imageCache = new Map();
let RAW = [];
let DATA = [];
let results = [];

window.currentCat = window.currentCat || 'all';
window.categorySelected = window.categorySelected || false;

// ===== 카테고리 정규화 및 매핑 =====
function canonCat(s=''){
  return String(s)
    .trim()
    .replace(/,/g, '·')
    .replace(/\s*·\s*/g, '·')
    .replace(/·{2,}/g, '·')
    .replace(/\s+/g, '');
}

function mapCategory(raw){
  const key = canonCat(raw || '');
  const table = {
    '가공육': '가공육',
    '간편식': '간편식',
    '기타': '기타',
    '농수산가공품': '농수산품',
    '라면·면류': '라면 · 면류',
    '빵·간식류': '빵 · 간식류',
    '소스·양념·기름류': '소스 · 양념',
    '유제품': '유제품',
    '음료·주류': '음료 · 주류',
    '절임류': '절임류',
  };
  return table[key] || table[key.replace(/,/g,'·')] || '기타';
}

// ===== 초기화 =====
init();
async function init(){
  // Allergy.json 로드
  try {
    const r2 = await fetch(ALLERGY_URL, { cache: 'no-store' });
    ALLERGY_RULES = r2.ok ? await r2.json() : null;
  } catch(e) {
    console.warn('Allergy.json load failed', e);
    ALLERGY_RULES = null;
  }

  // product.json 로드
  const productUrl = location.hostname.includes('localhost')
    ? '/data/product.json?v=20251009'
    : `${API_BASE}/data/product.json?v=20251009`;

  const res = await fetch(productUrl, { cache: 'no-store' });
  if (!res.ok) {
    console.error('product.json load failed:', res.status, productUrl);
    RAW = []; DATA = [];
  } else {
    RAW = await res.json();
    DATA = RAW.map(it => ({
      name:  it?.제품명 ?? '',
      brand: it?.회사명 ?? '',
      cat:   mapCategory(it?.대분류카테고리 ?? it?.카테고리 ?? ''),
      ings:  Array.isArray(it?.원재료명) ? it.원재료명 : []
    }));
  }

  apply();
  window.apply = apply; // 외부에서 호출 가능
}

function apply(){
  const qRaw = ($q?.value || '').trim();
  const q = qRaw.toLowerCase();
  const cat = canonCat(window.currentCat || 'all');

  let res = [...DATA];

  // 1) 검색어 없으면 결과 비움
  if (!q) {
    results = [];
    return render();
  }

  // 2) 제품명/회사명 포함
  res = res.filter(f =>
    (f.name  || '').toLowerCase().includes(q) ||
    (f.brand || '').toLowerCase().includes(q)
  );

  // 3) 카테고리 필터
  if (cat !== 'all') {
    res = res.filter(f => canonCat(f.cat) === cat);
  }

  // 4) 정렬
  switch($sort?.value){
    case 'brand': res.sort((a,b)=>(a.brand||'').localeCompare(b.brand||'','ko')); break;
    default:      res.sort((a,b)=>(a.name||'').localeCompare(b.name||'','ko'));
  }

  // 5) 알레르기 룰 적용: danger 제외, caution 표시
  const userAll = getUserAllergies();
  const rules = ALLERGY_RULES;

  const decorated = res.map(item => {
    const check = (rules && userAll.length)
      ? evaluateAllergies(item.ings, userAll, rules)
      : { excluded:false, dangerMatches:[], cautionMatches:[] };
    return { ...item, _allego: check };
  });

  // danger 매칭 제품 제외
  const filtered = decorated.filter(x => !x._allego.excluded);

  results = filtered;
  render();
}

/* =================================================================== */
/* 3) 렌더링                                                             */
/* =================================================================== */
function render(){
  if (!$list) return;
  $list.innerHTML = '';

  const qText = ($q?.value || '').trim();
  const toRender = results;

  if ($count){
    $count.textContent = `총 ${toRender.length}개 상품` + (qText ? ` • '${qText}' 검색 중` : '');
  }
  if (!toRender.length){ $empty && ($empty.style.display = 'block'); return; }
  $empty && ($empty.style.display = 'none');

  toRender.forEach((f, idx) => {
    const id = `card-${idx}`;
    const PLACEHOLDER =
      "data:image/svg+xml;utf8," +
      encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'>
        <rect width='100%' height='100%' fill='#f3f4f6'/>
        <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
              fill='#9aa59b' font-size='14'>이미지 로딩 중…</text>
      </svg>`);

    // 경고칩(노랑) & 일반칩(회색)
    const warnHits = [...new Set((f._allego?.cautionMatches || []).map(m => m.hit))];
    const hasCaution = warnHits.length > 0;
    const normalIngs = (f.ings || []).filter(x => !warnHits.includes(x)).slice(0,3);

    const chipsHTML = [
      ...warnHits.map(x => `<span class="chip chip-warn">${escapeHTML(x)}</span>`),
      ...normalIngs.map(x => `<span class="chip">${escapeHTML(x)}</span>`),
    ].join('');

    const badgeHTML = hasCaution
      ? `<div class="p-badge caution"><img src="./assets/search/caution.png" alt=""><span>주의해야 할 성분이 있어요</span></div>`
      : `<div class="p-badge safe"><img src="./assets/search/safe.png" alt=""><span>안전한 제품이에요</span></div>`;

    const card = document.createElement('div');
    card.className = 'product-card new-style';
    card.id = `${id}-card`;
    card.setAttribute('role','button');
    card.setAttribute('tabindex','0');

    card.innerHTML = `
      <div class="p-all">
        <div class="p-thumb">
          <img id="${id}-img" alt="${escapeHTML(f.name)}" src="${PLACEHOLDER}">
        </div>
        <div class="p-body">
          <div class="p-title">${escapeHTML(f.name)}</div>
          ${badgeHTML}
          <div class="p-chips">${chipsHTML}</div>
        </div>
      </div>
    `;

    const goDetail = () => {
      const key = `${f.name}@@${f.brand}@@${f.cat}`;
      const best = imageCache.get(key);

      const payload = {
        name:  f.name,
        brand: f.brand,
        cat:   f.cat,
        ings:  f.ings,
        image: best?.image || undefined,
        page:  best?.page  || undefined
      };
      try { sessionStorage.setItem('allego:selected', JSON.stringify(payload)); } catch {}

      const url = `./pages/product.html?name=${encodeURIComponent(f.name)}&brand=${encodeURIComponent(f.brand||'')}&cat=${encodeURIComponent(f.cat||'')}`;
      location.href = url;
    };
    card.addEventListener('click', goDetail);
    card.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){ e.preventDefault(); goDetail(); } });

    $list.appendChild(card);

    loadImageFor((f.name||'').trim(), f.brand, f.cat).then(best => {
      const $img = document.getElementById(`${id}-img`);
      if ($img && best?.image) $img.src = best.image;
    });
  });
}




$list?.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-more-ings');
  if (!btn) return;

  const cardId   = btn.dataset.card;
  const scrollId = btn.dataset.scroll;
  const card     = document.getElementById(cardId);
  const scrollEl = document.getElementById(scrollId);
  if (!card || !scrollEl) return;

  const expanded = !scrollEl.classList.contains('collapsed');
  if (expanded) {
    // 접기
    scrollEl.classList.add('collapsed');
    btn.textContent = '원재료 더보기';
    card.classList.remove('card-expanded');
    card.scrollIntoView({ behavior:'smooth', block:'nearest' });
  } else {
    // 펼치기
    scrollEl.classList.remove('collapsed');
    btn.textContent = '접기';
    card.classList.add('card-expanded');
  }
});




/* =================================================================== */
/* 4) 이미지 로더                                                        */
/* =================================================================== */
const _Q = []; let _active = 0;
function schedule(task){
  return new Promise((resolve, reject)=>{ _Q.push({task, resolve, reject}); _drain(); });
}
function _drain(){
  if (_active >= 3 || _Q.length === 0) return;
  const {task, resolve, reject} = _Q.shift();
  _active++;
  task().then(resolve).catch(reject).finally(()=>{
    _active--;
    setTimeout(_drain, 120);
  });
}
async function loadImageFor(name, brand='', cat=''){
  const key = `${name}@@${brand}@@${cat}`;
  if (imageCache.has(key)) return imageCache.get(key);

  return schedule(async () => {
    const url = `${API_BASE}/api/search?query=${encodeURIComponent(name)}&cat=${encodeURIComponent(cat)}`;
    const r = await fetch(url, { cache: 'no-store' });
    const data = await r.json().catch(()=>null);
    const best = data?.best || null;
    imageCache.set(key, best);
    return best;
  });
}

/* =================================================================== */
/* 5) 유틸 & 이벤트                                                      */
/* =================================================================== */
function escapeHTML(s){
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[m]);
}

// 정렬 변경 시 즉시 반영
$sort && $sort.addEventListener('change', apply);
(async function () {
  // 1) sessionStorage에서 선택 상품 불러오기
  let item = null;
  try {
    const raw = sessionStorage.getItem('allego:selected');
    if (raw) item = JSON.parse(raw);
  } catch {}

  // 2) 직링크 fallback: ?name=&brand=&cat= 로 들어오면 product.json에서 찾기
  if (!item) {
    const params = new URLSearchParams(location.search);
    const name  = params.get('name');
    const brand = params.get('brand');
    const cat   = params.get('cat');

    if (name) {
      const productUrl = location.hostname.includes('localhost')
        ? '/data/product.json?v=20251009'
        : `${API_BASE}/data/product.json?v=20251009`;

      try {
        const res = await fetch(productUrl, { cache: 'no-store' });
        const RAW = res.ok ? await res.json() : [];                             
        const DATA = RAW.map(it => ({
          name:  it?.제품명 ?? '',
          brand: it?.회사명 ?? '',
          cat:   mapCategory(it?.대분류카테고리 ?? it?.카테고리 ?? ''),
          ings:  Array.isArray(it?.원재료명) ? it.원재료명 : []
        }));
        item = DATA.find(x =>
          x.name === name &&
          (!brand || x.brand === brand) &&
          (!cat || x.cat === cat)
        ) || null;
      } catch {}
    }
  }


  // 4) 타이틀/브랜드/칩 렌더
  document.getElementById('p-title').textContent = item.name || '';
  document.getElementById('p-brand').textContent = item.brand || '';
  document.getElementById('p-chips').innerHTML = (item.ings || [])
    .slice(0, 12)  // 상세에선 넉넉히
    .map(x => `<span class="ing-chip">${escapeHTML(x)}</span>`)
    .join('');

  // 5) 이미지 표시 (넘겨받았으면 즉시, 아니면 검색)
  const imgEl = document.getElementById('p-image');
  if (item.image) {
    imgEl.src = item.image;
    imgEl.alt = item.name;
  } else {
    try {
      const best = await loadImageFor(item.name, item.brand, item.cat);
      if (best?.image) {
        imgEl.src = best.image;
        imgEl.alt = item.name;
      }
    } catch {}
  }

  // 6) 배지(주의/안전) — 사용자 알레르기/룰 재평가
  try {
    if (!ALLERGY_RULES) {
      const r2 = await fetch(ALLERGY_URL, { cache: 'no-store' });
      ALLERGY_RULES = r2.ok ? await r2.json() : null;
    }
    const userAll = getUserAllergies();
    const chk = (ALLERGY_RULES && userAll.length)
      ? evaluateAllergies(item.ings, userAll, ALLERGY_RULES)
      : { excluded:false, cautionMatches:[] };

    const badge = document.getElementById('p-badge');
    if (chk.cautionMatches?.length) {
      badge.innerHTML = `
        <img src="../assets/search/caution.png" alt="" class="badge-icon">
        <span class="badge-text">주의해야 할 성분이 있어요</span>
      `;
    } else {
      badge.innerHTML = `
        <img src="../assets/search/safe.png" alt="" class="badge-icon">
        <span class="badge-text safe">안전한 제품이에요</span>
      `;
    }
    badge.style.display = '';
  } catch {}
})();

(async function () {
  // ── 0) 공용 유틸
  const esc = s => String(s).replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  // ── 1) 선택된 상품 가져오기 (sessionStorage 우선 → URL fallback)
  let item = null;
  try { item = JSON.parse(sessionStorage.getItem('allego:selected') || 'null'); } catch {}

  if (!item) {
    const params = new URLSearchParams(location.search);
    const name  = params.get('name');
    const brand = params.get('brand');
    const cat   = params.get('cat');

    if (name) {
      const productUrl = location.hostname.includes('localhost')
        ? '/data/product.json?v=20251009'
        : `${API_BASE}/data/product.json?v=20251009`;

      try {
        const res = await fetch(productUrl, { cache: 'no-store' });
        const RAW = res.ok ? await res.json() : [];
        const DATA = RAW.map(it => ({
          name:  it?.제품명 ?? '',
          brand: it?.회사명 ?? '',
          cat:   (function mapCategory(raw){
            const key = String(raw || '').trim().replace(/,/g,'·').replace(/\s*·\s*/g,'·').replace(/·{2,}/g,'·').replace(/\s+/g,'');
            const table = {
              '가공육':'가공육','간편식':'간편식','기타':'기타','농수산가공품':'농수산품',
              '라면·면류':'라면 · 면류','빵·간식류':'빵 · 간식류','소스·양념·기름류':'소스 · 양념',
              '유제품':'유제품','음료·주류':'음료 · 주류','절임류':'절임류'
            };
            return table[key] || '기타';
          })(it?.대분류카테고리 ?? it?.카테고리 ?? ''),
          ings:  Array.isArray(it?.원재료명) ? it.원재료명 : []
        }));
        item = DATA.find(x =>
          x.name === name && (!brand || x.brand === brand) && (!cat || x.cat === cat)
        ) || null;
      } catch {}
    }
  }


  // ── 2) 타이틀/브랜드/카테고리
  document.getElementById('p-title').textContent = item.name || '';
  document.getElementById('p-brand').textContent = item.brand || '';
  document.getElementById('p-cat').textContent   = item.cat || '';

  // ── 3) 이미지 (넘겨받은 이미지가 있으면 사용, 없으면 검색)
  let sourcePage = null;
  const imgEl = document.getElementById('p-image');
  if (item.image) {
    imgEl.src = item.image; imgEl.alt = item.name;
  } else {
    try {
      const best = await loadImageFor(item.name, item.brand, item.cat);
      if (best?.image) imgEl.src = best.image;
      imgEl.alt = item.name;
      if (best?.page) sourcePage = best.page;
    } catch {}
  }
  // 원문 링크 표시
  if (sourcePage) {
    const a = document.getElementById('p-source');
    a.href = sourcePage;
    a.style.display = '';
  }

  // ── 4) 알레르기 룰 로드 및 평가 → 배지 & 주의 칩
  try {
    if (!ALLERGY_RULES) {
      const r2 = await fetch(ALLERGY_URL, { cache: 'no-store' });
      ALLERGY_RULES = r2.ok ? await r2.json() : null;
    }
    const userAll = getUserAllergies();
    const evalRes = (ALLERGY_RULES && userAll.length)
      ? evaluateAllergies(item.ings, userAll, ALLERGY_RULES)
      : {excluded:false, cautionMatches:[]};

    // 배지
    const badge = document.getElementById('p-badge');
    if (evalRes.cautionMatches?.length) {
      badge.innerHTML = `
        <img src="../assets/search/caution.png" alt="" class="badge-icon">
        <span class="badge-text">주의해야 할 성분이 있어요</span>
      `;
    } else {
      badge.innerHTML = `
        <img src="../assets/search/safe.png" alt="" class="badge-icon">
        <span class="badge-text safe">안전한 제품이에요</span>
      `;
    }
    badge.style.display = '';

    // 주의 성분(중복 제거)
    const warnHits = [...new Set((evalRes.cautionMatches || []).map(m => String(m.hit)))];
    if (warnHits.length) {
      document.getElementById('p-warn-chips').innerHTML =
        warnHits.map(h => `<span class="ing-chip ing-chip--warn">${esc(h)}</span>`).join('');
      document.getElementById('p-warn-card').style.display = '';
    }
  } catch {}

  // ── 5) 전체 원재료: 경고 하이라이트 + 펼침/접힘
  const chipsWrap = document.getElementById('p-all-chips');
  const toggleBtn = document.getElementById('p-toggle');

  // 경고 매칭 세트 (소문자 포함 판단)
  const cautionSet = new Set(
    ((window.ALLERGY_RULES && getUserAllergies().length)
      ? (window.evaluateAllergies(item.ings, getUserAllergies(), window.ALLERGY_RULES).cautionMatches || [])
      : []
    ).map(m => String(m.hit).toLowerCase())
  );

  const isWarn = ing => {
    const low = String(ing).toLowerCase();
    for (const h of cautionSet) { if (h && low.includes(h)) return true; }
    return false;
  };

  const ALL = item.ings || [];
  const LIMIT = 24;  // 접힘일 때 표시 개수
  let expanded = false;

  function renderAll() {
    const slice = expanded ? ALL : ALL.slice(0, LIMIT);
    chipsWrap.innerHTML = slice.map(x =>
      `<span class="ing-chip ${isWarn(x) ? 'ing-chip--warn' : ''}">${esc(x)}</span>`
    ).join('');
    if (ALL.length <= LIMIT) {
      toggleBtn.style.display = 'none';
    } else {
      toggleBtn.style.display = '';
      toggleBtn.textContent = expanded ? '접기' : '모두 펼치기';
    }
  }
  toggleBtn.addEventListener('click', () => { expanded = !expanded; renderAll(); });
  renderAll();
})();