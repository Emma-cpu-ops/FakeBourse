const CRYPTO_ASSETS = [
  { id: "bitcoin", name: "Bitcoin", symbol: "BTC", icon: "₿", className: "bitcoin" },
  { id: "ethereum", name: "Ethereum", symbol: "ETH", icon: "Ξ", className: "ethereum" },
  { id: "solana", name: "Solana", symbol: "SOL", icon: "S", className: "solana" },
  { id: "ripple", name: "XRP", symbol: "XRP", icon: "X", className: "ripple" },
  { id: "dogecoin", name: "Dogecoin", symbol: "DOGE", icon: "Ð", className: "dogecoin" },
].map((asset) => ({ ...asset, market: "crypto", chartSymbol: `BINANCE:${asset.symbol}USDT` }));

const FOREX_ASSETS = [
  { id: "fx-eurusd", name: "Euro / Dollar US", symbol: "EUR/USD", icon: "€", className: "forex-eur", chartSymbol: "FX:EURUSD", rate: (rates) => 1 / rates.EUR },
  { id: "fx-gbpusd", name: "Livre / Dollar US", symbol: "GBP/USD", icon: "£", className: "forex-gbp", chartSymbol: "FX:GBPUSD", rate: (rates) => 1 / rates.GBP },
  { id: "fx-usdjpy", name: "Dollar US / Yen", symbol: "USD/JPY", icon: "$", className: "forex-jpy", chartSymbol: "FX:USDJPY", rate: (rates) => rates.JPY, digits: 3 },
  { id: "fx-usdchf", name: "Dollar US / Franc suisse", symbol: "USD/CHF", icon: "Fr", className: "forex-chf", chartSymbol: "FX:USDCHF", rate: (rates) => rates.CHF },
  { id: "fx-usdcad", name: "Dollar US / Dollar canadien", symbol: "USD/CAD", icon: "C$", className: "forex-cad", chartSymbol: "FX:USDCAD", rate: (rates) => rates.CAD },
  { id: "fx-audusd", name: "Dollar australien / US", symbol: "AUD/USD", icon: "A$", className: "forex-aud", chartSymbol: "FX:AUDUSD", rate: (rates) => 1 / rates.AUD },
  { id: "fx-nzdusd", name: "Dollar néo-zélandais / US", symbol: "NZD/USD", icon: "NZ$", className: "forex-nzd", chartSymbol: "FX:NZDUSD", rate: (rates) => 1 / rates.NZD },
];

const ASSETS = [...FOREX_ASSETS, ...CRYPTO_ASSETS];
const FX_RATE_SYMBOLS = ["EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"].join(",");

const FALLBACK_PRICES = {
  bitcoin: { eur: 83025.42, eur_24h_change: 1.82 },
  ethereum: { eur: 2540.61, eur_24h_change: -0.76 },
  solana: { eur: 148.38, eur_24h_change: 2.94 },
  ripple: { eur: 1.92, eur_24h_change: 0.45 },
  dogecoin: { eur: 0.1724, eur_24h_change: -1.18 },
  "fx-eurusd": { eur: 1.0842, eur_24h_change: 0.12 },
  "fx-gbpusd": { eur: 1.2715, eur_24h_change: -0.08 },
  "fx-usdjpy": { eur: 149.82, eur_24h_change: 0.24 },
  "fx-usdchf": { eur: 0.8831, eur_24h_change: -0.16 },
  "fx-usdcad": { eur: 1.3564, eur_24h_change: 0.09 },
  "fx-audusd": { eur: 0.6538, eur_24h_change: -0.21 },
  "fx-nzdusd": { eur: 0.6084, eur_24h_change: 0.05 },
};

const currency = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 });
const storeKey = "fakeBoursePortfolioV1";
let state = readState();
let prices = structuredClone(FALLBACK_PRICES);
let selectedId = "fx-eurusd";
let mode = "buy";
let marketFilter = "all";
let chartInterval = "15";
let cryptoLive = false;
let forexReferenceAvailable = false;
let fxReferenceDate = null;
let chartLoadPromise;
let toastTimer;

