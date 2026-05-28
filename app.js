// ---------- Constants ----------
const STORAGE_KEY_V2 = "atlasly:v2";
const STORAGE_KEY_V1 = "atlasly:visited";
const MAP_URL = "https://cdn.jsdelivr.net/npm/@svg-maps/world/world.svg";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const SEARCH_DEBOUNCE_MS = 450;

// Approximate geographic centroids for ~10 stable countries used to fit a
// projection from lat/lon to this SVG's coordinate system at runtime.
const CALIBRATION_POINTS = [
  ["br", -10.0, -53.0],
  ["au", -25.0, 134.0],
  ["cn", 35.0, 104.0],
  ["in", 22.0, 79.0],
  ["za", -29.0, 25.0],
  ["ar", -35.0, -65.0],
  ["ng", 9.5, 8.5],
  ["sa", 24.0, 45.0],
  ["mx", 23.0, -102.0],
  ["fr", 46.5, 2.5],
  ["tr", 39.0, 35.5],
  ["mn", 46.0, 105.0],
];

// Continent membership for the 195 sovereign states (sovereign-only counts).
const CONTINENTS = {
  AF: new Set(["dz","ao","bj","bw","bf","bi","cv","cm","cf","td","km","cg","cd","dj","eg","gq","er","sz","et","ga","gm","gh","gn","gw","ci","ke","ls","lr","ly","mg","mw","ml","mr","mu","ma","mz","na","ne","ng","rw","st","sn","sc","sl","so","za","ss","sd","tz","tg","tn","ug","zm","zw"]),
  AS: new Set(["af","am","az","bh","bd","bt","bn","kh","cn","cy","ge","in","id","ir","iq","il","jp","jo","kz","kw","kg","la","lb","my","mv","mn","mm","np","kp","om","pk","ps","ph","qa","sa","sg","kr","lk","sy","tj","th","tl","tr","tm","ae","uz","vn","ye"]),
  EU: new Set(["al","ad","at","by","be","ba","bg","hr","cz","dk","ee","fi","fr","de","gr","hu","is","ie","it","lv","li","lt","lu","mt","md","mc","me","nl","mk","no","pl","pt","ro","ru","sm","rs","sk","si","es","se","ch","ua","gb","va"]),
  NA: new Set(["ag","bs","bb","bz","ca","cr","cu","dm","do","sv","gd","gt","ht","hn","jm","mx","ni","pa","kn","lc","vc","tt","us"]),
  SA: new Set(["ar","bo","br","cl","co","ec","gy","py","pe","sr","uy","ve"]),
  OC: new Set(["au","fj","ki","mh","fm","nr","nz","pw","pg","ws","sb","to","tv","vu"]),
};
const CONTINENT_NAMES = { AF: "Africa", AS: "Asia", EU: "Europe", NA: "N. America", SA: "S. America", OC: "Oceania" };

function continentOf(code) {
  for (const [c, set] of Object.entries(CONTINENTS)) if (set.has(code)) return c;
  return null;
}

// 193 UN member states + 2 observers (Vatican, Palestine) = 195 sovereign states.
// Lowercase ISO 3166-1 alpha-2 codes; territories/dependencies are excluded.
const SOVEREIGN_COUNTRIES = new Set([
  "af","al","dz","ad","ao","ag","ar","am","au","at","az","bs","bh","bd","bb",
  "by","be","bz","bj","bt","bo","ba","bw","br","bn","bg","bf","bi","cv","kh",
  "cm","ca","cf","td","cl","cn","co","km","cg","cd","cr","ci","hr","cu","cy",
  "cz","dk","dj","dm","do","ec","eg","sv","gq","er","ee","sz","et","fj","fi",
  "fr","ga","gm","ge","de","gh","gr","gd","gt","gn","gw","gy","ht","hn","hu",
  "is","in","id","ir","iq","ie","il","it","jm","jp","jo","kz","ke","ki","kp",
  "kr","kw","kg","la","lv","lb","ls","lr","ly","li","lt","lu","mg","mw","my",
  "mv","ml","mt","mh","mr","mu","mx","fm","md","mc","mn","me","ma","mz","mm",
  "na","nr","np","nl","nz","ni","ne","ng","mk","no","om","pk","pw","pa","pg",
  "py","pe","ph","pl","pt","qa","ro","ru","rw","kn","lc","vc","ws","sm","st",
  "sa","sn","rs","sc","sl","sg","sk","si","sb","so","za","ss","es","lk","sd",
  "sr","se","ch","sy","tj","tz","th","tl","tg","to","tt","tn","tr","tm","tv",
  "ug","ua","ae","gb","us","uy","uz","vu","ve","vn","ye","zm","zw",
  "va","ps",
]);

