(() => {
  "use strict";

  const INDEX_PATH = "docs/watchtech-library.json";
  const DOC_CACHE = "watchtech-files-v1";
  const state = {
    index: null,
    currentPath: "",
    search: "",
    view: localStorage.getItem("watchtech-view") || "grid",
    collapsed: new Set(JSON.parse(localStorage.getItem("watchtech-collapsed") || "[]")),
    deferredInstall: null,
    currentFile: null,
    currentUrl: null,
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    tree: $("tree"), content: $("content"), breadcrumbs: $("breadcrumbs"), searchInput: $("searchInput"),
    searchResults: $("searchResults"), resultsGrid: $("resultsGrid"), searchCount: $("searchCount"),
    pageTitle: $("pageTitle"), pageDescription: $("pageDescription"), sectionTitle: $("sectionTitle"),
    sectionKicker: $("sectionKicker"), folderStat: $("folderStat"), fileStat: $("fileStat"), syncStat: $("syncStat"),
    treeCount: $("treeCount"), themeBtn: $("themeBtn"), installBtn: $("installBtn"), offlineBtn: $("offlineBtn"),
    offlineHeroBtn: $("offlineHeroBtn"), homeBtn: $("homeBtn"), gridViewBtn: $("gridViewBtn"), listViewBtn: $("listViewBtn"),
    clearSearchBtn: $("clearSearchBtn"), toast: $("toast"), connectionText: $("connectionText"), connectionDot: $("connectionDot"),
    offlineText: $("offlineText"), offlineMeta: $("offlineMeta"), mobileMenuBtn: $("mobileMenuBtn"), sidebar: $("sidebar"), mobileBackdrop: $("mobileBackdrop"),
    viewer: $("viewer"), viewerTitle: $("viewerTitle"), viewerMeta: $("viewerMeta"), viewerBody: $("viewerBody"), viewerClose: $("viewerClose"), viewerNewTab: $("viewerNewTab"), viewerDownload: $("viewerDownload")
  };

  function baseUrl(path = "") { return new URL(path, document.baseURI).href; }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date);
  }

  function relativePathToUrl(relativePath) {
    const encoded = relativePath.split("/").map(encodeURIComponent).join("/");
    return baseUrl(`docs/${encoded}`);
  }

  function fileCategory(item) {
    const name = item.name.toLowerCase();
    const mime = (item.mimeType || "").toLowerCase();
    if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
    if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(name)) return "image";
    if (mime.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(name)) return "audio";
    if (mime.startsWith("video/") || /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(name)) return "video";
    if (mime.startsWith("text/") || /\.(txt|md|csv|tsv|log|json|xml|html|css|js)$/i.test(name)) return "text";
    return "document";
  }

  function iconFor(item) {
    if (item.kind === "folder") return "▱";
    const name = item.name.toLowerCase();
    if (name.endsWith(".pdf")) return "PDF";
    if (/\.(docx?|odt|rtf)$/i.test(name) || item.export_label?.toLowerCase().includes("word")) return "DOC";
    if (/\.(xlsx?|ods|csv|tsv)$/i.test(name) || item.export_label?.toLowerCase().includes("sheet")) return "XLS";
    if (/\.(pptx?|odp)$/i.test(name) || item.export_label?.toLowerCase().includes("presentation")) return "PPT";
    if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)$/i.test(name)) return "IMG";
    if (/\.(zip|7z|rar|tar|gz)$/i.test(name)) return "ZIP";
    if (/\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(name)) return "VID";
    return "FILE";
  }

  function childFolders(path) {
    if (!state.index || !Array.isArray(state.index.items)) return [];
    return state.index.items.filter((item) => item.kind === "folder" && parentPath(item.path) === path).sort(sortItems);
  }

  function childFiles(path) {
    if (!state.index || !Array.isArray(state.index.items)) return [];
    return state.index.items.filter((item) => item.kind === "file" && parentPath(item.path) === path).sort(sortItems);
  }

  function parentPath(path) {
    const parts = path.split("/");
    parts.pop();
    return parts.join("/");
  }

  function sortItems(a, b) {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  }

  function displayName(path) {
    const parts = path.split("/");
    return parts[parts.length - 1] || "WatchTech Docs";
  }

  function closeMobileNav() {
    els.sidebar?.classList.remove("open");
    els.mobileMenuBtn?.setAttribute("aria-expanded", "false");
    if (els.mobileBackdrop) els.mobileBackdrop.hidden = true;
  }

  function toggleMobileNav() {
    if (!els.sidebar || !els.mobileMenuBtn || !els.mobileBackdrop) return;
    const open = els.sidebar.classList.toggle("open");
    els.mobileMenuBtn.setAttribute("aria-expanded", String(open));
    els.mobileBackdrop.hidden = !open;
  }

  function renderTreeNode(path, label) {
    const folders = childFolders(path);
    const files = childFiles(path);
    const hasChildren = folders.length > 0;
    const isCollapsed = state.collapsed.has(path);
    const wrapper = document.createElement("div");
    const row = document.createElement("button");
    row.className = `tree-item ${state.currentPath === path ? "active" : ""}`;
    row.type = "button";
    row.innerHTML = `<span class="tree-caret">${hasChildren ? (isCollapsed ? "›" : "⌄") : ""}</span><span class="tree-icon">▱</span><span class="tree-name">${escapeHtml(label)}</span><span class="tree-badge">${files.length}</span>`;
    row.addEventListener("click", (event) => {
      if (hasChildren && event.target.closest(".tree-caret")) {
        if (state.collapsed.has(path)) state.collapsed.delete(path); else state.collapsed.add(path);
        localStorage.setItem("watchtech-collapsed", JSON.stringify([...state.collapsed]));
        renderTree();
        return;
      }
      openPath(path);
      closeMobileNav();
    });
    wrapper.appendChild(row);
    if (hasChildren && !isCollapsed) {
      const children = document.createElement("div");
      children.className = "tree-children";
      folders.forEach((folder) => children.appendChild(renderTreeNode(folder.path, folder.name)));
      wrapper.appendChild(children);
    }
    return wrapper;
  }

  function renderTree() {
    if (!els.tree || !state.index) return;
    els.tree.innerHTML = "";
    const rootFolders = childFolders("");
    const rootFiles = childFiles("");
    if (els.treeCount) els.treeCount.textContent = String(rootFolders.length + rootFiles.length);
    const all = document.createElement("div");
    const root = document.createElement("button");
    root.type = "button";
    root.className = `tree-item ${state.currentPath === "" ? "active" : ""}`;
    root.innerHTML = `<span class="tree-caret"></span><span class="tree-icon">⌂</span><span class="tree-name">All documents</span><span class="tree-badge">${Number(state.index.files ?? state.index.items.filter((x) => x.kind === "file").length)}</span>`;
    root.addEventListener("click", () => { openPath(""); closeMobileNav(); });
    all.appendChild(root);
    rootFolders.forEach((folder) => all.appendChild(renderTreeNode(folder.path, folder.name)));
    els.tree.appendChild(all);
  }

  function renderBreadcrumbs() {
    if (!els.breadcrumbs) return;
    els.breadcrumbs.innerHTML = "";
    const parts = state.currentPath ? state.currentPath.split("/") : [];
    const paths = [""];
    let cursor = "";
    for (const part of parts) { cursor = cursor ? `${cursor}/${part}` : part; paths.push(cursor); }
    paths.forEach((path, index) => {
      if (index > 0) { const sep = document.createElement("span"); sep.className = "breadcrumb-sep"; sep.textContent = "/"; els.breadcrumbs.appendChild(sep); }
      const button = document.createElement("button");
      button.className = `breadcrumb ${path === state.currentPath ? "current" : ""}`;
      button.type = "button";
      button.textContent = index === 0 ? "WatchTech Docs" : displayName(path);
      button.addEventListener("click", () => openPath(path));
      els.breadcrumbs.appendChild(button);
    });
  }

  function cardFor(item) {
    const card = document.createElement("button");
    card.className = `card ${item.kind === "file" ? "file-card" : "folder-card"}`;
    card.type = "button";
    if (item.kind === "file") { card.setAttribute("aria-label", `Open ${item.name}`); card.addEventListener("click", () => openFile(item)); }
    else card.addEventListener("click", () => openPath(item.path));
    const count = item.kind === "folder" ? `${childFolders(item.path).length} folders · ${childFiles(item.path).length} files` : (item.export_label || item.mimeType || "Document");
    card.innerHTML = `<div class="card-top"><span class="type-icon">${escapeHtml(iconFor(item))}</span></div><div><div class="card-title">${escapeHtml(item.name)}</div><div class="card-meta">${escapeHtml(count)}</div></div><div class="card-footer"><span class="item-count">${item.kind === "folder" ? "Browse folder" : formatDate(item.modifiedTime)}</span><span class="open-label">${item.kind === "folder" ? "Open →" : "Preview →"}</span></div>`;
    return card;
  }

  function renderContent() {
    if (!state.index) return;
    const folders = childFolders(state.currentPath);
    const files = childFiles(state.currentPath);
    els.sectionKicker.textContent = state.currentPath ? "Folder" : "Library";
    els.sectionTitle.textContent = state.currentPath ? displayName(state.currentPath) : "All folders & documents";
    els.pageTitle.textContent = state.currentPath ? displayName(state.currentPath) : "Welcome to WatchTech Docs";
    els.pageDescription.textContent = state.currentPath ? `Browse the documents and subfolders inside ${displayName(state.currentPath)}.` : "Your synchronized technical library, designed for fast browsing, search and offline access.";
    els.content.classList.toggle("list-mode", state.view === "list");
    els.content.innerHTML = "";
    [...folders, ...files].forEach((item) => els.content.appendChild(cardFor(item)));
    if (!folders.length && !files.length) els.content.innerHTML = `<div class="empty-state"><strong>This folder is empty</strong>There are no synchronized items here yet.</div>`;
    renderBreadcrumbs(); renderTree(); els.searchResults.hidden = !state.search;
  }

  function renderSearch() {
    const query = state.search.toLowerCase();
    if (!query) { els.searchResults.hidden = true; return; }
    if (!state.index || !Array.isArray(state.index.items)) return;
    const results = state.index.items.filter((item) => item.name.toLowerCase().includes(query) || item.path.toLowerCase().includes(query));
    els.searchResults.hidden = false;
    els.searchCount.textContent = String(results.length);
    els.resultsGrid.innerHTML = "";
    if (!results.length) els.resultsGrid.innerHTML = `<div class="empty-state"><strong>No matches found</strong>Try another document or folder name.</div>`;
    else results.sort(sortItems).forEach((item) => els.resultsGrid.appendChild(cardFor(item)));
  }

  function openPath(path) { if (!state.index) return; state.currentPath = path; renderContent(); window.scrollTo({ top: 0, behavior: "smooth" }); }

  function setView(view) {
    state.view = view; localStorage.setItem("watchtech-view", view);
    els.gridViewBtn.classList.toggle("active", view === "grid"); els.listViewBtn.classList.toggle("active", view === "list");
    renderContent();
  }

  function themeInit() {
    const stored = localStorage.getItem("watchtech-theme");
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const theme = stored || (prefersDark ? "dark" : "light");
    document.documentElement.dataset.theme = theme; els.themeBtn.textContent = theme === "dark" ? "☀" : "◐";
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next; localStorage.setItem("watchtech-theme", next); els.themeBtn.textContent = next === "dark" ? "☀" : "◐";
  }

  function cleanupViewerUrl() {
    if (state.currentUrl && state.currentUrl.startsWith("blob:")) URL.revokeObjectURL(state.currentUrl);
    state.currentUrl = null;
  }

  function closeViewer() {
    cleanupViewerUrl();
    state.currentFile = null;
    if (els.viewerBody) els.viewerBody.innerHTML = "";
    if (els.viewer?.open) els.viewer.close();
  }

  function viewerShellMessage(title, body) {
    els.viewerBody.innerHTML = `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${escapeHtml(body)}</div>`;
  }

  async function getLocalFile(item) {
    const url = relativePathToUrl(item.path);
    const cache = await getCache();
    if (cache) {
      const cached = await cache.match(url);
      if (cached) return { response: cached, fromCache: true, url };
    }
    if (!navigator.onLine) throw new Error("This document is not stored locally yet and the device is offline.");
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (cache) await cache.put(url, response.clone());
    return { response, fromCache: false, url };
  }

  async function openFile(item) {
    if (!item || item.kind !== "file") return;
    closeViewer();
    state.currentFile = item;
    els.viewerTitle.textContent = item.name;
    els.viewerMeta.textContent = `${item.path}${item.modifiedTime ? ` · ${formatDate(item.modifiedTime)}` : ""}`;
    els.viewerDownload.removeAttribute("href");
    els.viewerDownload.download = item.name;
    els.viewerNewTab.onclick = () => {
      if (state.currentUrl) window.open(state.currentUrl, "_blank", "noopener,noreferrer");
    };
    viewerShellMessage("Opening document…", "Retrieving a local copy for this device.");
    if (typeof els.viewer.showModal === "function") els.viewer.showModal();
    else els.viewer.setAttribute("open", "");

    try {
      const local = await getLocalFile(item);
      const blob = await local.response.blob();
      const objectUrl = URL.createObjectURL(blob);
      state.currentUrl = objectUrl;
      els.viewerDownload.href = objectUrl;
      const storageNote = local.fromCache ? "Local copy" : "Downloaded & stored locally";
      els.viewerMeta.textContent = `${item.path} · ${storageNote}${item.modifiedTime ? ` · ${formatDate(item.modifiedTime)}` : ""}`;

      const category = fileCategory(item);
      if (category === "pdf") {
        els.viewerBody.innerHTML = `<iframe class="viewer-frame" src="${escapeHtml(objectUrl)}" title="${escapeHtml(item.name)}"></iframe>`;
      } else if (category === "image") {
        els.viewerBody.innerHTML = `<div class="viewer-media-wrap"><img class="viewer-image" src="${escapeHtml(objectUrl)}" alt="${escapeHtml(item.name)}"></div>`;
      } else if (category === "audio") {
        els.viewerBody.innerHTML = `<div class="viewer-media-wrap"><audio class="viewer-audio" controls autoplay src="${escapeHtml(objectUrl)}"></audio></div>`;
      } else if (category === "video") {
        els.viewerBody.innerHTML = `<div class="viewer-media-wrap"><video class="viewer-video" controls autoplay src="${escapeHtml(objectUrl)}"></video></div>`;
      } else if (category === "text") {
        const text = await blob.text();
        els.viewerBody.innerHTML = `<pre class="viewer-text">${escapeHtml(text)}</pre>`;
      } else {
        viewerShellMessage("Stored on this device", "The file is now local to WatchTech. Use Download or Open separately to work with this file type.");
      }
    } catch (error) {
      console.error(error);
      viewerShellMessage("Document unavailable", error.message || "The file could not be retrieved.");
    }
  }