const marketList = document.querySelector("#market-list");
const portfolioList = document.querySelector("#portfolio-list");
const activityList = document.querySelector("#activity-list");
const amountInput = document.querySelector("#trade-amount");
const search = document.querySelector("#asset-search");
const fxAnchors = Object.fromEntries(FOREX_ASSETS.map((asset) => [asset.id, prices?.[asset.id]?.eur]));

function readState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey));
    if (saved && Number.isFinite(saved.cash) && saved.positions && saved.activity) return saved;
  } catch (_) { /* Start a fresh demo if storage is unavailable. */ }
  return { cash: 10000, positions: {}, activity: [] };
}

function saveState() { localStorage.setItem(storeKey, JSON.stringify(state)); }
function assetById(id) { return ASSETS.find((asset) => asset.id === id); }
function amountFormat(value) { return currency.format(Math.max(0, value)); }
function priceFormat(value, asset = null) {
  if (asset?.market === "forex") {
    return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: asset.digits || 4, maximumFractionDigits: asset.digits || 4 }).format(value);
  }
  if (value >= 1000) return currency.format(value);
  if (value >= 1) return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(value);
}
function shortAmount(value) { return number.format(value); }
function percentFormat(value) { return `${value >= 0 ? "+" : ""}${value.toFixed(2).replace(".", ",")} %`; }
function totalInvested() { return Object.entries(state.positions).reduce((sum, [id, position]) => sum + position.quantity * (prices[id]?.eur || position.averagePrice), 0); }
function portfolioTotal() { return state.cash + totalInvested(); }
function totalCost() { return Object.values(state.positions).reduce((sum, position) => sum + position.cost, 0); }
function selectedAsset() { return assetById(selectedId); }

function renderMarket() {
  const query = search.value.trim().toLowerCase();
  const visible = ASSETS.filter((asset) => {
    const matchesFilter = marketFilter === "all" || asset.market === marketFilter;
    return matchesFilter && (asset.name.toLowerCase().includes(query) || asset.symbol.toLowerCase().includes(query));
  });
  marketList.innerHTML = visible.map((asset) => {
    const quote = prices[asset.id];
    const change = quote?.eur_24h_change ?? 0;
    const marketName = asset.market === "forex" ? "Forex" : "Crypto";
    return `<tr>
      <td><div class="asset-name"><span class="asset-icon ${asset.className}">${asset.icon}</span><div><strong>${asset.name}</strong><span>${asset.symbol}</span></div></div></td>
      <td class="price">${priceFormat(quote?.eur || 0, asset)}</td>
      <td class="change ${change >= 0 ? "up" : "down"}">${change >= 0 ? "↗" : "↘"} ${percentFormat(change)}</td>
      <td><span class="market-tag ${asset.market}">${marketName}</span></td>
      <td><button class="buy-small" type="button" data-asset-id="${asset.id}">Trader</button></td>
    </tr>`;
  }).join("") || `<tr><td colspan="5" class="empty-activity">Aucun actif ne correspond à cette recherche.</td></tr>`;
}

function renderOverview() {
  const total = portfolioTotal();
  const gain = total - 10000;
  const held = Object.values(state.positions).filter((position) => position.quantity > 0).length;
  document.querySelector("#portfolio-total").textContent = amountFormat(total);
  const performance = document.querySelector("#portfolio-performance");
  performance.className = `performance ${gain >= 0 ? "is-up" : "is-down"}`;
  performance.innerHTML = `${gain >= 0 ? "↗" : "↘"} ${gain >= 0 ? "+" : ""}${amountFormat(gain)} <span>depuis le départ</span>`;
  document.querySelector("#cash-balance").textContent = amountFormat(state.cash);
  document.querySelector("#positions-count").textContent = held;
  document.querySelector("#positions-caption").textContent = held ? `${held} ${held > 1 ? "actifs détenus" : "actif détenu"}` : "Aucune ligne ouverte";
  document.querySelector("#invested-value").textContent = `${amountFormat(totalInvested())} investis`;
}

