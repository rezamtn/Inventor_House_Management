import { useState, useEffect, useRef } from "react";
import { loadFromCloud, saveToCloud } from "./supabase";

const VAPID_PUBLIC = 'BOGZiKAFAQnJDEQ_qfQbmQWblUStai9erzPp1wGPmQAtELeRdW-Y56I8YGrFWXPGKqeOZek5lkIIWqEtatnCItQ';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return null;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC)
  });
  await fetch('/api/subscribe', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(sub) });
  return sub;
}

async function unsubscribeFromPush() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await fetch('/api/subscribe', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ endpoint: sub.endpoint }) });
    await sub.unsubscribe();
  }
}

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
const UNITS = ["%","عدد","بسته","کیلوگرم","گرم","لیتر","میلی‌لیتر","جعبه","شیشه","قوطی"];

const mkId  = () => Math.random().toString(36).slice(2,9);
const clone = x  => JSON.parse(JSON.stringify(x));
const now   = ()  => new Date().toISOString();
const pad   = n  => String(n).padStart(2,"0");

const emptySector = () => ({ updatedAt:null, items:[], sections:[] });
const emptyHouse  = (name="") => ({ id:mkId(), name, sectors:Object.fromEntries(SECTORS.map(s=>[s.id,emptySector()])) });
const DEFAULT = { version:5, houses:[emptyHouse(""),emptyHouse("")] };

function migrate(d) {
  if (!d) return null;
  if (d.version===5) return d;
  try {
    return { version:5, houses:d.houses.map(h=>({
      id:h.id, name:h.name,
      sectors:Object.fromEntries(SECTORS.map(s=>{
        const old=h.sections?.[s.id];
        const items=old?.items||(Array.isArray(old)?old:[]);
        return [s.id,{updatedAt:old?.updatedAt||null,items,sections:[]}];
      }))
    }))};
  } catch(_){ return null; }
}

