console.log("product detail minimal – 2025-10-09");

/* ===== 환경 ===== */
const API_BASE = location.hostname.includes('localhost')
  ? ''
  : 'https://food-care-github-io.onrender.com';

const ALLERGY_URL = location.hostname.includes('localhost')
  ? '/data/Allergy.json?v=20251009'
  : `${API_BASE}/data/Allergy.json?v=20251009`;

/* ===== 유틸 ===== */
const esc = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function getUserAllergies(){
  try{
    if (typeof AllergyStore==='undefined' || !AllergyStore?.load) return [];
    const s = AllergyStore.load();
    return Array.isArray(s?.items)? s.items: [];
  }catch{ return []; }
}

/* 간단 이미지 검색 (서버 프록시) */
const _imgCache = new Map();
async function loadImageFor(name, brand='', cat=''){
  const key = `${name}@@${brand}@@${cat}`;
  if (_imgCache.has(key)) return _imgCache.get(key);
  const url = `${API_BASE}/api/search?query=${encodeURIComponent(name)}&cat=${encodeURIComponent(cat||'')}`;
  const r = await fetch(url, {cache:'no-store'});
  const data = await r.json().catch(()=>null);
  const best = data?.best || null;
  _imgCache.set(key,best);
  return best;
}

/* ===== 알레르기 판정 (심플) =====
   - 사용자 알러지 라벨/코드가 재료 문자열에 '부분포함'되면 주의로 처리
*/
async function evaluate(ings){
  const res = {warnHits:[]};
  const user = getUserAllergies();
  if (!user.length) return res;

  // 룰 파일(라벨 보정용) — 실패해도 무시
  let rules = null;
  try{
    const r = await fetch(ALLERGY_URL,{cache:'no-store'});
    rules = r.ok ? await r.json() : null;
  }catch{}

  const needles = new Set();
  for (const it of user){
    const k = it.label || it.code;
    if (k) needles.add(String(k).toLowerCase());
    // 룰 안에 대표 키가 있으면 그것도 체크
    if (rules?.[k]) needles.add(String(k).toLowerCase());
  }

  const hits = new Set();
  for (const ing of (ings||[])){
    const low = String(ing).toLowerCase();
    for (const n of needles){
      if (n && low.includes(n)) { hits.add(ing); break; }
    }
  }
  res.warnHits = [...hits];
  return res;
}

/* ===== 데이터 로드: sessionStorage → 쿼리스트링 → product.json ===== */
async function loadSelected(){
  // 1) sessionStorage
  try{
    const raw = sessionStorage.getItem('allego:selected');
    if (raw){
      const obj = JSON.parse(raw);
      if (obj?.name) return obj;
    }
  }catch{}

  // 2) URL
  const params = new URLSearchParams(location.search);
  const name  = params.get('name');
  const brand = params.get('brand') || '';
  const cat   = params.get('cat') || '';
  if (!name) return null;

  // 3) product.json
  const url = location.hostname.includes('localhost')
    ? '/data/product.json?v=20251009'
    : `${API_BASE}/data/product.json?v=20251009`;

  try{
    const r = await fetch(url, {cache:'no-store'});
    const raw = r.ok ? await r.json() : [];
    const data = raw.map(it => ({
      name:  it?.제품명 ?? '',
      brand: it?.회사명 ?? '',
      cat:   it?.대분류카테고리 ?? it?.카테고리 ?? '',
      ings:  Array.isArray(it?.원재료명) ? it.원재료명 : []
    }));
    const item = data.find(x =>
      x.name === name &&
      (!brand || x.brand === brand) &&
      (!cat   || x.cat   === cat)
    );
    return item || null;
  }catch{
    return null;
  }
}

/* ===== 렌더 ===== */
(async function main(){
  // 탭 전환
  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('is-active'));
      document.querySelectorAll('.panel').forEach(p=>p.classList.remove('is-active'));
      btn.classList.add('is-active');
      document.getElementById(`panel-${btn.dataset.tab}`).classList.add('is-active');
    });
  });

  const item = await loadSelected();
  if (!item){ location.href = '../index.html'; return; }

  // 제목/브랜드
  document.getElementById('p-title').textContent = item.name || '';
  document.getElementById('p-brand').textContent = item.brand || '';

  // 칩(상단): 경고칩 먼저(노랑) → 일반칩(회색)
  const evalRes = await evaluate(item.ings);
  const warnSet = new Set((evalRes.warnHits||[]).map(String));
  const warnChips = [...warnSet].map(x=>`<span class="chip chip--warn">${esc(x)}</span>`);
  const normalChips = (item.ings||[]).filter(x=>!warnSet.has(String(x))).slice(0,6)
    .map(x=>`<span class="chip">${esc(x)}</span>`);
  document.getElementById('p-chips').innerHTML = warnChips.concat(normalChips).join('');

  // 경고 라인 토글
  const badge = document.getElementById('p-badge');
  if (warnSet.size){ badge.style.display='flex'; }
  else{
    // 안전일 때는 초록 안전 아이콘+문구로 바꿔 표시
    badge.innerHTML = `<img class="pin" src="../assets/search/safe.png" alt="안전"/><span style="color:#22c55e">안전한 제품이에요</span>`;
    badge.style.display='flex';
  }

  // 좌측 이미지
  const img = document.getElementById('p-image');
  if (item.image){ img.src = item.image; img.alt = item.name; }
  else{
    try{
      const best = await loadImageFor(item.name, item.brand, item.cat);
      if (best?.image) img.src = best.image;
      img.alt = item.name;
    }catch{}
  }

  // 패널: 성분 분석
  if (warnSet.size){
    document.getElementById('danger-wrap').style.display = '';
    document.getElementById('danger-chips').innerHTML =
      [...warnSet].map(x=>`<span class="chip chip--warn">${esc(x)}</span>`).join('');
  }
  document.getElementById('all-ings').innerHTML =
    (item.ings||[]).map(x =>
      `<span class="chip ${warnSet.has(String(x))?'chip--warn':''}">${esc(x)}</span>`
    ).join('');

  // 버튼(최저가) — 일단 검색 링크로 연결
  const btnBuy = document.getElementById('btn-buy');
  const q = encodeURIComponent(`${item.name} ${item.brand}`.trim());
  btnBuy.addEventListener('click', ()=>{
    window.open(`https://www.google.com/search?q=${q}+최저가`, '_blank','noopener');
  });
})();