function renderSelectedAsset() {
  const asset = selectedAsset();
  const quote = prices[asset.id];
  document.querySelector("#selected-asset").innerHTML = `<div class="asset-icon ${asset.className}">${asset.icon}</div><div><strong>${asset.name}</strong><span>${asset.symbol}</span></div><b id="selected-price">${priceFormat(quote.eur, asset)}</b>`;
  document.querySelector("#trade-action-word").textContent = mode === "buy" ? "investir" : "retirer";
  document.querySelector("#trade-submit").innerHTML = `${mode === "buy" ? "Acheter" : "Vendre"} ${mode === "buy" ? "du" : "tes"} ${asset.name} <span aria-hidden="true">→</span>`;
  document.querySelector("#trade-submit").classList.toggle("is-sell", mode === "sell");
  updateTradeEstimate();
}

function updateTradeEstimate() {
  const asset = selectedAsset();
  const price = prices[asset.id]?.eur || 0;
  const requested = Number(amountInput.value) || 0;
  const position = state.positions[asset.id];
  const available = mode === "buy" ? state.cash : (position?.quantity || 0) * price;
  const validAmount = Math.min(Math.max(requested, 0), available);
  document.querySelector("#estimated-amount").textContent = asset.market === "forex"
    ? `${shortAmount(price ? validAmount / price : 0)} unités`
    : `${shortAmount(price ? validAmount / price : 0)} ${asset.symbol}`;
  document.querySelector("#reference-price").textContent = priceFormat(price, asset);
}

function renderPortfolio() {
  const entries = Object.entries(state.positions).filter(([, position]) => position.quantity > 0);
  if (!entries.length) {
    portfolioList.innerHTML = `<div class="empty-portfolio"><span aria-hidden="true">◎</span><div><strong>Ton portefeuille attend son premier mouvement.</strong><p>Choisis un actif, fixe un montant et teste ta première position.</p></div></div>`;
    return;
  }
  portfolioList.innerHTML = entries.map(([id, position]) => {
    const asset = assetById(id);
    const currentPrice = prices[id]?.eur || position.averagePrice;
    const currentValue = position.quantity * currentPrice;
    const gain = currentValue - position.cost;
    return `<article class="position-row">
      <div class="asset-name"><span class="asset-icon ${asset.className}">${asset.icon}</span><div><strong>${asset.name}</strong><span>${shortAmount(position.quantity)} ${asset.symbol}</span></div></div>
      <div class="position-metric"><span>PRIX MOYEN</span><strong>${priceFormat(position.averagePrice, asset)}</strong></div>
      <div class="position-metric"><span>VALEUR</span><strong>${amountFormat(currentValue)}</strong></div>
      <div class="position-metric"><span>PERFORMANCE</span><strong class="${gain >= 0 ? "is-up" : "is-down"}">${gain >= 0 ? "+" : ""}${amountFormat(gain)}</strong></div>
      <button type="button" class="sell-position" data-sell-id="${id}">Vendre</button>
    </article>`;
  }).join("");
}

function renderActivity() {
  if (!state.activity.length) {
    activityList.innerHTML = `<p class="empty-activity">Pas encore de mouvement. Le marché ne va pas s'échanger tout seul.</p>`;
    return;
  }
  activityList.innerHTML = state.activity.slice(0, 6).map((item) => {
    const asset = assetById(item.assetId);
    const date = new Date(item.timestamp);
    const side = item.type === "buy" ? "Achat" : "Vente";
    const unit = asset.market === "forex" ? "unités" : asset.symbol;
    return `<article class="activity-row"><span class="activity-icon ${item.type === "sell" ? "sell" : ""}" aria-hidden="true">${item.type === "buy" ? "↓" : "↑"}</span><div class="activity-copy"><strong>${side} · ${asset.name}</strong><span>${shortAmount(item.quantity)} ${unit} à ${priceFormat(item.price, asset)}</span></div><div class="activity-value">${item.type === "buy" ? "−" : "+"}${amountFormat(item.amount)}<time>${date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} · ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</time></div></article>`;
  }).join("");
}

function renderAll() { renderMarket(); renderOverview(); renderSelectedAsset(); renderPortfolio(); renderActivity(); }

