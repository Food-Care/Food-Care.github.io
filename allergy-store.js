
(function (w){
const KEY = 'allego_allergy_v1';

function load(){
    try { return JSON.parse(localStorage.getItem(KEY)) || { items: [], updatedAt: 0 }; }
    catch(e){ return { items: [], updatedAt: 0 }; }
}
function save(state){
    const data = { items: state.items || [], updatedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(data));
    return data;
}
function clear(){ localStorage.removeItem(KEY); }
function hasData(){ return (load().items || []).length > 0; }

// item: { code:string, label:string, severity:'danger'|'caution' }
function upsert(item){
    const s = load();
    const i = (s.items||[]).findIndex(x => x.code === item.code);
    if (i >= 0) s.items[i] = item; else s.items.push(item);
    return save(s);
}
function remove(code){
    const s = load();
    s.items = (s.items||[]).filter(x => x.code !== code);
    return save(s);
}

// 파일 내보내기/가져오기(선택사항)
async function exportFile(){
    const blob = new Blob([JSON.stringify(load(), null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'allergy.json';
    a.click();
    URL.revokeObjectURL(a.href);
}
async function importFile(file){
    const text = await file.text();
    const json = JSON.parse(text);
    return save({ items: Array.isArray(json.items)? json.items: [], updatedAt: Date.now() });
}

w.AllergyStore = { load, save, clear, hasData, upsert, remove, exportFile, importFile };
})(window);