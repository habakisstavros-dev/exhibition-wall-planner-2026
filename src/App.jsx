import React, { useEffect, useMemo, useState } from "react";
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

export default function App() {
  const [items, setItems] = useState(load);
  const [selectedWall, setSelectedWall] = useState("w1a");
  const [selectedItem, setSelectedItem] = useState(null);

  useEffect(() => localStorage.setItem(key, JSON.stringify(items)), [items]);

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

  function remove(wallId, id) {
    setItems(s => ({ ...s, [wallId]: (s[wallId] || []).filter(i => i.id !== id) }));
    setSelectedItem(null);
  }

  function photo(wallId, item, file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => update(wallId, item.id, { image: r.result });
    r.readAsDataURL(file);
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

  function clean() {
    if (!confirm("Clear all frames from all five wall sections?")) return;
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
        <button onClick={clean}>Clean preview</button>
      </div>

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

              <div className="wall" style={{ aspectRatio: `${wall.width} / ${wall.height}` }}>
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
                      {item.image ? <img src={item.image} alt="" /> : <div className="placeholder"><b>{item.size}</b><small>{item.orientation}</small></div>}
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
    </main>
  );
}
