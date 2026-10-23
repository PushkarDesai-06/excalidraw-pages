// Excalidraw Pages: page switcher UI.
//
// A pill in Excalidraw's bottom bar showing the active page. It
// opens a menu to switch, create, rename, duplicate, reorder (drag) and
// delete pages (export and import live in Excalidraw's own menu, see
// menu.js). Rendered inside a shadow root so Excalidraw's styles and ours
// cannot leak into each other; colors are copied from Excalidraw's own CSS
// variables so it follows the light/dark theme.

(() => {
  "use strict";

  const api = window.__excalidrawPages;
  if (!api || document.getElementById("excalidraw-pages-host")) return;

  const ICONS = {
    pages:
      '<path d="M15 3v4a1 1 0 0 0 1 1h4"/><path d="M18 17h-7a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2h4l5 5v7a2 2 0 0 1 -2 2z"/><path d="M16 17v2a2 2 0 0 1 -2 2h-7a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2h2"/>',
    chevron: '<path d="M6 15l6 -6l6 6"/>',
    plus: '<path d="M12 5l0 14"/><path d="M5 12l14 0"/>',
    check: '<path d="M5 12l5 5l10 -10"/>',
    rename:
      '<path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4"/><path d="M13.5 6.5l4 4"/>',
    duplicate:
      '<path d="M8 10a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2z"/><path d="M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2"/>',
    trash:
      '<path d="M4 7l16 0"/><path d="M10 11l0 6"/><path d="M14 11l0 6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/>',
  };

  // Excalidraw variables mirrored onto our host element.
  const THEME_VARS = [
    "--island-bg-color",
    "--text-primary-color",
    "--color-primary",
    "--color-primary-light",
    "--color-surface-low",
    "--color-surface-high",
    "--color-danger",
    "--default-border-color",
    "--shadow-island",
    "--ui-font",
  ];

  const STYLE = `
    :host {
      all: initial;
      position: fixed;
      left: 240px;
      bottom: 16px;
      z-index: 4;
      font-family: var(--ui-font, Assistant, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
      color: var(--text-primary-color, #1b1b1f);
      --bg: var(--island-bg-color, #fff);
      --hover: var(--color-surface-low, #ececf4);
      --accent: var(--color-primary, #6965db);
      --accent-soft: var(--color-primary-light, #e3e2fe);
      --border: var(--default-border-color, #f1f0ff);
      --danger: var(--color-danger, #db6965);
      --shadow: var(--shadow-island, 0 0 1px rgba(0,0,0,.17), 0 0 3px rgba(0,0,0,.08), 0 7px 14px rgba(0,0,0,.05));
    }
    :host([hidden]) { display: none; }
    /* Excalidraw's phone layout fills the bottom with toolbars, so sit in
       the empty space between the top corner buttons and open downwards. */
    :host([data-layout="phone"]) {
      left: 50% !important; top: 12px; bottom: auto !important;
      transform: translateX(-50%);
    }

    * { box-sizing: border-box; }
    button {
      font: inherit; color: inherit; background: none; border: 0; margin: 0;
      padding: 0; cursor: pointer;
    }
    button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    svg {
      width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor;
      stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round;
    }

    .trigger {
      display: flex; align-items: center; gap: 8px;
      height: 36px; max-width: min(320px, calc(100vw - 32px)); padding: 0 10px 0 12px;
      background: var(--bg); border-radius: 8px; box-shadow: var(--shadow);
      font-size: 14px;
    }
    .trigger:hover { background: var(--hover); }
    .trigger .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .trigger .count { opacity: .55; font-size: 12px; }
    :host([data-layout="phone"]) .trigger { max-width: calc(100vw - 140px); }
    .trigger .chevron { transition: transform .15s; opacity: .7; }
    .trigger[aria-expanded="true"] .chevron,
    :host([data-layout="phone"]) .trigger[aria-expanded="false"] .chevron { transform: rotate(180deg); }
    :host([data-layout="phone"]) .trigger[aria-expanded="true"] .chevron { transform: none; }

    .menu {
      position: absolute; left: 0; bottom: calc(100% + 8px);
      width: 280px; max-width: calc(100vw - 32px);
      background: var(--bg); border-radius: 10px; box-shadow: var(--shadow);
      padding: 8px; font-size: 14px;
    }
    .menu[hidden] { display: none; }
    :host([data-layout="phone"]) .menu {
      left: 50%; transform: translateX(-50%); top: calc(100% + 8px); bottom: auto;
    }
    .heading {
      padding: 4px 8px 8px; font-size: 12px; font-weight: 600; opacity: .6;
      text-transform: uppercase; letter-spacing: .04em;
    }
    ul {
      list-style: none; margin: 0; padding: 0; max-height: min(360px, 55vh); overflow-y: auto;
      display: flex; flex-direction: column; gap: 2px;
    }
    li {
      display: flex; align-items: center; gap: 4px; min-height: 34px;
      border-radius: 6px; padding: 0 4px 0 0; position: relative;
    }
    li:hover { background: var(--hover); }
    li.active { background: var(--accent-soft); }
    li.drop-before::before, li.drop-after::after {
      content: ""; position: absolute; left: 6px; right: 6px; height: 2px;
      background: var(--accent); border-radius: 1px;
    }
    li.drop-before::before { top: -2px; }
    li.drop-after::after { bottom: -2px; }
    li.dragging { opacity: .4; }

    .name {
      flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px;
      height: 34px; padding: 0 8px; text-align: left; border-radius: 6px;
    }
    .name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .name .tick { color: var(--accent); visibility: hidden; }
    li.active .name .tick { visibility: visible; }
    li.active .name { font-weight: 600; }

    .actions { display: flex; gap: 2px; opacity: 0; }
    li:hover .actions, li:focus-within .actions { opacity: 1; }
    .icon {
      width: 28px; height: 28px; display: grid; place-items: center;
      border-radius: 6px; opacity: .75;
    }
    .icon:hover { opacity: 1; background: var(--bg); }
    .icon.delete:hover { color: var(--danger); }
    .icon:disabled { opacity: .25; cursor: default; background: none; }

    input {
      flex: 1; min-width: 0; height: 28px; margin: 3px 4px; padding: 0 8px;
      font: inherit; color: inherit; background: var(--bg);
      border: 1px solid var(--accent); border-radius: 6px; outline: none;
    }

    .confirm { flex: 1; min-width: 0; padding: 0 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pill-button {
      height: 26px; padding: 0 10px; border-radius: 6px; font-size: 13px; flex: none;
    }
    .pill-button:hover { background: var(--bg); }
    .pill-button.danger { background: var(--danger); color: #fff; }
    .pill-button.danger:hover { filter: brightness(1.08); }

    .footer {
      display: flex; flex-direction: column; gap: 2px;
      margin-top: 9px; position: relative;
    }
    /* Divider centered in the gap above, so it never touches a highlight. */
    .footer::before {
      content: ""; position: absolute; left: 0; right: 0; top: -5px;
      height: 1px; background: var(--border); pointer-events: none;
    }
    .item {
      display: flex; align-items: center; gap: 8px; width: 100%; height: 34px;
      padding: 0 8px; border-radius: 6px;
    }
    .item:hover:not(:disabled) { background: var(--hover); }
    .item:disabled { opacity: .5; cursor: default; }
    .item.new { color: var(--accent); font-weight: 600; }
  `;

  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = ICONS[name];
    return svg;
  }

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === "class") node.className = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else if (key in node) node[key] = value;
      else node.setAttribute(key, value);
    }
    node.append(...children.filter((c) => c != null));
    return node;
  }

  function tickIcon() {
    const svg = icon("check");
    svg.classList.add("tick");
    return svg;
  }

  function iconButton(name, title, onclick, extraClass = "") {
    return el(
      "button",
      { class: `icon ${extraClass}`, title, "aria-label": title, onclick },
      icon(name),
    );
  }

  function mount() {
    const host = el("div", { id: "excalidraw-pages-host" });
    const root = host.attachShadow({ mode: "open" });

    const state = {
      open: false,
      renamingId: null,
      confirmingId: null,
      dragId: null,
    };

    const label = el("span", { class: "label" });
    const count = el("span", { class: "count" });
    const chevron = icon("chevron");
    chevron.classList.add("chevron");
    const trigger = el(
      "button",
      {
        class: "trigger",
        "aria-haspopup": "true",
        "aria-expanded": "false",
        title: "Pages",
        onclick: () => setOpen(!state.open),
      },
      icon("pages"),
      label,
      count,
      chevron,
    );

    const list = el("ul", { role: "list" });
    const newButton = el(
      "button",
      {
        class: "item new",
        onclick: () => {
          const id = api.create();
          if (id) api.switchTo(id);
        },
      },
      icon("plus"),
      el("span", {}, "New page"),
    );
    const menu = el(
      "div",
      { class: "menu", hidden: true },
      el("div", { class: "heading" }, "Pages"),
      list,
      el("div", { class: "footer" }, newButton),
    );

    const container = el("div", {}, menu, trigger);
    root.append(el("style", {}, STYLE), container);

    // Shadow DOM retargets events to the host, so Excalidraw's document-level
    // keyboard and clipboard handlers would see a plain <div> target and treat
    // typing in our inputs as canvas shortcuts or pastes. Keep them inside.
    for (const type of ["keydown", "keyup", "keypress", "copy", "cut", "paste", "wheel"]) {
      container.addEventListener(type, (event) => event.stopPropagation());
    }
    container.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && state.open && !state.renamingId && !state.confirmingId) {
        setOpen(false);
        trigger.focus();
      }
    });
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (state.open && !event.composedPath().includes(host)) setOpen(false);
      },
      true,
    );

    function setOpen(open) {
      state.open = open;
      state.renamingId = null;
      state.confirmingId = null;
      render();
    }

    function startRename(id) {
      state.renamingId = id;
      state.confirmingId = null;
      render();
    }

    function finishRename(id, value, commit) {
      if (state.renamingId !== id) return;
      state.renamingId = null;
      if (commit) api.rename(id, value);
      render();
    }

    function renderRow(page, index, pages) {
      const isActive = page.id === api.getActiveId();
      const row = el("li", { class: isActive ? "active" : "", "data-id": page.id });

      if (state.renamingId === page.id) {
        const input = el("input", {
          value: page.name,
          "aria-label": "Page name",
          maxLength: 80,
          onkeydown: (event) => {
            if (event.key === "Enter") finishRename(page.id, input.value, true);
            if (event.key === "Escape") {
              // Cancel the rename only, without also closing the menu.
              event.stopPropagation();
              finishRename(page.id, input.value, false);
            }
          },
          onblur: () => finishRename(page.id, input.value, true),
        });
        row.append(input);
        return row;
      }

      if (state.confirmingId === page.id) {
        row.append(
          el("span", { class: "confirm", title: page.name }, `Delete "${page.name}"?`),
          el(
            "button",
            {
              class: "pill-button danger",
              onclick: () => {
                state.confirmingId = null;
                api.remove(page.id);
              },
            },
            "Delete",
          ),
          el(
            "button",
            {
              class: "pill-button",
              onclick: () => {
                state.confirmingId = null;
                render();
              },
            },
            "Cancel",
          ),
        );
        return row;
      }

      const deleteButton = iconButton(
        "trash",
        "Delete page",
        () => {
          state.confirmingId = page.id;
          render();
        },
        "delete",
      );
      deleteButton.disabled = pages.length <= 1;

      row.draggable = true;
      row.append(
        el(
          "button",
          {
            class: "name",
            title: isActive ? `${page.name} (double-click to rename)` : `Open "${page.name}"`,
            onclick: () => {
              if (!isActive) api.switchTo(page.id);
            },
            ondblclick: () => startRename(page.id),
          },
          tickIcon(),
          el("span", {}, page.name),
        ),
        el(
          "span",
          { class: "actions" },
          iconButton("rename", "Rename", () => startRename(page.id)),
          iconButton("duplicate", "Duplicate", () => {
            const id = api.duplicate(page.id);
            if (id) render();
          }),
          deleteButton,
        ),
      );

      row.addEventListener("dragstart", (event) => {
        state.dragId = page.id;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", page.name);
        row.classList.add("dragging");
      });
      row.addEventListener("dragend", () => {
        state.dragId = null;
        render();
      });
      row.addEventListener("dragover", (event) => {
        if (!state.dragId || state.dragId === page.id) return;
        event.preventDefault();
        const after = event.offsetY > row.offsetHeight / 2;
        row.classList.toggle("drop-after", after);
        row.classList.toggle("drop-before", !after);
      });
      row.addEventListener("dragleave", () => row.classList.remove("drop-before", "drop-after"));
      row.addEventListener("drop", (event) => {
        event.preventDefault();
        const from = pages.findIndex((p) => p.id === state.dragId);
        if (from < 0) return;
        let to = index + (row.classList.contains("drop-after") ? 1 : 0);
        if (from < to) to -= 1;
        if (to !== from) api.move(state.dragId, to - from);
      });

      return row;
    }

    function render() {
      const pages = api.getPages();
      const active = pages.find((p) => p.id === api.getActiveId()) || pages[0];

      label.textContent = active.name;
      count.textContent = pages.length > 1 ? `${pages.indexOf(active) + 1}/${pages.length}` : "";
      trigger.setAttribute("aria-expanded", String(state.open));
      menu.hidden = !state.open;
      document.title = `${active.name} · Excalidraw`;

      if (!state.open) return;
      list.replaceChildren(...pages.map(renderRow));
      list.querySelector("li.active")?.scrollIntoView({ block: "nearest" });
      // Focus right away: any keystroke before that would reach Excalidraw
      // as a tool shortcut.
      const input = list.querySelector("input");
      if (input && root.activeElement !== input) {
        input.focus();
        input.select();
      }
    }

    // Live collaboration rooms (#room=) are not saved to localStorage, so
    // pages do not apply there.
    function syncVisibility() {
      host.hidden = location.hash.includes("room=");
    }

    // Excalidraw toggles theme and phone layout through classes on its root.
    let app = null;
    const appObserver = new MutationObserver(syncAppearance);
    function syncAppearance() {
      const next = document.querySelector(".excalidraw");
      if (!next) return false;
      if (next !== app) {
        app = next;
        appObserver.disconnect();
        appObserver.observe(app, { attributes: true, attributeFilter: ["class"] });
      }
      const styles = getComputedStyle(app);
      for (const name of THEME_VARS) {
        const value = styles.getPropertyValue(name).trim();
        if (value) host.style.setProperty(name, value);
        else host.style.removeProperty(name);
      }
      return syncPosition();
    }

    // On desktop, sit right after Excalidraw's zoom and undo/redo cluster:
    // the bottom center belongs to its "Scroll back to content" button.
    // Tracked live because that cluster resizes and slides away in zen mode.
    let anchor = null;
    const anchorObserver = new ResizeObserver(() => syncPosition());
    function syncPosition() {
      const phone = !!app?.classList.contains("excalidraw--mobile");
      host.dataset.layout = phone ? "phone" : "desktop";
      if (phone) return true;
      const next = document.querySelector(".layer-ui__wrapper__footer-left");
      if (next !== anchor) {
        anchorObserver.disconnect();
        anchor = next;
        if (anchor) anchorObserver.observe(anchor);
      }
      const rect = anchor?.getBoundingClientRect();
      if (!rect || !rect.width) return false;
      host.style.left = `${Math.max(16, rect.right + 8)}px`;
      host.style.bottom = `${Math.max(16, window.innerHeight - rect.bottom)}px`;
      return true;
    }

    // Excalidraw renders after we mount; wait for its UI to appear.
    const mountObserver = new MutationObserver(() => {
      if (syncAppearance()) mountObserver.disconnect();
    });
    mountObserver.observe(document.body, { childList: true, subtree: true });
    syncAppearance();
    window.addEventListener("resize", syncPosition);
    document.addEventListener("transitionend", syncPosition, true);

    api.subscribe(render);
    window.addEventListener("hashchange", syncVisibility);
    syncVisibility();
    render();
    document.body.append(host);
  }

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });
})();
