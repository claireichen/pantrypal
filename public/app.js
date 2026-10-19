'use strict';

const state = {
  items: [], location: 'all', search: '', deleteId: null,
  availableOnly: false,
  customRecipes: readLocal('pantrypal-recipes', []),
  shopping: readLocal('pantrypal-shopping', []),
  apiRecipes: [],
  recipeApiStatus: 'idle',
  recipeFetchToken: 0,
  selectedRecipeId: null,
  shoppingTransferId: null,
  notificationSettings: readObjectLocal('pantrypal-notifications', { days: 3, inApp: true, browser: false })
};

const elements = {
  list: document.querySelector('#item-list'),
  empty: document.querySelector('#empty-state'),
  message: document.querySelector('#message'),
  search: document.querySelector('#search'),
  dialog: document.querySelector('#item-dialog'),
  deleteDialog: document.querySelector('#delete-dialog'),
  form: document.querySelector('#item-form'),
  title: document.querySelector('#form-title'),
  kicker: document.querySelector('#form-kicker'),
  id: document.querySelector('#item-id'),
  name: document.querySelector('#name'),
  location: document.querySelector('#location'),
  quantity: document.querySelector('#quantity'),
  unit: document.querySelector('#unit'),
  expirationDate: document.querySelector('#expirationDate'),
  notes: document.querySelector('#notes'),
  save: document.querySelector('.save-button'),
  deleteName: document.querySelector('#delete-name'),
  recipeDialog: document.querySelector('#recipe-dialog'),
  recipeForm: document.querySelector('#recipe-form'),
  recipeList: document.querySelector('#recipe-list'),
  recipeSummary: document.querySelector('#recipe-summary'),
  recipeProvider: document.querySelector('#recipe-provider'),
  recipeImage: document.querySelector('#recipe-image'),
  recipeImagePreview: document.querySelector('#recipe-image-preview'),
  recipeImagePreviewImg: document.querySelector('#recipe-image-preview-img'),
  saveRecipe: document.querySelector('#save-recipe'),
  availableOnly: document.querySelector('#available-only'),
  recipeDetailDialog: document.querySelector('#recipe-detail-dialog'),
  recipeDetailForm: document.querySelector('#recipe-detail-form'),
  detailImage: document.querySelector('#detail-image'),
  detailProvider: document.querySelector('#detail-provider'),
  detailTitle: document.querySelector('#detail-title'),
  detailMeta: document.querySelector('#detail-meta'),
  detailIngredients: document.querySelector('#detail-ingredients'),
  detailDirections: document.querySelector('#detail-directions'),
  detailSource: document.querySelector('#detail-source'),
  consumptionList: document.querySelector('#consumption-list'),
  cookRecipe: document.querySelector('#cook-recipe'),
  shoppingList: document.querySelector('#shopping-list'),
  shoppingEmpty: document.querySelector('#shopping-empty'),
  shoppingCount: document.querySelector('#shopping-count'),
  notificationDialog: document.querySelector('#notification-dialog'),
  notificationForm: document.querySelector('#notification-form'),
  notificationDays: document.querySelector('#notification-days'),
  inAppNotifications: document.querySelector('#in-app-notifications'),
  browserNotifications: document.querySelector('#browser-notifications'),
  browserNotificationStatus: document.querySelector('#browser-notification-status'),
  enableBrowserNotifications: document.querySelector('#enable-browser-notifications'),
  notificationBadge: document.querySelector('#notification-badge'),
  expirationAlert: document.querySelector('#expiration-alert'),
  expirationAlertCopy: document.querySelector('#expiration-alert-copy')
};

const locationDetails = {
  refrigerator: { label: 'Refrigerator', icon: '❄' },
  freezer: { label: 'Freezer', icon: '◆' },
  pantry: { label: 'Pantry', icon: '◫' }
};

const commonStaples = ['water', 'salt', 'pepper', 'oil', 'sugar'];
let recipePreviewUrl = '';

function escapeHtml(value) {
  const node = document.createElement('div');
  node.textContent = String(value ?? '');
  return node.innerHTML;
}

function readLocal(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function readObjectLocal(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    if (!value || Array.isArray(value) || typeof value !== 'object') return fallback;
    const days = [1, 3, 5, 7].includes(Number(value.days)) ? Number(value.days) : fallback.days;
    return { days, inApp: value.inApp !== false, browser: value.browser === true };
  } catch {
    return fallback;
  }
}

