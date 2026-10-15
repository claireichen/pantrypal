'use strict';

const { getStore } = require('../src/store');
const { parseId, validateItem } = require('../src/validation');

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

async function handler(req, res) {
  try {
    const database = getStore();

    if (req.method === 'GET') {
      return send(res, 200, { items: await database.list() });
    }

    if (req.method === 'POST') {
      const result = validateItem(await readBody(req));
      if (!result.valid) return send(res, 400, { error: 'Check the highlighted fields.', fields: result.errors });
      return send(res, 201, { item: await database.create(result.item) });
    }

    if (req.method === 'PUT') {
      const body = await readBody(req);
      const id = parseId(body.id);
      if (!id) return send(res, 400, { error: 'A valid item ID is required.' });
      const result = validateItem(body);
      if (!result.valid) return send(res, 400, { error: 'Check the highlighted fields.', fields: result.errors });
      const item = await database.update(id, result.item);
      return item ? send(res, 200, { item }) : send(res, 404, { error: 'Item not found.' });
    }

    if (req.method === 'DELETE') {
      const requestUrl = new URL(req.url, 'http://localhost');
      const id = parseId(requestUrl.searchParams.get('id'));
      if (!id) return send(res, 400, { error: 'A valid item ID is required.' });
      return (await database.remove(id))
        ? send(res, 200, { success: true })
        : send(res, 404, { error: 'Item not found.' });
    }

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return send(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    console.error(error);
    const status = error instanceof SyntaxError ? 400 : 500;
    return send(res, status, { error: status === 400 ? 'Invalid JSON body.' : 'The server could not complete the request.' });
  }
}

module.exports = handler;
