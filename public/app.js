'use strict';

const state = {
  items: [], location: 'all', search: '', deleteId: null,
  availableOnly: false,
  customRecipes: readLocal('pantrypal-recipes', []),
  shopping: readLocal('pantrypal-shopping', []),
  apiRecipes: [],
  recipeApiStatus: 'idle',
  recipeFetchToken: 0
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
  availableOnly: document.querySelector('#available-only'),
  shoppingList: document.querySelector('#shopping-list'),
  shoppingEmpty: document.querySelector('#shopping-empty'),
  shoppingCount: document.querySelector('#shopping-count')
};

const locationDetails = {
  refrigerator: { label: 'Refrigerator', icon: '❄' },
  freezer: { label: 'Freezer', icon: '◆' },
  pantry: { label: 'Pantry', icon: '◫' }
};

const commonStaples = ['water', 'salt', 'pepper', 'oil', 'sugar'];

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

function saveLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
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

function safeHref(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? escapeHtml(url.toString()) : '';
  } catch {
    return '';
  }
}

function directionsPreview(value) {
  const compact = String(value || '').replace(/\s+/g, ' ').trim();
  return compact.length > 260 ? `${compact.slice(0, 257)}…` : compact;
}

function formatQuantity(item) {
  const quantity = Number.isInteger(item.quantity) ? item.quantity : Number(item.quantity.toFixed(2));
  const plural = quantity !== 1 && ['item', 'can', 'bottle', 'box', 'bag'].includes(item.unit) ? 's' : '';
  return `${quantity} ${item.unit}${plural}`;
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
          ${missing.length ? `<button class="secondary-button add-missing" data-recipe-id="${escapeHtml(recipe.id)}" type="button">Add missing to list</button>` : '<span class="ready-mark">✓ Ready to cook</span>'}
          <span class="recipe-links">
            ${recipe.sourceUrl ? `<a href="${safeHref(recipe.sourceUrl)}" target="_blank" rel="noopener noreferrer">View full recipe ↗</a>` : ''}
            ${recipe.custom ? `<button class="text-button delete-recipe" data-delete-recipe="${escapeHtml(recipe.id)}" type="button">Delete recipe</button>` : ''}
          </span>
        </div>
        </div>
      </article>`;
  }).join('') : `<div class="recipe-empty">${state.recipeApiStatus === 'offline'
    ? 'Live recipes are temporarily unavailable. Please try refreshing in a moment.'
    : state.availableOnly
      ? 'No live recipes use every ingredient you have. Turn off the filter to see the closest matches.'
      : 'No live recipes found for the current inventory yet.'}</div>`;

  renderShopping();
}

function addShoppingItems(names) {
  for (const name of names) {
    if (!state.shopping.some((item) => normalized(item.name) === normalized(name))) {
      state.shopping.push({ id: `${Date.now()}-${Math.random()}`, name, done: false });
    }
  }
  saveLocal('pantrypal-shopping', state.shopping);
  renderShopping();
}

function renderShopping() {
  elements.shoppingList.innerHTML = state.shopping.map((item) => `
    <label class="shopping-item ${item.done ? 'done' : ''}">
      <input type="checkbox" data-shopping-toggle="${escapeHtml(item.id)}" ${item.done ? 'checked' : ''}>
      <span>${escapeHtml(item.name)}</span>
      <button type="button" data-shopping-delete="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.name)}">×</button>
    </label>`).join('');
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
    await loadExternalRecipes();
  } catch (error) {
    showMessage('Could not load the inventory. Try refreshing the page.');
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

function openForm(item) {
  elements.form.reset();
  clearErrors();
  elements.id.value = item?.id || '';
  elements.name.value = item?.name || '';
  elements.location.value = item?.location || 'refrigerator';
  elements.quantity.value = item?.quantity || 1;
  elements.unit.value = item?.unit || 'item';
  elements.expirationDate.value = item?.expirationDate || '';
  elements.notes.value = item?.notes || '';
  elements.title.textContent = item ? 'Edit item' : 'Add an item';
  elements.kicker.textContent = item ? 'UPDATE INGREDIENT' : 'NEW INGREDIENT';
  elements.save.textContent = item ? 'Update item' : 'Save item';
  elements.dialog.showModal();
  requestAnimationFrame(() => elements.name.focus());
}

function closeForm() {
  elements.dialog.close();
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
  elements.save.disabled = true;
  elements.save.textContent = editing ? 'Updating…' : 'Saving…';
  try {
    await request('/api/items', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    closeForm();
    await loadItems();
    showMessage(editing ? 'Item updated.' : 'Item added.', 'success');
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
  elements.recipeDialog.showModal();
  requestAnimationFrame(() => document.querySelector('#recipe-name').focus());
});
document.querySelector('#close-recipe-form').addEventListener('click', () => elements.recipeDialog.close());
document.querySelector('#cancel-recipe-form').addEventListener('click', () => elements.recipeDialog.close());

elements.recipeForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = document.querySelector('#recipe-name').value.trim();
  const ingredients = document.querySelector('#recipe-ingredients').value.split(',').map((value) => value.trim()).filter(Boolean);
  const directions = document.querySelector('#recipe-directions').value.trim();
  if (!name || !ingredients.length) return;
  state.customRecipes.unshift({ id: `custom-${Date.now()}`, name, ingredients, directions, custom: true });
  saveLocal('pantrypal-recipes', state.customRecipes);
  elements.recipeDialog.close();
  renderRecipes();
  showMessage('Recipe added.', 'success');
});

elements.availableOnly.addEventListener('change', () => {
  state.availableOnly = elements.availableOnly.checked;
  renderRecipes();
});

elements.recipeList.addEventListener('click', (event) => {
  const addButton = event.target.closest('[data-recipe-id]');
  const deleteButton = event.target.closest('[data-delete-recipe]');
  if (addButton) {
    const entry = allRecipes().map(recipeDetails).find((candidate) => candidate.recipe.id === addButton.dataset.recipeId);
    if (entry) {
      addShoppingItems(entry.missing);
      showMessage('Missing ingredients added to your shopping list.', 'success');
    }
  }
  if (deleteButton) {
    state.customRecipes = state.customRecipes.filter((recipe) => recipe.id !== deleteButton.dataset.deleteRecipe);
    saveLocal('pantrypal-recipes', state.customRecipes);
    renderRecipes();
  }
});

document.querySelector('#shopping-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = document.querySelector('#shopping-input');
  if (input.value.trim()) addShoppingItems([input.value.trim()]);
  input.value = '';
});

elements.shoppingList.addEventListener('change', (event) => {
  const toggle = event.target.closest('[data-shopping-toggle]');
  if (!toggle) return;
  const item = state.shopping.find((entry) => entry.id === toggle.dataset.shoppingToggle);
  if (item) item.done = toggle.checked;
  saveLocal('pantrypal-shopping', state.shopping);
  renderShopping();
});

elements.shoppingList.addEventListener('click', (event) => {
  const remove = event.target.closest('[data-shopping-delete]');
  if (!remove) return;
  state.shopping = state.shopping.filter((item) => item.id !== remove.dataset.shoppingDelete);
  saveLocal('pantrypal-shopping', state.shopping);
  renderShopping();
});

document.querySelector('#clear-shopping').addEventListener('click', () => {
  state.shopping = state.shopping.filter((item) => !item.done);
  saveLocal('pantrypal-shopping', state.shopping);
  renderShopping();
});

loadItems();
