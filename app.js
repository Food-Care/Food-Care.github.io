console.log("build=2025-10-09-02: clean");

// ✅ 한 곳에서 API 주소 관리
const API_BASE = location.hostname.includes('localhost')
  ? ''
  : 'https://food-care-github-io.onrender.com';

// ✅ 초기 6개 미리보기
const INITIAL_LIMIT = 6;

// ===== DOM =====
const $q         = document.getElementById('q');
const $searchBtn = document.getElementById('searchBtn');
const $cats      = document.getElementById('cats');
const $count     = document.getElementById('count');
const $sort      = document.getElementById('sort');
const $list      = document.getElementById('list');
const $empty     = document.getElementById('empty');

// ===== 상수 =====
const PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'>
    <rect width='100%' height='100%' fill='#e9ece6'/>
    <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#9aa59b' font-size='16'>이미지 로딩 중…</text>
  </svg>`);

// ===== 상태 =====
const imageCache = new Map();
let RAW = [];
let DATA = [];
let results = [];

// 🔁 전역 단일 상태(다른 스크립트와 공유)
window.currentCat = window.currentCat || 'all';

// 칩 이모지(필요 시 확장)
const CAT_ICONS = new Map(Object.entries({
  "어묵": "🍢", "조미김": "🟩", "숙면": "🍜", "효소식품": "🧪", "조미액젓": "🧂",
  "두류가공품": "🌱", "탁주": "🍶", "복합조미식품": "🧂", "약주": "🍶",
  "소스": "🥫", "절임식품": "🥒", "발효식초": "🍾", "과실주": "🍷"
}));

// ===== 초기화 =====
init();
async function init(){
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
      cat:   it?.카테고리 ?? '',
      ings:  Array.isArray(it?.원재료명) ? it.원재료명 : []
    }));
  }

  if ($cats) buildCategoryChips(DATA);

  apply();              // 최초 렌더
  window.apply = apply; // 외부(다른 스크립트)에서 호출 가능
}

// ===== 칩(카테고리) =====
function buildCategoryChips(items){
  if (!$cats) return; // search.html에 없으면 무시

  const cats = Array.from(new Set(items.map(x => x.cat).filter(Boolean)))
    .sort((a,b)=>a.localeCompare(b,'ko'));

  $cats.innerHTML = '';
  addChip('all', '전체', '🏠', normCat(window.currentCat) === 'all');
  cats.forEach(cat => {
    const key   = normCat(cat);   // ← 비교용 키는 정규화
    const label = cat;            // ← 화면엔 원문 라벨
    addChip(key, label, CAT_ICONS.get(cat) || '🧺', normCat(window.currentCat) === key);
  });
}

function addChip(key, label, emoji, active){
  const b = document.createElement('button');
  b.className = 'chip' + (active ? ' active' : '');
  b.dataset.key = key;
  b.innerHTML = `<span class="emoji">${emoji}</span>${escapeHTML(label)}`;

  b.addEventListener('click', () => {
    document.body.classList.remove('mode-landing'); // 랜딩 모드 해제(있을 경우)

    // 칩 UI 토글
    $cats && $cats.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
    b.classList.add('active');

    // 상태 갱신 + 검색어 초기화
    window.currentCat = key;
    if ($q) $q.value = '';

    apply();

    // 리스트 위치로 스크롤
    document.getElementById('list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $cats.appendChild(b);
}

// ===== 적용/렌더 =====
function apply(){
  const q = ($q?.value || '').trim().toLowerCase();
  let res = [...DATA];  // JSON 순서 유지

  if (q) res = res.filter(f => (f.name || '').toLowerCase().includes(q));
  if (normCat(window.currentCat) !== 'all') {
    res = res.filter(f => normCat(f.cat) === normCat(window.currentCat));
  }

  if (q || window.currentCat !== 'all') {
    switch($sort?.value){
      case 'brand': res.sort((a,b)=>(a.brand||'').localeCompare(b.brand||'','ko')); break;
      case 'name':
      default:      res.sort((a,b)=>(a.name||'').localeCompare(b.name||'','ko'));
    }
  }

  // 초기 화면은 6개만
  if (!q && window.currentCat === 'all') res = res.slice(0, 6);

  results = res;
  render();
}

function render(){
  if (!$list) return; // 리스트 없는 페이지면 종료
  $list.innerHTML = '';

  const qText = ($q?.value || '').trim();
  const isInitial = !qText && window.currentCat === 'all';
  const toRender = isInitial ? results.slice(0, INITIAL_LIMIT) : results;

  if ($count){
    $count.textContent = isInitial
      ? `총 ${results.length}개 상품 • ${INITIAL_LIMIT}개 미리보기`
      : `총 ${results.length}개 상품` + (qText ? ` • '${qText}' 검색 중` : '');
  }

  if (!toRender.length){
    $empty && ($empty.style.display = 'block');
    return;
  }
  $empty && ($empty.style.display = 'none');

  toRender.forEach((f, idx) => {
    const id = `card-${idx}`;
    const queryNameOnly = (f.name || '').trim();

    const card = document.createElement('div');
    card.className = 'product-card col-span-6';
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
          <div class="meta-bottom">
            ${(f.ings || []).slice(0,8).map(x=>`<span class="chip">${escapeHTML(x)}</span>`).join('')}
          </div>
        </div>
      </div>`;
    $list.appendChild(card);

    loadImageFor(queryNameOnly, f.brand, f.cat).then(best => {
      const $img = document.getElementById(`${id}-img`);
      const $a   = document.getElementById(`${id}-link`);
      if (!$img || !$a) return;
      if (best?.image) $img.src = best.image;
      if (best?.page)  { $a.href = best.page; $a.classList.remove('disabled'); }
      else             { $a.removeAttribute('href'); $a.classList.add('disabled'); }
    });
  });
}

// ===== 큐/스로틀 & 이미지 로더 =====
const _Q = []; let _active = 0;
function schedule(task){
  return new Promise((resolve, reject)=>{
    _Q.push({task, resolve, reject}); _drain();
  });
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

// ===== 유틸 & 이벤트 =====
function escapeHTML(s){
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[m]);
}

// 로그인 버튼 등(있을 때만 동작)
document.addEventListener('DOMContentLoaded', () => {
  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      const toLogin = location.pathname.includes('/pages/')
        ? './login.html'
        : './pages/login.html';
      window.location.href = toLogin;
    });
  }

  const btn = document.getElementById('landingBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      window.location.href = './pages/landing.html';
    });
  }
});

// 🔗 null 안전 리스너
$searchBtn && $searchBtn.addEventListener('click', apply);
$q && $q.addEventListener('keydown', (e)=>{ if(e.key==='Enter') apply(); });
$sort && $sort.addEventListener('change', apply);

// ===== 유틸 & 이벤트 =====
function normCat(s){
  return String(s || '').replace(/\s*·\s*/g, '·').trim();
}
