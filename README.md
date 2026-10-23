# Excalidraw Pages

A Chrome extension that adds multiple named canvases ("pages") to
[excalidraw.com](https://excalidraw.com). Every browser tab can be on a
different page at the same time.

## Install

The extension isn't on the Chrome Web Store, so you load it from a copy of
this repository.

### 1. Get the code

**With git:**

```sh
git clone https://github.com/PushkarDesai-06/excalidraw-pages.git
```

This creates an `excalidraw-pages` folder.

**Without git:** on the
[repository page](https://github.com/PushkarDesai-06/excalidraw-pages), click
**Code** > **Download ZIP**, then unzip it. This gives you an
`excalidraw-pages-main` folder.

Put the folder somewhere permanent before the next step. Chrome loads the
extension from that folder every time it starts, so moving or deleting it
removes the extension.

### 2. Load it in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the folder from step 1, the one that
   contains `manifest.json`. With the ZIP download, make sure you pick the
   unzipped folder itself and not a parent folder around it.
4. Reload any open excalidraw.com tabs.

The pages button appears in Excalidraw's bottom bar. The same steps work in
other Chromium browsers such as Edge (`edge://extensions`) and Brave
(`brave://extensions`).

### Updating

1. Get the new code: run `git pull` inside the folder, or download the ZIP
   again and replace the old folder's contents with the new ones (keep the
   same location).
2. On `chrome://extensions`, click the reload icon on the Excalidraw Pages
   card.
3. Reload any open excalidraw.com tabs.

Your pages are kept by excalidraw.com, not by the extension, so reloading or
reinstalling the extension doesn't lose them.

## Using it

A pages button sits in the bottom bar, right after the zoom and undo/redo
buttons (at the top of the screen on phones). Click it to:

- switch pages (click a name)
- create a page (**New page**)
- rename a page (pencil icon, or double-click its name)
- duplicate a page
- delete a page (asks for confirmation; the last page can't be deleted)
- reorder pages (drag them)

The tab title shows the current page name so tabs are easy to tell apart.

## Export and import

Both are in Excalidraw's main menu (the ☰ button, top left), right below
"Export image...". A short message at the bottom of the screen confirms the
result or explains what went wrong.

**Export all pages** downloads one `.zip`:

```text
excalidraw-pages-2026-10-23.zip
├── pages.json                 page names and order
├── 01 Page 1.excalidraw
└── 02 Roadmap.excalidraw
```

Each `.excalidraw` file is a standard Excalidraw file with its images
embedded, so you can open it in plain Excalidraw (menu > Open, or drag it onto
the canvas) even without this extension.

**Import pages...** accepts that `.zip`, any `.zip` of `.excalidraw` files, or one
or more `.excalidraw` files. Imported pages are always added as new pages and
never overwrite existing ones. A name that's already taken gets a number, like
"Page 1 (2)".

## Before you uninstall

All pages live in excalidraw.com's own storage, so uninstalling deletes
nothing, but plain Excalidraw only shows Page 1. The other pages stay hidden
in storage and come back if you reinstall. Images that only appear on those
hidden pages are not safe, though: without the extension, Excalidraw deletes
images that are not on the open canvas once they are a day old.

So **export all pages before uninstalling** or moving to another browser.
Afterwards you can import the `.zip` with the extension, or open the page files
one by one in plain Excalidraw.

## How Excalidraw stores your drawing

excalidraw.com keeps a single scene in `localStorage`:

| Key                 | Contents                                                      |
| ------------------- | ------------------------------------------------------------- |
| `excalidraw`        | JSON array of all elements                                    |
| `excalidraw-state`  | persisted `appState` (scroll, zoom, current tool and styles)  |
| `version-dataState` | timestamp other tabs compare against to sync the scene        |
| `version-files`     | same, for images                                              |

Image data lives in IndexedDB (database `files-db`, store `files-store`),
keyed by `fileId`. Theme, library, language and the collab username have
their own keys and are not part of the scene.

The app saves the scene about 300ms after each change, flushes that save on
window `blur` and `beforeunload`, and re-reads `localStorage` on `focus` when
another tab has written a newer `version-dataState`.

## Extended schema

```text
excalidraw-pages               {
                                 "version": 1,
                                 "pages": [{ "id", "name", "createdAt" }, ...],
                                 "lastActivePageId": "..."
                               }

excalidraw::<pageId>           elements of that page
excalidraw-state::<pageId>     appState of that page
version-dataState::<pageId>    sync timestamp of that page

sessionStorage
excalidraw-pages:active        page shown in this tab
```

The page with id `default` uses the original unsuffixed keys. On first run
your existing drawing becomes "Page 1", and it is still there if you remove
the extension. Images stay in the shared IndexedDB store since `fileId`s are
content hashes.

## How it works

`src/store.js` runs in the page's main world at `document_start`, before
Excalidraw's bundle, and patches `Storage.prototype` so Excalidraw's reads and
writes of the three scene keys go to the active page's keys. Excalidraw needs
no changes and doesn't know pages exist.

- **Per-tab pages.** The active page is kept in `sessionStorage`, which is
  per tab and survives reloads. A new tab opens on the last page used.
- **Tab sync still works.** Each page has its own `version-dataState`, so two
  tabs on the same page sync like before, while tabs on different pages never
  pull in each other's drawings.
- **Switching reloads the tab.** The current page is flushed first (via a
  synthetic `blur`, which triggers Excalidraw's own save). A reload is used
  instead of swapping the scene live because Excalidraw's undo history would
  otherwise carry elements from one page into another.
- **Images on other pages are kept.** On startup Excalidraw deletes images
  that are over a day old and not in the scene it just opened. The extension
  blocks those deletes for any `fileId` that some page still uses; truly
  unused images are still cleaned up.
- **Deleting a page another tab is showing** moves that tab to another page,
  and writes to a deleted page are dropped so it can't come back.
- **Crash screen "clear canvas"** (`localStorage.clear()`) only clears the
  current page instead of every page.

## Limitations

- Live collaboration rooms (`#room=...`) don't save to `localStorage`, so the
  switcher is hidden there.
- Opening a share link (`#json=...`) loads it into the current page. Create a
  new page first if you want to keep it separate.
- This relies on Excalidraw's storage key names. If excalidraw.com changes
  them, `SCOPED_KEYS` in `src/store.js` needs updating.

## License

[MIT](LICENSE)
