import React, { useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";

const SCALE = 0.5;

const PAPER = {
  A0: [84.1, 118.9],
  A1: [59.4, 84.1],
  A2: [42.0, 59.4],
};

const THEMES = {
  wall1: {
    label: "Wall 1 — Theme 1",
    sections: [
      { key: "w1a", label: "22 m × 2.40 m", width: 2200, height: 240 },
      { key: "w1b", label: "15.7 m × 2.40 m", width: 1570, height: 240 },
    ],
  },
  wall2: {
    label: "Wall 2 — Theme 2",
    sections: [
      { key: "w2a", label: "15.7 m × 2.40 m", width: 1570, height: 240 },
      { key: "w2b", label: "9.4 m × 2.40 m", width: 940, height: 240 },
    ],
  },
  wall3: {
    label: "Wall 3 — Theme 3",
    sections: [
      { key: "w3", label: "9.4 m × 2.40 m", width: 940, height: 240 },
    ],
  },
};

const uid = () =>
  crypto.randomUUID?.() || Math.random().toString(36).slice(2);

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("wall-planner", 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("walls")) {
        req.result.createObjectStore("walls");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction("walls").objectStore("walls").get(key);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("walls", "readwrite");
    tx.objectStore("walls").put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function tileSize(tile) {
  const [a, b] = PAPER[tile.size];
  return tile.orientation === "P" ? [a, b] : [b, a];
}

export default function App() {
  const [themeKey, setThemeKey] = useState("wall1");
  const [layouts, setLayouts] = useState({});
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState(null);
  const [clean, setClean] = useState(false);

  const themeRef = useRef(null);
  const sectionRefs = useRef({});
  const drag = useRef(null);
  const timer = useRef(null);

  const theme = THEMES[themeKey];

  useEffect(() => {
    let cancelled = false;
    setReady(false);

    Promise.all(
      theme.sections.map(async (section) => [
        section.key,
        await dbGet(section.key),
      ])
    ).then((entries) => {
      if (cancelled) return;
      setLayouts(Object.fromEntries(entries));
      setReady(true);
      setSelected(null);
    });

    return () => {
      cancelled = true;
    };
  }, [themeKey]);

  useEffect(() => {
    if (!ready) return;
    theme.sections.forEach((section) => {
      dbPut(section.key, layouts[section.key] || []);
    });
  }, [layouts, ready, theme]);

  function showControls(sectionKey, id) {
    const token = `${sectionKey}:${id}`;
    setSelected(token);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSelected(null), 3500);
  }

  function updateSection(sectionKey, updater) {
    setLayouts((current) => ({
      ...current,
      [sectionKey]: updater(current[sectionKey] || []),
    }));
  }

  function addFrame(size) {
    const sections = theme.sections;
    const section = sections[Math.floor(Math.random() * sections.length)];
    const orientation = Math.random() > 0.45 ? "P" : "L";
    const [a, b] = PAPER[size];
    const [w, h] = orientation === "P" ? [a, b] : [b, a];

    updateSection(section.key, (tiles) => [
      ...tiles,
      {
        id: uid(),
        size,
        orientation,
        x: Math.max(0, Math.random() * (section.width - w)),
        y: Math.max(0, Math.random() * (section.height - h)),
      },
    ]);
  }

  function rotate(sectionKey, id) {
    updateSection(sectionKey, (tiles) =>
      tiles.map((tile) =>
        tile.id === id
          ? {
              ...tile,
              orientation: tile.orientation === "P" ? "L" : "P",
            }
          : tile
      )
    );
    showControls(sectionKey, id);
  }

  function remove(sectionKey, id) {
    updateSection(sectionKey, (tiles) =>
      tiles.filter((tile) => tile.id !== id)
    );
    setSelected(null);
  }

  function choosePhoto(sectionKey, id) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        updateSection(sectionKey, (tiles) =>
          tiles.map((tile) =>
            tile.id === id ? { ...tile, img: reader.result } : tile
          )
        );
      };
      reader.readAsDataURL(file);
    };

    input.click();
  }

  function pointerDown(e, section, tile) {
    if (clean) return;
    e.preventDefault();

    const rect = sectionRefs.current[section.key].getBoundingClientRect();
    drag.current = {
      sectionKey: section.key,
      id: tile.id,
      dx: (e.clientX - rect.left) / SCALE - tile.x,
      dy: (e.clientY - rect.top) / SCALE - tile.y,
    };

    showControls(section.key, tile.id);
  }

  function pointerMove(e, section) {
    const d = drag.current;
    if (!d || d.sectionKey !== section.key) return;

    const rect = sectionRefs.current[section.key].getBoundingClientRect();

    updateSection(section.key, (tiles) =>
      tiles.map((tile) => {
        if (tile.id !== d.id) return tile;

        const [w, h] = tileSize(tile);
        const nx = (e.clientX - rect.left) / SCALE - d.dx;
        const ny = (e.clientY - rect.top) / SCALE - d.dy;

        return {
          ...tile,
          x: Math.max(
            0,
            Math.min(section.width - w, Math.round(nx))
          ),
          y: Math.max(
            0,
            Math.min(section.height - h, Math.round(ny))
          ),
        };
      })
    );
  }

  async function exportPNG() {
    setClean(true);
    setSelected(null);
    await new Promise((resolve) => setTimeout(resolve, 120));

    const canvas = await html2canvas(themeRef.current, {
      backgroundColor: "#0b0b0b",
      scale: 2,
      useCORS: true,
    });

    const link = document.createElement("a");
    link.download = `${themeKey}-theme-layout.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();

    setClean(false);
  }

  function backupJSON() {
    const payload = {
      version: 2,
      theme: themeKey,
      layouts,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${themeKey}-theme-backup.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function restoreJSON() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";

    input.onchange = async () => {
      try {
        const json = JSON.parse(await input.files[0].text());

        if (json.layouts && typeof json.layouts === "object") {
          setLayouts((current) => ({ ...current, ...json.layouts }));
          return;
        }

        alert("This is not a Theme backup JSON.");
      } catch {
        alert("Invalid JSON backup.");
      }
    };

    input.click();
  }

  const totalPhotos = theme.sections.reduce(
    (sum, section) => sum + (layouts[section.key]?.length || 0),
    0
  );

  return (
    <main>
      <header>
        <div>
          <h1>Exhibition Wall Planner</h1>
          <p>
            Three exhibition themes · A0 / A1 / A2 · portrait + landscape ·
            autosaved
          </p>
        </div>

        <select
          value={themeKey}
          onChange={(e) => setThemeKey(e.target.value)}
        >
          {Object.entries(THEMES).map(([key, item]) => (
            <option value={key} key={key}>
              {item.label}
            </option>
          ))}
        </select>
      </header>

      <section className="toolbar">
        <div>
          {Object.keys(PAPER).map((size) => (
            <button key={size} onClick={() => addFrame(size)}>
              Add {size}
            </button>
          ))}
        </div>

        <div>
          <button onClick={() => setClean((v) => !v)}>
            {clean ? "Edit" : "Clean preview"}
          </button>
          <button onClick={exportPNG}>Export Theme PNG</button>
          <button onClick={backupJSON}>Backup Theme JSON</button>
          <button onClick={restoreJSON}>Restore JSON</button>
        </div>
      </section>

      <div className="themeMeta">
        <div>
          <strong>{theme.label}</strong>
          <span>
            {theme.sections.length === 2
              ? "Two physical sections shown together"
              : "One physical section"}
          </span>
        </div>
        <b>{totalPhotos} photographs</b>
      </div>

      <div className="themeCapture" ref={themeRef}>
        {theme.sections.map((section, index) => {
          const tiles = layouts[section.key] || [];

          return (
            <section className="wallGroup" key={section.key}>
              <div className="wallHeading">
                <strong>
                  {theme.label} · Section {index + 1}
                </strong>
                <span>{section.label}</span>
                <span>{tiles.length} photographs</span>
              </div>

              <div className="wallScroll">
                <div
                  className="wall"
                  ref={(node) => {
                    sectionRefs.current[section.key] = node;
                  }}
                  style={{
                    width: section.width * SCALE,
                    height: section.height * SCALE,
                  }}
                  onMouseMove={(e) => pointerMove(e, section)}
                  onMouseUp={() => {
                    drag.current = null;
                  }}
                  onMouseLeave={() => {
                    drag.current = null;
                  }}
                >
                  <div className="eyeLine" />

                  {tiles.map((tile) => {
                    const [w, h] = tileSize(tile);
                    const token = `${section.key}:${tile.id}`;

                    return (
                      <div
                        key={tile.id}
                        className={
                          "tile " + (selected === token ? "selected" : "")
                        }
                        style={{
                          left: tile.x * SCALE,
                          top: tile.y * SCALE,
                          width: w * SCALE,
                          height: h * SCALE,
                          backgroundImage: tile.img
                            ? `url("${tile.img}")`
                            : "none",
                        }}
                        onMouseDown={(e) =>
                          pointerDown(e, section, tile)
                        }
                        onClick={() =>
                          showControls(section.key, tile.id)
                        }
                        onDoubleClick={() =>
                          choosePhoto(section.key, tile.id)
                        }
                      >
                        {!tile.img && (
                          <span>
                            {tile.size}
                            <small>
                              {tile.orientation === "P"
                                ? "portrait"
                                : "landscape"}
                            </small>
                          </span>
                        )}

                        {!clean && selected === token && (
                          <div
                            className="actions"
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() =>
                                choosePhoto(section.key, tile.id)
                              }
                            >
                              {tile.img ? "Replace" : "Photo"}
                            </button>
                            <button
                              onClick={() =>
                                rotate(section.key, tile.id)
                              }
                            >
                              Rotate
                            </button>
                            <button
                              className="danger"
                              onClick={() =>
                                remove(section.key, tile.id)
                              }
                            >
                              Delete
                            </button>
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
      </div>

      <footer>
        Add frames randomly to the current theme · double-click a frame to add
        or replace a photograph · drag to position · click for controls
      </footer>
    </main>
  );
}