// ---------- State ----------
const state = {
  countries: new Set(),         // visited country codes
  countriesPlanned: new Set(),  // wishlist country codes
  cities: [],                   // {id, name, country, region, lat, lon, depth, status}
  names: new Map(),             // country code -> display name (from SVG aria-label)
  mode: "visited",              // current marking mode: "visited" | "planned"
};

let projParams = { lonA: 1010 / 360, lonB: 505, mercC: -120, mercD: 333 };

function loadPersisted() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY_V2));
    if (raw) {
      if (Array.isArray(raw.countries)) state.countries = new Set(raw.countries);
      if (Array.isArray(raw.countriesPlanned)) state.countriesPlanned = new Set(raw.countriesPlanned);
      if (Array.isArray(raw.cities)) {
        state.cities = raw.cities.map((c) => ({ status: "visited", ...c }));
      }
      if (raw.mode === "visited" || raw.mode === "planned") state.mode = raw.mode;
      return;
    }
  } catch {}
  try {
    const v1 = JSON.parse(localStorage.getItem(STORAGE_KEY_V1));
    if (Array.isArray(v1)) state.countries = new Set(v1);
  } catch {}
}

function savePersisted() {
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify({
    countries: [...state.countries],
    countriesPlanned: [...state.countriesPlanned],
    cities: state.cities,
    mode: state.mode,
  }));
}

loadPersisted();

// ---------- DOM refs ----------
const $ = (id) => document.getElementById(id);
const searchInput = $("search-input");
const searchResults = $("search-results");
const searchStatus = $("search-status");
const citiesList = $("cities-list");
const visitedList = $("visited-list");
const tooltip = $("tooltip");
const toastEl = $("toast");

// ---------- Helpers ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
const escapeAttr = escapeHtml;

function effectiveVisited() {
  const set = new Set(state.countries);
  for (const c of state.cities) {
    if (c.country && (c.status || "visited") === "visited") set.add(c.country);
  }
  return set;
}

function effectivePlanned() {
  const set = new Set(state.countriesPlanned);
  for (const c of state.cities) {
    if (c.country && c.status === "planned") set.add(c.country);
  }
  return set;
}

function countryStatus(code) {
  if (effectiveVisited().has(code)) return "visited";
  if (effectivePlanned().has(code)) return "planned";
  return null;
}

function cityId(city) {
  return `${city.country}|${city.name}|${city.lat.toFixed(3)}|${city.lon.toFixed(3)}`;
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  requestAnimationFrame(() => toastEl.classList.add("show"));
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    toastEl.classList.remove("show");
    setTimeout(() => { toastEl.hidden = true; }, 250);
  }, 2200);
}

