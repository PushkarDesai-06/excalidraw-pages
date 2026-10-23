// Excalidraw Pages: "Export all pages" and "Import pages..." in Excalidraw's
// main (hamburger) menu.
//
// Excalidraw renders that menu only while it is open, so we watch for it and
// insert our items after "Export image...", built with Excalidraw's own menu
// classes so they look native. Results are reported in a small toast.

(() => {
  "use strict";

  const api = window.__excalidrawPages;
  if (!api) return;

  const MENU_SELECTOR = ".dropdown-menu.main-menu";
  const ITEM_ATTRIBUTE = "data-excalidraw-pages";
  const INSERT_AFTER = [
    '[data-testid="image-export-button"]',
    '[data-testid="json-export-button"]',
    '[data-testid="load-button"]',
  ];

  const ICONS = {
    export:
      '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M11.5 21h-4.5a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v5m-5 6h7m-3 -3l3 3l-3 3"/>',
    import:
      '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 13v-8a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2h-5.5m-9.5 -2h7m-3 -3l3 3l-3 3"/>',
  };

  // Excalidraw variables the toast borrows so it follows the theme.
  const THEME_VARS = [
    "--island-bg-color",
    "--text-primary-color",
    "--color-danger",
    "--shadow-island",
    "--ui-font",
  ];

  let busy = false;

  // ---------------------------------------------------------------- toast

  const TOAST_STYLE = `
    :host {
      all: initial; position: fixed; left: 50%; bottom: 16px; z-index: 10;
      transform: translateX(-50%); max-width: calc(100vw - 32px);
      font-family: var(--ui-font, Assistant, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
    }
    :host([hidden]) { display: none; }
    :host([data-layout="phone"]) { bottom: 128px; }
    div {
      padding: 10px 16px; border-radius: 8px; font-size: 14px; cursor: default;
      color: var(--text-primary-color, #1b1b1f); background: var(--island-bg-color, #fff);
      box-shadow: var(--shadow-island, 0 0 1px rgba(0,0,0,.17), 0 0 3px rgba(0,0,0,.08), 0 7px 14px rgba(0,0,0,.05));
      overflow-wrap: anywhere;
    }
    div.error { color: var(--color-danger, #db6965); }
  `;

  let toastHost = null;
  let toastText = null;
  let toastTimer = 0;

  function toast(text, { error = false, sticky = false } = {}) {
    if (!toastHost) {
      toastHost = document.createElement("div");
      toastHost.id = "excalidraw-pages-toast";
      const root = toastHost.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = TOAST_STYLE;
      toastText = document.createElement("div");
      toastText.setAttribute("role", "status");
      toastText.addEventListener("click", () => (toastHost.hidden = true));
      root.append(style, toastText);
      document.body.append(toastHost);
    }
    const app = document.querySelector(".excalidraw");
    if (app) {
      const styles = getComputedStyle(app);
      for (const name of THEME_VARS) {
        const value = styles.getPropertyValue(name).trim();
        if (value) toastHost.style.setProperty(name, value);
      }
      toastHost.dataset.layout = app.classList.contains("excalidraw--mobile") ? "phone" : "desktop";
    }
    toastText.textContent = text;
    toastText.classList.toggle("error", error);
    toastHost.hidden = false;
    clearTimeout(toastTimer);
    if (!sticky) toastTimer = setTimeout(() => (toastHost.hidden = true), error ? 6000 : 4000);
  }

  // -------------------------------------------------------------- actions

  async function run(progress, task) {
    if (busy) return;
    busy = true;
    toast(progress, { sticky: true });
    try {
      toast(await task());
    } catch (err) {
      console.error("[excalidraw-pages]", err);
      toast((err && err.message) || String(err), { error: true });
    } finally {
      busy = false;
    }
  }

  const plural = (n) => `${n} ${n === 1 ? "page" : "pages"}`;

  function exportAll() {
    run("Exporting pages…", async () => {
      const { blob, filename, count } = await api.exportAll();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return `Exported ${plural(count)} to ${filename}`;
    });
  }

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".zip,.excalidraw,.json,application/zip,application/json";
  fileInput.multiple = true;
  fileInput.addEventListener("change", () => {
    const files = [...fileInput.files];
    fileInput.value = "";
    if (!files.length) return;
    run("Importing pages…", async () => {
      const ids = await api.importFiles(files);
      return `Imported ${plural(ids.length)}. Open them from the pages button.`;
    });
  });

  // ---------------------------------------------------------- menu items

  // Our items aren't registered with the menu's Radix component, so it won't
  // close by itself on click. Escape is how Radix menus are dismissed.
  function closeMenu() {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
    );
  }

  function menuItem(action, label, title, onSelect) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "radix-menu-item dropdown-menu-item dropdown-menu-item-base";
    button.setAttribute("role", "menuitem");
    button.setAttribute(ITEM_ATTRIBUTE, action);
    button.title = title;
    button.setAttribute("aria-label", label);

    const iconBox = document.createElement("div");
    iconBox.className = "dropdown-menu-item__icon";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.5");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.innerHTML = ICONS[action];
    iconBox.append(svg);

    const text = document.createElement("div");
    text.className = "dropdown-menu-item__text";
    const span = document.createElement("span");
    span.style.cssText = "text-overflow: ellipsis; overflow: hidden; white-space: nowrap;";
    span.textContent = label;
    text.append(span);
    button.append(iconBox, text);

    // Mirror Radix's hover highlight, which it only applies to its own items.
    button.addEventListener("pointerenter", () => button.setAttribute("data-highlighted", ""));
    button.addEventListener("pointerleave", () => button.removeAttribute("data-highlighted"));
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onSelect();
      closeMenu();
    });
    return button;
  }

  function injectInto(menu) {
    if (menu.querySelector(`[${ITEM_ATTRIBUTE}]`)) return;
    // Pages aren't saved in live collaboration rooms (see ui.js).
    if (location.hash.includes("room=")) return;
    const anchor = INSERT_AFTER.map((s) => menu.querySelector(s)).find(Boolean);
    const container = menu.querySelector(".dropdown-menu-container");
    if (!anchor && !container) return;

    const items = [
      menuItem("export", "Export all pages", "Download every page as a .zip of .excalidraw files", exportAll),
      // The file picker has to open inside the click's user activation.
      menuItem("import", "Import pages...", "Add pages from an exported .zip or .excalidraw files", () =>
        fileInput.click(),
      ),
    ];
    if (anchor) anchor.after(...items);
    else container.prepend(...items);
  }

  new MutationObserver(() => {
    const menu = document.querySelector(MENU_SELECTOR);
    if (menu) injectInto(menu);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
