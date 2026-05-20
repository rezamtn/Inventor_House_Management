import { useState, useEffect, useRef } from "react";
import { loadFromCloud, saveToCloud } from "./supabase";

const LOCAL_KEY = "houseInventory_v5";

const SECTORS = [
  { id: "yakhchal",    label: "یخچال",    icon: "❄️" },
  { id: "ashpazkhane", label: "آشپزخانه", icon: "🍳" },
  { id: "anbar",       label: "انباری",   icon: "📦" },
  { id: "hamam",       label: "حمام",     icon: "🚿" },
];

const STATUSES = [
  { id: "available", label: "موجود",       color: "#0F6E56", bg: "#E1F5EE" },
  { id: "low",       label: "رو به اتمام", color: "#854F0B", bg: "#FAEEDA" },
  { id: "needed",    label: "باید بخرم",   color: "#A32D2D", bg: "#FCEBEB" },
];

const UNITS = ["عدد","بسته","کیلوگرم","گرم","لیتر","میلی‌لیتر","جعبه","شیشه","قوطی"];

const mkId  = () => Math.random().toString(36).slice(2,9);
const clone = x  => JSON.parse(JSON.stringify(x));
const now   = ()  => new Date().toISOString();
const pad   = n  => String(n).padStart(2,"0");

// Data model v5:
// house -> sectors{} -> { items[], sections[{ id, name, items[], subsections[{ id, name, items[] }] }] }
const emptySector = () => ({ updatedAt: null, items: [], sections: [] });
const emptyHouse  = (name="") => ({
  id: mkId(), name,
  sectors: Object.fromEntries(SECTORS.map(s => [s.id, emptySector()]))
});
const DEFAULT = { version: 5, houses: [emptyHouse(""), emptyHouse("")] };

function migrate(d) {
  if (!d) return null;
  if (d.version === 5) return d;
  // migrate from v4 (had .sections[sectorId].items[])
  try {
    return {
      version: 5,
      houses: d.houses.map(h => ({
        id: h.id, name: h.name,
        sectors: Object.fromEntries(SECTORS.map(s => {
          const old = h.sections?.[s.id];
          const items = old?.items || (Array.isArray(old) ? old : []);
          return [s.id, { updatedAt: old?.updatedAt || null, items, sections: [] }];
        }))
      }))
    };
  } catch(_) { return null; }
}