function normalized(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function ingredientMatches(itemName, ingredient) {
  const item = normalized(itemName);
  const needed = normalized(ingredient);
  return item === needed || item.includes(needed) || needed.includes(item);
}

function isCommonStaple(ingredient) {
  const value = normalized(ingredient);
  return commonStaples.some((staple) => value === staple || value.endsWith(` ${staple}`));
}

function safeUrlValue(value) {
  if (!value) return '';
  if (/^\/uploads\/[a-zA-Z0-9._-]+$/.test(value)) return value;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function resetRecipeImage() {
  if (recipePreviewUrl) URL.revokeObjectURL(recipePreviewUrl);
  recipePreviewUrl = '';
  elements.recipeImage.value = '';
  elements.recipeImagePreviewImg.removeAttribute('src');
  elements.recipeImagePreview.hidden = true;
}

async function prepareRecipeImage(file) {
  if (!file) return '';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP image.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Choose an image smaller than 8 MB.');
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = sourceUrl;
    await image.decode();
    const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
    if (!blob) throw new Error('The photo could not be prepared.');
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('The photo could not be read.'));
      reader.readAsDataURL(blob);
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function safeHref(value) {
  return escapeHtml(safeUrlValue(value));
}

function directionsPreview(value) {
  const compact = String(value || '').replace(/\s+/g, ' ').trim();
  return compact.length > 260 ? `${compact.slice(0, 257)}…` : compact;
}

function formatQuantity(item) {
  const quantity = Number.isInteger(item.quantity) ? item.quantity : Number(item.quantity.toFixed(2));
  const pluralUnits = { item: 'items', cup: 'cups', can: 'cans', bottle: 'bottles', box: 'boxes', bag: 'bags' };
  const unit = quantity !== 1 ? (pluralUnits[item.unit] || item.unit) : item.unit;
  return `${quantity} ${unit}`;
}

function dateStatus(dateValue) {
  if (!dateValue) return { label: 'No expiration date', className: '' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(`${dateValue}T00:00:00`);
  const days = Math.round((date - today) / 86400000);
  if (days < 0) return { label: `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`, className: 'expired' };
  if (days === 0) return { label: 'Expires today', className: 'soon' };
  if (days <= 7) return { label: `Use within ${days} day${days === 1 ? '' : 's'}`, className: 'soon' };
  return { label: `Expires ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, className: '' };
}

function daysUntilExpiration(dateValue) {
  if (!dateValue) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(`${dateValue}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : Math.round((date - today) / 86400000);
}

function expiringItems() {
  return state.items
    .map((item) => ({ ...item, daysLeft: daysUntilExpiration(item.expirationDate) }))
    .filter((item) => item.daysLeft !== null && item.daysLeft >= 0 && item.daysLeft <= state.notificationSettings.days)
    .sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name));
}

function expirationPhrase(item) {
  if (item.daysLeft === 0) return `${item.name} expires today`;
  return `${item.name} expires in ${item.daysLeft} day${item.daysLeft === 1 ? '' : 's'}`;
}

function renderExpirationAlert() {
  const items = expiringItems();
  elements.notificationBadge.textContent = items.length;
  elements.notificationBadge.hidden = items.length === 0;
  elements.expirationAlert.hidden = !state.notificationSettings.inApp || items.length === 0;
  if (!items.length) return;
  const visible = items.slice(0, 3).map(expirationPhrase);
  const remainder = items.length - visible.length;
  elements.expirationAlertCopy.textContent = `${visible.join(' · ')}${remainder ? ` · and ${remainder} more` : ''}.`;
}

function localDayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function updateNotificationPermissionUI() {
  const supported = 'Notification' in window;
  const permission = supported ? Notification.permission : 'unsupported';
  const copy = {
    granted: 'Browser notifications are allowed.',
    denied: 'Browser notifications are blocked. You can change this in your browser settings.',
    default: 'Permission has not been requested yet.',
    unsupported: 'This browser does not support desktop notifications.'
  };
  elements.browserNotificationStatus.textContent = copy[permission];
  elements.enableBrowserNotifications.hidden = permission === 'granted' || permission === 'unsupported';
  elements.enableBrowserNotifications.disabled = permission === 'denied';
  elements.browserNotifications.disabled = permission !== 'granted';
  if (permission !== 'granted') elements.browserNotifications.checked = false;
}

function openNotificationSettings() {
  elements.notificationDays.value = String(state.notificationSettings.days);
  elements.inAppNotifications.checked = state.notificationSettings.inApp;
  elements.browserNotifications.checked = state.notificationSettings.browser && 'Notification' in window && Notification.permission === 'granted';
  updateNotificationPermissionUI();
  elements.notificationDialog.showModal();
}

function maybeSendExpirationNotification() {
  const items = expiringItems();
  if (!state.notificationSettings.browser || !items.length || !('Notification' in window) || Notification.permission !== 'granted') return;
  const today = localDayKey();
  if (localStorage.getItem('pantrypal-last-notification') === today) return;
  const visible = items.slice(0, 3).map(expirationPhrase);
  const remainder = items.length - visible.length;
  try {
    new Notification('PantryPal: food expiring soon', {
      body: `${visible.join('. ')}${remainder ? `. Plus ${remainder} more` : ''}.`,
      tag: 'pantrypal-expiring'
    });
    localStorage.setItem('pantrypal-last-notification', today);
  } catch {
    // Some mobile browsers expose the API but require service-worker notifications.
  }
}

function filteredItems() {
  const query = state.search.toLowerCase();
  return state.items.filter((item) => {
    const locationMatch = state.location === 'all' || item.location === state.location;
    const textMatch = !query || item.name.toLowerCase().includes(query) || item.notes.toLowerCase().includes(query);
    return locationMatch && textMatch;
  });
}

function render() {
  const items = filteredItems();
  elements.list.innerHTML = items.map((item) => {
    const status = dateStatus(item.expirationDate);
    const location = locationDetails[item.location];
    return `
      <article class="item-card">
        <div class="location-icon" title="${location.label}" aria-hidden="true">${location.icon}</div>
        <div class="item-content">
          <h3>${escapeHtml(item.name)}</h3>
          <p class="item-meta">${escapeHtml(formatQuantity(item))} · ${location.label}</p>
          ${item.notes ? `<p class="item-note">${escapeHtml(item.notes)}</p>` : ''}
          <span class="item-status ${status.className}">${status.label}</span>
        </div>
        <div class="card-actions">
          <button class="icon-button" data-edit="${item.id}" type="button" aria-label="Edit ${escapeHtml(item.name)}">✎</button>
          <button class="icon-button" data-delete="${item.id}" type="button" aria-label="Delete ${escapeHtml(item.name)}">×</button>
        </div>
      </article>`;
  }).join('');

  elements.empty.hidden = items.length > 0;
  elements.list.hidden = items.length === 0;

  document.querySelector('#total-count').textContent = state.items.length;
  document.querySelector('#all-badge').textContent = state.items.length;
  let soon = 0;
  const activeLocations = new Set();
  for (const item of state.items) {
    activeLocations.add(item.location);
    if (['soon', 'expired'].includes(dateStatus(item.expirationDate).className)) soon += 1;
  }
  document.querySelector('#soon-count').textContent = soon;
  document.querySelector('#location-count').textContent = activeLocations.size;
  for (const location of Object.keys(locationDetails)) {
    document.querySelector(`#${location}-badge`).textContent = state.items.filter((item) => item.location === location).length;
  }
  renderExpirationAlert();
  renderRecipes();
}

function allRecipes() {
  const recipes = [...state.customRecipes, ...state.apiRecipes];
  const seen = new Set();
  return recipes.filter((recipe) => {
    const key = normalized(recipe.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function recipeDetails(recipe) {
  const consideredIngredients = recipe.ingredients.filter((ingredient) => !isCommonStaple(ingredient));
  const matches = consideredIngredients.map((ingredient) => ({
    ingredient,
    item: state.items.find((candidate) => ingredientMatches(candidate.name, ingredient))
  }));
  const available = matches.filter((match) => match.item);
  const missing = matches.filter((match) => !match.item).map((match) => match.ingredient);
  const urgent = available.filter((match) => ['soon', 'expired'].includes(dateStatus(match.item.expirationDate).className));
  const percent = consideredIngredients.length ? Math.round((available.length / consideredIngredients.length) * 100) : 0;
  return { recipe, available, missing, urgent, percent, score: percent + (urgent.length * 8) };
}

function renderRecipes() {
  const ranked = allRecipes().map(recipeDetails)
    .filter((entry) => !state.availableOnly || entry.missing.length === 0)
    .sort((a, b) => b.score - a.score || a.missing.length - b.missing.length)
    .slice(0, 12);

  const complete = ranked.filter((entry) => entry.missing.length === 0).length;
  if (state.recipeApiStatus === 'loading') {
    elements.recipeSummary.textContent = 'Finding live recipes using your inventory…';
  } else {
    elements.recipeSummary.textContent = state.items.length
      ? `${complete} recipe${complete === 1 ? '' : 's'} ready to make · ranked by availability and expiration urgency`
      : 'Add ingredients to see your best matches.';
  }
  elements.recipeProvider.hidden = state.recipeApiStatus !== 'ready';

  if (state.recipeApiStatus === 'loading' && !ranked.length) {
    elements.recipeList.innerHTML = Array.from({ length: 3 }, () => `
      <div class="recipe-skeleton" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>`).join('');
    renderShopping();
    return;
  }

  elements.recipeList.innerHTML = ranked.length ? ranked.map((entry, index) => {
    const { recipe, missing, urgent, percent } = entry;
    const ready = missing.length === 0;
    return `
      <article class="recipe-card ${index === 0 && state.items.length ? 'best-match' : ''} ${recipe.image ? 'has-image' : ''}">
        ${recipe.image ? `<img class="recipe-image" src="${safeHref(recipe.image)}" alt="${escapeHtml(recipe.name)}" loading="lazy">` : ''}
        <div class="recipe-card-body">
        <div class="recipe-card-top">
          <div>
            ${index === 0 && state.items.length ? '<span class="match-label">Best match</span>' : ''}
            ${recipe.provider ? `<span class="provider-label">${escapeHtml(recipe.provider)}${recipe.area ? ` · ${escapeHtml(recipe.area)}` : ''}</span>` : ''}
            <h3>${escapeHtml(recipe.name)}</h3>
          </div>
          <strong class="match-percent">${percent}%</strong>
        </div>
        <div class="match-bar" aria-label="${percent}% of ingredients available"><span style="width:${percent}%"></span></div>
        <p class="ingredient-line"><strong>Needs:</strong> ${recipe.ingredients.map(escapeHtml).join(', ')}</p>
        ${urgent.length ? `<p class="urgent-note">Use soon: ${urgent.map((match) => escapeHtml(match.item.name)).join(', ')}</p>` : ''}
        <p class="recipe-status ${ready ? 'ready' : ''}">${ready ? 'You have everything' : `Missing ${missing.length}: ${missing.map(escapeHtml).join(', ')}`}</p>
        <p class="directions">${escapeHtml(directionsPreview(recipe.directions) || 'Use your preferred preparation method.')}</p>
        <div class="recipe-actions">
          <span class="recipe-primary-actions">
            <button class="primary-button view-recipe" data-view-recipe="${escapeHtml(recipe.id)}" type="button">View recipe</button>
            ${missing.length ? `<button class="secondary-button add-missing" data-recipe-id="${escapeHtml(recipe.id)}" type="button">Add missing to list</button>` : '<span class="ready-mark">✓ Ready to cook</span>'}
          </span>
          <span class="recipe-links">
            ${recipe.sourceUrl ? `<a href="${safeHref(recipe.sourceUrl)}" target="_blank" rel="noopener noreferrer">View full recipe ↗</a>` : ''}
            ${recipe.custom ? `<button class="text-button delete-recipe" data-delete-recipe="${escapeHtml(recipe.id)}" type="button">Delete recipe</button>` : ''}
          </span>
        </div>
        </div>
      </article>`;
  }).join('') : `<div class="recipe-empty">${state.recipeApiStatus === 'offline'
    ? 'Live recipes are temporarily unavailable. <button class="text-button" data-retry-recipes type="button">Try again</button>'
    : state.availableOnly
      ? 'No live recipes use every ingredient you have. Turn off the filter to see the closest matches.'
      : 'No live recipes found for the current inventory yet.'}</div>`;

  renderShopping();
}

function findRecipeEntry(recipeId) {
  const recipe = allRecipes().find((candidate) => candidate.id === recipeId);
  return recipe ? recipeDetails(recipe) : null;
}

function openRecipeDetail(recipeId) {
  const entry = findRecipeEntry(recipeId);
  if (!entry) return;
  const { recipe, available, missing, percent } = entry;
  state.selectedRecipeId = recipe.id;

  elements.detailTitle.textContent = recipe.name;
  elements.detailProvider.textContent = recipe.provider ? `RECIPE BY ${recipe.provider.toUpperCase()}` : 'YOUR RECIPE';
  elements.detailMeta.textContent = [recipe.category, recipe.area, `${percent}% inventory match`].filter(Boolean).join(' · ');
  elements.detailDirections.textContent = recipe.directions || 'Use your preferred preparation method.';

  const imageUrl = safeUrlValue(recipe.image);
  elements.detailImage.hidden = !imageUrl;
  if (imageUrl) {
    elements.detailImage.src = imageUrl;
    elements.detailImage.alt = recipe.name;
  } else {
    elements.detailImage.removeAttribute('src');
    elements.detailImage.alt = '';
  }

  const sourceUrl = safeUrlValue(recipe.sourceUrl);
  elements.detailSource.hidden = !sourceUrl;
  if (sourceUrl) elements.detailSource.href = sourceUrl;

  elements.detailIngredients.innerHTML = recipe.ingredients.map((ingredient, index) => {
    const item = state.items.find((candidate) => ingredientMatches(candidate.name, ingredient));
    const staple = isCommonStaple(ingredient);
    const status = item ? 'In inventory' : staple ? 'Pantry staple' : 'Missing';
    const className = item ? 'available' : staple ? 'staple' : 'missing';
    const measure = recipe.measures?.[index];
    return `<li>
      <span><strong>${escapeHtml(ingredient)}</strong>${measure ? `<small>${escapeHtml(measure)}</small>` : ''}</span>
      <span class="ingredient-badge ${className}">${status}</span>
    </li>`;
  }).join('');

  const uniqueAvailable = [...new Map(available.map((match) => [match.item.id, match.item])).values()];
  elements.consumptionList.innerHTML = uniqueAvailable.length ? uniqueAvailable.map((item) => `
    <label class="consumption-row">
      <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(formatQuantity(item))} available</small></span>
      <span class="consumption-input">
        <input type="number" min="0" max="${item.quantity}" step="0.01" value="${Math.min(1, item.quantity)}" data-consume-id="${item.id}" aria-label="Amount of ${escapeHtml(item.name)} to use">
        <em>${escapeHtml(item.unit)}</em>
      </span>
    </label>`).join('') : '<p class="no-matches">Add some of this recipe’s ingredients before updating inventory.</p>';
  elements.cookRecipe.disabled = uniqueAvailable.length === 0;
  elements.cookRecipe.textContent = uniqueAvailable.length ? 'Cook & update inventory' : 'No matched inventory';
  elements.recipeDetailDialog.showModal();
}

function closeRecipeDetail() {
  elements.recipeDetailDialog.close();
  state.selectedRecipeId = null;
}

async function addShoppingItems(names) {
  const created = [];
  for (const name of names) {
    if (!state.shopping.some((item) => normalized(item.name) === normalized(name))) {
      const payload = await request('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'shopping', item: { name, done: false } })
      });
      state.shopping.push(payload.item);
      created.push(payload.item);
    }
  }
  renderShopping();
  return created;
}

function renderShopping() {
  elements.shoppingList.innerHTML = state.shopping.map((item) => `
    <div class="shopping-item ${item.done ? 'done' : ''}">
      <label class="shopping-check">
        <input type="checkbox" data-shopping-toggle="${escapeHtml(item.id)}" ${item.done ? 'checked' : ''}>
        <span>${escapeHtml(item.name)}</span>
      </label>
      <button class="shopping-add" type="button" data-shopping-add="${escapeHtml(item.id)}" aria-label="Add ${escapeHtml(item.name)} to inventory">＋ inventory</button>
      <button type="button" data-shopping-delete="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.name)}">×</button>
    </div>`).join('');
  elements.shoppingEmpty.hidden = state.shopping.length > 0;
  elements.shoppingCount.textContent = state.shopping.filter((item) => !item.done).length;
}

function showMessage(text, type = 'error') {
  elements.message.textContent = text;
  elements.message.className = `message ${type}`;
  if (text) setTimeout(() => {
    if (elements.message.textContent === text) elements.message.textContent = '';
  }, 4000);
}

async function request(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Something went wrong.');
    error.fields = payload.fields || {};
    throw error;
  }
  return payload;
}

async function loadItems() {
  try {
    const payload = await request('/api/items');
    state.items = payload.items;
    render();
    maybeSendExpirationNotification();
    await loadExternalRecipes();
  } catch (error) {
    showMessage('Could not load the inventory. Try refreshing the page.');
  }
}

async function loadUserData() {
  const localSnapshot = {
    customRecipes: readLocal('pantrypal-recipes', []),
    shopping: readLocal('pantrypal-shopping', []),
    notificationSettings: readObjectLocal('pantrypal-notifications', { days: 3, inApp: true, browser: false })
  };
  try {
    let payload = await request('/api/user-data');
    const hasLocalData = localSnapshot.customRecipes.length > 0
      || localSnapshot.shopping.length > 0
      || localStorage.getItem('pantrypal-notifications') !== null;
    if (hasLocalData && localStorage.getItem('pantrypal-cloud-migrated') !== 'true') {
      payload = await request('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'migration', ...localSnapshot })
      });
    }
    state.customRecipes = Array.isArray(payload.customRecipes) ? payload.customRecipes : [];
    state.shopping = Array.isArray(payload.shopping) ? payload.shopping : [];
    state.notificationSettings = payload.notificationSettings || { days: 3, inApp: true, browser: false };
    localStorage.removeItem('pantrypal-recipes');
    localStorage.removeItem('pantrypal-shopping');
    localStorage.removeItem('pantrypal-notifications');
    localStorage.setItem('pantrypal-cloud-migrated', 'true');
    renderShopping();
    renderExpirationAlert();
  } catch {
    showMessage('Cloud-saved recipes, shopping items, and settings are temporarily unavailable.');
  }
}

async function loadExternalRecipes() {
  const token = ++state.recipeFetchToken;
  if (!state.items.length) {
    state.apiRecipes = [];
    state.recipeApiStatus = 'idle';
    renderRecipes();
    return;
  }

  const prioritized = [...state.items].sort((a, b) => {
    const urgentA = ['soon', 'expired'].includes(dateStatus(a.expirationDate).className) ? 1 : 0;
    const urgentB = ['soon', 'expired'].includes(dateStatus(b.expirationDate).className) ? 1 : 0;
    return urgentB - urgentA;
  });
  const ingredientNames = prioritized.slice(0, 12).map((item) => item.name);
  state.recipeApiStatus = 'loading';
  renderRecipes();
  try {
    const payload = await request(`/api/recipes?ingredients=${encodeURIComponent(ingredientNames.join(','))}`);
    if (token !== state.recipeFetchToken) return;
    state.apiRecipes = Array.isArray(payload.recipes) ? payload.recipes : [];
    state.recipeApiStatus = state.apiRecipes.length ? 'ready' : 'empty';
  } catch {
    if (token !== state.recipeFetchToken) return;
    state.apiRecipes = [];
    state.recipeApiStatus = 'offline';
  }
  renderRecipes();
}

function clearErrors() {
  document.querySelectorAll('.field-error').forEach((node) => { node.textContent = ''; });
  document.querySelectorAll('.invalid').forEach((node) => node.classList.remove('invalid'));
}

function openForm(item, shoppingTransferId = null) {
  elements.form.reset();
  clearErrors();
  state.shoppingTransferId = shoppingTransferId;
  const editing = Boolean(item?.id);
  elements.id.value = item?.id || '';
  elements.name.value = item?.name || '';
  elements.location.value = item?.location || 'refrigerator';
  elements.quantity.value = item?.quantity || 1;
  elements.unit.value = item?.unit || 'item';
  elements.expirationDate.value = item?.expirationDate || '';
  elements.notes.value = item?.notes || '';
  elements.title.textContent = editing ? 'Edit item' : 'Add an item';
  elements.kicker.textContent = shoppingTransferId ? 'FROM SHOPPING LIST' : editing ? 'UPDATE INGREDIENT' : 'NEW INGREDIENT';
  elements.save.textContent = editing ? 'Update item' : 'Save item';
  elements.dialog.showModal();
  requestAnimationFrame(() => elements.name.focus());
}

function closeForm() {
  elements.dialog.close();
  state.shoppingTransferId = null;
  clearErrors();
}

elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors();
  const body = {
    id: elements.id.value || undefined,
    name: elements.name.value,
    location: elements.location.value,
    quantity: elements.quantity.value,
    unit: elements.unit.value,
    expirationDate: elements.expirationDate.value || null,
    notes: elements.notes.value
  };
  const editing = Boolean(body.id);
  const shoppingTransferId = state.shoppingTransferId;
  elements.save.disabled = true;
  elements.save.textContent = editing ? 'Updating…' : 'Saving…';
  try {
    await request('/api/items', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (shoppingTransferId) {
      state.shopping = state.shopping.filter((item) => item.id !== shoppingTransferId);
      await request(`/api/user-data?type=shopping&id=${encodeURIComponent(shoppingTransferId)}`, { method: 'DELETE' });
    }
    closeForm();
    await loadItems();
    showMessage(shoppingTransferId ? 'Shopping item moved into inventory.' : editing ? 'Item updated.' : 'Item added.', 'success');
  } catch (error) {
    Object.entries(error.fields || {}).forEach(([field, message]) => {
      document.querySelector(`[data-error-for="${field}"]`).textContent = message;
      document.querySelector(`#${field}`)?.classList.add('invalid');
    });
    if (!Object.keys(error.fields || {}).length) showMessage(error.message);
  } finally {
    elements.save.disabled = false;
    elements.save.textContent = editing ? 'Update item' : 'Save item';
  }
});

document.querySelector('#open-form').addEventListener('click', () => openForm());
document.querySelector('#empty-add').addEventListener('click', () => openForm());
document.querySelector('#close-form').addEventListener('click', closeForm);
document.querySelector('#cancel-form').addEventListener('click', closeForm);

document.querySelectorAll('.filter').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.filter').forEach((node) => node.classList.remove('active'));
    button.classList.add('active');
    state.location = button.dataset.location;
    render();
  });
});

