console.log("build=2025-10-09-02");

const API_BASE = location.hostname.includes('localhost')
  ? '' // 백엔드가 같은 오리진이면 '' 유지
  : 'https://food-care-github-io.onrender.com'; // Render 백엔드 URL

// -------------------- 페이지 공통: 버튼 네비게이션 --------------------
document.addEventListener('DOMContentLoaded', () => {
  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      window.location.href = './pages/login.html';
    });
  }

  const landingBtn = document.getElementById('landingBtn');
  if (landingBtn) {
    landingBtn.addEventListener('click', () => {
      window.location.href = './pages/landing.html';
    });
  }

  // 검색 UI 유무로 페이지 구분
  const isSearchPage = !!document.getElementById('list'); // 검색 목록 영역이 있으면 검색 페이지
  if (isSearchPage) {
    setupSearchPage();
  }
});

// -------------------- 검색 페이지 전용 로직 --------------------
function setupSearchPage(){
  // 필요한 엘리먼트들 안전하게 다시 조회
  const $q      = document.getElementById('q');
  const $btn    = document.getElementById('searchBtn');
  const $cats   = document.getElementById('cats');
  const $count  = document.getElementById('count');
  const $sort   = document.getElementById('sort');
  const $list   = document.getElementById('list');
  const $empty  = document.getElementById('empty');

  // 필수 요소 없으면 그냥 종료 (디자인 바뀐 경우 대비)
  if (!$q || !$btn || !$cats || !$count || !$sort || !$list || !$empty) {
    console.warn('[search] required elements not found. abort init.');
    return;
  }

  const INITIAL_LIMIT = 6;
  const PLACEHOLDER =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'>
      <rect width='100%' height='100%' fill='#e9ece6'/>
      <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#9aa59b' font-size='16'>이미지 로딩 중…</text>
    </svg>`);

  const CAT_ICONS = new Map(Object.entries({
    "어묵":"🍢","조미김":"🟩","숙면":"🍜","효소식품":"🧪","조미액젓":"🧂",
    "두류가공품":"🌱","탁주":"🍶","복합조미식품":"🧂","약주":"🍶","소스":"🥫",
    "절임식품":"🥒","발효식초":"🍾","과실주":"🍷"
  }));

  const imageCache = new Map();
  let RAW=[], DATA=[], results=[];
  let currentCat = 'all';

  // 초기 데이터 로딩
  (async function init(){
    const productUrl = location.hostname.includes('localhost')
      ? 'data/product.json?v=20251009'
      : `${API_BASE}/data/product.json?v=20251009`;

    try{
      const res = await fetch(productUrl, { cache:'no-store' });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      RAW = await res.json();
    }catch(err){
      console.error('product.json load failed:', err);
      RAW = [];
    }

    DATA = RAW.map(it => ({
      name: it?.제품명 ?? '',
      brand: it?.회사명 ?? '',
      cat: it?.카테고리 ?? '',
      ings: Array.isArray(it?.원재료명) ? it.원재료명 : []
    }));

    buildCategoryChips(DATA);
    apply(); // 첫 렌더
  })();

  function buildCategoryChips(items){
    const cats = Array.from(new Set(items.map(x => x.cat).filter(Boolean)))
      .sort((a,b)=>a.localeCompare(b,'ko'));
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
    const q = ($q.value || '').trim().toLowerCase();
    let res = [...DATA];

    if (q) res = res.filter(f => (f.name || '').toLowerCase().includes(q));
    if (currentCat !== 'all') res = res.filter(f => f.cat === currentCat);

    if (q || currentCat !== 'all') {
      switch($sort.value){
        case 'brand': res.sort((a,b)=>(a.brand||'').localeCompare(b.brand||'','ko')); break;
        case 'name':
        default:      res.sort((a,b)=>(a.name||'').localeCompare(b.name||'','ko'));
      }
    }
    if (!q && currentCat === 'all') res = res.slice(0, 6); // 초기 미리보기

    results = res;
    render();
  }

  function render(){
    $list.innerHTML = '';
    const qText = ($q.value || '').trim();
    const isInitial = !qText && currentCat === 'all';
    const toRender = isInitial ? results.slice(0, INITIAL_LIMIT) : results;

    $count.textContent = isInitial
      ? `총 ${results.length}개 상품 • ${INITIAL_LIMIT}개 미리보기`
      : `총 ${results.length}개 상품` + (qText ? ` • '${qText}' 검색 중` : '');

    if (!toRender.length){
      $empty.style.display = 'block';
      return;
    }
    $empty.style.display = 'none';

    toRender.forEach((f, idx) => {
      const id = `card-${idx}`;
      const card = document.createElement('div');
      card.className = 'product-card col-span-6';
      card.innerHTML = `
        <div class="product-row">
          <div class="thumb-wrap">
            <a id="${id}-link" class="thumb-link disabled" href="javascript:void(0)" target="_blank" rel="noopener">
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

      loadImageFor(f.name, f.brand, f.cat).then(best => {
        const $img = document.getElementById(`${id}-img`);
        const $a   = document.getElementById(`${id}-link`);
        if (best?.image) $img.src = best.image;
        if (best?.page) { $a.href = best.page; $a.classList.remove('disabled'); }
      });
    });
  }

  // 이미지 검색 (서버는 q/query 모두 지원)
  const imageCache = new Map();
  function loadImageFor(name, brand='', cat=''){
    const key = `${name}@@${brand}@@${cat}`;
    if (imageCache.has(key)) return Promise.resolve(imageCache.get(key));
    const url = `${API_BASE}/api/search?q=${encodeURIComponent(name)}&brand=${encodeURIComponent(brand)}&cat=${encodeURIComponent(cat)}`;
    return fetch(url, { cache:'no-store' })
      .then(r => r.json())
      .then(d => {
        const best = d?.best || null;
        imageCache.set(key, best);
        return best;
      })
      .catch(()=>null);
  }

  function escapeHTML(s){
    return String(s).replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[m]);
  }

  // 이벤트
  $btn.addEventListener('click', apply);
  $q.addEventListener('keydown', e => { if (e.key === 'Enter') apply(); });
  $sort.addEventListener('change', apply);
}