function readLocal() {
  for (const key of ["houseInventory_v5","houseInventory_v4"]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const d = migrate(JSON.parse(raw));
      if (d?.version === 5 && Array.isArray(d.houses)) return d;
    } catch(_) {}
  }
  return null;
}
function writeLocal(d) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(d)); } catch(_) {} }
function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Styles ──────────────────────────────────────────────────────────────────
const C = {
  wrap:    { fontFamily:"'Vazirmatn',Tahoma,Arial,sans-serif", direction:"rtl", maxWidth:640, margin:"0 auto", padding:"1rem", color:"#111", background:"#fff", minHeight:"100dvh" },
  input:   { width:"100%", padding:"9px 12px", border:"0.5px solid #ddd", borderRadius:8, fontFamily:"inherit", fontSize:14, background:"#fff", color:"#111", direction:"rtl", outline:"none" },
  select:  { width:"100%", padding:"9px 12px", border:"0.5px solid #ddd", borderRadius:8, fontFamily:"inherit", fontSize:14, background:"#fff", color:"#111", direction:"rtl", cursor:"pointer", outline:"none" },
  primary: { padding:"9px 18px", borderRadius:8, border:"none", background:"#111", color:"#fff", fontFamily:"inherit", fontSize:14, fontWeight:500, cursor:"pointer" },
  ghost:   { padding:"9px 18px", borderRadius:8, border:"0.5px solid #ddd", background:"transparent", color:"#666", fontFamily:"inherit", fontSize:14, cursor:"pointer" },
  iconBtn: d => ({ minWidth:28, height:28, border:"0.5px solid #eee", borderRadius:7, background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:d==="danger"?"#A32D2D":d==="primary"?"#0F6E56":"#888", fontFamily:"inherit", flexShrink:0, padding:"0 6px", gap:3 }),
  badge:   s => ({ display:"inline-flex", alignItems:"center", padding:"2px 8px", borderRadius:20, fontSize:11, fontWeight:500, cursor:"pointer", background:s.bg, color:s.color, whiteSpace:"nowrap", border:"none", fontFamily:"inherit" }),
  houseTab:a => ({ padding:"7px 14px", borderRadius:24, border:`1px solid ${a?"#111":"#ddd"}`, background:a?"#111":"transparent", color:a?"#fff":"#555", cursor:"pointer", fontFamily:"inherit", fontSize:14, fontWeight:500, whiteSpace:"nowrap" }),
  secTab:  a => ({ flex:1, padding:"10px 4px", border:"none", borderBottom:`2px solid ${a?"#111":"transparent"}`, background:"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:13, color:a?"#111":"#888", fontWeight:a?500:400, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }),
  pill:    a => ({ padding:"4px 12px", borderRadius:20, border:`0.5px solid ${a?"#bbb":"#eee"}`, background:a?"#f5f5f5":"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:12, color:a?"#111":"#888", fontWeight:a?500:400 }),
  navBtn:  a => ({ padding:"7px 12px", border:`0.5px solid ${a?"#F09595":"#ddd"}`, borderRadius:20, background:a?"#FCEBEB":"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:13, color:a?"#A32D2D":"#888", display:"flex", alignItems:"center", gap:5, fontWeight:a?500:400 }),
  smBtn:   { padding:"6px 12px", borderRadius:8, border:"0.5px solid #ddd", background:"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:12, color:"#555", display:"flex", alignItems:"center", gap:5 },
  addDash: { width:"100%", padding:"8px", border:"0.5px dashed #ddd", borderRadius:10, background:"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:13, color:"#aaa", display:"flex", alignItems:"center", justifyContent:"center", gap:5, marginTop:6 },
  itemRow: { background:"#fff", border:"0.5px solid #ececec", borderRadius:10, padding:"9px 12px", display:"flex", alignItems:"center", gap:8, marginBottom:6 },
  sectionBox: { border:"0.5px solid #e8e8e8", borderRadius:12, marginBottom:10, overflow:"hidden" },
  sectionHead: { display:"flex", alignItems:"center", gap:6, padding:"10px 12px", background:"#fafafa", cursor:"pointer", userSelect:"none" },
  subBox:  { border:"0.5px solid #f0f0f0", borderRadius:10, marginBottom:8, overflow:"hidden" },
  subHead: { display:"flex", alignItems:"center", gap:6, padding:"8px 12px", background:"#f8f8f8", cursor:"pointer", userSelect:"none" },
};

function highlight(text, q) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i===-1) return text;
  return <>{text.slice(0,i)}<mark style={{background:"#FFF3B0",color:"#111",borderRadius:3,padding:"0 1px"}}>{text.slice(i,i+q.length)}</mark>{text.slice(i+q.length)}</>;
}

const statusOf = id => STATUSES.find(s=>s.id===id)||STATUSES[0];

// ── Item Row Component ───────────────────────────────────────────────────────
function ItemRow({ item, onCycle, onEdit, onDelete, searchQ }) {
  const st = statusOf(item.status);
  return (
    <div style={C.itemRow}>
      <div style={{flex:1,minWidth:0}}>
        <span style={{fontSize:13,fontWeight:500}}>{searchQ?highlight(item.name,searchQ):item.name}</span>
        <span style={{fontSize:12,color:"#aaa",marginRight:8}}>{item.qty} {item.unit}</span>
      </div>
      <button style={C.badge(st)} onClick={onCycle}>{st.label}</button>
      <button style={C.iconBtn()} onClick={onEdit}>✏️</button>
      <button style={C.iconBtn("danger")} onClick={onDelete}>🗑️</button>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [data,        setData]        = useState(null);
  const [house,       setHouse]       = useState(null);
  const [sector,      setSector]      = useState("yakhchal");
  const [view,        setView]        = useState("items");
  const [syncMsg,     setSyncMsg]     = useState("");
  const [setup,       setSetup]       = useState(["",""]);
  const [expanded,    setExpanded]    = useState({}); // sectionId/subsectionId -> bool
  const [searchQ,     setSearchQ]     = useState("");
  const [searchOpen,  setSearchOpen]  = useState(false);
  const [renaming,    setRenaming]    = useState(null);
  const [nameDraft,   setNameDraft]   = useState("");

  // modal: null | { type:'item'|'section'|'subsection', mode:'add'|'edit', ctx:{...}, data:{...} }
  const [modal, setModal] = useState(null);

  const fileRef   = useRef();
  const searchRef = useRef();
  const saveTimer = useRef(null);

  // ── init ──
  useEffect(() => {
    (async () => {
      setSyncMsg("☁️ در حال بارگذاری...");
      let d = migrate(await loadFromCloud());
      if (d?.version===5) { writeLocal(d); setSyncMsg("✓ همگام‌سازی شد"); }
      else {
        d = readLocal();
        setSyncMsg(d ? "📱 بارگذاری محلی" : "");
        if (!d) d = clone(DEFAULT);
      }
      setTimeout(()=>setSyncMsg(""),3000);
      setData(d); setHouse(d.houses[0].id);
      setView(d.houses[0].name?"items":"setup");
    })();
  }, []);

  useEffect(() => { if (searchOpen && searchRef.current) searchRef.current.focus(); }, [searchOpen]);

  const persist = nd => {
    setData(nd); writeLocal(nd); setSyncMsg("💾 ذخیره...");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const ok = await saveToCloud(nd);
      setSyncMsg(ok?"☁️ ذخیره ابر ✓":"⚠️ ذخیره محلی");
      setTimeout(()=>setSyncMsg(""),3000);
    }, 800);
  };

  // ── helpers to navigate data ──
  const getHouse   = (nd=data) => nd.houses.find(h=>h.id===house);
  const getSector  = (nd=data) => getHouse(nd)?.sectors[sector];
  const getSection = (nd, secId) => getSector(nd)?.sections.find(s=>s.id===secId);
  const getSub     = (nd, secId, subId) => getSection(nd,secId)?.subsections?.find(s=>s.id===subId);

  const toggleExpand = id => setExpanded(e=>({...e,[id]:!e[id]}));

  // ── CRUD: items ──
  function addItem(ctx, itemData) {
    const nd = clone(data);
    const sec = nd.houses.find(h=>h.id===house).sectors[sector];
    const item = { id:mkId(), ...itemData };
    if (ctx.subId) {
      getSection(nd,ctx.secId).subsections.find(s=>s.id===ctx.subId).items.push(item);
    } else if (ctx.secId) {
      getSection(nd,ctx.secId).items.push(item);
    } else {
      sec.items.push(item);
    }
    sec.updatedAt = now(); persist(nd);
  }

  function editItem(ctx, itemData) {
    const nd = clone(data);
    const sec = nd.houses.find(h=>h.id===house).sectors[sector];
    let arr;
    if (ctx.subId) arr = getSection(nd,ctx.secId).subsections.find(s=>s.id===ctx.subId).items;
    else if (ctx.secId) arr = getSection(nd,ctx.secId).items;
    else arr = sec.items;
    const idx = arr.findIndex(i=>i.id===ctx.itemId);
    if (idx>=0) arr[idx] = { id:ctx.itemId, ...itemData };
    sec.updatedAt = now(); persist(nd);
  }

  function deleteItem(ctx) {
    const nd = clone(data);
    const sec = nd.houses.find(h=>h.id===house).sectors[sector];
    let arr;
    if (ctx.subId) arr = getSection(nd,ctx.secId).subsections.find(s=>s.id===ctx.subId).items;
    else if (ctx.secId) arr = getSection(nd,ctx.secId).items;
    else arr = sec.items;
    const target = arr.find(i=>i.id===ctx.itemId);
    if (target && !window.confirm(`حذف «${target.name}»؟`)) return;
    const parent = ctx.subId ? getSection(nd,ctx.secId).subsections.find(s=>s.id===ctx.subId)
                 : ctx.secId ? getSection(nd,ctx.secId)
                 : sec;
    parent.items = parent.items.filter(i=>i.id!==ctx.itemId);
    sec.updatedAt = now(); persist(nd);
  }

  function cycleStatus(ctx) {
    const order = ["available","low","needed"];
    const nd = clone(data);
    const sec = nd.houses.find(h=>h.id===house).sectors[sector];
    let arr;
    if (ctx.subId) arr = getSection(nd,ctx.secId).subsections.find(s=>s.id===ctx.subId).items;
    else if (ctx.secId) arr = getSection(nd,ctx.secId).items;
    else arr = sec.items;
    const it = arr.find(i=>i.id===ctx.itemId);
    if (it) it.status = order[(order.indexOf(it.status)+1)%3];
    sec.updatedAt = now(); persist(nd);
  }

  // ── CRUD: sections ──
  function addSection(name) {
    const nd = clone(data);
    const sec = nd.houses.find(h=>h.id===house).sectors[sector];
    sec.sections.push({ id:mkId(), name:name.trim(), items:[], subsections:[] });
    sec.updatedAt = now(); persist(nd);
  }
  function editSection(secId, name) {
    const nd = clone(data);
    const s = getSection(nd, secId);
    if (s) s.name = name.trim();
    getSector(nd).updatedAt = now(); persist(nd);
  }
  function deleteSection(secId) {
    const nd = clone(data);
    const sec = nd.houses.find(h=>h.id===house).sectors[sector];
    const s = sec.sections.find(s=>s.id===secId);
    if (!window.confirm(`حذف بخش «${s?.name}» و همه محتوای آن؟`)) return;
    sec.sections = sec.sections.filter(s=>s.id!==secId);
    sec.updatedAt = now(); persist(nd);
  }

  // ── CRUD: subsections ──
  function addSubsection(secId, name) {
    const nd = clone(data);
    const s = getSection(nd, secId);
    if (!s.subsections) s.subsections = [];
    s.subsections.push({ id:mkId(), name:name.trim(), items:[] });
    getSector(nd).updatedAt = now(); persist(nd);
  }
  function editSubsection(secId, subId, name) {
    const nd = clone(data);
    const sub = getSub(nd, secId, subId);
    if (sub) sub.name = name.trim();
    getSector(nd).updatedAt = now(); persist(nd);
  }
  function deleteSubsection(secId, subId) {
    const nd = clone(data);
    const s = getSection(nd, secId);
    const sub = s.subsections?.find(s=>s.id===subId);
    if (!window.confirm(`حذف زیربخش «${sub?.name}» و همه محتوای آن؟`)) return;
    s.subsections = s.subsections.filter(s=>s.id!==subId);
    getSector(nd).updatedAt = now(); persist(nd);
  }

  // ── backup / restore ──
  const doBackup = () => {
    const blob = new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url; a.download=`house-inventory-${new Date().toISOString().slice(0,10)}.json`; a.click();
    URL.revokeObjectURL(url);
  };
  const doRestore = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const d = migrate(JSON.parse(ev.target.result));
        if (!d?.houses) throw new Error();
        persist(d); setHouse(d.houses[0].id);
        setView(d.houses[0].name?"items":"setup");
        alert("بکاپ با موفقیت بازیابی شد ✓");
      } catch(_) { alert("فایل معتبر نیست"); }
    };
    reader.readAsText(file); e.target.value="";
  };

  // ── global search ──
  function searchResults() {
    if (!data || !searchQ.trim()) return [];
    const q = searchQ.trim().toLowerCase();
    const res = [];
    data.houses.forEach(h => SECTORS.forEach(sec => {
      const sd = h.sectors?.[sec.id];
      if (!sd) return;
      // sector-level items
      (sd.items||[]).forEach(item => {
        if (item.name.toLowerCase().includes(q))
          res.push({...item, houseName:h.name, houseId:h.id, sectorId:sec.id, sectorLabel:sec.label, sectorIcon:sec.icon, path:"مستقیم"});
      });
      // section items
      (sd.sections||[]).forEach(section => {
        (section.items||[]).forEach(item => {
          if (item.name.toLowerCase().includes(q))
            res.push({...item, houseName:h.name, houseId:h.id, sectorId:sec.id, sectorLabel:sec.label, sectorIcon:sec.icon, path:section.name});
        });
        // subsection items
        (section.subsections||[]).forEach(sub => {
          (sub.items||[]).forEach(item => {
            if (item.name.toLowerCase().includes(q))
              res.push({...item, houseName:h.name, houseId:h.id, sectorId:sec.id, sectorLabel:sec.label, sectorIcon:sec.icon, path:`${section.name} › ${sub.name}`});
          });
        });
      });
    }));
    return res;
  }

  // ── gather all needed items ──
  function getAllNeeded() {
    const res = [];
    data?.houses.forEach(h => SECTORS.forEach(sec => {
      const sd = h.sectors?.[sec.id];
      if (!sd) return;
      const collect = (items, path) => items?.filter(i=>i.status==="needed").forEach(i=>res.push({...i,houseName:h.name,sectorLabel:sec.label,path}));
      collect(sd.items, "مستقیم");
      (sd.sections||[]).forEach(s => {
        collect(s.items, s.name);
        (s.subsections||[]).forEach(sub => collect(sub.items, `${s.name} › ${sub.name}`));
      });
    }));
    return res;
  }

  // ── Modal ──────────────────────────────────────────────────────────────────
  function openItemModal(ctx, existing=null) {
    setModal({ type:"item", mode: existing?"edit":"add", ctx,
      form: existing ? { name:existing.name, qty:existing.qty, unit:existing.unit, status:existing.status }
                     : { name:"", qty:1, unit:"عدد", status:"available" } });
  }
  function openNameModal(type, ctx, existing=null) {
    setModal({ type, mode: existing?"edit":"add", ctx, form:{ name: existing?.name||"" } });
  }

  function handleModalSave() {
    if (!modal) return;
    const { type, mode, ctx, form } = modal;
    if (type==="item") {
      if (!form.name.trim()) return;
      if (mode==="add") addItem(ctx, { name:form.name.trim(), qty:form.qty, unit:form.unit, status:form.status });
      else              editItem({ ...ctx }, { name:form.name.trim(), qty:form.qty, unit:form.unit, status:form.status });
    } else if (type==="section") {
      if (!form.name.trim()) return;
      if (mode==="add") addSection(form.name);
      else              editSection(ctx.secId, form.name);
    } else if (type==="subsection") {
      if (!form.name.trim()) return;
      if (mode==="add") addSubsection(ctx.secId, form.name);
      else              editSubsection(ctx.secId, ctx.subId, form.name);
    }
    setModal(null);
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (!data) return (
    <div style={{...C.wrap,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100dvh",gap:12,color:"#888"}}>
      <link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.003/Vazirmatn-font-face.css" rel="stylesheet"/>
      <div style={{fontSize:32}}>☁️</div><div style={{fontSize:14}}>در حال اتصال...</div>
    </div>
  );

  // ── Setup ──────────────────────────────────────────────────────────────────
  if (view==="setup") {
    const ok = setup.every(n=>n.trim().length>0);
    return (
      <div style={{...C.wrap,display:"flex",flexDirection:"column",justifyContent:"center",padding:"2rem 1.5rem"}}>
        <link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.003/Vazirmatn-font-face.css" rel="stylesheet"/>
        <div style={{fontSize:40,textAlign:"center",marginBottom:12}}>🏠</div>
        <h1 style={{fontSize:20,fontWeight:500,textAlign:"center",marginBottom:6}}>مدیریت موجودی خانه</h1>
        <p style={{fontSize:14,color:"#888",textAlign:"center",marginBottom:"2rem"}}>برای هر خانه یک اسم انتخاب کن</p>
        {data.houses.map((h,i)=>(
          <div key={h.id} style={{marginBottom:"1rem"}}>
            <label style={{fontSize:13,color:"#666",display:"block",marginBottom:6}}>خانه {i+1}</label>
            <input style={{...C.input,fontSize:15,padding:"11px 14px"}} placeholder="مثلاً: خانه تهران، ویلا..."
              value={setup[i]} onChange={e=>{const u=[...setup];u[i]=e.target.value;setSetup(u);}}/>
          </div>
        ))}
        <button style={{...C.primary,width:"100%",padding:"12px",marginTop:"0.5rem",fontSize:15,opacity:ok?1:0.4}} disabled={!ok}
          onClick={()=>{const nd=clone(data);nd.houses.forEach((h,i)=>{h.name=setup[i].trim();});persist(nd);setView("items");}}>
          شروع کن ✓
        </button>
      </div>
    );
  }

  // ── Item/Name Modal ────────────────────────────────────────────────────────
  if (modal) {
    const isItem = modal.type==="item";
    const title  = isItem ? (modal.mode==="add"?"افزودن آیتم":"ویرایش آیتم")
                 : modal.type==="section" ? (modal.mode==="add"?"افزودن بخش":"ویرایش بخش")
                 : (modal.mode==="add"?"افزودن زیربخش":"ویرایش زیربخش");
    return (
      <div style={{fontFamily:"'Vazirmatn',Tahoma,Arial,sans-serif",direction:"rtl",position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"2rem 1rem",zIndex:999}}
        onClick={e=>{if(e.target===e.currentTarget)setModal(null);}}>
        <link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.003/Vazirmatn-font-face.css" rel="stylesheet"/>
        <div style={{background:"#fff",borderRadius:16,padding:"1.5rem",width:"100%",maxWidth:380,border:"0.5px solid #ddd",marginTop:"2rem"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.25rem"}}>
            <span style={{fontSize:16,fontWeight:500}}>{title}</span>
            <button onClick={()=>setModal(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:"#888"}}>✕</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <label style={{fontSize:12,color:"#888",display:"block",marginBottom:5}}>نام</label>
              <input style={C.input} value={modal.form.name} autoFocus
                onChange={e=>setModal(m=>({...m,form:{...m.form,name:e.target.value}}))}
                onKeyDown={e=>e.key==="Enter"&&modal.form.name.trim()&&handleModalSave()}
                placeholder={isItem?"مثلاً: شیر، شامپو...":"مثلاً: کابینت، قفسه..."}/>
            </div>
            {isItem&&<>
              <div style={{display:"flex",gap:10}}>
                <div style={{flex:1}}>
                  <label style={{fontSize:12,color:"#888",display:"block",marginBottom:5}}>تعداد</label>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <button style={{width:30,height:34,border:"0.5px solid #ddd",borderRadius:6,background:"transparent",cursor:"pointer",fontSize:18,fontFamily:"inherit"}} onClick={()=>setModal(m=>({...m,form:{...m.form,qty:Math.max(1,m.form.qty-1)}}))}>−</button>
                    <input style={{...C.input,textAlign:"center",width:52}} type="number" min="1" value={modal.form.qty}
                      onChange={e=>setModal(m=>({...m,form:{...m.form,qty:Math.max(1,parseInt(e.target.value)||1)}}))}/>
                    <button style={{width:30,height:34,border:"0.5px solid #ddd",borderRadius:6,background:"transparent",cursor:"pointer",fontSize:18,fontFamily:"inherit"}} onClick={()=>setModal(m=>({...m,form:{...m.form,qty:m.form.qty+1}}))}>+</button>
                  </div>
                </div>
                <div style={{flex:1}}>
                  <label style={{fontSize:12,color:"#888",display:"block",marginBottom:5}}>واحد</label>
                  <select style={C.select} value={modal.form.unit} onChange={e=>setModal(m=>({...m,form:{...m.form,unit:e.target.value}}))}>
                    {UNITS.map(u=><option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{fontSize:12,color:"#888",display:"block",marginBottom:8}}>وضعیت</label>
                <div style={{display:"flex",gap:6}}>
                  {STATUSES.map(s=>(
                    <button key={s.id} onClick={()=>setModal(m=>({...m,form:{...m.form,status:s.id}}))}
                      style={{flex:1,padding:"8px 4px",borderRadius:8,fontFamily:"inherit",fontSize:12,cursor:"pointer",
                        border:modal.form.status===s.id?`2px solid ${s.color}`:"0.5px solid #eee",
                        background:modal.form.status===s.id?s.bg:"transparent",
                        color:modal.form.status===s.id?s.color:"#888",fontWeight:modal.form.status===s.id?500:400}}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </>}
          </div>
          <div style={{display:"flex",gap:8,marginTop:"1.25rem"}}>
            <button style={C.primary} onClick={handleModalSave} disabled={!modal.form.name.trim()}>
              {modal.mode==="add"?"افزودن":"ذخیره"}
            </button>
            <button style={C.ghost} onClick={()=>setModal(null)}>انصراف</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render items list ──────────────────────────────────────────────────────
  function renderItems(items, ctx) {
    return (
      <>
        {(items||[]).map(item=>(
          <ItemRow key={item.id} item={item}
            onCycle={()=>cycleStatus({...ctx,itemId:item.id})}
            onEdit={()=>openItemModal({...ctx,itemId:item.id},item)}
            onDelete={()=>deleteItem({...ctx,itemId:item.id})}/>
        ))}
        <button style={C.addDash} onClick={()=>openItemModal(ctx)}>＋ افزودن آیتم</button>
      </>
    );
  }

  // ── Main data ──────────────────────────────────────────────────────────────
  const curSector   = getHouse()?.sectors[sector] || { items:[], sections:[], updatedAt:null };
  const allNeeded   = getAllNeeded();
  const totalNeeded = allNeeded.length;
  const results     = searchResults();
  const isSearching = searchOpen && searchQ.trim().length>0;

  // ── MAIN UI ────────────────────────────────────────────────────────────────
  return (
    <div style={C.wrap}>
      <link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.003/Vazirmatn-font-face.css" rel="stylesheet"/>
      <input type="file" accept=".json" ref={fileRef} style={{display:"none"}} onChange={doRestore}/>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"0.75rem"}}>
        <span style={{fontSize:18,fontWeight:500}}>🏠 مدیریت خانه</span>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          {syncMsg&&<span style={{fontSize:11,color:syncMsg.includes("⚠️")?"#A32D2D":"#0F6E56",fontWeight:500,whiteSpace:"nowrap"}}>{syncMsg}</span>}
          <button style={C.navBtn(view==="shopping")} onClick={()=>{setView(v=>v==="shopping"?"items":"shopping");setSearchOpen(false);setSearchQ("");}}>
            🛒{totalNeeded>0&&<span style={{background:"#FCEBEB",color:"#A32D2D",fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:10}}>{totalNeeded}</span>}
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{marginBottom:"0.75rem"}}>
        {searchOpen?(
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{flex:1,position:"relative"}}>
              <span style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",fontSize:15,color:"#aaa",pointerEvents:"none"}}>🔍</span>
              <input ref={searchRef} style={{...C.input,paddingRight:34}} placeholder="جستجو در همه خانه‌ها..."
                value={searchQ} onChange={e=>setSearchQ(e.target.value)}/>
            </div>
            <button style={{...C.ghost,padding:"7px 12px",fontSize:13}} onClick={()=>{setSearchOpen(false);setSearchQ("");}}>بستن</button>
          </div>
        ):(
          <button style={{...C.smBtn,width:"100%",justifyContent:"center",padding:"8px",borderRadius:10,color:"#aaa",borderColor:"#eee"}} onClick={()=>setSearchOpen(true)}>
            🔍 جستجو در همه خانه‌ها...
          </button>
        )}
      </div>

      {/* Search Results */}
      {isSearching?(
        <div>
          <div style={{fontSize:13,color:"#888",marginBottom:"0.75rem"}}>
            {results.length===0?`هیچ نتیجه‌ای برای «${searchQ}» پیدا نشد`:`${results.length} نتیجه`}
          </div>
          {results.length===0
            ?<div style={{textAlign:"center",padding:"2rem",color:"#ccc",fontSize:32}}>🔍</div>
            :data.houses.map(h=>{
              const hRes=results.filter(r=>r.houseId===h.id);
              if(!hRes.length) return null;
              return (
                <div key={h.id} style={{marginBottom:"1.25rem"}}>
                  <div style={{fontSize:13,fontWeight:500,color:"#555",marginBottom:8}}>🏠 {h.name}</div>
                  {SECTORS.map(sec=>{
                    const sRes=hRes.filter(r=>r.sectorId===sec.id);
                    if(!sRes.length) return null;
                    return (
                      <div key={sec.id} style={{marginBottom:8}}>
                        <div style={{fontSize:11,color:"#aaa",marginBottom:5}}>{sec.icon} {sec.label}</div>
                        {sRes.map(item=>{
                          const st=statusOf(item.status);
                          return (
                            <div key={item.id} style={{...C.itemRow,cursor:"pointer"}}
                              onClick={()=>{setHouse(item.houseId);setSector(item.sectorId);setView("items");setSearchOpen(false);setSearchQ("");}}>
                              <div style={{flex:1,minWidth:0}}>
                                <span style={{fontSize:13,fontWeight:500}}>{highlight(item.name,searchQ)}</span>
                                <span style={{fontSize:11,color:"#aaa",marginRight:6}}>{item.qty} {item.unit}</span>
                                <span style={{fontSize:11,color:"#bbb",display:"block"}}>{item.path}</span>
                              </div>
                              <span style={C.badge(st)}>{st.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })
          }
        </div>
      ):(
        <>
          {/* Toolbar */}
          <div style={{display:"flex",gap:8,marginBottom:"0.75rem"}}>
            <button style={C.smBtn} onClick={doBackup}>💾 بکاپ</button>
            <button style={C.smBtn} onClick={()=>fileRef.current.click()}>📂 بازیابی</button>
          </div>

          {/* House Tabs */}
          <div style={{display:"flex",gap:8,marginBottom:"1rem",flexWrap:"wrap"}}>
            {data.houses.map(h=>(
              <div key={h.id} style={{display:"flex",alignItems:"center",gap:4}}>
                {renaming===h.id?(
                  <input autoFocus value={nameDraft}
                    style={{border:"none",borderBottom:"1.5px solid #111",background:"transparent",fontFamily:"inherit",fontSize:14,fontWeight:500,color:"#111",direction:"rtl",outline:"none",minWidth:100}}
                    onChange={e=>setNameDraft(e.target.value)}
                    onBlur={()=>{if(nameDraft.trim()){const nd=clone(data);nd.houses.find(x=>x.id===renaming).name=nameDraft.trim();persist(nd);}setRenaming(null);}}
                    onKeyDown={e=>{if(e.key==="Enter")e.target.blur();if(e.key==="Escape")setRenaming(null);}}/>
                ):(
                  <>
                    <button style={C.houseTab(house===h.id)} onClick={()=>{setHouse(h.id);setView("items");}}>
                      {h.name}
                    </button>
                    <button style={{...C.iconBtn(),width:24,height:24,fontSize:12}} onClick={()=>{setRenaming(h.id);setNameDraft(h.name);}}>✏️</button>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Shopping View */}
          {view==="shopping"?(
            <div>
              {allNeeded.length===0
                ?<div style={{textAlign:"center",padding:"3rem 1rem",color:"#888"}}>
                    <div style={{fontSize:36,marginBottom:10}}>✅</div>
                    <p style={{fontSize:14}}>همه چیز موجوده!</p>
                  </div>
                :data.houses.map(h=>{
                    const hItems=allNeeded.filter(i=>i.houseName===h.name);
                    if(!hItems.length) return null;
                    return (
                      <div key={h.id} style={{marginBottom:"1.5rem"}}>
                        <div style={{fontSize:13,fontWeight:500,color:"#666",marginBottom:10}}>🏠 {h.name}</div>
                        {SECTORS.map(sec=>{
                          const its=hItems.filter(i=>i.sectorLabel===sec.label);
                          if(!its.length) return null;
                          return (
                            <div key={sec.id} style={{marginBottom:10}}>
                              <div style={{fontSize:11,color:"#aaa",marginBottom:6}}>{sec.icon} {sec.label}</div>
                              {its.map(item=>(
                                <div key={item.id} style={{...C.itemRow,justifyContent:"space-between"}}>
                                  <div>
                                    <span style={{fontSize:13,fontWeight:500}}>{item.name}</span>
                                    <span style={{fontSize:11,color:"#bbb",display:"block"}}>{item.path}</span>
                                  </div>
                                  <span style={{fontSize:12,color:"#888"}}>{item.qty} {item.unit}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
              }
            </div>
          ):(
            /* Items View */
            <div>
              {/* Sector Tabs */}
              <div style={{display:"flex",borderBottom:"0.5px solid #eee",marginBottom:"1rem"}}>
                {SECTORS.map(sec=>{
                  const sd = getHouse()?.sectors[sec.id];
                  const countAllNeeded = (sd) => {
                    let n=0;
                    (sd?.items||[]).forEach(i=>{if(i.status==="needed")n++;});
                    (sd?.sections||[]).forEach(s=>{
                      (s.items||[]).forEach(i=>{if(i.status==="needed")n++;});
                      (s.subsections||[]).forEach(sub=>(sub.items||[]).forEach(i=>{if(i.status==="needed")n++;}));
                    });
                    return n;
                  };
                  const n = countAllNeeded(sd);
                  return (
                    <button key={sec.id} style={C.secTab(sector===sec.id)} onClick={()=>setSector(sec.id)}>
                      <span style={{fontSize:20}}>{sec.icon}</span>
                      <span style={{fontSize:11}}>{sec.label}</span>
                      {n>0&&<span style={{background:"#FCEBEB",color:"#A32D2D",fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:8}}>{n}</span>}
                    </button>
                  );
                })}
              </div>

              {curSector.updatedAt&&(
                <div style={{fontSize:11,color:"#ccc",marginBottom:"0.75rem",textAlign:"left"}}>
                  آخرین بروزرسانی: {formatDate(curSector.updatedAt)}
                </div>
              )}

              {/* Direct items in sector */}
              {renderItems(curSector.items, {})}

              {/* Sections */}
              {(curSector.sections||[]).map(sec=>(
                <div key={sec.id} style={C.sectionBox}>
                  {/* Section Header */}
                  <div style={C.sectionHead} onClick={()=>toggleExpand(sec.id)}>
                    <span style={{fontSize:14,marginLeft:2}}>{expanded[sec.id]?"▾":"▸"}</span>
                    <span style={{fontSize:14,fontWeight:500,flex:1}}>{sec.name}</span>
                    <span style={{fontSize:11,color:"#bbb",marginLeft:4}}>
                      {(sec.items?.length||0)+(sec.subsections?.reduce((a,s)=>a+(s.items?.length||0),0)||0)} آیتم
                    </span>
                    <button style={C.iconBtn()} onClick={e=>{e.stopPropagation();openNameModal("subsection",{secId:sec.id});}}>＋ زیربخش</button>
                    <button style={C.iconBtn()} onClick={e=>{e.stopPropagation();openNameModal("section",{secId:sec.id},sec);}}>✏️</button>
                    <button style={C.iconBtn("danger")} onClick={e=>{e.stopPropagation();deleteSection(sec.id);}}>🗑️</button>
                  </div>

                  {/* Section Body */}
                  {expanded[sec.id]&&(
                    <div style={{padding:"10px 12px"}}>
                      {/* Items in section */}
                      {renderItems(sec.items, {secId:sec.id})}

                      {/* Subsections */}
                      {(sec.subsections||[]).map(sub=>(
                        <div key={sub.id} style={C.subBox}>
                          <div style={C.subHead} onClick={()=>toggleExpand(sub.id)}>
                            <span style={{fontSize:13,marginLeft:2}}>{expanded[sub.id]?"▾":"▸"}</span>
                            <span style={{fontSize:13,fontWeight:500,flex:1}}>{sub.name}</span>
                            <span style={{fontSize:11,color:"#bbb",marginLeft:4}}>{sub.items?.length||0} آیتم</span>
                            <button style={C.iconBtn()} onClick={e=>{e.stopPropagation();openNameModal("subsection",{secId:sec.id,subId:sub.id},sub);}}>✏️</button>
                            <button style={C.iconBtn("danger")} onClick={e=>{e.stopPropagation();deleteSubsection(sec.id,sub.id);}}>🗑️</button>
                          </div>
                          {expanded[sub.id]&&(
                            <div style={{padding:"8px 12px"}}>
                              {renderItems(sub.items, {secId:sec.id,subId:sub.id})}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Add Section Button */}
              <button style={{...C.addDash,borderColor:"#ccc",color:"#888",marginTop:8}}
                onClick={()=>openNameModal("section",{})}>
                ＋ افزودن بخش جدید
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