// ---------- Projection (linear fit at runtime against country path centroids) ----------
function mercY(lat) {
  const clamped = Math.max(-80, Math.min(82, lat));
  const rad = clamped * Math.PI / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

function calibrateProjection(svg) {
  const lons = [], xs = [], mercs = [], ys = [];
  for (const [code, lat, lon] of CALIBRATION_POINTS) {
    const path = svg.querySelector(`path[id="${code}"]`);
    if (!path) continue;
    let bb;
    try { bb = path.getBBox(); } catch { continue; }
    if (!bb || !bb.width) continue;
    lons.push(lon);
    xs.push(bb.x + bb.width / 2);
    mercs.push(mercY(lat));
    ys.push(bb.y + bb.height / 2);
  }
  if (lons.length < 2) return;

  function fit(xs, ys) {
    const n = xs.length;
    const sx = xs.reduce((s, v) => s + v, 0);
    const sy = ys.reduce((s, v) => s + v, 0);
    const sxy = xs.reduce((s, v, i) => s + v * ys[i], 0);
    const sx2 = xs.reduce((s, v) => s + v * v, 0);
    const a = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
    const b = (sy - a * sx) / n;
    return { a, b };
  }

  const fx = fit(lons, xs);
  const fy = fit(mercs, ys);
  projParams = { lonA: fx.a, lonB: fx.b, mercC: fy.a, mercD: fy.b };
}

function project(lat, lon) {
  const x = projParams.lonA * lon + projParams.lonB;
  const y = projParams.mercC * mercY(lat) + projParams.mercD;
  return { x, y };
}

// ---------- Map loading ----------
async function loadMap() {
  const wrap = $("map-wrap");
  const loading = $("map-loading");

  try {
    const res = await fetch(MAP_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const svgText = await res.text();
    loading.remove();
    wrap.insertAdjacentHTML("beforeend", svgText);
    initSvg();
    initPaths();
    renderAll();
  } catch (err) {
    loading.textContent = `Failed to load map: ${err.message}`;
  }
}

function initSvg() {
  const svg = document.querySelector("#map-wrap svg");
  if (!svg) return;
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  // Gradients for visited / planned fills
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.innerHTML = `
    <linearGradient id="visitedGradient" x1="0" y1="0" x2="0.7" y2="1">
      <stop offset="0%" stop-color="#34d399" />
      <stop offset="100%" stop-color="#15803d" />
    </linearGradient>
    <linearGradient id="plannedGradient" x1="0" y1="0" x2="0.7" y2="1">
      <stop offset="0%" stop-color="#60a5fa" stop-opacity="0.55" />
      <stop offset="100%" stop-color="#1d4ed8" stop-opacity="0.55" />
    </linearGradient>
  `;
  svg.insertBefore(defs, svg.firstChild);

  // City layer always sits above all country paths
  const layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  layer.setAttribute("class", "city-layer");
  svg.appendChild(layer);
}

function initPaths() {
  const svg = document.querySelector("#map-wrap svg");
  if (!svg) return;

  calibrateProjection(svg);

  const paths = svg.querySelectorAll("path[id]");
  const sovereignInSvg = [...paths].filter((p) => SOVEREIGN_COUNTRIES.has(p.id));
  $("total-count").textContent = sovereignInSvg.length;

  paths.forEach((p) => {
    const id = p.id;
    const name =
      p.getAttribute("title") ||
      p.getAttribute("aria-label") ||
      p.getAttribute("name") ||
      id;
    state.names.set(id, name);

    p.addEventListener("click", () => toggleCountry(id, p));
    p.addEventListener("mouseenter", (e) => showTooltip(e, name));
    p.addEventListener("mousemove", moveTooltip);
    p.addEventListener("mouseleave", hideTooltip);
  });
}

// ---------- Rendering ----------
let lastVisitedCount = 0;

function renderAll() {
  renderPaths();
  renderCityDots();
  renderCounters();
  renderContinents();
  renderCitiesList();
  renderVisitedList();
  renderSearchResults();
  syncModeUi();
}

function renderContinents() {
  const list = $("continent-list");
  if (!list) return;
  const visited = effectiveVisited();
  const planned = effectivePlanned();
  list.innerHTML = Object.keys(CONTINENT_NAMES)
    .map((c) => {
      const set = CONTINENTS[c];
      let v = 0, p = 0;
      for (const code of set) {
        if (visited.has(code)) v++;
        else if (planned.has(code)) p++;
      }
      const total = set.size;
      const vPct = (v / total) * 100;
      const vpPct = ((v + p) / total) * 100;
      return `
        <li class="continent-row">
          <span class="continent-name">${CONTINENT_NAMES[c]}</span>
          <span class="continent-bar">
            <span class="continent-bar-planned" style="width:${vpPct.toFixed(1)}%"></span>
            <span class="continent-bar-fill" style="width:${vPct.toFixed(1)}%"></span>
          </span>
          <span class="continent-count">${v}${p ? `<span class="dim">+${p}</span>` : ""}<span class="dim">/${total}</span></span>
        </li>`;
    })
    .join("");
}

function syncModeUi() {
  document.querySelectorAll(".mode-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === state.mode);
  });
}

function renderPaths() {
  const visited = effectiveVisited();
  const planned = effectivePlanned();
  const paths = document.querySelectorAll("#map-wrap svg path[id]");
  paths.forEach((p) => {
    const isVisited = visited.has(p.id);
    const isPlanned = !isVisited && planned.has(p.id);
    p.classList.toggle("visited", isVisited);
    p.classList.toggle("planned", isPlanned);
  });
}

function renderCityDots() {
  const layer = document.querySelector("#map-wrap svg .city-layer");
  if (!layer) return;
  layer.innerHTML = "";
  for (const city of state.cities) {
    const { x, y } = project(city.lat, city.lon);
    const status = city.status || "visited";
    const r = status === "planned" ? 3.5 : 2 + city.depth * 1.3;
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", x);
    c.setAttribute("cy", y);
    c.setAttribute("r", r);
    c.setAttribute("class", `city-dot ${status}`);
    c.dataset.cityId = city.id;
    const label = status === "planned"
      ? `${city.name} · planned`
      : `${city.name} · depth ${city.depth}`;
    c.addEventListener("mouseenter", (e) => showTooltip(e, label));
    c.addEventListener("mousemove", moveTooltip);
    c.addEventListener("mouseleave", hideTooltip);
    layer.appendChild(c);
  }
}

let lastPlannedCount = 0;

function renderCounters() {
  const visited = effectiveVisited();
  const planned = effectivePlanned();
  let visitedTarget = 0, plannedTarget = 0;
  for (const code of visited) if (SOVEREIGN_COUNTRIES.has(code)) visitedTarget++;
  for (const code of planned) if (SOVEREIGN_COUNTRIES.has(code) && !visited.has(code)) plannedTarget++;

  animateCount($("visited-count"), lastVisitedCount, visitedTarget, 500);
  animateCount($("planned-count"), lastPlannedCount, plannedTarget, 500);
  lastVisitedCount = visitedTarget;
  lastPlannedCount = plannedTarget;

  $("cities-count").textContent = state.cities.length;
  $("cities-badge").textContent = state.cities.length;

  const totalEl = $("total-count");
  const total = parseInt(totalEl.textContent, 10) || 1;
  const pct = (visitedTarget / total) * 100;
  $("progress-bar").style.width = `${pct}%`;
}

function animateCount(el, from, to, duration) {
  if (from === to) {
    el.textContent = to;
    return;
  }
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = to;
  }
  requestAnimationFrame(step);
}

