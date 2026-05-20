import { useState, useEffect, useRef } from "react";

const KEY = "houseInventory_v4";

const SECTIONS = [
  { id: "yakhchal", label: "یخچال", icon: "❄️" },
  { id: "ashpazkhane", label: "آشپزخانه", icon: "🍳" },
  { id: "anbar", label: "انباری", icon: "📦" },
  { id: "hamam", label: "حمام", icon: "🚿" },
];

const STATUSES = [
  { id: "available", label: "موجود", color: "#0F6E56", bg: "#E1F5EE" },
  { id: "low",       label: "رو به اتمام", color: "#854F0B", bg: "#FAEEDA" },
  { id: "needed",    label: "باید بخرم",  color: "#A32D2D", bg: "#FCEBEB" },
];

const UNITS = ["عدد","بسته","کیلوگرم","گرم","لیتر","میلی‌لیتر","جعبه","شیشه","قوطی"];

const mkId  = () => Math.random().toString(36).slice(2,9);
const clone = x  => JSON.parse(JSON.stringify(x));
const now   = ()  => new Date().toISOString();

const emptyHouse = (name="") => ({
  id: mkId(), name,
  sections: Object.fromEntries(SECTIONS.map(s => [s.id, { items: [], updatedAt: null }]))
});

const DEFAULT = {
  version: 4,
  houses: [ emptyHouse(""), emptyHouse("") ],
};