elements.search.addEventListener('input', () => {
  state.search = elements.search.value.trim();
  render();
});

elements.list.addEventListener('click', (event) => {
  const editButton = event.target.closest('[data-edit]');
  const deleteButton = event.target.closest('[data-delete]');
  if (editButton) openForm(state.items.find((item) => item.id === Number(editButton.dataset.edit)));
  if (deleteButton) {
    const item = state.items.find((entry) => entry.id === Number(deleteButton.dataset.delete));
    state.deleteId = item.id;
    elements.deleteName.textContent = item.name;
    elements.deleteDialog.showModal();
  }
});

document.querySelector('#confirm-delete').addEventListener('click', async (event) => {
  event.preventDefault();
  try {
    await request(`/api/items?id=${state.deleteId}`, { method: 'DELETE' });
    elements.deleteDialog.close();
    await loadItems();
    showMessage('Item deleted.', 'success');
  } catch (error) {
    elements.deleteDialog.close();
    showMessage(error.message);
  }
});

document.querySelector('#open-recipe-form').addEventListener('click', () => {
  elements.recipeForm.reset();
  resetRecipeImage();
  elements.recipeDialog.showModal();
  requestAnimationFrame(() => document.querySelector('#recipe-name').focus());
});
document.querySelector('#close-recipe-form').addEventListener('click', () => elements.recipeDialog.close());
document.querySelector('#cancel-recipe-form').addEventListener('click', () => elements.recipeDialog.close());

