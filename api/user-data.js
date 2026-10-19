'use strict';

const { getStore } = require('../src/store');
const {
  validateCustomRecipe,
  validateShoppingItem,
  validateNotificationSettings
} = require('../src/validation');

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('Request body is too large.');
  }
  return body ? JSON.parse(body) : {};
}

function validIdentifier(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9._-]{1,100}$/.test(value);
}

async function migrate(database, body) {
  const recipes = Array.isArray(body.customRecipes) ? body.customRecipes : [];
  const shopping = Array.isArray(body.shopping) ? body.shopping : [];
  for (const candidate of recipes) {
    const result = validateCustomRecipe(candidate);
    if (result.valid) await database.createRecipe(result.recipe);
  }
  for (const candidate of shopping) {
    const result = validateShoppingItem(candidate);
    if (result.valid) await database.createShoppingItem(result.item);
  }
  await database.updateNotificationSettings(validateNotificationSettings(body.notificationSettings));
  return database.getUserData();
}

async function handler(req, res) {
  try {
    const database = getStore();

    if (req.method === 'GET') return send(res, 200, await database.getUserData());

    if (req.method === 'POST') {
      const body = await readBody(req);
      if (body.type === 'recipe') {
        const result = validateCustomRecipe(body.recipe);
        return result.valid
          ? send(res, 201, { recipe: await database.createRecipe(result.recipe) })
          : send(res, 400, { error: 'Enter a recipe name and at least one ingredient.', fields: result.errors });
      }
      if (body.type === 'shopping') {
        const result = validateShoppingItem(body.item);
        return result.valid
          ? send(res, 201, { item: await database.createShoppingItem(result.item) })
          : send(res, 400, { error: 'Enter a shopping item.' });
      }
      if (body.type === 'migration') return send(res, 200, await migrate(database, body));
      return send(res, 400, { error: 'Choose a valid data type.' });
    }

    if (req.method === 'PUT') {
      const body = await readBody(req);
      if (body.type === 'shopping' && validIdentifier(body.id)) {
        return (await database.updateShoppingItem(body.id, body.done === true))
          ? send(res, 200, { success: true })
          : send(res, 404, { error: 'Shopping item not found.' });
      }
      if (body.type === 'settings') {
        return send(res, 200, { settings: await database.updateNotificationSettings(validateNotificationSettings(body.settings)) });
      }
      return send(res, 400, { error: 'Choose a valid data type.' });
    }

    if (req.method === 'DELETE') {
      const requestUrl = new URL(req.url, 'http://localhost');
      const type = requestUrl.searchParams.get('type');
      const id = requestUrl.searchParams.get('id');
      if (type === 'completed-shopping') {
        return send(res, 200, { removed: await database.clearCompletedShopping() });
      }
      if (!validIdentifier(id)) return send(res, 400, { error: 'A valid ID is required.' });
      const removed = type === 'recipe'
        ? await database.removeRecipe(id)
        : type === 'shopping'
          ? await database.removeShoppingItem(id)
          : false;
      return removed ? send(res, 200, { success: true }) : send(res, 404, { error: 'Saved data not found.' });
    }

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return send(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    console.error(error);
    const status = error instanceof SyntaxError ? 400 : 500;
    return send(res, status, { error: status === 400 ? 'Invalid JSON body.' : 'The saved data could not be updated.' });
  }
}

module.exports = handler;