function renderCitiesList() {
  if (state.cities.length === 0) {
    citiesList.innerHTML =
      '<li class="empty">Search for a city above to add it.</li>';
    return;
  }
  const sorted = [...state.cities].sort((a, b) => {
    const sa = (a.status || "visited") === "planned" ? 1 : 0;
    const sb = (b.status || "visited") === "planned" ? 1 : 0;
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name);
  });
  citiesList.innerHTML = sorted
    .map((c) => {
      const status = c.status || "visited";
      const toggleTo = status === "visited" ? "planned" : "visited";
      const toggleLabel = status === "visited" ? "→ Wishlist" : "→ Visited";
      const depthRow = status === "planned"
        ? ""
        : `<div class="depth-row">
            <input class="depth-slider" type="range" min="1" max="5" value="${c.depth}" data-city-id="${escapeAttr(c.id)}" />
            <span class="depth-value">${depthLabel(c.depth)}</span>
          </div>`;
      return `
      <li>
        <div class="city-row">
          <div class="city-row-top">
            <span class="status-dot ${status}" title="${status}"></span>
            <span class="city-name">${escapeHtml(c.name)}</span>
            <span class="city-country">${escapeHtml((c.country || "??").toUpperCase())}</span>
            <button class="status-toggle" data-toggle-city="${escapeAttr(c.id)}" data-to="${toggleTo}">${toggleLabel}</button>
            <button class="row-remove" data-city-id="${escapeAttr(c.id)}" title="Remove">×</button>
          </div>
          ${depthRow}
        </div>
      </li>`;
    })
    .join("");
}