/*
  async function loadIndex() {
    els.content.innerHTML = `<div class="card skeleton"></div><div class="card skeleton"></div><div class="card skeleton"></div>`;
    try {
      const response = await fetch(baseUrl(INDEX_PATH), { cache: "no-store" });
      if (!response.ok) throw new Error(`Library index returned ${response.status}`);
      state.index = await response.json();
      if (!Array.isArray(state.index.items)) throw new Error("Invalid library index");
      els.folderStat.textContent = String(state.index.folders ?? state.index.items.filter((x) => x.kind === "folder").length);
      els.fileStat.textContent = String(state.index.files ?? state.index.items.filter((x) => x.kind === "file").length);
      els.syncStat.textContent = formatDate(state.index.generated_at);
      renderContent(); renderSearch(); updateConnection(); checkOfflineCache().catch(() => {});
    } catch (error) {
      els.content.innerHTML = `<div class="empty-state"><strong>Library index unavailable</strong>Run the WatchTech Drive Sync once so the PWA can load the synchronized library.</div>`;
      showToast("Could not load the synchronized library"); console.error(error);
    }
  }
*/
async function readCachedIndex() {
  const cache = await getCache();
  if (!cache) return null;
  const cached = await cache.match(baseUrl(INDEX_PATH));
  if (!cached) return null;
  const index = await cached.json();
  if (!Array.isArray(index.items)) {throw new Error("Invalid cached library index");  }
  return index;
}

