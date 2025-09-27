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

const imageCache = new Map(); // query → {image, link}
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
  const res = await fetch('data/product.json', { cache: 'no-store' });
  RAW = await res.json();
  DATA = RAW.map(it => ({
    name: it?.제품명 ?? '',
    brand: it?.회사명 ?? '',
    cat: it?.카테고리 ?? '',
    ings: Array.isArray(it?.원재료명) ? it.원재료명 : []
  }));

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

function apply(){
  const q = $q.value.trim().toLowerCase();
  let res = [...DATA];

  if (q) {
    res = res.filter(f => {
      const inName = (f.name||'').toLowerCase().includes(q);
      const inBrand = (f.brand||'').toLowerCase().includes(q);
      const inIngs = (f.ings||[]).some(s => (s||'').toLowerCase().includes(q));
      return inName || inBrand || inIngs;
    });
  }

  if (currentCat !== 'all') {
    res = res.filter(f => f.cat === currentCat);
  }

  switch($sort.value){
    case 'brand': res.sort((a,b)=>(a.brand||'').localeCompare(b.brand||'','ko')); break;
    case 'name':
    default:      res.sort((a,b)=>(a.name||'').localeCompare(b.name||'','ko'));
  }

  results = res;
  render();
}

function render(){
  $list.innerHTML = '';
  const qText = $q.value.trim();
  $count.textContent = `총 ${results.length}개 상품` + (qText ? ` • '${qText}' 검색 중` : '');

  if (!results.length) {
    $empty.style.display = 'block';
    return;
  }
  $empty.style.display = 'none';

  results.forEach((f, idx) => {
    const id = `card-${idx}`;
    const query = `${f.name} ${f.brand}`.trim();

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
      </div>
    `;
    $list.appendChild(card);

    loadImageFor(query, f.brand, f.cat).then(best => {
    const $img = document.getElementById(`${id}-img`);
    const $a   = document.getElementById(`${id}-link`);

    if (best?.image) $img.src = best.image;

    if (best?.page) {
        $a.href = best.page;
        $a.classList.remove("disabled");
    } else {
        $a.removeAttribute("href");
        $a.classList.add("disabled");
    }
    });
  });
}

const MAX_CONCURRENCY = 3;
let inflight = 0;
const queue = [];

function schedule(task) {
  return new Promise((resolve) => {
    const run = async () => {
      inflight++;
      try { resolve(await task()); }
      finally { inflight--; pump(); }
    };
    queue.push(run);
    pump();
  });
}
function pump() {
  while (inflight < MAX_CONCURRENCY && queue.length) {
    const fn = queue.shift();
    fn();
  }
}

async function loadImageFor(name, brand='', cat='') {
  const key = `${name}@@${brand}@@${cat}`;
  if (imageCache.has(key)) return imageCache.get(key);

  return schedule(async () => {
    try {
      const url = `/api/search?query=${encodeURIComponent(name)}&brand=${encodeURIComponent(brand)}&cat=${encodeURIComponent(cat)}`;
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const best = data?.best || null;
      imageCache.set(key, best);
      await delay(120);
      return best;
    } catch (e) {
      console.warn("이미지 로드 실패:", name, e.message);
      const fallback = null;
      imageCache.set(key, fallback);
      return fallback;
    }
  });
}


async function loadImageFor(query, brand=''){
  const key = `${query}@@${brand}`;
  if (imageCache.has(key)) return imageCache.get(key);
  try{
    const url = `/api/search?query=${encodeURIComponent(query)}&brand=${encodeURIComponent(brand)}&display=5`;
    const r = await fetch(url, { cache: "no-store" });
    const data = await r.json();
    const best = data?.best || null;
    imageCache.set(key, best);
    await delay(200);
    return best;
  }catch(e){
    console.warn("이미지 로드 실패:", query, e);
    const fallback = null;
    imageCache.set(key, fallback);
    return fallback;
  }
}

const delay = (ms)=>new Promise(r=>setTimeout(r, ms));

function escapeHTML(s){
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[m]);
}

$searchBtn.addEventListener('click', apply);
$q.addEventListener('keydown', (e)=>{ if(e.key==='Enter') apply(); });
$sort.addEventListener('change', apply);
