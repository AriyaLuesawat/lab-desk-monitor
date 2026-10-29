# Lab Desk Monitor

A browser-based prototype for checking computer lab desk availability and making shared test reservations with a student ID.

## Features

- Twelve desks with shared, randomized occupancy for demonstrations.
- Shared student ID reservations for 30 minutes to 3 hours, with atomic conflict checks, cancellation, and automatic expiration.
- The booking database stores student IDs; each browser keeps a private cancellation key for its own bookings.
- Photo upload with user-drawn workstation zones. TensorFlow.js COCO-SSD checks whether a person appears in each zone.

## Run locally

Install dependencies with `npm ci`, generate and apply the D1 migration, then run `npm run dev`. The project uses the Sites Vinext starter and Cloudflare D1. See the [starter guide](https://github.com/cloudflare/vinext) for local Worker setup.

The API is covered by `node --test tests/shared-reservations.test.mjs` while the local Worker is running at `http://127.0.0.1:8787`.

## Current limits

The overview occupancy is simulated, but bookings are shared. Student IDs are not verified with PSU. The Site remains private while this test system is being developed. Photo analysis is an estimate: a missed person may cause a zone to appear available. The uploaded photo is processed in the browser; the detection model and fonts load from third-party CDNs.

For public student use, add an authorized PSU sign-in integration and a policy for student ID retention before opening the Site to everyone.