async function loadIndex() {
  els.content.innerHTML = `<div class="card skeleton"></div><div class="card skeleton"></div><div class="card skeleton"></div>`;
  try {
    let index = null;
    // Offline-first: use the locally cached library index when available.
    try {
      index = await readCachedIndex();
    } catch (error) {
      console.warn("Cached library index unavailable:", error);
    }
    if (!index) {
      const response = await fetch(baseUrl(INDEX_PATH), { cache: "no-store" });
      if (!response.ok) {throw new Error(`Library index returned ${response.status}`);      }
      index = await response.clone().json();
      const cache = await getCache();
      if (cache) {await cache.put(baseUrl(INDEX_PATH), response);      }
    }
    state.index = index;
    if (!Array.isArray(state.index.items)) {throw new Error("Invalid library index");    }
    els.folderStat.textContent = String(state.index.folders ?? state.index.items.filter((x) => x.kind === "folder").length);
    els.fileStat.textContent = String(state.index.files ?? state.index.items.filter((x) => x.kind === "file").length);
    els.syncStat.textContent = formatDate(state.index.generated_at);

    renderContent();
    renderSearch();
    updateConnection();
    checkOfflineCache().catch(() => {});
  } catch (error) {
    els.content.innerHTML = `<div class="empty-state"><strong>Library index unavailable</strong>Run the WatchTech Drive Sync once so the PWA can load the synchronized library.</div>`;
    showToast("Could not load the synchronized library");
    console.error(error);
  }
}

  function updateConnection() {
    const online = navigator.onLine; els.connectionText.textContent = online ? "Online" : "Offline mode"; els.connectionDot.style.background = online ? "var(--success)" : "#e7a13d";
  }

  async function getCache() { if (!("caches" in window)) return null; return caches.open(DOC_CACHE); }
  
  async function requestPersistentStorage() {
    if (!navigator.storage?.persist) return;  
    try {
      const alreadyPersistent = await navigator.storage.persisted();  
      if (alreadyPersistent) { console.log("✅ WatchTech storage is already persistent.");        return;
      }
      const granted = await navigator.storage.persist();  
      console.log(
        granted
          ? "✅ WatchTech persistent storage granted."
          : "ℹ️ WatchTech persistent storage not granted."
      );
    } catch (error) { console.warn("Persistent storage request failed:", error);
    }
  }

 /* -- backup of all cachedAllDocs ---
  async function cacheAllDocs() {
    if (!state.index) return;
    const cache = await getCache(); if (!cache) throw new Error("Cache API unavailable");    
    const files = state.index.items.filter((item) => item.kind === "file");
    let done = 0;
    els.offlineText.textContent = "Preparing offline…"; els.offlineMeta.textContent = `0 / ${files.length} documents`;
    for (const item of files) {
      try { const response = await fetch(relativePathToUrl(item.path), { cache: "no-store" }); if (response.ok) await cache.put(relativePathToUrl(item.path), response.clone()); }
      finally { done += 1; els.offlineMeta.textContent = `${done} / ${files.length} documents`; }
    }
    els.offlineText.textContent = "Offline library ready"; els.offlineMeta.textContent = `${files.length} documents cached on this device`; showToast("WatchTech Docs is ready for offline use");
  }
*/
async function cacheAllDocs() {
  if (!state.index) return;
  const cache = await getCache();
  if (!cache) throw new Error("Cache API unavailable");

  // Cache the library index as part of the offline package.
  const indexUrl = baseUrl(INDEX_PATH);
  const indexResponse = await fetch(indexUrl, { cache: "no-store" });

  if (!indexResponse.ok) { throw new Error(`Library index returned ${indexResponse.status}`);  }
  await cache.put(indexUrl, indexResponse.clone());
  const files = state.index.items.filter((item) => item.kind === "file");

  let done = 0;

  els.offlineText.textContent = "Preparing offline…";
  els.offlineMeta.textContent = `0 / ${files.length} documents`;

  for (const item of files) {
    try {
      const url = relativePathToUrl(item.path);
      const response = await fetch(url, { cache: "no-store" });

      if (!response.ok) { throw new Error(`HTTP ${response.status} for ${item.path}`);      }
      await cache.put(url, response.clone());
    } finally {
      done += 1;
      els.offlineMeta.textContent =
        `${done} / ${files.length} documents`;
    }
  }

  els.offlineText.textContent = "Offline library ready";
  els.offlineMeta.textContent =
    `${files.length} documents cached on this device`;

  showToast("WatchTech Docs is ready for offline use");
}
  
  async function checkOfflineCache() {
    const cache = await getCache(); if (!cache || !state.index) return;
    const keys = await cache.keys(); const filePaths = state.index.items.filter((i) => i.kind === "file").map((i) => relativePathToUrl(i.path));
    const cached = keys.filter((request) => filePaths.includes(request.url)).length;
    if (cached > 0) { els.offlineText.textContent = "Offline library ready"; els.offlineMeta.textContent = `${cached} / ${filePaths.length} documents cached`; }
  }

  function showToast(message) {
    els.toast.textContent = message; els.toast.classList.add("show"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2600);
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(baseUrl("sw.js"), { scope: baseUrl("./") }).catch((error) => console.warn("Service worker registration failed", error));
  }

  function initInstallPrompt() {
    window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); state.deferredInstall = event; els.installBtn.hidden = false; });
    els.installBtn.addEventListener("click", async () => { if (!state.deferredInstall) return; state.deferredInstall.prompt(); await state.deferredInstall.userChoice; state.deferredInstall = null; els.installBtn.hidden = true; });
  }

  function initEvents() {
    els.searchInput.addEventListener("input", (event) => { state.search = event.target.value.trim(); renderSearch(); if (state.search) els.searchResults.scrollIntoView({ behavior: "smooth", block: "start" }); });
    els.clearSearchBtn.addEventListener("click", () => { state.search = ""; els.searchInput.value = ""; renderSearch(); });
    els.homeBtn.addEventListener("click", () => openPath(""));
    els.themeBtn.addEventListener("click", toggleTheme);
    els.gridViewBtn.addEventListener("click", () => setView("grid"));
    els.listViewBtn.addEventListener("click", () => setView("list"));
    els.mobileMenuBtn.addEventListener("click", toggleMobileNav);
    els.mobileBackdrop.addEventListener("click", closeMobileNav);
    els.viewerClose?.addEventListener("click", closeViewer);
    els.viewer?.addEventListener("cancel", (event) => { event.preventDefault(); closeViewer(); });
    els.viewer?.addEventListener("click", (event) => { if (event.target === els.viewer) closeViewer(); });
    els.offlineBtn.addEventListener("click", () => cacheAllDocs().catch((error) => { console.error(error); showToast("Offline caching could not be completed"); }));
    els.offlineHeroBtn.addEventListener("click", () => cacheAllDocs().catch((error) => { console.error(error); showToast("Offline caching could not be completed"); }));
    window.addEventListener("online", updateConnection); window.addEventListener("offline", updateConnection);
    window.addEventListener("keydown", (event) => {
      if (event.key === "/" && document.activeElement !== els.searchInput) { event.preventDefault(); els.searchInput.focus(); }
      if (event.key === "Escape") { if (els.viewer?.open) closeViewer(); else if (document.activeElement === els.searchInput) { els.searchInput.value = ""; state.search = ""; renderSearch(); els.searchInput.blur(); } }
    });
  }

  themeInit();
  els.gridViewBtn.classList.toggle("active", state.view === "grid");
  els.listViewBtn.classList.toggle("active", state.view === "list");
  initEvents();
  initInstallPrompt();
  registerServiceWorker();
  requestPersistentStorage();
  loadIndex();
})();
