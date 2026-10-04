import React, { useEffect, useMemo, useState } from "react";
import html2canvas from "html2canvas";
import "./styles.css";

const WALLS = [
  { id: "w1a", theme: "Wall 1 — Theme 1", section: "Section 1", width: 22, height: 2.4 },
  { id: "w1b", theme: "Wall 1 — Theme 1", section: "Section 2", width: 15.7, height: 2.4 },
  { id: "w2a", theme: "Wall 2 — Theme 2", section: "Section 1", width: 15.7, height: 2.4 },
  { id: "w2b", theme: "Wall 2 — Theme 2", section: "Section 2", width: 9.4, height: 2.4 },
  { id: "w3", theme: "Wall 3 — Theme 3", section: "Section 1", width: 9.4, height: 2.4 },
];

const SIZES = {
  A0: { portrait: [0.841, 1.189], landscape: [1.189, 0.841] },
  A1: { portrait: [0.594, 0.841], landscape: [0.841, 0.594] },
  A2: { portrait: [0.420, 0.594], landscape: [0.594, 0.420] },
};

const key = "exhibition-wall-planner-2026-centered-v1";
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    if (v && typeof v === "object") return v;
  } catch {}
  return Object.fromEntries(WALLS.map(w => [w.id, []]));
}


const DB_NAME = "exhibition-wall-planner-2026";
const DB_STORE = "photos";

function openPhotoDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putPhoto(id, blob) {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(blob, id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getPhoto(id) {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function deletePhoto(id) {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function optimizeImage(file, maxSide = 1800, quality = 0.82) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return new Promise((resolve, reject) =>
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Image conversion failed")), "image/jpeg", quality)
  );
}

export default function App() {
  const [items, setItems] = useState(load);
  const [selectedWall, setSelectedWall] = useState("w1a");
  const [selectedItem, setSelectedItem] = useState(null);
  const [photoUrls, setPhotoUrls] = useState({});

  // Only lightweight layout metadata goes into localStorage.
  useEffect(() => {
    const lightweight = Object.fromEntries(
      Object.entries(items).map(([wallId, list]) => [
        wallId,
        list.map(({ image, ...item }) => item)
      ])
    );
    localStorage.setItem(key, JSON.stringify(lightweight));
  }, [items]);

  // Load photo blobs from IndexedDB and create temporary browser URLs.
  useEffect(() => {
    let cancelled = false;
    const liveUrls = [];
    (async () => {
      const ids = Object.values(items).flat().map(i => i.id);
      const next = {};
      for (const id of ids) {
        try {
          const blob = await getPhoto(id);
          if (blob) {
            const url = URL.createObjectURL(blob);
            liveUrls.push(url);
            next[id] = url;
          }
        } catch {}
      }
      if (!cancelled) setPhotoUrls(next);
    })();
    return () => {
      cancelled = true;
      liveUrls.forEach(URL.revokeObjectURL);
    };
  }, []);

  const selectedWallData = WALLS.find(w => w.id === selectedWall);

  function add(size) {
    const wall = selectedWallData;
    if (!wall) return;
    const existing = items[wall.id] || [];
    const dims = SIZES[size].portrait;
    const x = Math.min(
      Math.max(0.15, existing.length ? Math.max(...existing.map(i => i.x + i.w)) + 0.25 : 0.35),
      Math.max(0.15, wall.width - dims[0] - 0.15)
    );
    const item = { id: uid(), size, orientation: "portrait", x, w: dims[0], h: dims[1], image: null };
    setItems(s => ({ ...s, [wall.id]: [...(s[wall.id] || []), item] }));
    setSelectedItem(item.id);
  }

  function update(wallId, id, patch) {
    setItems(s => ({ ...s, [wallId]: (s[wallId] || []).map(i => i.id === id ? { ...i, ...patch } : i) }));
  }

  function rotate(wallId, item) {
    const orientation = item.orientation === "portrait" ? "landscape" : "portrait";
    const [w, h] = SIZES[item.size][orientation];
    const wall = WALLS.find(x => x.id === wallId);
    update(wallId, item.id, { orientation, w, h, x: Math.min(item.x, wall.width - w) });
  }

  async function remove(wallId, id) {
    setItems(s => ({ ...s, [wallId]: (s[wallId] || []).filter(i => i.id !== id) }));
    setPhotoUrls(s => {
      if (s[id]) URL.revokeObjectURL(s[id]);
      const next = { ...s };
      delete next[id];
      return next;
    });
    try { await deletePhoto(id); } catch {}
    setSelectedItem(null);
  }

  async function photo(wallId, item, file) {
    if (!file) return;
    try {
      const blob = await optimizeImage(file);
      await putPhoto(item.id, blob);
      const url = URL.createObjectURL(blob);
      setPhotoUrls(s => {
        if (s[item.id]) URL.revokeObjectURL(s[item.id]);
        return { ...s, [item.id]: url };
      });
      // Remove any legacy base64 image from state/localStorage.
      update(wallId, item.id, { image: null });
    } catch (err) {
      console.error(err);
      alert("Could not prepare this photograph. Please try another JPEG/PNG.");
    }
  }

  function dragStart(e, wall, item) {
    e.stopPropagation();
    setSelectedWall(wall.id);
    setSelectedItem(item.id);
    const rect = e.currentTarget.parentElement.getBoundingClientRect();
    const startX = e.clientX;
    const start = item.x;
    const move = ev => {
      const dxM = ((ev.clientX - startX) / rect.width) * wall.width;
      update(wall.id, item.id, { x: Math.max(0, Math.min(wall.width - item.w, start + dxM)) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function saveExhibition() {
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      walls: WALLS,
      items: Object.fromEntries(
        Object.entries(items).map(([wallId, list]) => [
          wallId,
          list.map(({ image, ...item }) => item)
        ])
      ),
      note: "Layout backup. Photographs are stored safely in this browser's IndexedDB."
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `exhibition-wall-planner-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function loadExhibition(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const restored = parsed?.items || parsed;
        if (!restored || typeof restored !== "object") throw new Error("Invalid file");
        const normalized = Object.fromEntries(
          WALLS.map(w => [w.id, Array.isArray(restored[w.id])
            ? restored[w.id].map(({ image, ...item }) => item)
            : []])
        );
        setItems(normalized);
        setSelectedItem(null);
        alert("Exhibition restored successfully.");
      } catch {
        alert("This does not look like a valid Exhibition Wall Planner backup.");
      }
    };
    reader.readAsText(file);
  }

  async function exportJpg() {
    const target = document.getElementById("exhibition-export");
    if (!target) return;

    const previousItem = selectedItem;
    setSelectedItem(null);

    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    try {
      const canvas = await html2canvas(target, {
        backgroundColor: "#090909",
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: target.scrollWidth,
        windowHeight: target.scrollHeight
      });
      const link = document.createElement("a");
      link.download = `exhibition-wall-plan-${new Date().toISOString().slice(0,10)}.jpg`;
      link.href = canvas.toDataURL("image/jpeg", 0.95);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      alert("JPG export failed. Please try again after the photographs finish loading.");
    } finally {
      setSelectedItem(previousItem);
    }
  }

  async function clean() {
    if (!confirm("Clear all frames from all five wall sections?")) return;
    const ids = Object.values(items).flat().map(i => i.id);
    await Promise.all(ids.map(id => deletePhoto(id).catch(() => {})));
    Object.values(photoUrls).forEach(url => URL.revokeObjectURL(url));
    setPhotoUrls({});
    setItems(Object.fromEntries(WALLS.map(w => [w.id, []])));
  }

  const groups = useMemo(() => [
    { title: "Wall 1 — Theme 1", walls: WALLS.slice(0,2) },
    { title: "Wall 2 — Theme 2", walls: WALLS.slice(2,4) },
    { title: "Wall 3 — Theme 3", walls: WALLS.slice(4,5) },
  ], []);

  return (
    <main>
      <header>
        <h1>Exhibition Wall Planner</h1>
        <p>Three exhibition themes · A0 / A1 / A2 · portrait + landscape · single-line centred hanging · autosaved</p>
      </header>

      <div className="toolbar">
        <div className="adders">
          <button onClick={() => add("A0")}>Add A0</button>
          <button onClick={() => add("A1")}>Add A1</button>
          <button onClick={() => add("A2")}>Add A2</button>
        </div>
        <div className="destination">
          Adding to: <strong>{selectedWallData?.theme} · {selectedWallData?.section} · {selectedWallData?.width} m</strong>
        </div>
        <div className="fileActions">
          <button onClick={saveExhibition}>Save Exhibition</button>
          <label className="loadButton">
            Load Exhibition
            <input
              type="file"
              accept=".json,application/json"
              hidden
              onChange={e => {
                loadExhibition(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <button onClick={exportJpg}>Export as JPG</button>
          <button onClick={clean}>Clean preview</button>
        </div>
      </div>

      <div id="exhibition-export">
      {groups.map(group => (
        <section className="theme" key={group.title}>
          <div className="themeTitle">
            <h2>{group.title}</h2>
            <span>{group.walls.length === 2 ? "Two physical sections shown together" : "One physical section"}</span>
          </div>

          {group.walls.map(wall => (
            <div
              className={"wallBlock " + (selectedWall === wall.id ? "selectedWall" : "")}
              key={wall.id}
              onClick={(e) => { if (e.target === e.currentTarget || e.target.classList.contains("wall") || e.target.classList.contains("centerline")) { setSelectedWall(wall.id); } }}
            >
              <div className="wallHeading">
                <h3>{wall.theme} · {wall.section}</h3>
                <span>{wall.width} m × {wall.height.toFixed(2)} m</span>
              </div>
              {selectedWall === wall.id && <div className="selectedBadge">SELECTED — ADDING HERE</div>}

              <div
                className="wall"
                style={{
                  width: `${(wall.width / 22) * 100}%`,
                  aspectRatio: `${wall.width} / ${wall.height}`
                }}
              >
                <div className="centerline" />
                {(items[wall.id] || []).map(item => {
                  const left = (item.x / wall.width) * 100;
                  const width = (item.w / wall.width) * 100;
                  const height = (item.h / wall.height) * 100;
                  const chosen = selectedItem === item.id && selectedWall === wall.id;
                  return (
                    <div
                      key={item.id}
                      className={"frame " + (chosen ? "chosen" : "")}
                      style={{ left: `${left}%`, width: `${width}%`, height: `${height}%` }}
                      onClick={e => { e.stopPropagation(); setSelectedWall(wall.id); setSelectedItem(item.id); }}
                      onPointerDown={e => dragStart(e, wall, item)}
                      onDoubleClick={e => {
                        e.stopPropagation();
                        e.currentTarget.querySelector("input").click();
                      }}
                    >
                      {(photoUrls[item.id] || item.image) ? <img src={photoUrls[item.id] || item.image} alt="" draggable="false" onDragStart={e => e.preventDefault()} /> : <div className="placeholder"><b>{item.size}</b><small>{item.orientation}</small></div>}
                      <input type="file" accept="image/*" hidden onChange={e => photo(wall.id, item, e.target.files?.[0])} />
                      {chosen && (
                        <div className="controls" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                          <button onClick={() => rotate(wall.id, item)}>Rotate</button>
                          <button onClick={e => e.currentTarget.parentElement.parentElement.querySelector("input").click()}>Photo</button>
                          <button onClick={() => remove(wall.id, item.id)}>Delete</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="wallHint">Drag left/right only · every frame stays centred on the same hanging line</div>
            </div>
          ))}
        </section>
      ))}
      </div>
    </main>
  );
}