elements.recipeImage.addEventListener('change', () => {
  const file = elements.recipeImage.files[0];
  if (!file) return resetRecipeImage();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    resetRecipeImage();
    showMessage('Choose a JPG, PNG, or WebP image.');
    return;
  }
  if (recipePreviewUrl) URL.revokeObjectURL(recipePreviewUrl);
  recipePreviewUrl = URL.createObjectURL(file);
  elements.recipeImagePreviewImg.src = recipePreviewUrl;
  elements.recipeImagePreview.hidden = false;
});

document.querySelector('#remove-recipe-image').addEventListener('click', resetRecipeImage);

elements.recipeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = document.querySelector('#recipe-name').value.trim();
  const ingredients = document.querySelector('#recipe-ingredients').value.split(',').map((value) => value.trim()).filter(Boolean);
  const directions = document.querySelector('#recipe-directions').value.trim();
  if (!name || !ingredients.length) return;
  elements.saveRecipe.disabled = true;
  try {
    elements.saveRecipe.textContent = elements.recipeImage.files[0] ? 'Uploading photo…' : 'Saving…';
    const imageDataUrl = await prepareRecipeImage(elements.recipeImage.files[0]);
    const payload = await request('/api/user-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'recipe', recipe: { name, ingredients, directions }, imageDataUrl })
    });
    state.customRecipes.unshift(payload.recipe);
    elements.recipeDialog.close();
    renderRecipes();
    showMessage('Recipe saved to your cloud database.', 'success');
  } catch (error) {
    showMessage(error.message);
  } finally {
    elements.saveRecipe.disabled = false;
    elements.saveRecipe.textContent = 'Save recipe';
  }
});

