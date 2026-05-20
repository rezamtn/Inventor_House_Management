import { useState, useEffect } from "react";

const STORAGE_KEY = "home-inventory-v2";

const SECTIONS = [
  { id: "yakhchal", label: "یخچال", icon: "❄️" },
  { id: "ashpazkhane", label: "آشپزخانه", icon: "🍳" },
  { id: "anbar", label: "انباری", icon: "📦" },
  { id: "hamam", label: "حمام", icon: "🚿" },
];

const STATUSES = [
  { id: "available", label: "موجود", color: "#0F6E56", bg: "#E1F5EE" },
  { id: "low", label: "رو به اتمام", color: "#854F0B", bg: "#FAEEDA" },
  { id: "needed", label: "باید بخرم", color: "#A32D2D", bg: "#FCEBEB" },
];

const UNITS = ["عدد", "بسته", "کیلوگرم", "گرم", "لیتر", "میلی‌لیتر", "جعبه", "شیشه", "قوطی"];

const mkId = () => Math.random().toString(36).slice(2, 9);

const defaultData = {
  houses: [
    { id: "h1", name: "خانه اول", sections: { yakhchal: [], ashpazkhane: [], anbar: [], hamam: [] } },
    { id: "h2", name: "خانه دوم", sections: { yakhchal: [], ashpazkhane: [], anbar: [], hamam: [] } },
  ],
};

function deepClone(x) { return JSON.parse(JSON.stringify(x)); }

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return deepClone(defaultData);
}

function saveData(d) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch (_) {}
}

