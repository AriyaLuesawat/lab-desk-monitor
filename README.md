# Lab Desk Monitor

A browser-based prototype for checking computer lab desk availability and making test reservations with a student ID.

## Features

- Twelve desks with randomized availability for demonstrations.
- Student ID reservations for 30 minutes to 3 hours, with cancellation and automatic expiration.
- Browser-local storage for test bookings.
- Photo upload with user-drawn workstation zones. TensorFlow.js COCO-SSD checks whether a person appears in each zone.

## Run locally

Serve the `dist` directory with any static HTTP server, such as `python3 -m http.server 8000 -d dist`, then open `http://localhost:8000`.

## Current limits

The overview is simulated. Bookings exist only in the current browser and student IDs are not verified with PSU. Photo analysis is an estimate: a missed person may cause a zone to appear available. The uploaded photo is processed in the browser; the detection model and fonts load from third-party CDNs.

Shared reservations and PSU sign-in would require an authorized integration and a server-side booking store.