elements.availableOnly.addEventListener('change', () => {
  state.availableOnly = elements.availableOnly.checked;
  renderRecipes();
});

elements.recipeList.addEventListener('click', (event) => {
  const addButton = event.target.closest('[data-recipe-id]');
  const viewButton = event.target.closest('[data-view-recipe]');
  const deleteButton = event.target.closest('[data-delete-recipe]');
  const retryButton = event.target.closest('[data-retry-recipes]');
  if (retryButton) loadExternalRecipes();
  if (viewButton) openRecipeDetail(viewButton.dataset.viewRecipe);
  if (addButton) {
    const entry = allRecipes().map(recipeDetails).find((candidate) => candidate.recipe.id === addButton.dataset.recipeId);
    if (entry) {
      addShoppingItems(entry.missing)
        .then(() => showMessage('Missing ingredients saved to your shopping list.', 'success'))
        .catch((error) => showMessage(error.message));
    }
  }
  if (deleteButton) {
    request(`/api/user-data?type=recipe&id=${encodeURIComponent(deleteButton.dataset.deleteRecipe)}`, { method: 'DELETE' })
      .then(() => {
        state.customRecipes = state.customRecipes.filter((recipe) => recipe.id !== deleteButton.dataset.deleteRecipe);
        renderRecipes();
      })
      .catch((error) => showMessage(error.message));
  }
});

