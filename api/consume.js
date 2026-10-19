'use strict';

const { getStore } = require('../src/store');
const { applyConsumptions, validateConsumptions } = require('../src/consumption');

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
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Method not allowed.' });
  }

  try {
    const body = await readBody(req);
    const consumptions = validateConsumptions(body.items);
    if (!consumptions) return send(res, 400, { error: 'Choose at least one valid inventory amount to use.' });
    const result = await applyConsumptions(getStore(), consumptions);
    return send(res, 200, { success: true, ...result });
  } catch (error) {
    console.error(error);
    const status = error instanceof SyntaxError ? 400 : 500;
    return send(res, status, { error: status === 400 ? 'Invalid JSON body.' : 'The inventory could not be updated.' });
  }
}

module.exports = handler;