function depthLabel(d) {
  return ({ 1: "1 · transit", 2: "2 · brief", 3: "3 · visited", 4: "4 · explored", 5: "5 · lived" })[d] || `${d}`;
}

function renderVisitedList() {
  const visited = effectiveVisited();
  const planned = effectivePlanned();
  const all = new Set([...visited, ...planned]);
  if (all.size === 0) {
    visitedList.innerHTML =
      '<li class="empty">Click a country on the map or search for one.</li>';
    return;
  }
  const items = [...all]
    .map((id) => ({
      id,
      name: state.names.get(id) || id.toUpperCase(),
      status: visited.has(id) ? "visited" : "planned",
    }))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "visited" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  visitedList.innerHTML = items
    .map(({ id, name, status }) => {
      const cityCount = state.cities.filter((c) => c.country === id).length;
      const detail = cityCount > 0
        ? `<span class="city-country">${cityCount} ${cityCount === 1 ? "city" : "cities"}</span>`
        : "";
      const toggleTo = status === "visited" ? "planned" : "visited";
      const toggleLabel = status === "visited" ? "→ Wishlist" : "→ Visited";
      return `
        <li>
          <div class="visited-row">
            <span class="status-dot ${status}" title="${status}"></span>
            <span class="city-name">${escapeHtml(name)}</span>
            ${detail}
            <button class="status-toggle" data-toggle-country="${escapeAttr(id)}" data-to="${toggleTo}">${toggleLabel}</button>
            <button class="row-remove" data-country="${escapeAttr(id)}" title="Remove">×</button>
          </div>
        </li>`;
    })
    .join("");
}

// ---------- Toggle / mutate ----------
function toggleCountry(code, pathEl) {
  const status = countryStatus(code);
  if (status) {
    // Already marked — unmark fully (drop direct flags and any cities here)
    state.countries.delete(code);
    state.countriesPlanned.delete(code);
    state.cities = state.cities.filter((c) => c.country !== code);
  } else if (state.mode === "planned") {
    state.countriesPlanned.add(code);
    if (pathEl) flashPulse(pathEl);
  } else {
    state.countries.add(code);
    if (pathEl) flashPulse(pathEl);
  }
  savePersisted();
  renderAll();
}

function setCountryStatus(code, status) {
  state.countries.delete(code);
  state.countriesPlanned.delete(code);
  if (status === "visited") state.countries.add(code);
  else if (status === "planned") state.countriesPlanned.add(code);
  // Also flip any cities of this country to match
  for (const c of state.cities) if (c.country === code) c.status = status;
  savePersisted();
  renderAll();
}

function addCity(item) {
  const city = {
    id: cityId(item),
    name: item.name,
    country: item.country,
    region: item.region || "",
    lat: item.lat,
    lon: item.lon,
    depth: 3,
    status: state.mode === "planned" ? "planned" : "visited",
  };
  if (state.cities.some((c) => c.id === city.id)) {
    showToast("Already added");
    return;
  }
  state.cities.push(city);
  savePersisted();
  renderAll();
  popLastCityDot(city.id);
  showToast(state.mode === "planned" ? `Wishlisted ${city.name}` : `Added ${city.name}`);
}

function setCityStatus(id, status) {
  const c = state.cities.find((x) => x.id === id);
  if (!c) return;
  c.status = status;
  savePersisted();
  renderAll();
}

