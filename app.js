console.log("build=2025-10-09-02");

// ✅ 한 곳에서 API 주소 관리
const API_BASE = location.hostname.includes('localhost')
  ? ''
  : 'https://food-care-github-io.onrender.com';

// ✅ 초기 6개 미리보기
const INITIAL_LIMIT = 6;

const $q = document.getElementById('q');
const $searchBtn = document.getElementById('searchBtn');
const $cats = document.getElementById('cats');
const $count = document.getElementById('count');
const $sort = document.getElementById('sort');
const $list = document.getElementById('list');
const $empty = document.getElementById('empty');

const PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'>
    <rect width='100%' height='100%' fill='#e9ece6'/>
    <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#9aa59b' font-size='16'>이미지 로딩 중…</text>
  </svg>`);

const imageCache = new Map();
let RAW = [];
let DATA = [];
let results = [];
let currentCat = 'all';

const CAT_ICONS = new Map(Object.entries({
  "어묵": "🍢",
  "조미김": "🟩",
  "숙면": "🍜",
  "효소식품": "🧪",
  "조미액젓": "🧂",
  "두류가공품": "🌱",
  "탁주": "🍶",
  "복합조미식품": "🧂",
  "약주": "🍶",
  "소스": "🥫",
  "절임식품": "🥒",
  "발효식초": "🍾",
  "과실주": "🍷"
}));

init();

async function init(){
  // ✅ 로컬/배포에 따라 product.json 경로 자동 결정 (캐시 버스터 포함)
  const productUrl = location.hostname.includes('localhost')
    ? 'data/product.json?v=20251009'
    : `${API_BASE}/data/product.json?v=20251009`;

  const res = await fetch(productUrl, { cache: 'no-store' });
  if (!res.ok) {
    console.error('product.json load failed:', res.status, productUrl);
    RAW = []; DATA = [];
  } else {
    RAW = await res.json();
    DATA = RAW.map(it => ({
      name: it?.제품명 ?? '',
      brand: it?.회사명 ?? '',
      cat: it?.카테고리 ?? '',
      ings: Array.isArray(it?.원재료명) ? it.원재료명 : []
    }));
  }

  buildCategoryChips(DATA);
  apply();
}

function buildCategoryChips(items){
  const cats = Array.from(new Set(items.map(x => x.cat).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'ko'));
  $cats.innerHTML = '';
  addChip('all', '전체', '🏠', true);
  cats.forEach(cat => addChip(cat, cat, CAT_ICONS.get(cat) || '🧺', false));
}

function addChip(key, label, emoji, active){
  const b = document.createElement('button');
  b.className = 'chip' + (active ? ' active' : '');
  b.dataset.key = key;
  b.innerHTML = `<span class="emoji">${emoji}</span>${escapeHTML(label)}`;
  b.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    currentCat = key;
    apply();
  });
  $cats.appendChild(b);
}

function normalizeText(s){ return (s || '').toLowerCase(); }

function apply(){
  const q = $q.value.trim().toLowerCase();
  let res = [...DATA];  // JSON 순서 유지

  if (q) {
    res = res.filter(f => (f.name || '').toLowerCase().includes(q));
  }

  if (currentCat !== 'all') {
    res = res.filter(f => f.cat === currentCat);
  }

  if (q || currentCat !== 'all') {
    switch($sort.value){
      case 'brand': res.sort((a,b)=>(a.brand||'').localeCompare(b.brand||'','ko')); break;
      case 'name':
      default:      res.sort((a,b)=>(a.name||'').localeCompare(b.name||'','ko'));
    }
  }

  // ✅ 아무 검색·카테고리도 없을 때 → JSON 원본 순서 앞의 6개만
  if (!q && currentCat === 'all') {
    res = res.slice(0, 6);
  }

  results = res;
  render();
}



function render(){
  $list.innerHTML = '';
  const qText = $q.value.trim();
  const isInitial = !qText && currentCat === 'all';

  const toRender = isInitial ? results.slice(0, INITIAL_LIMIT) : results;

  if (isInitial) {
    $count.textContent = `총 ${results.length}개 상품 • ${INITIAL_LIMIT}개 미리보기`;
  } else {
    $count.textContent = `총 ${results.length}개 상품` + (qText ? ` • '${qText}' 검색 중` : '');
  }

  if (!toRender.length) {
    $empty.style.display = 'block';
    return;
  }
  $empty.style.display = 'none';

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
      if (best?.image) $img.src = best.image;
      if (best?.page) { $a.href = best.page; $a.classList.remove("disabled"); }
      else { $a.removeAttribute("href"); $a.classList.add("disabled"); }
    });
  });
}

// ===== 큐/스로틀 & 이미지 로더 (중복 제거 버전) =====
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
  task()
    .then(resolve)
    .catch(reject)
    .finally(()=>{
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


const delay = (ms)=>new Promise(r=>setTimeout(r, ms));
function escapeHTML(s){
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[m]);
}

// 로그인 버튼 및 모달 제어
const $loginBtn = document.getElementById('loginBtn');
const $loginModal = document.getElementById('loginModal');
const $closeModal = document.getElementById('closeModal');

document.addEventListener('DOMContentLoaded', () => {
  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      console.log("로그인 버튼 클릭됨");
      window.location.href = './pages/login.html';
    });
  }
});


$searchBtn.addEventListener('click', apply);
$q.addEventListener('keydown', (e)=>{ if(e.key==='Enter') apply(); });
$sort.addEventListener('change', apply);