function chooseAsset(id) {
  selectedId = id;
  document.querySelector(".trade-panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
  renderSelectedAsset();
  renderChart();
  amountInput.focus();
}

function setMode(nextMode) {
  mode = nextMode;
  document.querySelectorAll(".trade-tab").forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  renderSelectedAsset();
}

function trade() {
  const asset = selectedAsset();
  const price = prices[asset.id]?.eur;
  const amount = Number(amountInput.value);
  if (!Number.isFinite(amount) || amount <= 0) return showToast("Choisis un montant supérieur à 0 €.");
  if (!price) return showToast("Le cours est indisponible, réessaie dans un instant.");
  if (mode === "buy") {
    if (amount > state.cash + 0.001) return showToast("Ton solde virtuel ne suffit pas pour cet ordre.");
    const quantity = amount / price;
    const position = state.positions[asset.id] || { quantity: 0, cost: 0, averagePrice: price };
    position.quantity += quantity;
    position.cost += amount;
    position.averagePrice = position.cost / position.quantity;
    state.positions[asset.id] = position;
    state.cash -= amount;
    state.activity.unshift({ type: "buy", assetId: asset.id, quantity, amount, price, timestamp: Date.now() });
    showToast(`Ordre fictif exécuté : ${shortAmount(quantity)} ${asset.symbol} ajoutés.`);
  } else {
    const position = state.positions[asset.id];
    const valueHeld = (position?.quantity || 0) * price;
    if (!position || !valueHeld) return showToast(`Tu ne détiens pas encore de ${asset.symbol}.`);
    if (amount > valueHeld + 0.01) return showToast(`Tu peux vendre au maximum ${amountFormat(valueHeld)} de ${asset.symbol}.`);
    const quantity = amount / price;
    const costSold = position.cost * (quantity / position.quantity);
    position.quantity -= quantity;
    position.cost -= costSold;
    if (position.quantity < 0.000000001) delete state.positions[asset.id];
    state.cash += amount;
    state.activity.unshift({ type: "sell", assetId: asset.id, quantity, amount, price, timestamp: Date.now() });
    showToast(`Vente fictive exécutée : ${shortAmount(quantity)} ${asset.symbol} vendus.`);
  }
  state.activity = state.activity.slice(0, 20);
  saveState();
  renderAll();
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3400);
}