function removeCity(id) {
  state.cities = state.cities.filter((c) => c.id !== id);
  savePersisted();
  renderAll();
}

function setCityDepth(id, depth) {
  const c = state.cities.find((x) => x.id === id);
  if (!c) return;
  c.depth = depth;
  savePersisted();
  renderCityDots();
  renderCitiesList();
}

function flashPulse(pathEl) {
  pathEl.classList.remove("pulse");
  void pathEl.getBoundingClientRect();
  pathEl.classList.add("pulse");
  setTimeout(() => pathEl.classList.remove("pulse"), 900);
}

function popLastCityDot(id) {
  const dot = document.querySelector(`.city-dot[data-city-id="${CSS.escape(id)}"]`);
  if (!dot) return;
  dot.classList.add("pop");
  // Pulse ring
  const cx = dot.getAttribute("cx");
  const cy = dot.getAttribute("cy");
  const layer = dot.parentNode;
  const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  ring.setAttribute("cx", cx);
  ring.setAttribute("cy", cy);
  ring.setAttribute("r", "2");
  ring.setAttribute("class", "city-pulse-ring");
  layer.appendChild(ring);
  setTimeout(() => ring.remove(), 1200);
  setTimeout(() => dot.classList.remove("pop"), 600);
}

// ---------- Tooltip ----------
function showTooltip(e, text) {
  tooltip.textContent = text;
  tooltip.hidden = false;
  moveTooltip(e);
}
function moveTooltip(e) {
  tooltip.style.left = `${e.clientX + 12}px`;
  tooltip.style.top = `${e.clientY + 12}px`;
}
function hideTooltip() { tooltip.hidden = true; }

// ---------- Search (local countries + Nominatim cities) ----------
let searchTimer = null;
let searchSeq = 0;

function debouncedSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
}

