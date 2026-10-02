import React, { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import "./styles.css";

const PAPER = {
  A0: { w: 84.1, h: 118.9 },
  A1: { w: 59.4, h: 84.1 },
  A2: { w: 42.0, h: 59.4 },
};

const THEMES = {
  wall1: {
    title: "Wall 1 — Theme 1",
    sections: [
      { id: "wall1a", title: "Wall 1 — Theme 1 · Section 1", length: 22, height: 2.4 },
      { id: "wall1b", title: "Wall 1 — Theme 1 · Section 2", length: 15.7, height: 2.4 },
    ],
  },
  wall2: {
    title: "Wall 2 — Theme 2",
    sections: [
      { id: "wall2a", title: "Wall 2 — Theme 2 · Section 1", length: 15.7, height: 2.4 },
      { id: "wall2b", title: "Wall 2 — Theme 2 · Section 2", length: 9.4, height: 2.4 },
    ],
  },
  wall3: {
    title: "Wall 3 — Theme 3",
    sections: [
      { id: "wall3a", title: "Wall 3 — Theme 3", length: 9.4, height: 2.4 },
    ],
  },
};

const STORAGE_KEY = "exhibition-wall-planner-2026-v3";
const uid = () => Math.random().toString(36).slice(2, 10);

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

export default function App() {
  const [themeKey, setThemeKey] = useState("wall1");
  const [selectedSection, setSelectedSection] = useState("wall1a");
  const [items, setItems] = useState(loadSaved);
  const [selectedItem, setSelectedItem] = useState(null);
  const [clean, setClean] = useState(false);
  const [pendingPhotoId, setPendingPhotoId] = useState(null);
  const fileInput = useRef(null);
  const exportRef = useRef(null);
  const drag = useRef(null);

  const theme = THEMES[themeKey];
  const activeSection = useMemo(
    () => theme.sections.find((s) => s.id === selectedSection) || theme.sections[0],
    [theme, selectedSection]
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    if (!theme.sections.some((s) => s.id === selectedSection)) {
      setSelectedSection(theme.sections[0].id);
    }
    setSelectedItem(null);
  }, [themeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const sectionItems = (id) => items[id] || [];

  function updateSection(id, updater) {
    setItems((prev) => ({ ...prev, [id]: updater(prev[id] || []) }));
  }

  function addFrame(size) {
    const section = activeSection;
    const existing = sectionItems(section.id);
    const base = PAPER[size];
    const portrait = existing.length % 2 === 0;
    const wCm = portrait ? base.w : base.h;
    const hCm = portrait ? base.h : base.w;

    const next = {
      id: uid(),
      size,
      rotated: !portrait,
      x: Math.min(88, 3 + (existing.length * 8) % 82),
      y: 50,
      wCm,
      hCm,
      img: null,
    };
    updateSection(section.id, (arr) => [...arr, next]);
    setSelectedItem({ sectionId: section.id, itemId: next.id });
  }

  function rotateItem(sectionId, itemId) {
    updateSection(sectionId, (arr) =>
      arr.map((it) =>
        it.id === itemId
          ? { ...it, rotated: !it.rotated, wCm: it.hCm, hCm: it.wCm }
          : it
      )
    );
  }

  function deleteItem(sectionId, itemId) {
    updateSection(sectionId, (arr) => arr.filter((it) => it.id !== itemId));
    setSelectedItem(null);
  }

  function choosePhoto(sectionId, itemId) {
    setPendingPhotoId({ sectionId, itemId });
    fileInput.current?.click();
  }

  function onPhoto(e) {
    const file = e.target.files?.[0];
    if (!file || !pendingPhotoId) return;
    const reader = new FileReader();
    reader.onload = () => {
      updateSection(pendingPhotoId.sectionId, (arr) =>
        arr.map((it) => it.id === pendingPhotoId.itemId ? { ...it, img: reader.result } : it)
      );
      setPendingPhotoId(null);
      e.target.value = "";
    };
    reader.readAsDataURL(file);
  }

  function pointerDown(e, sectionId, item) {
    e.stopPropagation();
    setSelectedItem({ sectionId, itemId: item.id });
    const wall = e.currentTarget.closest(".wall-canvas").getBoundingClientRect();
    drag.current = {
      sectionId,
      itemId: item.id,
      wall,
      dx: e.clientX - (wall.left + (item.x / 100) * wall.width),
      dy: e.clientY - (wall.top + (item.y / 100) * wall.height),
    };
    window.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", pointerUp, { once: true });
  }

  function pointerMove(e) {
    if (!drag.current) return;
    const d = drag.current;
    const x = Math.max(0, Math.min(100, ((e.clientX - d.wall.left - d.dx) / d.wall.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - d.wall.top - d.dy) / d.wall.height) * 100));
    updateSection(d.sectionId, (arr) =>
      arr.map((it) => it.id === d.itemId ? { ...it, x, y } : it)
    );
  }

  function pointerUp() {
    drag.current = null;
    window.removeEventListener("pointermove", pointerMove);
  }

  async function exportPNG() {
    setClean(true);
    setSelectedItem(null);
    await new Promise((r) => setTimeout(r, 100));
    const canvas = await html2canvas(exportRef.current, {
      backgroundColor: "#090909",
      scale: 2,
      useCORS: true,
    });
    const a = document.createElement("a");
    a.download = `${themeKey}-theme.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
    setClean(false);
  }

  function backupJSON() {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "exhibition-wall-planner-backup.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function restoreJSON(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setItems(JSON.parse(reader.result));
      } catch {
        alert("That JSON backup could not be read.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="app">
      <header>
        <div>
          <h1>Exhibition Wall Planner</h1>
          <p>Three exhibition themes · A0 / A1 / A2 · portrait + landscape · autosaved</p>
        </div>
        <select value={themeKey} onChange={(e) => setThemeKey(e.target.value)}>
          <option value="wall1">Wall 1 — Theme 1</option>
          <option value="wall2">Wall 2 — Theme 2</option>
          <option value="wall3">Wall 3 — Theme 3</option>
        </select>
      </header>

      <div className="toolbar">
        <div className="add-tools">
          <div className="destination">
            Adding to: <strong>{activeSection.title}</strong> · {activeSection.length} m
          </div>
          <div className="buttons">
            <button onClick={() => addFrame("A0")}>Add A0</button>
            <button onClick={() => addFrame("A1")}>Add A1</button>
            <button onClick={() => addFrame("A2")}>Add A2</button>
          </div>
        </div>
        <div className="buttons">
          <button onClick={() => { setClean((v) => !v); setSelectedItem(null); }}>
            {clean ? "Edit preview" : "Clean preview"}
          </button>
          <button onClick={exportPNG}>Export Theme PNG</button>
          <button onClick={backupJSON}>Backup Theme JSON</button>
          <label className="button-label">
            Restore JSON
            <input type="file" accept=".json,application/json" onChange={restoreJSON} hidden />
          </label>
        </div>
      </div>

      <input ref={fileInput} type="file" accept="image/*" onChange={onPhoto} hidden />

      <main ref={exportRef}>
        <div className="theme-heading">
          <strong>{theme.title}</strong>
          {theme.sections.length > 1 && <span>Two physical sections shown together</span>}
        </div>

        {theme.sections.map((section) => {
          const selected = selectedSection === section.id;
          return (
            <section className={`section ${selected ? "selected-section" : ""}`} key={section.id}>
              <div className="section-title">
                <strong>{section.title}</strong>
                <span>{section.length} m × {section.height.toFixed(2)} m</span>
              </div>

              <div
                className="wall-shell"
                onClick={() => {
                  setSelectedSection(section.id);
                  setSelectedItem(null);
                }}
              >
                {!clean && selected && <div className="selected-badge">SELECTED — ADDING HERE</div>}
                <div
                  className="wall-canvas"
                  style={{ aspectRatio: `${section.length} / ${section.height}` }}
                >
                  <div className="centre-line" />
                  {sectionItems(section.id).map((it) => {
                    const wPct = (it.wCm / (section.length * 100)) * 100;
                    const hPct = (it.hCm / (section.height * 100)) * 100;
                    const isSelected =
                      selectedItem?.sectionId === section.id && selectedItem?.itemId === it.id;

                    return (
                      <div
                        key={it.id}
                        className={`frame ${isSelected ? "frame-selected" : ""}`}
                        style={{
                          left: `${it.x}%`,
                          top: `${it.y}%`,
                          width: `${wPct}%`,
                          height: `${hPct}%`,
                        }}
                        onPointerDown={(e) => pointerDown(e, section.id, it)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          choosePhoto(section.id, it.id);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedItem({ sectionId: section.id, itemId: it.id });
                        }}
                      >
                        {it.img ? (
                          <img src={it.img} alt="" draggable="false" />
                        ) : (
                          <div className="placeholder">
                            <b>{it.size}</b>
                            <small>{it.rotated ? "landscape" : "portrait"}</small>
                          </div>
                        )}

                        {!clean && isSelected && (
                          <div className="item-controls">
                            <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => {
                              e.stopPropagation(); rotateItem(section.id, it.id);
                            }}>Rotate</button>
                            <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => {
                              e.stopPropagation(); choosePhoto(section.id, it.id);
                            }}>Photo</button>
                            <button className="danger" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => {
                              e.stopPropagation(); deleteItem(section.id, it.id);
                            }}>Delete</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })}
      </main>

      <p className="hint">
        Click a wall section to choose where new frames go · double-click a frame to add/replace its photograph · drag to position
      </p>
    </div>
  );
}
