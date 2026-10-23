// Excalidraw Pages: storage layer.
//
// Runs in the page's MAIN world at document_start, before Excalidraw's own
// bundle. Excalidraw keeps exactly one scene in localStorage:
//
//   "excalidraw"         JSON array of elements
//   "excalidraw-state"   JSON of the persisted appState (scroll, zoom, tools...)
//   "version-dataState"  timestamp used to sync the scene between open tabs
//
// and the binary data of images in IndexedDB ("files-db" / "files-store"),
// keyed by fileId. We extend that schema with an index of pages and give
// every page its own copy of the three keys above:
//
//   "excalidraw-pages"   { version, pages: [{ id, name, createdAt }], lastActivePageId }
//   "<key>::<pageId>"    per page scene keys, e.g. "excalidraw::k3j9x2"
//
// The page with id "default" maps to the original unsuffixed keys, so the
// drawing a user had before installing becomes "Page 1" and is still there
// if the extension is removed. Which page a tab shows lives in
// sessionStorage, which the browser keeps per tab, so every tab can sit on a
// different page. Excalidraw itself is unaware of any of this: we patch
// Storage.prototype so its reads and writes land on the active page.

(() => {
  "use strict";

  if (window.__excalidrawPages) return;

  const INDEX_KEY = "excalidraw-pages";
  const SESSION_KEY = "excalidraw-pages:active";
  const DEFAULT_PAGE_ID = "default";
  const SEPARATOR = "::";
  // Everything else Excalidraw stores (theme, library, collab username,
  // language, images) is shared by all pages.
  const SCOPED_KEYS = ["excalidraw", "excalidraw-state", "version-dataState"];
  const ELEMENTS_KEY = "excalidraw";
  const APP_STATE_KEY = "excalidraw-state";
  const FILES_DB = "files-db";
  const FILES_STORE = "files-store";

  let ls;
  let ss;
  try {
    ls = window.localStorage;
    ss = window.sessionStorage;
  } catch {
    return;
  }

  const proto = Storage.prototype;
  const raw = {
    getItem: proto.getItem,
    setItem: proto.setItem,
    removeItem: proto.removeItem,
    clear: proto.clear,
    key: proto.key,
  };
  const lsGet = (key) => raw.getItem.call(ls, key);
  const lsSet = (key, value) => raw.setItem.call(ls, key, value);
  const lsRemove = (key) => raw.removeItem.call(ls, key);

  const storageKey = (baseKey, pageId) =>
    pageId === DEFAULT_PAGE_ID ? baseKey : baseKey + SEPARATOR + pageId;

  const newPageId = () =>
    Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

  // Declared before anything that writes the index: startup itself writes it
  // (see "active page" below), and touching a `const` before its declaration
  // throws, which would abort this script before Storage is patched.
  const listeners = new Set();
  function notify() {
    for (const fn of listeners) {
      try {
        fn();
      } catch (err) {
        console.error("[excalidraw-pages]", err);
      }
    }
  }

  // ---------------------------------------------------------------- index

  // Rebuilds an index from the keys on disk. Used on first run (adopting the
  // existing drawing as Page 1) and if the index was lost or corrupted while
  // page data is still around.
  function recoverIndex() {
    const ids = [];
    if (lsGet(ELEMENTS_KEY) !== null) ids.push(DEFAULT_PAGE_ID);
    const prefix = ELEMENTS_KEY + SEPARATOR;
    for (let i = 0; i < ls.length; i++) {
      const key = raw.key.call(ls, i);
      if (key && key.startsWith(prefix)) ids.push(key.slice(prefix.length));
    }
    if (!ids.length) ids.push(DEFAULT_PAGE_ID);
    const now = Date.now();
    return {
      version: 1,
      pages: ids.map((id, i) => ({ id, name: `Page ${i + 1}`, createdAt: now })),
      lastActivePageId: ids[0],
    };
  }

  function readIndex() {
    try {
      const index = JSON.parse(lsGet(INDEX_KEY));
      if (index && Array.isArray(index.pages) && index.pages.length) return index;
    } catch {}
    return recoverIndex();
  }

  function writeIndex(index) {
    lsSet(INDEX_KEY, JSON.stringify(index));
    notify();
  }

  // Read-modify-write against the latest stored index so concurrent edits
  // from other tabs are not clobbered.
  function updateIndex(mutate) {
    const index = readIndex();
    const result = mutate(index);
    writeIndex(index);
    return result;
  }

  const findPage = (index, id) => index.pages.find((p) => p.id === id);

  function uniqueName(index, base) {
    const taken = new Set(index.pages.map((p) => p.name));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) {
      if (!taken.has(`${base} (${n})`)) return `${base} (${n})`;
    }
  }

  function nextPageName(index) {
    const taken = new Set(index.pages.map((p) => p.name));
    for (let n = index.pages.length + 1; ; n++) {
      if (!taken.has(`Page ${n}`)) return `Page ${n}`;
    }
  }

  // --------------------------------------------------------- active page

  const initialIndex = readIndex();
  if (lsGet(INDEX_KEY) === null) lsSet(INDEX_KEY, JSON.stringify(initialIndex));

  let activeId = raw.getItem.call(ss, SESSION_KEY);
  if (!activeId || !findPage(initialIndex, activeId)) {
    // A brand new tab opens on whatever page was used last.
    activeId = findPage(initialIndex, initialIndex.lastActivePageId)
      ? initialIndex.lastActivePageId
      : initialIndex.pages[0].id;
  }
  raw.setItem.call(ss, SESSION_KEY, activeId);
  if (initialIndex.lastActivePageId !== activeId) {
    updateIndex((index) => {
      index.lastActivePageId = activeId;
    });
  }

  // Writes are dropped once the active page has been deleted (here or in
  // another tab), so Excalidraw's flush-on-unload cannot bring its keys back.
  const activePageExists = () => !!findPage(readIndex(), activeId);

  // ------------------------------------------------- Storage redirection

  proto.getItem = function (key) {
    if (this === ls && SCOPED_KEYS.includes(key)) key = storageKey(key, activeId);
    return raw.getItem.call(this, key);
  };

  proto.setItem = function (key, value) {
    if (this === ls && SCOPED_KEYS.includes(key)) {
      if (!activePageExists()) return;
      key = storageKey(key, activeId);
    }
    return raw.setItem.call(this, key, value);
  };

  proto.removeItem = function (key) {
    if (this === ls && SCOPED_KEYS.includes(key)) key = storageKey(key, activeId);
    return raw.removeItem.call(this, key);
  };

  // Excalidraw only calls localStorage.clear() from its crash screen ("clear
  // the canvas"). Recover by clearing the broken page, not every page.
  proto.clear = function () {
    if (this !== ls) return raw.clear.call(this);
    for (const key of SCOPED_KEYS) lsRemove(storageKey(key, activeId));
  };

  // ------------------------------------------------------ image guarding

  // On every load Excalidraw deletes images from IndexedDB that are older
  // than a day and not used by the scene it just opened. With pages, "not in
  // this scene" no longer means unused, so keep images any page refers to.
  let fileIdCache = null;
  function fileIdsInUse() {
    if (fileIdCache && Date.now() - fileIdCache.at < 1000) return fileIdCache.ids;
    const ids = new Set();
    for (const page of readIndex().pages) {
      try {
        const elements = JSON.parse(lsGet(storageKey(ELEMENTS_KEY, page.id)) || "[]");
        for (const el of elements) if (el && el.fileId) ids.add(el.fileId);
      } catch {}
    }
    fileIdCache = { at: Date.now(), ids };
    return ids;
  }

  const rawDelete = IDBObjectStore.prototype.delete;
  IDBObjectStore.prototype.delete = function (key) {
    if (
      this.name === FILES_STORE &&
      this.transaction.db.name === FILES_DB &&
      typeof key === "string" &&
      fileIdsInUse().has(key)
    ) {
      // idb-keyval ignores the request and waits on the transaction, so any
      // harmless request on the same store keeps its flow intact.
      return this.count(key);
    }
    return rawDelete.call(this, key);
  };

  // ------------------------------------------------------------ actions

  // Excalidraw debounces its saves. Its window "blur" handler flushes the
  // pending save synchronously, which is what we want before we touch the
  // active page's keys or leave it.
  const flushExcalidrawSave = () => window.dispatchEvent(new Event("blur"));

  // Switching reloads the tab. Excalidraw reads its scene, history and images
  // once on startup, and loading a different scene into a live editor would
  // let undo/redo carry elements across pages.
  function switchTo(id) {
    if (id === activeId) return;
    if (!findPage(readIndex(), id)) return;
    flushExcalidrawSave();
    raw.setItem.call(ss, SESSION_KEY, id);
    updateIndex((index) => {
      index.lastActivePageId = id;
    });
    // Drop share/collab hashes (#json=, #room=) so they are not imported
    // again into the page being opened.
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    location.reload();
  }

  function create(name) {
    return updateIndex((index) => {
      const page = {
        id: newPageId(),
        name: (name && name.trim()) || nextPageName(index),
        createdAt: Date.now(),
      };
      index.pages.push(page);
      return page.id;
    });
  }

  function duplicate(id) {
    if (id === activeId) flushExcalidrawSave();
    return updateIndex((index) => {
      const source = findPage(index, id);
      if (!source) return null;
      const page = {
        id: newPageId(),
        name: uniqueName(index, `${source.name} copy`),
        createdAt: Date.now(),
      };
      for (const key of SCOPED_KEYS) {
        const value = lsGet(storageKey(key, source.id));
        if (value !== null) lsSet(storageKey(key, page.id), value);
      }
      index.pages.splice(index.pages.indexOf(source) + 1, 0, page);
      return page.id;
    });
  }

  function rename(id, name) {
    name = (name || "").trim();
    if (!name) return;
    updateIndex((index) => {
      const page = findPage(index, id);
      if (page) page.name = name;
    });
  }

  function move(id, offset) {
    updateIndex((index) => {
      const from = index.pages.findIndex((p) => p.id === id);
      const to = from + offset;
      if (from < 0 || to < 0 || to >= index.pages.length) return;
      const [page] = index.pages.splice(from, 1);
      index.pages.splice(to, 0, page);
    });
  }

  function remove(id) {
    const index = readIndex();
    const position = index.pages.findIndex((p) => p.id === id);
    if (position < 0 || index.pages.length <= 1) return;
    const fallback = index.pages[position === 0 ? 1 : position - 1].id;
    updateIndex((index) => {
      index.pages = index.pages.filter((p) => p.id !== id);
      if (index.lastActivePageId === id) index.lastActivePageId = fallback;
    });
    for (const key of SCOPED_KEYS) lsRemove(storageKey(key, id));
    if (id === activeId) switchTo(fallback);
  }

  // ---------------------------------------------------- export / import

  // An export is a zip with one standard .excalidraw file per page, images
  // included, so each page also opens in plain Excalidraw (useful after
  // uninstalling). pages.json keeps the page names and order for importing.

  const ARCHIVE_FORMAT = "excalidraw-pages";
  const MANIFEST_NAME = "pages.json";
  // The appState fields Excalidraw itself writes into a .excalidraw file.
  const EXPORTED_APP_STATE = ["viewBackgroundColor", "gridSize", "gridStep", "gridModeEnabled"];

  const parseJSON = (text, fallback) => {
    try {
      return text ? JSON.parse(text) : fallback;
    } catch {
      return fallback;
    }
  };
  const isScene = (data) => !!data && data.type === "excalidraw" && Array.isArray(data.elements);
  const baseName = (path) => path.split("/").pop().replace(/\.(excalidraw|json)$/i, "");
  const fileSafe = (name) =>
    name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 80) || "Untitled";

  function openFilesDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(FILES_DB);
      // Same layout idb-keyval creates for Excalidraw, in case it hasn't yet.
      request.onupgradeneeded = () => request.result.createObjectStore(FILES_STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function readFiles(db, ids) {
    return new Promise((resolve, reject) => {
      const files = {};
      if (!ids.length) return resolve(files);
      const tx = db.transaction(FILES_STORE, "readonly");
      const store = tx.objectStore(FILES_STORE);
      for (const id of ids) {
        store.get(id).onsuccess = (event) => {
          if (event.target.result) files[id] = event.target.result;
        };
      }
      tx.oncomplete = () => resolve(files);
      tx.onerror = () => reject(tx.error);
    });
  }

  function writeFiles(db, files) {
    return new Promise((resolve, reject) => {
      const entries = Object.entries(files || {}).filter(
        ([, file]) => file && typeof file.dataURL === "string",
      );
      if (!entries.length) return resolve();
      const tx = db.transaction(FILES_STORE, "readwrite");
      const store = tx.objectStore(FILES_STORE);
      for (const [id, file] of entries) {
        store.put({ ...file, id: file.id || id, lastRetrieved: Date.now() }, file.id || id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function exportAll() {
    flushExcalidrawSave();
    const { pages } = readIndex();
    const digits = Math.max(2, String(pages.length).length);
    const manifest = {
      format: ARCHIVE_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      pages: [],
    };
    const entries = [];
    const db = await openFilesDb();
    try {
      for (const [i, page] of pages.entries()) {
        const stored = parseJSON(lsGet(storageKey(ELEMENTS_KEY, page.id)), []);
        const elements = (Array.isArray(stored) ? stored : []).filter((el) => el && !el.isDeleted);
        const state = parseJSON(lsGet(storageKey(APP_STATE_KEY, page.id)), null) || {};
        const appState = {};
        for (const key of EXPORTED_APP_STATE) if (key in state) appState[key] = state[key];
        const fileIds = [...new Set(elements.map((el) => el.fileId).filter(Boolean))];
        const scene = {
          type: "excalidraw",
          version: 2,
          source: location.origin,
          elements,
          appState,
          files: await readFiles(db, fileIds),
        };
        const file = `${String(i + 1).padStart(digits, "0")} ${fileSafe(page.name)}.excalidraw`;
        manifest.pages.push({ name: page.name, file });
        entries.push({ name: file, data: JSON.stringify(scene) });
      }
    } finally {
      db.close();
    }
    entries.unshift({ name: MANIFEST_NAME, data: JSON.stringify(manifest, null, 2) });
    const blob = await window.__excalidrawPagesZip.createZip(entries);
    const date = new Date().toISOString().slice(0, 10);
    return { blob, filename: `excalidraw-pages-${date}.zip`, count: pages.length };
  }

  // Accepts our zip exports, any zip of .excalidraw files, and single
  // .excalidraw files. Returns [{ name, scene }] in page order.
  async function readScenes(file) {
    const magic = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    if (magic[0] !== 0x50 || magic[1] !== 0x4b) {
      const scene = parseJSON(await file.text(), null);
      if (!isScene(scene)) throw new Error(`"${file.name}" is not an Excalidraw file`);
      return [{ name: baseName(file.name), scene }];
    }

    const decoder = new TextDecoder();
    const text = (entry) => decoder.decode(entry.data);
    const entries = (await window.__excalidrawPagesZip.readZip(file)).filter(
      (entry) => !entry.name.startsWith("__MACOSX/"),
    );
    const manifestEntry = entries.find((e) => e.name.split("/").pop() === MANIFEST_NAME);
    const manifest = manifestEntry && parseJSON(text(manifestEntry), null);

    let listed;
    if (manifest && manifest.format === ARCHIVE_FORMAT && Array.isArray(manifest.pages)) {
      // Paths are relative to pages.json, in case the zip was re-made from a folder.
      const dir = manifestEntry.name.slice(0, -MANIFEST_NAME.length);
      listed = manifest.pages.map((page) => ({
        name: page.name,
        entry: entries.find((e) => e.name === dir + page.file),
      }));
    } else {
      listed = entries
        .filter((e) => /\.excalidraw$/i.test(e.name))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        .map((entry) => ({ name: baseName(entry.name), entry }));
    }

    const scenes = [];
    for (const { name, entry } of listed) {
      const scene = entry && parseJSON(text(entry), null);
      if (isScene(scene)) scenes.push({ name, scene });
    }
    if (!scenes.length) throw new Error(`No Excalidraw pages found in "${file.name}"`);
    return scenes;
  }

  // Imported pages are always added as new pages; nothing is overwritten.
  async function importFiles(fileList) {
    const scenes = [];
    for (const file of fileList) scenes.push(...(await readScenes(file)));

    // Images first: if saving the pages fails, unused images are cleaned up
    // by Excalidraw later, whereas pages without their images stay broken.
    const db = await openFilesDb();
    try {
      for (const { scene } of scenes) await writeFiles(db, scene.files);
    } finally {
      db.close();
    }

    const ids = [];
    try {
      for (const { scene } of scenes) {
        const id = newPageId();
        ids.push(id);
        lsSet(storageKey(ELEMENTS_KEY, id), JSON.stringify(scene.elements));
        lsSet(storageKey(APP_STATE_KEY, id), JSON.stringify(scene.appState || {}));
      }
    } catch (err) {
      for (const id of ids) for (const key of SCOPED_KEYS) lsRemove(storageKey(key, id));
      if (err && err.name === "QuotaExceededError") {
        throw new Error("Not enough browser storage left to import these pages");
      }
      throw err;
    }

    updateIndex((index) => {
      scenes.forEach(({ name }, i) => {
        const trimmed = typeof name === "string" ? name.trim() : "";
        index.pages.push({
          id: ids[i],
          name: trimmed ? uniqueName(index, trimmed) : nextPageName(index),
          createdAt: Date.now(),
        });
      });
    });
    return ids;
  }

  // Another tab changed the index. If it deleted the page this tab shows,
  // move to a page that still exists.
  window.addEventListener("storage", (event) => {
    if (event.storageArea !== ls) return;
    if (event.key !== INDEX_KEY && event.key !== null) return;
    const index = readIndex();
    if (!findPage(index, activeId)) {
      const fallback = findPage(index, index.lastActivePageId)
        ? index.lastActivePageId
        : index.pages[0].id;
      raw.setItem.call(ss, SESSION_KEY, fallback);
      location.reload();
      return;
    }
    notify();
  });

  Object.defineProperty(window, "__excalidrawPages", {
    value: Object.freeze({
      getPages: () => readIndex().pages,
      getActiveId: () => activeId,
      switchTo,
      create,
      duplicate,
      rename,
      move,
      remove,
      exportAll,
      importFiles,
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    }),
  });
})();