async function runSearch() {
  const q = searchInput.value.trim();
  if (!q) {
    searchResults.hidden = true;
    searchResults.innerHTML = "";
    searchStatus.hidden = true;
    return;
  }
  const seq = ++searchSeq;

  // Local country matches
  const lowerQ = q.toLowerCase();
  const countryMatches = [...state.names.entries()]
    .filter(([, name]) => name.toLowerCase().includes(lowerQ))
    .sort((a, b) => a[1].localeCompare(b[1]))
    .slice(0, 5)
    .map(([code, name]) => ({ kind: "country", code, name }));

  renderResultList(countryMatches);
  searchStatus.hidden = false;
  searchStatus.textContent = "Searching cities…";

  try {
    const url = `${NOMINATIM_URL}?format=jsonv2&q=${encodeURIComponent(q)}&limit=8&addressdetails=1`;
    const res = await fetch(url, { headers: { "Accept-Language": "en" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (seq !== searchSeq) return;

    const cityMatches = data
      .filter((p) => p.address && p.address.country_code)
      .filter((p) =>
        p.class === "place" ||
        ["city", "town", "village", "hamlet", "suburb", "municipality", "administrative"].includes(p.type)
      )
      .map((p) => {
        const a = p.address;
        const name = a.city || a.town || a.village || a.hamlet ||
          a.municipality || a.state || p.display_name.split(",")[0].trim();
        return {
          kind: "city",
          name,
          country: a.country_code.toLowerCase(),
          countryName: a.country || "",
          region: a.state || a.region || "",
          lat: parseFloat(p.lat),
          lon: parseFloat(p.lon),
        };
      })
      .filter((c) => !isNaN(c.lat) && !isNaN(c.lon))
      .slice(0, 7);

    searchStatus.hidden = true;
    renderResultList([...countryMatches, ...cityMatches]);
  } catch (err) {
    if (seq !== searchSeq) return;
    searchStatus.textContent = "City search unavailable";
  }
}

function renderResultList(items) {
  if (items.length === 0) {
    searchResults.hidden = false;
    searchResults.innerHTML = '<li class="empty">No matches</li>';
    return;
  }
  searchResults.hidden = false;
  const visited = effectiveVisited();
  const planned = effectivePlanned();
  searchResults.innerHTML = items
    .map((item, idx) => {
      if (item.kind === "country") {
        const status = visited.has(item.code) ? "visited" : (planned.has(item.code) ? "planned" : "");
        return `
        <li data-idx="${idx}" class="${status}">
          <span class="status-dot ${status || "none"}"></span>
          <span class="result-name">${escapeHtml(item.name)}</span>
          <span class="result-detail">Country</span>
        </li>`;
      }
      const detail = [item.region, item.countryName].filter(Boolean).join(", ");
      const already = state.cities.find(
        (c) =>
          c.name === item.name &&
          c.country === item.country &&
          Math.abs(c.lat - item.lat) < 0.01
      );
      const status = already ? (already.status || "visited") : "";
      return `
        <li data-idx="${idx}" class="${status}">
          <span class="status-dot ${status || "none"}"></span>
          <span class="result-name">${escapeHtml(item.name)}</span>
          <span class="result-detail">${escapeHtml(detail)}</span>
        </li>`;
    })
    .join("");
  searchResults._items = items;
}

function renderSearchResults() {
  // Re-render with current visited state if the result list is visible
  if (!searchResults.hidden && searchResults._items) {
    renderResultList(searchResults._items);
  }
}

// ---------- Image share ----------
async function shareAsImage() {
  const svg = document.querySelector("#map-wrap svg");
  if (!svg) { showToast("Map not loaded yet"); return; }

  const clone = svg.cloneNode(true);
  // Inline the gradient definition already lives in the SVG; add fallback styles
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `
    path { fill: #2a3340; stroke: #00000080; stroke-width: 0.4; }
    path.visited { fill: url(#visitedGradient); }
    path.planned { fill: url(#plannedGradient); stroke: rgba(96,165,250,0.7); stroke-width: 0.6; stroke-dasharray: 1.2 1.2; }
    .city-dot { fill: #f59e0b; stroke: #ffffff; stroke-width: 0.6; }
    .city-dot.planned { fill: transparent; stroke: #60a5fa; stroke-width: 1.4; }
  `;
  clone.insertBefore(style, clone.firstChild);

  const svgStr = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error("Image load failed"));
    img.src = url;
  });

  const W = 1600, H = 1100;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0f1721");
  bg.addColorStop(1, "#0b1018");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle radial accent
  const accent = ctx.createRadialGradient(W * 0.2, H * 0.2, 0, W * 0.2, H * 0.2, 800);
  accent.addColorStop(0, "rgba(96,165,250,0.10)");
  accent.addColorStop(1, "rgba(96,165,250,0)");
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, H);

  // Title with gradient
  const titleGrad = ctx.createLinearGradient(80, 0, 380, 0);
  titleGrad.addColorStop(0, "#4ade80");
  titleGrad.addColorStop(1, "#60a5fa");
  ctx.fillStyle = titleGrad;
  ctx.font = "bold 72px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
  ctx.fillText("Atlasly", 80, 110);

  // Stats line
  const visitedSet = effectiveVisited();
  const plannedSet = effectivePlanned();
  let visCount = 0, planCount = 0;
  for (const code of visitedSet) if (SOVEREIGN_COUNTRIES.has(code)) visCount++;
  for (const code of plannedSet) if (SOVEREIGN_COUNTRIES.has(code) && !visitedSet.has(code)) planCount++;
  const total = parseInt($("total-count").textContent, 10) || 0;
  ctx.fillStyle = "#e8eef5";
  ctx.font = "600 36px -apple-system, system-ui, sans-serif";
  ctx.fillText(
    `${visCount} of ${total} visited · ${planCount} planned · ${state.cities.length} cities`,
    80, 165
  );

  ctx.fillStyle = "#8a96a6";
  ctx.font = "22px -apple-system, system-ui, sans-serif";
  ctx.fillText("Mark where you've been. Discover where to go.", 80, 200);

  // Map card
  const mapMaxW = W - 160;
  const mapMaxH = H - 280;
  const aspect = 1010 / 666;
  let mapW = mapMaxW, mapH = mapMaxW / aspect;
  if (mapH > mapMaxH) { mapH = mapMaxH; mapW = mapH * aspect; }
  const mapX = (W - mapW) / 2;
  const mapY = 240;

  ctx.fillStyle = "#0a1422";
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(mapX - 24, mapY - 24, mapW + 48, mapH + 48, 18);
    ctx.fill();
  } else {
    ctx.fillRect(mapX - 24, mapY - 24, mapW + 48, mapH + 48);
  }

  ctx.drawImage(img, mapX, mapY, mapW, mapH);
  URL.revokeObjectURL(url);

  // Footer
  ctx.fillStyle = "#8a96a6";
  ctx.font = "20px -apple-system, system-ui, sans-serif";
  ctx.fillText("atlasly", 80, H - 50);
  ctx.textAlign = "right";
  ctx.fillText(new Date().toLocaleDateString(), W - 80, H - 50);
  ctx.textAlign = "left";

  canvas.toBlob(async (blob) => {
    if (!blob) { showToast("Image generation failed"); return; }

    let copied = false;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        copied = true;
      }
    } catch {}

    const a = document.createElement("a");
    const dlUrl = URL.createObjectURL(blob);
    a.href = dlUrl;
    a.download = `atlasly-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(dlUrl), 4000);

    showToast(copied ? "Copied to clipboard & downloaded" : "Image downloaded");
  }, "image/png");
}

// ---------- Event bindings ----------
searchInput.addEventListener("input", debouncedSearch);
searchInput.addEventListener("focus", debouncedSearch);
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search")) {
    searchResults.hidden = true;
  }
});

searchResults.addEventListener("click", (e) => {
  const li = e.target.closest("li[data-idx]");
  if (!li || !searchResults._items) return;
  const item = searchResults._items[parseInt(li.dataset.idx, 10)];
  if (!item) return;
  if (item.kind === "country") {
    const path = document.querySelector(`#map-wrap svg path[id="${item.code}"]`);
    toggleCountry(item.code, path);
  } else {
    addCity(item);
  }
});

