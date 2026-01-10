# Beluga2 Push Notification Server

## Setup

1. Install dependencies:
   ```sh
   npm install
   ```
2. Generate VAPID keys (run once):
   ```sh
   npm run generate-vapid
   ```
   Copy the public and private keys into `index.js`.
3. Start the server:
   ```sh
   npm start
   ```

## Endpoints
- `POST /api/subscribe` — Receives push subscription from frontend (JSON body)
- `POST /api/notify` — Sends a push notification to all subscribers. Body: `{ title, body, url }`

## Notes
- Subscriptions are stored in `subscriptions.json` (in-memory + file for demo)
- Use a real database for production
- CORS is enabled for local development
