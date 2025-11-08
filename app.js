console.log("build=2025-10-09-03: fix search logic & remove 6-preview");

// ✅ 한 곳에서 API 주소 관리
const API_BASE = location.hostname.includes('localhost')
  ? ''
  : 'https://food-care-github-io.onrender.com';

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
  // 쉼표 → 가운데점 버전도 매칭
  return table[key] || table[key.replace(/,/g,'·')] || '기타';
}

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
      cat:   mapCategory(it?.대분류카테고리 ?? it?.카테고리 ?? ''),
      ings:  Array.isArray(it?.원재료명) ? it.원재료명 : []
    }));
  }

  apply();
  window.apply = apply; // 외부 접근용
}

function apply(){
  const qRaw = ($q?.value || '').trim();
  const q = qRaw.toLowerCase();
  const cat = canonCat(window.currentCat || 'all');

  let res = [...DATA];

  // 1️⃣ 검색어가 없으면 → 무조건 결과 비움
  if (!q) {
    results = [];
    return render();
  }

  // 2️⃣ 검색어가 있을 때: 제품명 또는 회사명 포함 필터
  res = res.filter(f =>
    (f.name  || '').toLowerCase().includes(q) ||
    (f.brand || '').toLowerCase().includes(q)
  );

  // 3️⃣ 카테고리 필터 (all 제외)
  if (cat !== 'all') {
    res = res.filter(f => canonCat(f.cat) === cat);
  }

  // 4️⃣ 정렬
  switch($sort?.value){
    case 'brand': res.sort((a,b)=>(a.brand||'').localeCompare(b.brand||'','ko')); break;
    default:      res.sort((a,b)=>(a.name||'').localeCompare(b.name||'','ko'));
  }

  results = res;
  render();
}


function render(){
  if (!$list) return;
  $list.innerHTML = '';

  const qText = ($q?.value || '').trim();
  const catKey = canonCat(window.currentCat || 'all');
  const toRender = results;

  if ($count){
    $count.textContent = `총 ${toRender.length}개 상품` +
      (qText ? ` • '${qText}' 검색 중` : '');
  }

  if (!toRender.length){
    $empty && ($empty.style.display = 'block');
    return;
  }
  $empty && ($empty.style.display = 'none');

  toRender.forEach((f, idx) => {
    const id = `card-${idx}`;
    const queryNameOnly = (f.name || '').trim();
    const PLACEHOLDER =
      "data:image/svg+xml;utf8," +
      encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'>
        <rect width='100%' height='100%' fill='#e9ece6'/>
        <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
              fill='#9aa59b' font-size='16'>이미지 로딩 중…</text>
      </svg>`);

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

// ===== 이미지 로더 =====
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

// ===== 유틸 =====
function escapeHTML(s){
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[m]);
}

// ===== 정렬 변경 시 즉시 반영 =====
$sort && $sort.addEventListener('change', apply);