function readLocal() {
  for (const key of [LOCAL_KEY,"houseInventory_v4"]) {
    try { const d=migrate(JSON.parse(localStorage.getItem(key)||"")); if(d?.version===5) return d; } catch(_){}
  }
  return null;
}
function writeLocal(d) { try { localStorage.setItem(LOCAL_KEY,JSON.stringify(d)); } catch(_){} }
function formatDate(iso) {
  if (!iso) return null;
  const d=new Date(iso);
  return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Build flat list of all locations in a house for "move to" select
function buildLocations(houseData) {
  const locs = [];
  SECTORS.forEach(sec => {
    const sd = houseData?.sectors?.[sec.id];
    locs.push({ key:`s:${sec.id}`, label:`${sec.icon} ${sec.label} (مستقیم)`, sectorId:sec.id });
    (sd?.sections||[]).forEach(section => {
      locs.push({ key:`s:${sec.id}:sec:${section.id}`, label:`${sec.icon} ${sec.label} ‹ ${section.name}`, sectorId:sec.id, secId:section.id });
      (section.subsections||[]).forEach(sub => {
        locs.push({ key:`s:${sec.id}:sec:${section.id}:sub:${sub.id}`, label:`${sec.icon} ${sec.label} ‹ ${section.name} ‹ ${sub.name}`, sectorId:sec.id, secId:section.id, subId:sub.id });
      });
    });
  });
  return locs;
}

function ctxToKey(ctx) {
  if (ctx.subId) return `s:${ctx.sectorId}:sec:${ctx.secId}:sub:${ctx.subId}`;
  if (ctx.secId) return `s:${ctx.sectorId}:sec:${ctx.secId}`;
  return `s:${ctx.sectorId}`;
}

const statusOf = id => STATUSES.find(s=>s.id===id)||STATUSES[0];

// ── Styles ────────────────────────────────────────────────────────────────────
const C = {
  wrap:    { fontFamily:"'Vazirmatn',Tahoma,Arial,sans-serif", direction:"rtl", maxWidth:640, margin:"0 auto", padding:"1rem", color:"#111", background:"#fff", minHeight:"100dvh" },
  input:   { width:"100%", padding:"12px 14px", border:"0.5px solid #ddd", borderRadius:10, fontFamily:"inherit", fontSize:16, background:"#fff", color:"#111", direction:"rtl", outline:"none" },
  select:  { width:"100%", padding:"12px 14px", border:"0.5px solid #ddd", borderRadius:10, fontFamily:"inherit", fontSize:16, background:"#fff", color:"#111", direction:"rtl", cursor:"pointer", outline:"none" },
  primary: { padding:"12px 20px", borderRadius:10, border:"none", background:"#111", color:"#fff", fontFamily:"inherit", fontSize:16, fontWeight:500, cursor:"pointer" },
  ghost:   { padding:"12px 20px", borderRadius:10, border:"0.5px solid #ddd", background:"transparent", color:"#666", fontFamily:"inherit", fontSize:16, cursor:"pointer" },
  iconBtn: t => ({ minWidth:36, height:36, border:"0.5px solid #eee", borderRadius:8, background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, color:t==="danger"?"#A32D2D":"#888", fontFamily:"inherit", flexShrink:0, padding:"0 6px", gap:3 }),
  badge:   s => ({ display:"inline-flex", alignItems:"center", padding:"5px 12px", borderRadius:20, fontSize:13, fontWeight:500, cursor:"pointer", background:s.bg, color:s.color, whiteSpace:"nowrap", border:"none", fontFamily:"inherit" }),
  houseTab:a => ({ padding:"10px 18px", borderRadius:24, border:`1px solid ${a?"#111":"#ddd"}`, background:a?"#111":"transparent", color:a?"#fff":"#555", cursor:"pointer", fontFamily:"inherit", fontSize:16, fontWeight:500, whiteSpace:"nowrap" }),
  secTab:  a => ({ flex:1, padding:"12px 4px", border:"none", borderBottom:`2px solid ${a?"#111":"transparent"}`, background:"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:13, color:a?"#111":"#888", fontWeight:a?500:400, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }),
  navBtn:  a => ({ padding:"10px 14px", border:`0.5px solid ${a?"#F09595":"#ddd"}`, borderRadius:20, background:a?"#FCEBEB":"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:14, color:a?"#A32D2D":"#888", display:"flex", alignItems:"center", gap:5, fontWeight:a?500:400 }),
  smBtn:   { padding:"9px 14px", borderRadius:9, border:"0.5px solid #ddd", background:"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:14, color:"#555", display:"flex", alignItems:"center", gap:5 },
  itemRow: { background:"#fff", border:"0.5px solid #ececec", borderRadius:12, padding:"13px 14px", display:"flex", alignItems:"center", gap:10, marginBottom:8 },
  addBtn:  color => ({ width:"100%", padding:"11px 14px", border:`0.5px dashed ${color||"#ddd"}`, borderRadius:10, background:"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:14, color:color||"#bbb", display:"flex", alignItems:"center", gap:5, marginTop:6 }),
  sectionBox: { border:"0.5px solid #e8e8e8", borderRadius:14, marginBottom:12, overflow:"hidden" },
  sectionHead:{ display:"flex", alignItems:"center", gap:8, padding:"13px 14px", background:"#fafafa", cursor:"pointer", userSelect:"none" },
  subBox:  { border:"0.5px solid #f0f0f0", borderRadius:11, marginBottom:8, overflow:"hidden" },
  subHead: { display:"flex", alignItems:"center", gap:8, padding:"11px 14px", background:"#f7f7f7", cursor:"pointer", userSelect:"none" },
};

function highlight(text, q) {
  if (!q) return text;
  const i=text.toLowerCase().indexOf(q.toLowerCase());
  if(i===-1) return text;
  return <>{text.slice(0,i)}<mark style={{background:"#FFF3B0",color:"#111",borderRadius:3,padding:"0 1px"}}>{text.slice(i,i+q.length)}</mark>{text.slice(i+q.length)}</>;
}

function qtyColor(qty, unit) {
  if (unit === "%") {
    if (qty >= 100) return { color:"#0F6E56", bg:"#E1F5EE" }; // سبز
    if (qty >= 75)  return { color:"#1a6fa8", bg:"#ddeeff" }; // آبی
    if (qty >= 50)  return { color:"#8a6d00", bg:"#FFF8DC" }; // زرد
    if (qty >= 25)  return { color:"#b85c00", bg:"#FFF0E0" }; // نارنجی
    return          { color:"#A32D2D", bg:"#FCEBEB" };        // قرمز
  }
  return { color:"#0F6E56", bg:"#E1F5EE" }; // همیشه سبز
}

function ItemRow({ item, onCycle, onEdit, onDelete, searchQ }) {
  const st = statusOf(item.status);
  const qc = qtyColor(item.qty, item.unit);
  return (
    <div id={`item-${item.id}`} style={C.itemRow}>
      <div style={{flex:1,minWidth:0,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{fontSize:15,fontWeight:500}}>{searchQ?highlight(item.name,searchQ):item.name}</span>
        <span style={{fontSize:12,fontWeight:600,color:qc.color,background:qc.bg,padding:"2px 8px",borderRadius:20,whiteSpace:"nowrap"}}>
          {item.qty}{item.unit}
        </span>
      </div>
      <button style={C.badge(st)} onClick={onCycle}>{st.label}</button>
      <button style={C.iconBtn()} onClick={onEdit} title="ویرایش">✏️</button>
      <button style={C.iconBtn("danger")} onClick={onDelete} title="حذف">🗑️</button>
    </div>
  );
}

export default function App() {
  const [data,       setData]       = useState(null);
  const [house,      setHouse]      = useState(null);
  const [sector,     setSector]     = useState("yakhchal");
  const [view,       setView]       = useState("items");
  const [syncMsg,    setSyncMsg]    = useState("");
  const [setup,      setSetup]      = useState(["",""]);
  const [expanded,   setExpanded]   = useState({});
  const [searchQ,    setSearchQ]    = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [renaming,   setRenaming]   = useState(null);
  const [nameDraft,  setNameDraft]  = useState("");
  const [modal,          setModal]          = useState(null);
  const [highlightItemId,setHighlightItemId] = useState(null);
  const [pushEnabled,    setPushEnabled]     = useState(false);
  const fileRef   = useRef();
  const searchRef = useRef();
  const saveTimer = useRef(null);

  useEffect(() => {
    (async () => {
      setSyncMsg("☁️ در حال بارگذاری...");
      let d = migrate(await loadFromCloud());
      if (d?.version===5) { writeLocal(d); setSyncMsg("✓ همگام‌سازی شد"); }
      else { d=readLocal(); setSyncMsg(d?"📱 بارگذاری محلی":""); if(!d) d=clone(DEFAULT); }
      setTimeout(()=>setSyncMsg(""),3000);
      setData(d); setHouse(d.houses[0].id);
      setView(d.houses[0].name?"items":"setup");
    })();
    // Check if already subscribed to push
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(reg =>
        reg.pushManager.getSubscription().then(sub => setPushEnabled(!!sub))
      );
    }
  }, []);

  useEffect(() => { if(searchOpen&&searchRef.current) searchRef.current.focus(); }, [searchOpen]);

  useEffect(() => {
    if (!highlightItemId) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`item-${highlightItemId}`);
      if (el) {
        el.scrollIntoView({ behavior:"smooth", block:"center" });
        el.style.transition = "box-shadow 0.3s";
        el.style.boxShadow = "0 0 0 2.5px #111";
        setTimeout(() => { el.style.boxShadow = ""; setHighlightItemId(null); }, 2000);
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [highlightItemId]);

  const persist = nd => {
    setData(nd); writeLocal(nd); setSyncMsg("💾 ذخیره...");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async()=>{
      const ok=await saveToCloud(nd);
      setSyncMsg(ok?"☁️ ذخیره ابر ✓":"⚠️ ذخیره محلی");
      setTimeout(()=>setSyncMsg(""),3000);
    },800);
  };

  const getHouse   = (nd=data) => nd?.houses.find(h=>h.id===house);
  const getSectorD = (nd=data,sid=sector) => getHouse(nd)?.sectors[sid];

  // ── helpers: get item arrays ──────────────────────────────────────────────
  function getArr(nd, ctx) {
    const sd = getHouse(nd)?.sectors[ctx.sectorId];
    if (!sd) return [];
    if (ctx.subId) return sd.sections.find(s=>s.id===ctx.secId)?.subsections?.find(s=>s.id===ctx.subId)?.items||[];
    if (ctx.secId) return sd.sections.find(s=>s.id===ctx.secId)?.items||[];
    return sd.items||[];
  }

  // ── CRUD: items ───────────────────────────────────────────────────────────
  function saveItem(ctx, form, originalCtx=null) {
    const nd = clone(data);
    const newItem = { id: originalCtx?.itemId||mkId(), name:form.name.trim(), qty:form.qty, unit:form.unit, status:form.status };
    if (originalCtx) {
      // remove from original location
      const fromArr = getArr(nd, originalCtx);
      const idx = fromArr.findIndex(i=>i.id===originalCtx.itemId);
      if (idx>=0) fromArr.splice(idx,1);
      nd.houses.find(h=>h.id===house).sectors[originalCtx.sectorId].updatedAt = now();
    }
    // add to new location
    const toArr = getArr(nd, ctx);
    if (originalCtx && ctx.sectorId===originalCtx.sectorId && !originalCtx.secId && !ctx.secId) {
      // same place, just update
      const fromArr2 = getArr(nd, ctx);
      fromArr2.push(newItem);
    } else {
      toArr.push(newItem);
    }
    nd.houses.find(h=>h.id===house).sectors[ctx.sectorId].updatedAt = now();
    persist(nd);
  }

  function cycleStatus(ctx) {
    const order=["available","low","needed"];
    const nd=clone(data);
    const arr=getArr(nd,ctx);
    const it=arr.find(i=>i.id===ctx.itemId);
    if(it) it.status=order[(order.indexOf(it.status)+1)%3];
    nd.houses.find(h=>h.id===house).sectors[ctx.sectorId].updatedAt=now();
    persist(nd);
  }

  function deleteItem(ctx) {
    const nd=clone(data);
    const arr=getArr(nd,ctx);
    const item=arr.find(i=>i.id===ctx.itemId);
    if(!window.confirm(`حذف «${item?.name}»؟`)) return;
    const parent = ctx.subId
      ? nd.houses.find(h=>h.id===house).sectors[ctx.sectorId].sections.find(s=>s.id===ctx.secId)?.subsections?.find(s=>s.id===ctx.subId)
      : ctx.secId
        ? nd.houses.find(h=>h.id===house).sectors[ctx.sectorId].sections.find(s=>s.id===ctx.secId)
        : nd.houses.find(h=>h.id===house).sectors[ctx.sectorId];
    if(parent) parent.items=parent.items.filter(i=>i.id!==ctx.itemId);
    nd.houses.find(h=>h.id===house).sectors[ctx.sectorId].updatedAt=now();
    persist(nd);
  }

  // ── CRUD: sections ────────────────────────────────────────────────────────
  function addSection(name) {
    const nd=clone(data); const sd=nd.houses.find(h=>h.id===house).sectors[sector];
    sd.sections.push({id:mkId(),name:name.trim(),items:[],subsections:[]});
    sd.updatedAt=now(); persist(nd);
  }
  function editSection(secId,name) {
    const nd=clone(data); const sd=nd.houses.find(h=>h.id===house).sectors[sector];
    const s=sd.sections.find(s=>s.id===secId); if(s) s.name=name.trim();
    sd.updatedAt=now(); persist(nd);
  }
  function deleteSection(secId) {
    const nd=clone(data); const sd=nd.houses.find(h=>h.id===house).sectors[sector];
    const s=sd.sections.find(s=>s.id===secId);
    if(!window.confirm(`حذف بخش «${s?.name}» و همه محتوای آن؟`)) return;
    sd.sections=sd.sections.filter(s=>s.id!==secId); sd.updatedAt=now(); persist(nd);
  }
  function addSubsection(secId,name) {
    const nd=clone(data); const sd=nd.houses.find(h=>h.id===house).sectors[sector];
    const s=sd.sections.find(s=>s.id===secId); if(!s) return;
    if(!s.subsections) s.subsections=[];
    s.subsections.push({id:mkId(),name:name.trim(),items:[]});
    sd.updatedAt=now(); persist(nd);
  }
  function editSubsection(secId,subId,name) {
    const nd=clone(data); const sd=nd.houses.find(h=>h.id===house).sectors[sector];
    const sub=sd.sections.find(s=>s.id===secId)?.subsections?.find(s=>s.id===subId);
    if(sub) sub.name=name.trim(); sd.updatedAt=now(); persist(nd);
  }
  function deleteSubsection(secId,subId) {
    const nd=clone(data); const sd=nd.houses.find(h=>h.id===house).sectors[sector];
    const s=sd.sections.find(s=>s.id===secId);
    const sub=s?.subsections?.find(s=>s.id===subId);
    if(!window.confirm(`حذف زیربخش «${sub?.name}» و همه محتوای آن؟`)) return;
    s.subsections=s.subsections.filter(s=>s.id!==subId); sd.updatedAt=now(); persist(nd);
  }

  // ── modal openers ─────────────────────────────────────────────────────────
  function openAddItem(ctx, targetLabel) {
    setModal({ type:"item", mode:"add", ctx, targetLabel,
      form:{ name:"", qty:1, unit:"عدد", status:"available", locKey:ctxToKey(ctx) } });
  }
  function openEditItem(ctx, item, targetLabel) {
    setModal({ type:"item", mode:"edit", ctx, targetLabel, originalCtx:{...ctx},
      form:{ name:item.name, qty:item.qty, unit:item.unit, status:item.status, locKey:ctxToKey(ctx) } });
  }
  function openNameModal(type,ctx,existing=null) {
    setModal({ type, mode:existing?"edit":"add", ctx, form:{ name:existing?.name||"" } });
  }

  function handleModalSave() {
    if (!modal) return;
    const { type, mode, ctx, form, originalCtx } = modal;
    if (type==="item") {
      if (!form.name.trim()) return;
      const locations = buildLocations(getHouse());
      const selectedLoc = locations.find(l=>l.key===form.locKey);
      const destCtx = selectedLoc ? { sectorId:selectedLoc.sectorId, secId:selectedLoc.secId, subId:selectedLoc.subId }
                                   : ctx;
      if (mode==="add") {
        saveItem(destCtx, form);
      } else {
        // edit: move if location changed
        const locChanged = form.locKey !== ctxToKey(originalCtx);
        if (locChanged) saveItem(destCtx, form, originalCtx);
        else saveItem({...originalCtx}, form, originalCtx);
      }
    } else if (type==="section") {
      if (!form.name.trim()) return;
      mode==="add" ? addSection(form.name) : editSection(ctx.secId, form.name);
    } else if (type==="subsection") {
      if (!form.name.trim()) return;
      mode==="add" ? addSubsection(ctx.secId, form.name) : editSubsection(ctx.secId, ctx.subId, form.name);
    }
    setModal(null);
  }

  // ── backup / restore ──────────────────────────────────────────────────────
  const doBackup = () => {
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a");
    a.href=url; a.download=`house-inventory-${new Date().toISOString().slice(0,10)}.json`; a.click();
    URL.revokeObjectURL(url);
  };
  const doRestore = e => {
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{ try {
      const d=migrate(JSON.parse(ev.target.result)); if(!d?.houses) throw new Error();
      persist(d); setHouse(d.houses[0].id); setView(d.houses[0].name?"items":"setup");
      alert("بکاپ با موفقیت بازیابی شد ✓");
    } catch(_){alert("فایل معتبر نیست");} };
    reader.readAsText(file); e.target.value="";
  };

  // ── search ────────────────────────────────────────────────────────────────
  function searchResults() {
    if (!data||!searchQ.trim()) return [];
    const q=searchQ.trim().toLowerCase(); const res=[];
    data.houses.forEach(h=>SECTORS.forEach(sec=>{
      const sd=h.sectors?.[sec.id]; if(!sd) return;
      const base={houseName:h.name,houseId:h.id,sectorId:sec.id,sectorLabel:sec.label,sectorIcon:sec.icon};
      (sd.items||[]).forEach(i=>{ if(i.name.toLowerCase().includes(q)) res.push({...i,...base,path:"مستقیم",secId:null,subId:null}); });
      (sd.sections||[]).forEach(s=>{
        (s.items||[]).forEach(i=>{ if(i.name.toLowerCase().includes(q)) res.push({...i,...base,path:s.name,secId:s.id,subId:null}); });
        (s.subsections||[]).forEach(sub=>{
          (sub.items||[]).forEach(i=>{ if(i.name.toLowerCase().includes(q)) res.push({...i,...base,path:`${s.name} › ${sub.name}`,secId:s.id,subId:sub.id}); });
        });
      });
    }));
    return res;
  }

  function getAllNeeded() {
    const res=[];
    data?.houses.forEach(h=>SECTORS.forEach(sec=>{
      const sd=h.sectors?.[sec.id]; if(!sd) return;
      const collect=(items,path)=>items?.filter(i=>i.status==="needed").forEach(i=>res.push({...i,houseName:h.name,sectorLabel:sec.label,path}));
      collect(sd.items,"مستقیم");
      (sd.sections||[]).forEach(s=>{ collect(s.items,s.name); (s.subsections||[]).forEach(sub=>collect(sub.items,`${s.name} › ${sub.name}`)); });
    }));
    return res;
  }

  function countNeeded(sd) {
    let n=0;
    (sd?.items||[]).forEach(i=>{if(i.status==="needed")n++;});
    (sd?.sections||[]).forEach(s=>{ (s.items||[]).forEach(i=>{if(i.status==="needed")n++;}); (s.subsections||[]).forEach(sub=>(sub.items||[]).forEach(i=>{if(i.status==="needed")n++;})); });
    return n;
  }

  // ── render items list with labeled add button ─────────────────────────────
  function renderItems(items, ctx, addLabel) {
    return (
      <>
        {(items||[]).map(item=>(
          <ItemRow key={item.id} item={item}
            onCycle={()=>cycleStatus({...ctx,itemId:item.id})}
            onEdit={()=>openEditItem({...ctx,itemId:item.id},item,addLabel)}
            onDelete={()=>deleteItem({...ctx,itemId:item.id})}/>
        ))}
        <button style={C.addBtn()} onClick={()=>openAddItem(ctx,addLabel)}>
          ＋ افزودن آیتم به <strong style={{color:"#555"}}>{addLabel}</strong>
        </button>
      </>
    );
  }

  if (!data) return (
    <div style={{...C.wrap,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100dvh",gap:12,color:"#888"}}>
      <link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.003/Vazirmatn-font-face.css" rel="stylesheet"/>
      <div style={{fontSize:32}}>☁️</div><div style={{fontSize:16}}>در حال اتصال...</div>
    </div>
  );

  if (view==="setup") {
    const ok=setup.every(n=>n.trim().length>0);
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

  // ── Modal ─────────────────────────────────────────────────────────────────
  if (modal) {
    const isItem=modal.type==="item";
    const isSec=modal.type==="section";
    const title=isItem?(modal.mode==="add"?"افزودن آیتم":"ویرایش آیتم"):isSec?(modal.mode==="add"?"افزودن بخش":"ویرایش بخش"):(modal.mode==="add"?"افزودن زیربخش":"ویرایش زیربخش");
    const locations = isItem ? buildLocations(getHouse()) : [];

    return (
      <div style={{fontFamily:"'Vazirmatn',Tahoma,Arial,sans-serif",direction:"rtl",position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"1.5rem 1rem",zIndex:999,overflowY:"auto"}}
        onClick={e=>{if(e.target===e.currentTarget)setModal(null);}}>
        <link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.003/Vazirmatn-font-face.css" rel="stylesheet"/>
        <div style={{background:"#fff",borderRadius:16,padding:"1.5rem",width:"100%",maxWidth:400,border:"0.5px solid #ddd",marginTop:"1rem"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.25rem"}}>
            <span style={{fontSize:18,fontWeight:500}}>{title}</span>
            <button onClick={()=>setModal(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:"#888"}}>✕</button>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {/* Name */}
            <div>
              <label style={{fontSize:15,color:"#888",display:"block",marginBottom:5}}>نام</label>
              <input style={C.input} value={modal.form.name} autoFocus
                onChange={e=>setModal(m=>({...m,form:{...m.form,name:e.target.value}}))}
                onKeyDown={e=>{ if(e.key==="Enter"&&modal.form.name.trim()) { if(isItem&&e.shiftKey) return; if(!isItem) handleModalSave(); }}}
                placeholder={isItem?"مثلاً: شیر، شامپو...":"مثلاً: کابینت، قفسه..."}/>
            </div>

            {/* Item-specific fields */}
            {isItem&&<>
              <div style={{display:"flex",gap:10}}>
                <div style={{flex:1}}>
                  <label style={{fontSize:15,color:"#888",display:"block",marginBottom:5}}>تعداد</label>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <button style={{width:30,height:34,border:"0.5px solid #ddd",borderRadius:6,background:"transparent",cursor:"pointer",fontSize:18,fontFamily:"inherit"}} onClick={()=>setModal(m=>{
                      const isP=m.form.unit==="%";
                      const step=isP?5:1; const min=isP?0:1;
                      return {...m,form:{...m.form,qty:Math.max(min,m.form.qty-step)}};
                    })}>−</button>
                    <div style={{position:"relative",width:64}}>
                      <input style={{...C.input,textAlign:"center",width:"100%",paddingLeft:modal.form.unit==="%"?"18px":"12px"}} type="number"
                        min={modal.form.unit==="%"?0:1} max={modal.form.unit==="%"?100:undefined} step={modal.form.unit==="%"?5:1}
                        value={modal.form.qty}
                        onChange={e=>setModal(m=>{
                          const isP=m.form.unit==="%";
                          const val=parseInt(e.target.value)||0;
                          const clamped=isP?Math.min(100,Math.max(0,val)):Math.max(1,val);
                          return {...m,form:{...m.form,qty:clamped}};
                        })}/>
                      {modal.form.unit==="%" && <span style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",fontSize:14,color:"#888",pointerEvents:"none"}}>%</span>}
                    </div>
                    <button style={{width:30,height:34,border:"0.5px solid #ddd",borderRadius:6,background:"transparent",cursor:"pointer",fontSize:18,fontFamily:"inherit"}} onClick={()=>setModal(m=>{
                      const isP=m.form.unit==="%";
                      const step=isP?5:1; const max=isP?100:Infinity;
                      return {...m,form:{...m.form,qty:Math.min(max,m.form.qty+step)}};
                    })}>+</button>
                  </div>
                </div>
                <div style={{flex:1}}>
                  <label style={{fontSize:15,color:"#888",display:"block",marginBottom:5}}>واحد</label>
                  <select style={C.select} value={modal.form.unit} onChange={e=>{
                    const newUnit=e.target.value;
                    setModal(m=>({...m,form:{...m.form,unit:newUnit,
                      qty: newUnit==="%"?100 : m.form.unit==="%"?1 : m.form.qty
                    }}));
                  }}>
                    {UNITS.map(u=><option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              {/* Status */}
              <div>
                <label style={{fontSize:15,color:"#888",display:"block",marginBottom:8}}>وضعیت</label>
                <div style={{display:"flex",gap:6}}>
                  {STATUSES.map(s=>(
                    <button key={s.id} onClick={()=>setModal(m=>({...m,form:{...m.form,status:s.id}}))}
                      style={{flex:1,padding:"8px 4px",borderRadius:8,fontFamily:"inherit",fontSize:14,cursor:"pointer",
                        border:modal.form.status===s.id?`2px solid ${s.color}`:"0.5px solid #eee",
                        background:modal.form.status===s.id?s.bg:"transparent",
                        color:modal.form.status===s.id?s.color:"#888",fontWeight:modal.form.status===s.id?500:400}}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Location (move to) */}
              <div>
                <label style={{fontSize:15,display:"block",marginBottom:5,color: modal.mode==="edit"?"#854F0B":"#888", fontWeight: modal.mode==="edit"?500:400}}>
                  {modal.mode==="edit"?"📍 موقعیت (انتقال به)":"📍 افزودن به"}
                </label>
                <select style={{...C.select, borderColor: modal.mode==="edit"&&modal.form.locKey!==ctxToKey(modal.originalCtx||modal.ctx)?"#854F0B":"#ddd"}}
                  value={modal.form.locKey}
                  onChange={e=>setModal(m=>({...m,form:{...m.form,locKey:e.target.value}}))}>
                  {locations.map(l=><option key={l.key} value={l.key}>{l.label}</option>)}
                </select>
                {modal.mode==="edit"&&modal.form.locKey!==ctxToKey(modal.originalCtx||modal.ctx)&&(
                  <div style={{fontSize:11,color:"#854F0B",marginTop:5}}>⚠️ آیتم به موقعیت جدید منتقل خواهد شد</div>
                )}
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

  // ── main data ─────────────────────────────────────────────────────────────
  const curSectorD  = getSectorD()||{items:[],sections:[],updatedAt:null};
  const curSectorMeta = SECTORS.find(s=>s.id===sector);
  const allNeeded   = getAllNeeded();
  const totalNeeded = allNeeded.length;
  const results     = searchResults();
  const isSearching = searchOpen&&searchQ.trim().length>0;

  return (
    <div style={C.wrap}>
      <link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.003/Vazirmatn-font-face.css" rel="stylesheet"/>
      <input type="file" accept=".json" ref={fileRef} style={{display:"none"}} onChange={doRestore}/>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"0.75rem"}}>
        <span style={{fontSize:18,fontWeight:500}}>🏠 مدیریت خانه</span>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          {syncMsg&&<span style={{fontSize:13,color:syncMsg.includes("⚠️")?"#A32D2D":"#0F6E56",fontWeight:500,whiteSpace:"nowrap"}}>{syncMsg}</span>}
          <button
            title={pushEnabled?"اعلان جمعه فعاله — بزن تا غیرفعال بشه":"اعلان هر جمعه ساعت ۱۶ — بزن تا فعال بشه"}
            style={{width:38,height:38,borderRadius:19,border:`1.5px solid ${pushEnabled?"#0F6E56":"#ddd"}`,
              background:pushEnabled?"#E1F5EE":"transparent",cursor:"pointer",fontSize:20,
              display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}
            onClick={async()=>{
              if (pushEnabled) {
                await unsubscribeFromPush(); setPushEnabled(false);
              } else {
                const sub = await subscribeToPush();
                setPushEnabled(!!sub);
                if (!sub) alert('لطفاً دسترسی نوتیفیکیشن رو در تنظیمات مرورگر فعال کن');
              }
            }}>
            {pushEnabled?"🔔":"🔕"}
          </button>
          <button style={C.navBtn(view==="shopping")} onClick={()=>{setView(v=>v==="shopping"?"items":"shopping");setSearchOpen(false);setSearchQ("");}}>
            🛒{totalNeeded>0&&<span style={{background:"#FCEBEB",color:"#A32D2D",fontSize:12,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{totalNeeded}</span>}
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{marginBottom:"0.75rem"}}>
        {searchOpen?(
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{flex:1,position:"relative"}}>
              <span style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",fontSize:18,color:"#aaa",pointerEvents:"none"}}>🔍</span>
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
          <div style={{fontSize:15,color:"#888",marginBottom:"0.75rem"}}>
            {results.length===0?`نتیجه‌ای برای «${searchQ}» پیدا نشد`:`${results.length} نتیجه`}
          </div>
          {results.length===0
            ?<div style={{textAlign:"center",padding:"2rem",color:"#ccc",fontSize:36}}>🔍</div>
            :data.houses.map(h=>{
              const hRes=results.filter(r=>r.houseId===h.id); if(!hRes.length) return null;
              return (
                <div key={h.id} style={{marginBottom:"1.25rem"}}>
                  <div style={{fontSize:15,fontWeight:500,color:"#555",marginBottom:8}}>🏠 {h.name}</div>
                  {SECTORS.map(sec=>{
                    const sRes=hRes.filter(r=>r.sectorId===sec.id); if(!sRes.length) return null;
                    return (
                      <div key={sec.id} style={{marginBottom:8}}>
                        <div style={{fontSize:13,color:"#aaa",marginBottom:5}}>{sec.icon} {sec.label}</div>
                        {sRes.map(item=>{
                          const st=statusOf(item.status);
                          return (
                            <div key={item.id} style={{...C.itemRow,cursor:"pointer"}} onClick={()=>{
                              setHouse(item.houseId);
                              setSector(item.sectorId);
                              setView("items");
                              setSearchOpen(false);
                              setSearchQ("");
                              // expand parent section and subsection
                              setExpanded(e=>{
                                const next={...e};
                                if(item.secId) next[item.secId]=true;
                                if(item.subId) next[item.subId]=true;
                                return next;
                              });
                              // scroll + highlight the exact item
                              setHighlightItemId(item.id);
                            }}>
                              <div style={{flex:1,minWidth:0}}>
                                <span style={{fontSize:15,fontWeight:500}}>{highlight(item.name,searchQ)}</span>
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
          <div style={{display:"flex",gap:8,marginBottom:"0.75rem"}}>
            <button style={C.smBtn} onClick={doBackup}>💾 بکاپ</button>
            <button style={C.smBtn} onClick={()=>fileRef.current.click()}>📂 بازیابی</button>
            <button style={{...C.smBtn, marginRight:"auto",
              background: pushEnabled?"#E1F5EE":"transparent",
              color: pushEnabled?"#0F6E56":"#555",
              border: pushEnabled?"0.5px solid #0F6E56":"0.5px solid #ddd"}}
              onClick={async()=>{
                if (pushEnabled) {
                  await unsubscribeFromPush(); setPushEnabled(false);
                } else {
                  const sub = await subscribeToPush();
                  setPushEnabled(!!sub);
                  if (!sub) alert('لطفاً دسترسی نوتیفیکیشن رو در مرورگر فعال کن');
                }
              }}>
              {pushEnabled ? "🔔 اعلان فعاله" : "🔕 اعلان جمعه"}
            </button>
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
                    <button style={C.iconBtn()} onClick={()=>{setRenaming(h.id);setNameDraft(h.name);}}>✏️</button>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Shopping View */}
          {view==="shopping"?(
            <div>
              {allNeeded.length===0
                ?<div style={{textAlign:"center",padding:"3rem 1rem",color:"#888"}}><div style={{fontSize:36,marginBottom:10}}>✅</div><p style={{fontSize:14}}>همه چیز موجوده!</p></div>
                :data.houses.map(h=>{
                    const hItems=allNeeded.filter(i=>i.houseName===h.name); if(!hItems.length) return null;
                    return (
                      <div key={h.id} style={{marginBottom:"1.5rem"}}>
                        <div style={{fontSize:15,fontWeight:500,color:"#666",marginBottom:10}}>🏠 {h.name}</div>
                        {SECTORS.map(sec=>{
                          const its=hItems.filter(i=>i.sectorLabel===sec.label); if(!its.length) return null;
                          return (
                            <div key={sec.id} style={{marginBottom:10}}>
                              <div style={{fontSize:13,color:"#aaa",marginBottom:6}}>{sec.icon} {sec.label}</div>
                              {its.map(item=>(
                                <div key={item.id} style={{...C.itemRow,justifyContent:"space-between"}}>
                                  <div><span style={{fontSize:15,fontWeight:500}}>{item.name}</span><span style={{fontSize:11,color:"#bbb",display:"block"}}>{item.path}</span></div>
                                  <span style={{fontSize:14,color:"#888"}}>{item.qty} {item.unit}</span>
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
                  const n=countNeeded(getSectorD(data,sec.id));
                  return (
                    <button key={sec.id} style={C.secTab(sector===sec.id)} onClick={()=>setSector(sec.id)}>
                      <span style={{fontSize:24}}>{sec.icon}</span>
                      <span style={{fontSize:13}}>{sec.label}</span>
                      {n>0&&<span style={{background:"#FCEBEB",color:"#A32D2D",fontSize:11,fontWeight:700,padding:"1px 5px",borderRadius:8}}>{n}</span>}
                    </button>
                  );
                })}
              </div>

              {curSectorD.updatedAt&&(
                <div style={{fontSize:13,color:"#ccc",marginBottom:"0.75rem",textAlign:"left"}}>آخرین بروزرسانی: {formatDate(curSectorD.updatedAt)}</div>
              )}

              {/* Direct items in sector */}
              {renderItems(curSectorD.items, {sectorId:sector}, `${curSectorMeta?.icon} ${curSectorMeta?.label} (مستقیم)`)}

              {/* Sections */}
              {(curSectorD.sections||[]).map(sec=>(
                <div key={sec.id} style={C.sectionBox}>
                  <div style={C.sectionHead} onClick={()=>setExpanded(e=>({...e,[sec.id]:!e[sec.id]}))}>
                    <span style={{fontSize:14}}>{expanded[sec.id]?"▾":"▸"}</span>
                    <span style={{fontSize:16,fontWeight:500,flex:1}}>{sec.name}</span>
                    <span style={{fontSize:13,color:"#bbb"}}>
                      {(sec.items?.length||0)+(sec.subsections?.reduce((a,s)=>a+(s.items?.length||0),0)||0)} آیتم
                    </span>
                    <button style={C.iconBtn()} onClick={e=>{e.stopPropagation();openNameModal("subsection",{secId:sec.id});}}>＋زیربخش</button>
                    <button style={C.iconBtn()} onClick={e=>{e.stopPropagation();openNameModal("section",{secId:sec.id},sec);}}>✏️</button>
                    <button style={C.iconBtn("danger")} onClick={e=>{e.stopPropagation();deleteSection(sec.id);}}>🗑️</button>
                  </div>
                  {expanded[sec.id]&&(
                    <div style={{padding:"10px 12px"}}>
                      {renderItems(sec.items, {sectorId:sector,secId:sec.id}, sec.name)}
                      {(sec.subsections||[]).map(sub=>(
                        <div key={sub.id} style={C.subBox}>
                          <div style={C.subHead} onClick={()=>setExpanded(e=>({...e,[sub.id]:!e[sub.id]}))}>
                            <span style={{fontSize:13}}>{expanded[sub.id]?"▾":"▸"}</span>
                            <span style={{fontSize:15,fontWeight:500,flex:1}}>{sub.name}</span>
                            <span style={{fontSize:13,color:"#bbb"}}>{sub.items?.length||0} آیتم</span>
                            <button style={C.iconBtn()} onClick={e=>{e.stopPropagation();openNameModal("subsection",{secId:sec.id,subId:sub.id},sub);}}>✏️</button>
                            <button style={C.iconBtn("danger")} onClick={e=>{e.stopPropagation();deleteSubsection(sec.id,sub.id);}}>🗑️</button>
                          </div>
                          {expanded[sub.id]&&(
                            <div style={{padding:"8px 12px"}}>
                              {renderItems(sub.items, {sectorId:sector,secId:sec.id,subId:sub.id}, `${sec.name} › ${sub.name}`)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <button style={{...C.addBtn("#aaa"),justifyContent:"center",padding:"9px",marginTop:10}} onClick={()=>openNameModal("section",{})}>
                ＋ افزودن بخش جدید به {curSectorMeta?.label}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
