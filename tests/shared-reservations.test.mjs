import assert from 'node:assert/strict';
import test from 'node:test';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8787';

async function request(path, method = 'GET', body) {
  const response = await fetch(new URL(path, base), {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json', Origin: base },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}

test('bookings are shared, exclusive, and cancellable only with the private key', async () => {
  let snapshot = await request('/api/desks');
  assert.equal(snapshot.status, 200);
  assert.equal(snapshot.data.desks.length, 12);
  assert.ok(snapshot.data.desks.every((item) => item.status === 'available' || item.status === 'reserved'));
  const desk = snapshot.data.desks.find((item) => item.status === 'available');
  assert.ok(desk, 'at least one desk should be available for the test');

  const booked = await request('/api/reservations', 'POST', { deskId: desk.id, studentId: 'TEST123', duration: 30 });
  assert.equal(booked.status, 201);
  assert.ok(booked.data.token);

  const otherClientView = await request('/api/desks');
  assert.equal(otherClientView.data.desks.find((item) => item.id === desk.id).status, 'reserved');
  assert.equal(JSON.stringify(otherClientView.data).includes('TEST123'), false);

  const conflict = await request('/api/reservations', 'POST', { deskId: desk.id, studentId: 'OTHER456', duration: 30 });
  assert.equal(conflict.status, 409);

  const wrongKey = await request('/api/reservations', 'DELETE', { deskId: desk.id, token: 'wrong' });
  assert.equal(wrongKey.status, 404);

  const cancelled = await request('/api/reservations', 'DELETE', { deskId: desk.id, token: booked.data.token });
  assert.equal(cancelled.status, 200);
  const after = await request('/api/desks');
  assert.equal(after.data.desks.find((item) => item.id === desk.id).status, 'available');
});