const S = {
  wrap: { fontFamily: "'Vazirmatn', Tahoma, Arial, sans-serif", direction: "rtl", maxWidth: 640, margin: "0 auto", padding: "1rem", color: "#111", minHeight: "100dvh", background: "#fff" },
  row: { display: "flex", alignItems: "center", gap: 8 },
  houseTab: (active) => ({
    padding: "7px 18px", borderRadius: 24,
    border: `0.5px solid ${active ? "#111" : "#ddd"}`,
    background: active ? "#111" : "transparent",
    color: active ? "#fff" : "#666",
    cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 500, whiteSpace: "nowrap",
  }),
  secTab: (active) => ({
    flex: 1, padding: "10px 4px", border: "none", borderBottom: `2px solid ${active ? "#111" : "transparent"}`,
    background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 13,
    color: active ? "#111" : "#888", fontWeight: active ? 500 : 400,
    display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
  }),
  card: { background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "11px 14px", display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  badge: (st) => ({ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: "pointer", background: st.bg, color: st.color, whiteSpace: "nowrap", border: "none", fontFamily: "inherit" }),
  iconBtn: (danger) => ({ width: 30, height: 30, border: "0.5px solid #e5e5e5", borderRadius: 8, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: danger ? "#A32D2D" : "#888", fontFamily: "inherit" }),
  addBtn: { width: "100%", padding: "10px", border: "0.5px dashed #ccc", borderRadius: 12, background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 14, color: "#888", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4 },
  input: { width: "100%", padding: "9px 12px", border: "0.5px solid #ddd", borderRadius: 8, fontFamily: "inherit", fontSize: 14, background: "#fff", color: "#111", direction: "rtl" },
  select: { width: "100%", padding: "9px 12px", border: "0.5px solid #ddd", borderRadius: 8, fontFamily: "inherit", fontSize: 14, background: "#fff", color: "#111", direction: "rtl", cursor: "pointer" },
  primaryBtn: { padding: "9px 20px", borderRadius: 8, border: "none", background: "#111", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 500, cursor: "pointer" },
  cancelBtn: { padding: "9px 20px", borderRadius: 8, border: "0.5px solid #ddd", background: "transparent", color: "#666", fontFamily: "inherit", fontSize: 14, cursor: "pointer" },
  pill: (active) => ({ padding: "4px 12px", borderRadius: 20, border: `0.5px solid ${active ? "#ccc" : "#eee"}`, background: active ? "#f5f5f5" : "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 12, color: active ? "#111" : "#888", fontWeight: active ? 500 : 400 }),
  navBtn: (active) => ({ padding: "7px 14px", border: `0.5px solid ${active ? "#F09595" : "#ddd"}`, borderRadius: 20, background: active ? "#FCEBEB" : "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: active ? "#A32D2D" : "#888", display: "flex", alignItems: "center", gap: 6, fontWeight: active ? 500 : 400 }),
};

export default function App() {
  const [data, setData] = useState(() => loadData());
  const [house, setHouse] = useState("h1");
  const [section, setSection] = useState("yakhchal");
  const [view, setView] = useState("items");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: "", qty: 1, unit: "عدد", status: "available" });
  const [filter, setFilter] = useState("all");
  const [editHouse, setEditHouse] = useState(null);
  const [houseNameDraft, setHouseNameDraft] = useState("");

  const persist = (newData) => { setData(newData); saveData(newData); };

  const curHouse = data.houses.find(h => h.id === house);
  const items = (curHouse.sections[section] || []);
  const shown = filter === "all" ? items : items.filter(i => i.status === filter);

  const countNeeded = (hid, sid) => (data.houses.find(h => h.id === hid)?.sections[sid] || []).filter(i => i.status === "needed").length;
  const totalNeeded = data.houses.reduce((a, h) => a + SECTIONS.reduce((b, s) => b + countNeeded(h.id, s.id), 0), 0);

  const allNeeded = [];
  data.houses.forEach(h => SECTIONS.forEach(s => {
    (h.sections[s.id] || []).filter(i => i.status === "needed").forEach(i =>
      allNeeded.push({ ...i, houseName: h.name, secLabel: s.label })
    );
  }));

  const cycleStatus = (itemId) => {
    const order = ["available", "low", "needed"];
    const nd = deepClone(data);
    const h = nd.houses.find(h => h.id === house);
    const it = h.sections[section].find(i => i.id === itemId);
    it.status = order[(order.indexOf(it.status) + 1) % 3];
    persist(nd);
  };

  const deleteItem = (itemId) => {
    const nd = deepClone(data);
    nd.houses.find(h => h.id === house).sections[section] =
      nd.houses.find(h => h.id === house).sections[section].filter(i => i.id !== itemId);
    persist(nd);
  };

  const openAdd = () => { setForm({ name: "", qty: 1, unit: "عدد", status: "available" }); setModal("add"); };
  const openEdit = (item) => { setForm({ name: item.name, qty: item.qty ?? 1, unit: item.unit, status: item.status, id: item.id }); setModal("edit"); };

  const handleSave = () => {
    if (!form.name.trim()) return;
    const nd = deepClone(data);
    const sec = nd.houses.find(h => h.id === house).sections;
    if (modal === "add") {
      sec[section].push({ id: mkId(), name: form.name.trim(), qty: form.qty, unit: form.unit, status: form.status });
    } else {
      const idx = sec[section].findIndex(i => i.id === form.id);
      if (idx >= 0) sec[section][idx] = { id: form.id, name: form.name.trim(), qty: form.qty, unit: form.unit, status: form.status };
    }
    persist(nd);
    setModal(null);
  };

  const renameHouse = () => {
    if (!houseNameDraft.trim()) { setEditHouse(null); return; }
    const nd = deepClone(data);
    nd.houses.find(h => h.id === editHouse).name = houseNameDraft.trim();
    persist(nd);
    setEditHouse(null);
  };

  const statusOf = (id) => STATUSES.find(s => s.id === id) || STATUSES[0];

  const ModalContent = () => (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "2rem 1rem", zIndex: 999 }}
      onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "1.5rem", width: "100%", maxWidth: 380, border: "0.5px solid #ddd" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <span style={{ fontSize: 16, fontWeight: 500 }}>{modal === "add" ? "افزودن آیتم" : "ویرایش آیتم"}</span>
          <button onClick={() => setModal(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#888", lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 5 }}>نام</label>
            <input style={S.input} value={form.name} autoFocus
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && handleSave()}
              placeholder="مثلاً: شیر، شامپو، برنج..." />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 5 }}>تعداد</label>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button style={{ width: 30, height: 34, border: "0.5px solid #ddd", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 18, fontFamily: "inherit" }}
                  onClick={() => setForm(f => ({ ...f, qty: Math.max(1, f.qty - 1) }))}>−</button>
                <input style={{ ...S.input, textAlign: "center", width: 52 }} type="number" min="1"
                  value={form.qty} onChange={e => setForm(f => ({ ...f, qty: Math.max(1, parseInt(e.target.value) || 1) }))} />
                <button style={{ width: 30, height: 34, border: "0.5px solid #ddd", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 18, fontFamily: "inherit" }}
                  onClick={() => setForm(f => ({ ...f, qty: f.qty + 1 }))}>+</button>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 5 }}>واحد</label>
              <select style={S.select} value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                {UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 8 }}>وضعیت</label>
            <div style={{ display: "flex", gap: 6 }}>
              {STATUSES.map(s => (
                <button key={s.id} onClick={() => setForm(f => ({ ...f, status: s.id }))}
                  style={{ flex: 1, padding: "8px 4px", borderRadius: 8, fontFamily: "inherit", fontSize: 12, cursor: "pointer",
                    border: form.status === s.id ? `2px solid ${s.color}` : "0.5px solid #eee",
                    background: form.status === s.id ? s.bg : "transparent",
                    color: form.status === s.id ? s.color : "#888",
                    fontWeight: form.status === s.id ? 500 : 400 }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: "1.25rem" }}>
          <button style={S.primaryBtn} onClick={handleSave} disabled={!form.name.trim()}>{modal === "add" ? "افزودن" : "ذخیره"}</button>
          <button style={S.cancelBtn} onClick={() => setModal(null)}>انصراف</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={S.wrap}>
      <link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.003/Vazirmatn-font-face.css" rel="stylesheet" />
      {modal && <ModalContent />}

      <div style={{ ...S.row, justifyContent: "space-between", marginBottom: "1.25rem" }}>
        <span style={{ fontSize: 18, fontWeight: 500 }}>🏠 مدیریت خانه</span>
        <button style={S.navBtn(view === "shopping")} onClick={() => setView(v => v === "shopping" ? "items" : "shopping")}>
          🛒 لیست خرید
          {totalNeeded > 0 && <span style={{ background: "#FCEBEB", color: "#A32D2D", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10 }}>{totalNeeded}</span>}
        </button>
      </div>

      <div style={{ ...S.row, marginBottom: "1rem", flexWrap: "wrap" }}>
        {data.houses.map(h => (
          editHouse === h.id
            ? <input key={h.id} autoFocus value={houseNameDraft}
                style={{ border: "none", borderBottom: "1.5px solid #111", background: "transparent", fontFamily: "inherit", fontSize: 14, fontWeight: 500, color: "#111", direction: "rtl", outline: "none", minWidth: 100 }}
                onChange={e => setHouseNameDraft(e.target.value)}
                onBlur={renameHouse}
                onKeyDown={e => { if (e.key === "Enter") renameHouse(); if (e.key === "Escape") setEditHouse(null); }} />
            : <button key={h.id} style={S.houseTab(house === h.id)}
                onClick={() => { setHouse(h.id); setView("items"); setFilter("all"); }}
                onDoubleClick={() => { setEditHouse(h.id); setHouseNameDraft(h.name); }}>
                {h.name}
              </button>
        ))}
      </div>

      {view === "shopping" ? (
        <div>
          {allNeeded.length === 0
            ? <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#888" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                <p style={{ fontSize: 14 }}>همه چیز موجوده! نیازی به خرید نیست.</p>
              </div>
            : data.houses.map(h => {
                const hItems = allNeeded.filter(i => i.houseName === h.name);
                if (!hItems.length) return null;
                return (
                  <div key={h.id} style={{ marginBottom: "1.5rem" }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#666", marginBottom: 10 }}>🏠 {h.name}</div>
                    {SECTIONS.map(sec => {
                      const its = hItems.filter(i => i.secLabel === sec.label);
                      if (!its.length) return null;
                      return (
                        <div key={sec.id} style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 11, color: "#aaa", marginBottom: 6 }}>{sec.icon} {sec.label}</div>
                          {its.map(item => (
                            <div key={item.id} style={{ ...S.card, justifyContent: "space-between" }}>
                              <span style={{ fontSize: 14, fontWeight: 500 }}>{item.name}</span>
                              <span style={{ fontSize: 12, color: "#888" }}>{item.qty} {item.unit}</span>
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
        <div>
          <div style={{ display: "flex", borderBottom: "0.5px solid #eee", marginBottom: "1rem" }}>
            {SECTIONS.map(sec => {
              const n = countNeeded(house, sec.id);
              return (
                <button key={sec.id} style={S.secTab(section === sec.id)} onClick={() => { setSection(sec.id); setFilter("all"); }}>
                  <span style={{ fontSize: 20 }}>{sec.icon}</span>
                  <span style={{ fontSize: 11 }}>{sec.label}</span>
                  {n > 0 && <span style={{ background: "#FCEBEB", color: "#A32D2D", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 8 }}>{n}</span>}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: "1rem", flexWrap: "wrap" }}>
            {[["all", `همه (${items.length})`], ...STATUSES.map(s => [s.id, `${s.label} (${items.filter(i => i.status === s.id).length})`])].map(([val, lbl]) => (
              <button key={val} style={S.pill(filter === val)} onClick={() => setFilter(val)}>{lbl}</button>
            ))}
          </div>

          {shown.length === 0
            ? <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "#aaa" }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>{SECTIONS.find(s => s.id === section)?.icon}</div>
                <p style={{ fontSize: 13 }}>{filter === "all" ? "هنوز آیتمی ثبت نشده" : "آیتمی با این فیلتر پیدا نشد"}</p>
              </div>
            : shown.map(item => {
                const st = statusOf(item.status);
                return (
                  <div key={item.id} style={S.card}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14, fontWeight: 500 }}>{item.name}</span>
                        <span style={{ fontSize: 12, color: "#888" }}>{item.qty} {item.unit}</span>
                      </div>
                    </div>
                    <button style={S.badge(st)} onClick={() => cycleStatus(item.id)}>{st.label}</button>
                    <button style={S.iconBtn(false)} onClick={() => openEdit(item)}>✏️</button>
                    <button style={S.iconBtn(true)} onClick={() => deleteItem(item.id)}>🗑️</button>
                  </div>
                );
              })
          }
          <button style={S.addBtn} onClick={openAdd}>+ افزودن آیتم</button>
        </div>
      )}
    </div>
  );
}
