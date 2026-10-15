'use strict';

const state = { items: [], location: 'all', search: '', deleteId: null };

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
  deleteName: document.querySelector('#delete-name')
};

const locationDetails = {
  refrigerator: { label: 'Refrigerator', icon: '❄' },
  freezer: { label: 'Freezer', icon: '◆' },
  pantry: { label: 'Pantry', icon: '◫' }
};

function escapeHtml(value) {
  const node = document.createElement('div');
  node.textContent = String(value ?? '');
  return node.innerHTML;
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
  } catch (error) {
    showMessage('Could not load the inventory. Try refreshing the page.');
  }
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

loadItems();