async function fetchPrices() {
  const ids = CRYPTO_ASSETS.map((asset) => asset.id).join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=eur&include_24hr_change=true&include_last_updated_at=true`;
  try {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`CoinGecko a répondu ${response.status}`);
    const data = await response.json();
    if (!data.bitcoin?.eur) throw new Error("Réponse de cours incomplète");
    prices = { ...prices, ...data };
    cryptoLive = true;
  } catch (error) {
    cryptoLive = false;
  }
  updateMarketMessage();
  renderAll();
}

async function fetchForexRates() {
  const url = `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${FX_RATE_SYMBOLS}`;
  try {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`Frankfurter a répondu ${response.status}`);
    const data = await response.json();
    if (!data.rates?.EUR || !data.date) throw new Error("Réponse Forex incomplète");
    FOREX_ASSETS.forEach((asset) => {
      const rate = asset.rate(data.rates);
      if (data.date !== fxReferenceDate) fxAnchors[asset.id] = rate;
      prices[asset.id] = { ...prices[asset.id], eur: rate };
    });
    fxReferenceDate = data.date;
    forexReferenceAvailable = true;
  } catch (error) {
    forexReferenceAvailable = false;
  }
  updateMarketMessage();
  renderAll();
}

function tickForex() {
  FOREX_ASSETS.forEach((asset) => {
    const quote = prices[asset.id];
    const anchor = fxAnchors[asset.id];
    if (!quote || !anchor) return;
    quote.eur = Math.max(0.00001, quote.eur + (Math.random() - 0.5) * quote.eur * 0.00012);
    quote.eur_24h_change = ((quote.eur - anchor) / anchor) * 100;
  });
  updateFreshness();
  renderAll();
}

function updateMarketMessage() {
  const forexText = forexReferenceAvailable
    ? "Forex : référence BCE via Frankfurter, variations simulées chaque seconde"
    : "Forex : cotations de démonstration, référence Frankfurter indisponible";
  const cryptoText = cryptoLive ? "Crypto : CoinGecko" : "Crypto : derniers cours disponibles en cache";
  document.querySelector("#market-message").textContent = `${forexText} · ${cryptoText} · Graphique réel TradingView.`;
  document.querySelector("#market-message").classList.toggle("is-warning", !forexReferenceAvailable || !cryptoLive);
}

function updateFreshness() {
  const now = new Date();
  document.querySelector("#updated-at").textContent = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  document.querySelector("#market-status").textContent = "Simulation en direct";
}

function loadTradingView() {
  if (window.TradingView) return Promise.resolve(true);
  if (chartLoadPromise) return chartLoadPromise;
  chartLoadPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => resolve(Boolean(window.TradingView));
    script.onerror = () => resolve(false);
    document.head.append(script);
  });
  return chartLoadPromise;
}

async function renderChart() {
  const asset = selectedAsset();
  const chart = document.querySelector("#tradingview-chart");
  document.querySelector("#chart-symbol").textContent = asset.symbol;
  chart.replaceChildren();
  const available = await loadTradingView();
  if (selectedId !== asset.id) return;
  if (!available) {
    const message = document.createElement("p");
    message.textContent = "Le graphique TradingView est indisponible. Vérifie la connexion réseau.";
    chart.append(message);
    return;
  }
  const mount = document.createElement("div");
  mount.id = "tv-chart-container";
  chart.append(mount);
  new window.TradingView.widget({
    container_id: mount.id,
    autosize: true,
    symbol: asset.chartSymbol,
    interval: chartInterval,
    timezone: "Europe/Paris",
    theme: "light",
    style: "1",
    locale: "fr",
    toolbar_bg: "#f7f7f8",
    enable_publishing: false,
    allow_symbol_change: false,
    hide_side_toolbar: true,
    save_image: false,
  });
}

marketList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-asset-id]");
  if (button) chooseAsset(button.dataset.assetId);
});
document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
  marketFilter = button.dataset.filter;
  document.querySelectorAll("[data-filter]").forEach((filterButton) => {
    const active = filterButton === button;
    filterButton.classList.toggle("is-active", active);
    filterButton.setAttribute("aria-pressed", String(active));
  });
  renderMarket();
}));
document.querySelectorAll("[data-interval]").forEach((button) => button.addEventListener("click", () => {
  chartInterval = button.dataset.interval;
  document.querySelectorAll("[data-interval]").forEach((intervalButton) => intervalButton.classList.toggle("is-active", intervalButton === button));
  renderChart();
}));
portfolioList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-sell-id]");
  if (!button) return;
  chooseAsset(button.dataset.sellId);
  setMode("sell");
  amountInput.value = Math.floor(((state.positions[button.dataset.sellId]?.quantity || 0) * prices[button.dataset.sellId].eur) * 100) / 100;
  updateTradeEstimate();
});
document.querySelectorAll(".trade-tab").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
document.querySelector("#trade-form").addEventListener("submit", (event) => { event.preventDefault(); trade(); });
document.querySelectorAll("[data-amount]").forEach((button) => button.addEventListener("click", () => {
  const requested = button.dataset.amount;
  if (requested === "all") {
    const held = state.positions[selectedId]?.quantity || 0;
    amountInput.value = Math.floor((mode === "buy" ? state.cash : held * prices[selectedId].eur) * 100) / 100;
  } else amountInput.value = requested;
  updateTradeEstimate();
}));
amountInput.addEventListener("input", updateTradeEstimate);
search.addEventListener("input", renderMarket);
document.querySelector("#reset-button").addEventListener("click", () => {
  if (!confirm("Réinitialiser le portefeuille virtuel et l'historique ?")) return;
  state = { cash: 10000, positions: {}, activity: [] };
  saveState();
  renderAll();
  showToast("Portefeuille virtuel réinitialisé à 10 000 €.");
});

renderAll();
renderChart();
fetchPrices();
fetchForexRates();
updateFreshness();
setInterval(fetchPrices, 60000);
setInterval(fetchForexRates, 300000);
setInterval(tickForex, 1000);