citiesList.addEventListener("click", (e) => {
  const rm = e.target.closest(".row-remove[data-city-id]");
  if (rm) { removeCity(rm.dataset.cityId); return; }
  const tg = e.target.closest(".status-toggle[data-toggle-city]");
  if (tg) setCityStatus(tg.dataset.toggleCity, tg.dataset.to);
});

citiesList.addEventListener("input", (e) => {
  const slider = e.target.closest(".depth-slider[data-city-id]");
  if (slider) setCityDepth(slider.dataset.cityId, parseInt(slider.value, 10));
});

visitedList.addEventListener("click", (e) => {
  const rm = e.target.closest(".row-remove[data-country]");
  if (rm) {
    const code = rm.dataset.country;
    state.countries.delete(code);
    state.countriesPlanned.delete(code);
    state.cities = state.cities.filter((c) => c.country !== code);
    savePersisted();
    renderAll();
    return;
  }
  const tg = e.target.closest(".status-toggle[data-toggle-country]");
  if (tg) setCountryStatus(tg.dataset.toggleCountry, tg.dataset.to);
});

document.querySelector(".mode-toggle").addEventListener("click", (e) => {
  const btn = e.target.closest(".mode-btn[data-mode]");
  if (!btn) return;
  state.mode = btn.dataset.mode;
  savePersisted();
  syncModeUi();
  renderSearchResults();
});

$("reset-btn").addEventListener("click", () => {
  if (state.countries.size === 0 && state.countriesPlanned.size === 0 && state.cities.length === 0) return;
  if (!confirm("Clear all marked countries, wishlist, and cities?")) return;
  state.countries.clear();
  state.countriesPlanned.clear();
  state.cities = [];
  savePersisted();
  renderAll();
});

$("share-btn").addEventListener("click", shareAsImage);

syncModeUi();
loadMap();