document.querySelector('#close-recipe-detail').addEventListener('click', closeRecipeDetail);
document.querySelector('#cancel-recipe-detail').addEventListener('click', closeRecipeDetail);

elements.recipeDetailForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const items = [...elements.consumptionList.querySelectorAll('[data-consume-id]')]
    .map((input) => ({ id: Number(input.dataset.consumeId), amount: Number(input.value) }))
    .filter((item) => Number.isFinite(item.amount) && item.amount > 0);
  if (!items.length) {
    showMessage('Choose at least one inventory amount to use.');
    return;
  }

  elements.cookRecipe.disabled = true;
  elements.cookRecipe.textContent = 'Updating inventory…';
  try {
    await request('/api/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    closeRecipeDetail();
    await loadItems();
    showMessage('Meal cooked — inventory quantities updated.', 'success');
  } catch (error) {
    showMessage(error.message);
    elements.cookRecipe.disabled = false;
    elements.cookRecipe.textContent = 'Cook & update inventory';
  }
});

document.querySelector('#shopping-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.querySelector('#shopping-input');
  try {
    if (input.value.trim()) await addShoppingItems([input.value.trim()]);
  } catch (error) {
    showMessage(error.message);
  }
  input.value = '';
});

elements.shoppingList.addEventListener('change', async (event) => {
  const toggle = event.target.closest('[data-shopping-toggle]');
  if (!toggle) return;
  const item = state.shopping.find((entry) => entry.id === toggle.dataset.shoppingToggle);
  if (!item) return;
  const previous = item.done;
  item.done = toggle.checked;
  renderShopping();
  try {
    await request('/api/user-data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'shopping', id: item.id, done: item.done })
    });
  } catch (error) {
    item.done = previous;
    renderShopping();
    showMessage(error.message);
  }
});

