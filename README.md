# Supabase Security Triage Lab

A local prototype for exploring Jev's three typed decisions on security tickets: **Choice** routes a ticket, **Score** rates urgency, and **Noul** estimates whether human review is needed before an action.

## Run

Requires Node.js 20 or newer. No package install is needed.

```sh
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The sample previews are illustrative and make no API call.

## Edit the API request

Open **See and edit the API call** below the ticket cards. The editor shows the exact JSON request body. You can change the model, state, question instructions, choice options, score levels, and Noul criteria. **Run this JSON** sends that body through the local proxy and shows the raw response beside it. **Run current request** above does the same thing. The server validates the JSON before forwarding it, and the Jev API URL and key remain server-side. **Reset** restores the default three-question request for the current ticket. **Copy cURL** copies the current request with a `JEV_API_KEY` environment variable placeholder.

The ticket field and JSON `state.ticket` stay in sync while that field exists. If you replace `state` with a different structure, edit that state directly in JSON. Selecting a sample resets the request to the default template.

For live Jev results, set the key on the server before starting it:

```sh
export JEV_API_KEY="your-key"
npm start
```

The browser calls the local server, which sends `POST https://thejevai.com/v1/systemone` with `model: jev-latest`. The key is never sent to the browser. `JEV_API_URL` can point at a compatible local server, such as `http://127.0.0.1:8765/v1/systemone`; the prototype will then run without a hosted key. Use only synthetic tickets until data handling has been reviewed.

## Verify

```sh
npm test
```

This covers the three question types in the request, the server proxy and its response, and missing-key behavior. A live hosted API result has **not** been verified without a `JEV_API_KEY`.

## Scope

This is a decision-support prototype. It does not create tickets, reset MFA, modify accounts, or implement identity verification. Tune routing and review thresholds against labeled security tickets before any automation. The Supabase logos were copied from the provided `local-jev/brand-assets` folder.