/* ── storage helpers ── */
function readStorage() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d && d.version === 4 && Array.isArray(d.houses)) return d;
  } catch(_) {}
  return null;
}
function writeStorage(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); return true; }
  catch(_) { return false; }
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const pad = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())}  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ── styles ── */
const S = {
  wrap:       { fontFamily:"'Vazirmatn',Tahoma,Arial,sans-serif", direction:"rtl", maxWidth:640, margin:"0 auto", padding:"1rem", color:"#111", background:"#fff", minHeight:"100dvh" },
  row:        { display:"flex", alignItems:"center", gap:8 },
  card:       { background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:12, padding:"11px 14px", display:"flex", alignItems:"center", gap:8, marginBottom:8 },
  input:      { width:"100%", padding:"9px 12px", border:"0.5px solid #ddd", borderRadius:8, fontFamily:"inherit", fontSize:14, background:"#fff", color:"#111", direction:"rtl", outline:"none" },
  select:     { width:"100%", padding:"9px 12px", border:"0.5px solid #ddd", borderRadius:8, fontFamily:"inherit", fontSize:14, background:"#fff", color:"#111", direction:"rtl", cursor:"pointer", outline:"none" },
  primaryBtn: { padding:"9px 20px", borderRadius:8, border:"none", background:"#111", color:"#fff", fontFamily:"inherit", fontSize:14, fontWeight:500, cursor:"pointer" },
  cancelBtn:  { padding:"9px 20px", borderRadius:8, border:"0.5px solid #ddd", background:"transparent", color:"#666", fontFamily:"inherit", fontSize:14, cursor:"pointer" },
  addBtn:     { width:"100%", padding:"10px", border:"0.5px dashed #ccc", borderRadius:12, background:"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:14, color:"#888", display:"flex", alignItems:"center", justifyContent:"center", gap:6, marginTop:4 },
  badge:      s => ({ display:"inline-flex", alignItems:"center", padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:500, cursor:"pointer", background:s.bg, color:s.color, whiteSpace:"nowrap", border:"none", fontFamily:"inherit" }),
  iconBtn:    danger => ({ width:30, height:30, border:"0.5px solid #e5e5e5", borderRadius:8, background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, color: danger?"#A32D2D":"#888", fontFamily:"inherit", flexShrink:0 }),
  houseTab:   a => ({ padding:"7px 14px", borderRadius:24, border:`1px solid ${a?"#111":"#ddd"}`, background:a?"#111":"transparent", color:a?"#fff":"#555", cursor:"pointer", fontFamily:"inherit", fontSize:14, fontWeight:500, whiteSpace:"nowrap" }),
  secTab:     a => ({ flex:1, padding:"10px 4px", border:"none", borderBottom:`2px solid ${a?"#111":"transparent"}`, background:"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:13, color:a?"#111":"#888", fontWeight:a?500:400, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }),
  pill:       a => ({ padding:"4px 12px", borderRadius:20, border:`0.5px solid ${a?"#bbb":"#eee"}`, background:a?"#f5f5f5":"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:12, color:a?"#111":"#888", fontWeight:a?500:400 }),
  navBtn:     a => ({ padding:"7px 12px", border:`0.5px solid ${a?"#F09595":"#ddd"}`, borderRadius:20, background:a?"#FCEBEB":"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:13, color:a?"#A32D2D":"#888", display:"flex", alignItems:"center", gap:5, fontWeight:a?500:400 }),
  smBtn:      { padding:"6px 12px", borderRadius:8, border:"0.5px solid #ddd", background:"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:12, color:"#555", display:"flex", alignItems:"center", gap:5 },
};

export default function App() {
  const [data,      setData]      = useState(null);
  const [house,     setHouse]     = useState(null);
  const [section,   setSection]   = useState("yakhchal");
  const [view,      setView]      = useState("items");
  const [modal,     setModal]     = useState(null);
  const [form,      setForm]      = useState({ name:"", qty:1, unit:"عدد", status:"available" });
  const [filter,    setFilter]    = useState("all");
  const [renaming,  setRenaming]  = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const [setup,     setSetup]     = useState(["",""]);
  const [savedMsg,  setSavedMsg]  = useState("");
  const fileRef = useRef();

  /* ── init ── */
  useEffect(() => {
    const stored = readStorage();
    if (stored) {
      setData(stored);
      setHouse(stored.houses[0].id);
      setView(stored.houses[0].name ? "items" : "setup");
    } else {
      const d = clone(DEFAULT);
      setData(d);
      setHouse(d.houses[0].id);
      setView("setup");
    }
  }, []);

  const persist = (nd) => {
    setData(nd);
    const ok = writeStorage(nd);
    if (ok) { setSavedMsg("✓ ذخیره شد"); setTimeout(() => setSavedMsg(""), 2000); }
    else     { setSavedMsg("⚠️ خطا در ذخیره"); setTimeout(() => setSavedMsg(""), 3000); }
  };

  /* ── backup / restore ── */
  const doBackup = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `house-inventory-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doRestore = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const d = JSON.parse(ev.target.result);
        if (!d.houses) throw new Error("invalid");
        d.version = 4;
        d.houses.forEach(h => {
          SECTIONS.forEach(s => {
            if (!h.sections[s.id]) h.sections[s.id] = { items:[], updatedAt:null };
            if (Array.isArray(h.sections[s.id])) h.sections[s.id] = { items: h.sections[s.id], updatedAt: null };
          });
        });
        persist(d);
        setHouse(d.houses[0].id);
        setView(d.houses[0].name ? "items" : "setup");
        alert("بکاپ با موفقیت بازیابی شد ✓");
      } catch(_) { alert("فایل معتبر نیست"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  if (!data) return <div style={{...S.wrap, textAlign:"center", paddingTop:"4rem", color:"#888"}}>در حال بارگذاری...</div>;

  /* ── SETUP SCREEN ── */
  if (view === "setup") {
    const ok = setup.every(n => n.trim().length > 0);
    return (
      <div style={{...S.wrap, display:"flex", flexDirection:"column", justifyContent:"center", padding:"2rem 1.5rem"}}>
        <link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.003/Vazirmatn-font-face.css" rel="stylesheet"/>
        <div style={{fontSize:40, textAlign:"center", marginBottom:12}}>🏠</div>
        <h1 style={{fontSize:20, fontWeight:500, textAlign:"center", marginBottom:6}}>مدیریت موجودی خانه</h1>
        <p style={{fontSize:14, color:"#888", textAlign:"center", marginBottom:"2rem"}}>برای هر خانه یک اسم انتخاب کن</p>
        {data.houses.map((h,i) => (
          <div key={h.id} style={{marginBottom:"1rem"}}>
            <label style={{fontSize:13, color:"#666", display:"block", marginBottom:6}}>خانه {i+1}</label>
            <input style={{...S.input, fontSize:15, padding:"11px 14px"}}
              placeholder="مثلاً: خانه تهران، ویلا، آپارتمان..."
              value={setup[i]}
              onChange={e => { const u=[...setup]; u[i]=e.target.value; setSetup(u); }}
            />
          </div>
        ))}
        <button style={{...S.primaryBtn, width:"100%", padding:"12px", marginTop:"0.5rem", fontSize:15, opacity: ok?1:0.4}}
          disabled={!ok}
          onClick={() => {
            const nd = clone(data);
            nd.houses.forEach((h,i) => { h.name = setup[i].trim(); });
            persist(nd);
            setView("items");
          }}>
          شروع کن ✓
        </button>
      </div>
    );
  }

  /* ── MODAL ── */
  if (modal) {
    return (
      <div style={{fontFamily:"'Vazirmatn',Tahoma,Arial,sans-serif", direction:"rtl", minHeight:520, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"2rem 1rem"}}>
        <link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.003/Vazirmatn-font-face.css" rel="stylesheet"/>
        <div style={{background:"#fff", borderRadius:16, padding:"1.5rem", width:"100%", maxWidth:380, border:"0.5px solid #ddd"}}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1.25rem"}}>
            <span style={{fontSize:16, fontWeight:500}}>{modal==="add"?"افزودن آیتم":"ویرایش آیتم"}</span>
            <button onClick={()=>setModal(null)} style={{background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#888"}}>✕</button>
          </div>
          <div style={{display:"flex", flexDirection:"column", gap:14}}>
            <div>
              <label style={{fontSize:12, color:"#888", display:"block", marginBottom:5}}>نام</label>
              <input style={S.input} value={form.name} autoFocus
                onChange={e=>setForm(f=>({...f,name:e.target.value}))}
                onKeyDown={e=>e.key==="Enter"&&form.name.trim()&&handleSave()}
                placeholder="مثلاً: شیر، شامپو، برنج..."/>
            </div>
            <div style={{display:"flex", gap:10}}>
              <div style={{flex:1}}>
                <label style={{fontSize:12, color:"#888", display:"block", marginBottom:5}}>تعداد</label>
                <div style={{display:"flex", alignItems:"center", gap:6}}>
                  <button style={{width:30,height:34,border:"0.5px solid #ddd",borderRadius:6,background:"transparent",cursor:"pointer",fontSize:18,fontFamily:"inherit"}} onClick={()=>setForm(f=>({...f,qty:Math.max(1,f.qty-1)}))}>−</button>
                  <input style={{...S.input,textAlign:"center",width:52}} type="number" min="1" value={form.qty} onChange={e=>setForm(f=>({...f,qty:Math.max(1,parseInt(e.target.value)||1)}))}/>
                  <button style={{width:30,height:34,border:"0.5px solid #ddd",borderRadius:6,background:"transparent",cursor:"pointer",fontSize:18,fontFamily:"inherit"}} onClick={()=>setForm(f=>({...f,qty:f.qty+1}))}>+</button>
                </div>
              </div>
              <div style={{flex:1}}>
                <label style={{fontSize:12, color:"#888", display:"block", marginBottom:5}}>واحد</label>
                <select style={S.select} value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))}>
                  {UNITS.map(u=><option key={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={{fontSize:12, color:"#888", display:"block", marginBottom:8}}>وضعیت</label>
              <div style={{display:"flex", gap:6}}>
                {STATUSES.map(s=>(
                  <button key={s.id} onClick={()=>setForm(f=>({...f,status:s.id}))}
                    style={{flex:1,padding:"8px 4px",borderRadius:8,fontFamily:"inherit",fontSize:12,cursor:"pointer",
                      border: form.status===s.id?`2px solid ${s.color}`:"0.5px solid #eee",
                      background: form.status===s.id?s.bg:"transparent",
                      color: form.status===s.id?s.color:"#888",
                      fontWeight: form.status===s.id?500:400}}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div style={{display:"flex", gap:8, marginTop:"1.25rem"}}>
            <button style={S.primaryBtn} onClick={handleSave} disabled={!form.name.trim()}>{modal==="add"?"افزودن":"ذخیره"}</button>
            <button style={S.cancelBtn}  onClick={()=>setModal(null)}>انصراف</button>
          </div>
        </div>
      </div>
    );
  }

  /* ── helpers ── */
  const curHouse   = data.houses.find(h=>h.id===house);
  const secData    = curHouse?.sections[section] || { items:[], updatedAt:null };
  const items      = secData.items || [];
  const shown      = filter==="all" ? items : items.filter(i=>i.status===filter);
  const statusOf   = id => STATUSES.find(s=>s.id===id)||STATUSES[0];
  const needCount  = (hid,sid) => (data.houses.find(h=>h.id===hid)?.sections[sid]?.items||[]).filter(i=>i.status==="needed").length;
  const totalNeeded= data.houses.reduce((a,h)=>a+SECTIONS.reduce((b,s)=>b+needCount(h.id,s.id),0),0);

  const allNeeded=[];
  data.houses.forEach(h=>SECTIONS.forEach(s=>{
    (h.sections[s.id]?.items||[]).filter(i=>i.status==="needed").forEach(i=>allNeeded.push({...i,houseName:h.name,secLabel:s.label}));
  }));

  function handleSave() {
    if (!form.name.trim()) return;
    const nd = clone(data);
    const sec = nd.houses.find(h=>h.id===house).sections;
    if (!sec[section] || !sec[section].items) sec[section] = { items:[], updatedAt:null };
    if (modal==="add") {
      sec[section].items.push({ id:mkId(), name:form.name.trim(), qty:form.qty, unit:form.unit, status:form.status });
    } else {
      const idx = sec[section].items.findIndex(i=>i.id===form.id);
      if (idx>=0) sec[section].items[idx] = { id:form.id, name:form.name.trim(), qty:form.qty, unit:form.unit, status:form.status };
    }
    sec[section].updatedAt = now();
    persist(nd);
    setModal(null);
  }

  function cycleStatus(itemId) {
    const order=["available","low","needed"];
    const nd=clone(data);
    const sec=nd.houses.find(h=>h.id===house).sections[section];
    const it=sec.items.find(i=>i.id===itemId);
    it.status=order[(order.indexOf(it.status)+1)%3];
    sec.updatedAt=now();
    persist(nd);
  }

  function deleteItem(itemId) {
    const nd=clone(data);
    const sec=nd.houses.find(h=>h.id===house).sections[section];
    sec.items=sec.items.filter(i=>i.id!==itemId);
    sec.updatedAt=now();
    persist(nd);
  }

  function finishRename() {
    if (!nameDraft.trim()) { setRenaming(null); return; }
    const nd=clone(data);
    nd.houses.find(h=>h.id===renaming).name=nameDraft.trim();
    persist(nd);
    setRenaming(null);
  }

  /* ── MAIN UI ── */
  return (
    <div style={S.wrap}>
      <link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.003/Vazirmatn-font-face.css" rel="stylesheet"/>
      <input type="file" accept=".json" ref={fileRef} style={{display:"none"}} onChange={doRestore}/>

      {/* Header */}
      <div style={{...S.row, justifyContent:"space-between", marginBottom:"1rem"}}>
        <span style={{fontSize:18, fontWeight:500}}>🏠 مدیریت خانه</span>
        <div style={{display:"flex", alignItems:"center", gap:6}}>
          {savedMsg && <span style={{fontSize:11, color:"#0F6E56", fontWeight:500}}>{savedMsg}</span>}
          <button style={S.navBtn(view==="shopping")} onClick={()=>setView(v=>v==="shopping"?"items":"shopping")}>
            🛒 لیست خرید
            {totalNeeded>0 && <span style={{background:"#FCEBEB",color:"#A32D2D",fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:10}}>{totalNeeded}</span>}
          </button>
        </div>
      </div>

      {/* Backup / Restore */}
      <div style={{display:"flex", gap:8, marginBottom:"1rem"}}>
        <button style={S.smBtn} onClick={doBackup}>💾 بکاپ</button>
        <button style={S.smBtn} onClick={()=>fileRef.current.click()}>📂 بازیابی</button>
      </div>

      {/* House Tabs */}
      <div style={{...S.row, marginBottom:"1rem", flexWrap:"wrap", gap:8}}>
        {data.houses.map(h=>(
          <div key={h.id} style={{display:"flex", alignItems:"center", gap:4}}>
            {renaming===h.id ? (
              <input autoFocus value={nameDraft}
                style={{border:"none",borderBottom:"1.5px solid #111",background:"transparent",fontFamily:"inherit",fontSize:14,fontWeight:500,color:"#111",direction:"rtl",outline:"none",minWidth:100}}
                onChange={e=>setNameDraft(e.target.value)}
                onBlur={finishRename}
                onKeyDown={e=>{if(e.key==="Enter")finishRename();if(e.key==="Escape")setRenaming(null);}}/>
            ):(
              <>
                <button style={S.houseTab(house===h.id)} onClick={()=>{setHouse(h.id);setView("items");setFilter("all");}}>
                  {h.name}
                </button>
                <button title="تغییر نام" onClick={()=>{setRenaming(h.id);setNameDraft(h.name);}}
                  style={{width:26,height:26,border:"0.5px solid #eee",borderRadius:6,background:"transparent",cursor:"pointer",fontSize:13,color:"#aaa",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  ✏️
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Shopping View */}
      {view==="shopping" ? (
        <div>
          {allNeeded.length===0
            ? <div style={{textAlign:"center",padding:"3rem 1rem",color:"#888"}}>
                <div style={{fontSize:36,marginBottom:10}}>✅</div>
                <p style={{fontSize:14}}>همه چیز موجوده! نیازی به خرید نیست.</p>
              </div>
            : data.houses.map(h=>{
                const hItems=allNeeded.filter(i=>i.houseName===h.name);
                if(!hItems.length) return null;
                return (
                  <div key={h.id} style={{marginBottom:"1.5rem"}}>
                    <div style={{fontSize:13,fontWeight:500,color:"#666",marginBottom:10}}>🏠 {h.name}</div>
                    {SECTIONS.map(sec=>{
                      const its=hItems.filter(i=>i.secLabel===sec.label);
                      if(!its.length) return null;
                      return (
                        <div key={sec.id} style={{marginBottom:10}}>
                          <div style={{fontSize:11,color:"#aaa",marginBottom:6}}>{sec.icon} {sec.label}</div>
                          {its.map(item=>(
                            <div key={item.id} style={{...S.card,justifyContent:"space-between"}}>
                              <span style={{fontSize:14,fontWeight:500}}>{item.name}</span>
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
      ) : (
        /* Items View */
        <div>
          {/* Section Tabs */}
          <div style={{display:"flex",borderBottom:"0.5px solid #eee",marginBottom:"1rem"}}>
            {SECTIONS.map(sec=>{
              const n=needCount(house,sec.id);
              const ts=curHouse?.sections[sec.id]?.updatedAt;
              return (
                <button key={sec.id} style={S.secTab(section===sec.id)} onClick={()=>{setSection(sec.id);setFilter("all");}}>
                  <span style={{fontSize:20}}>{sec.icon}</span>
                  <span style={{fontSize:11}}>{sec.label}</span>
                  {n>0 && <span style={{background:"#FCEBEB",color:"#A32D2D",fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:8}}>{n}</span>}
                </button>
              );
            })}
          </div>

          {/* Last updated */}
          {secData.updatedAt && (
            <div style={{fontSize:11,color:"#bbb",marginBottom:"0.75rem",textAlign:"left"}}>
              آخرین بروزرسانی: {formatDate(secData.updatedAt)}
            </div>
          )}

          {/* Filters */}
          <div style={{display:"flex",gap:6,marginBottom:"1rem",flexWrap:"wrap"}}>
            {[["all",`همه (${items.length})`],...STATUSES.map(s=>[s.id,`${s.label} (${items.filter(i=>i.status===s.id).length})`])].map(([val,lbl])=>(
              <button key={val} style={S.pill(filter===val)} onClick={()=>setFilter(val)}>{lbl}</button>
            ))}
          </div>

          {/* Item list */}
          {shown.length===0
            ? <div style={{textAlign:"center",padding:"2.5rem 1rem",color:"#aaa"}}>
                <div style={{fontSize:32,marginBottom:10}}>{SECTIONS.find(s=>s.id===section)?.icon}</div>
                <p style={{fontSize:13}}>{filter==="all"?"هنوز آیتمی ثبت نشده":"آیتمی با این فیلتر پیدا نشد"}</p>
              </div>
            : shown.map(item=>{
                const s=statusOf(item.status);
                return (
                  <div key={item.id} style={S.card}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <span style={{fontSize:14,fontWeight:500}}>{item.name}</span>
                        <span style={{fontSize:12,color:"#888"}}>{item.qty} {item.unit}</span>
                      </div>
                    </div>
                    <button style={S.badge(s)} onClick={()=>cycleStatus(item.id)} title="کلیک برای تغییر وضعیت">{s.label}</button>
                    <button style={S.iconBtn(false)} onClick={()=>{setForm({name:item.name,qty:item.qty,unit:item.unit,status:item.status,id:item.id});setModal("edit");}}>✏️</button>
                    <button style={S.iconBtn(true)}  onClick={()=>deleteItem(item.id)}>🗑️</button>
                  </div>
                );
              })
          }
          <button style={S.addBtn} onClick={()=>{setForm({name:"",qty:1,unit:"عدد",status:"available"});setModal("add");}}>+ افزودن آیتم</button>
        </div>
      )}
    </div>
  );
}