elements.shoppingList.addEventListener('click', (event) => {
  const remove = event.target.closest('[data-shopping-delete]');
  const add = event.target.closest('[data-shopping-add]');
  if (add) {
    const shoppingItem = state.shopping.find((item) => item.id === add.dataset.shoppingAdd);
    if (shoppingItem) openForm({ name: shoppingItem.name, location: 'pantry', quantity: 1, unit: 'item', expirationDate: '', notes: 'Added from shopping list' }, shoppingItem.id);
    return;
  }
  if (remove) {
    request(`/api/user-data?type=shopping&id=${encodeURIComponent(remove.dataset.shoppingDelete)}`, { method: 'DELETE' })
      .then(() => {
        state.shopping = state.shopping.filter((item) => item.id !== remove.dataset.shoppingDelete);
        renderShopping();
      })
      .catch((error) => showMessage(error.message));
  }
});

document.querySelector('#clear-shopping').addEventListener('click', async () => {
  try {
    await request('/api/user-data?type=completed-shopping', { method: 'DELETE' });
    state.shopping = state.shopping.filter((item) => !item.done);
    renderShopping();
  } catch (error) {
    showMessage(error.message);
  }
});

document.querySelector('#open-notification-settings').addEventListener('click', openNotificationSettings);
document.querySelector('#open-notification-settings-banner').addEventListener('click', openNotificationSettings);
document.querySelector('#close-notification-settings').addEventListener('click', () => elements.notificationDialog.close());
document.querySelector('#cancel-notification-settings').addEventListener('click', () => elements.notificationDialog.close());

elements.enableBrowserNotifications.addEventListener('click', async () => {
  if (!('Notification' in window)) return;
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    elements.browserNotifications.checked = true;
    elements.browserNotificationStatus.textContent = 'Browser notifications are allowed. Save settings to turn them on.';
  }
  updateNotificationPermissionUI();
  if (permission === 'granted') elements.browserNotifications.checked = true;
});

elements.notificationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  state.notificationSettings = {
    days: Number(elements.notificationDays.value),
    inApp: elements.inAppNotifications.checked,
    browser: elements.browserNotifications.checked && 'Notification' in window && Notification.permission === 'granted'
  };
  try {
    const payload = await request('/api/user-data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'settings', settings: state.notificationSettings })
    });
    state.notificationSettings = payload.settings;
    elements.notificationDialog.close();
    renderExpirationAlert();
    maybeSendExpirationNotification();
    showMessage('Expiration reminder settings saved to the cloud.', 'success');
  } catch (error) {
    showMessage(error.message);
  }
});

async function initialize() {
  await loadUserData();
  await loadItems();
}

initialize();
