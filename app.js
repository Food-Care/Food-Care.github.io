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

  if (!toRender.length){
    $empty && ($empty.style.display = 'block');
    return;
  }
  $empty && ($empty.style.display = 'none');

  toRender.forEach((f, idx) => {
    const id = `card-${idx}`;
    const PLACEHOLDER =
      "data:image/svg+xml;utf8," +
      encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'>
        <rect width='100%' height='100%' fill='#e9ece6'/>
        <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
              fill='#9aa59b' font-size='16'>이미지 로딩 중…</text>
      </svg>`);

    // 경고 칩
    const cautionHitsRaw = (f._allego?.cautionMatches || []).map(m => m.hit);
    const cautionHits = [...new Set(cautionHitsRaw)];
    const hasCaution  = cautionHits.length > 0;

    // 칩: 경고 먼저, 그다음 일반 원재료(중복 제거)
    const normalIngs = (f.ings || []).filter(x => !cautionHits.includes(x));
    const ingChipsHTML = [
      ...cautionHits.map(x=>`<span class="chip chip-warn">${escapeHTML(x)}</span>`),
      ...normalIngs.map(x=>`<span class="chip">${escapeHTML(x)}</span>`)
    ].join('');

    const badgeHTML = hasCaution
      ? `<div class="badge-row">
           <img src="./assets/search/caution.png" alt="" class="badge-icon"/>
           <span class="badge-text">주의해야 할 성분이 있어요</span>
         </div>`
      : `<div class="badge-row">
           <img src="./assets/search/safe.png" alt="" class="badge-icon"/>
           <span class="badge-text safe">안전한 제품이에요</span>
         </div>`;

    const card = document.createElement('div');
    card.className = 'product-card';
    card.id = `${id}-card`;                          // ✅ 카드 id

    card.innerHTML = `
      <div class="product-row">
        <div class="thumb-wrap">
          <a id="${id}-link" class="thumb-link" href="javascript:void(0)" target="_blank" rel="noopener">
            <img id="${id}-img" class="thumb-img" alt="${escapeHTML(f.name)}" src="${PLACEHOLDER}">
          </a>
        </div>
        <div class="meta">
          <div class="meta-top">
            <div>
              <div class="title">${escapeHTML(f.name)}</div>
              <div class="brand">${escapeHTML(f.brand || '')}</div>
            </div>
            <div class="chip">${escapeHTML(f.cat || '')}</div>
          </div>

          ${badgeHTML}

          <div class="ings-scroll collapsed" id="${id}-scroll">   <!-- ✅ 스크롤 컨테이너 -->
            <div class="ings" id="${id}-ings">
              ${ingChipsHTML}
            </div>
          </div>
          <button type="button" class="btn-more-ings" data-target="${id}-ingswrap">원재료 더보기</button>
        </div>
      </div>
    `;
    $list.appendChild(card);



    // 이미지 비동기 로딩 (기존 로직)
    loadImageFor((f.name||'').trim(), f.brand, f.cat).then(best => {
      const $img = document.getElementById(`${id}-img`);
      const $a   = document.getElementById(`${id}-link`);
      if (!$img || !$a) return;
      if (best?.image) $img.src = best.image;
      if (best?.page)  { $a.href = best.page; $a.classList.remove('disabled'); }
      else             { $a.removeAttribute('href'); $a.classList.add('disabled'); }
    });

    // 접힘 필요 여부 판단 (overflow 없으면 버튼 숨김)
    requestAnimationFrame(() => {
    const scrollBox = document.getElementById(`${id}-scroll`);
    const btn = card.querySelector('.btn-more-ings');
    if (!scrollBox || !btn) return;

    // 스크롤 컨테이너가 실제 넘치는지 체크
    const needMore = scrollBox.scrollHeight > scrollBox.clientHeight + 2;
      if (!needMore) {
        scrollBox.classList.remove('collapsed');
        btn.style.display = 'none';
      } else {
        scrollBox.classList.add('collapsed');
        btn.style.display = '';
      }
    });

  });
}

$list?.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-more-ings');
  if (!btn) return;

  const cardId   = btn.getAttribute('data-card');
  const scrollId = btn.getAttribute('data-scroll');
  const card     = document.getElementById(cardId);
  const scrollEl = document.getElementById(scrollId);
  if (!card || !scrollEl) return;

  
  const expanded = wrap.classList.toggle('expanded');
  if (expanded) {
    scrollEl.classList.remove('collapsed');
    btn.textContent = '접기';
    wrap.closest('.product-card')?.classList.add('card-expanded');
  } else {
    scrollEl.classList.add('collapsed');
    btn.textContent = '원재료 더보기';
    wrap.closest('.product-card')?.classList.remove('card-expanded');
    card.scrollIntoView({ behavior:'smooth', block:'nearest' });
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
