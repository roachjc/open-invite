## Astro 7

This app uses Astro 7 with the `@astrojs/node` adapter (`output: "server"`). There is no client framework. APIs and config may differ from your training data. Check the types and JSDoc in `node_modules/astro/dist/types/public/` before relying on an API.

- Pages render on the server and must keep working without JavaScript. Changes are HTML forms that post to the page and finish with `finish()` from `src/lib/server/respond.ts`, never a client-side API call.
- `src/client/enhance.ts` swaps in the server's markup for `#app`. It keeps an open dialog when the next page shows the dialog with the same `id` prop, and keeps `[data-persist]` fields during background refreshes. Do not render content on the client. Mark elements the script adds with a selector in `TRANSIENT`, so refreshes can tell when nothing changed.
- Server code reads `process.env`. `astro.config.mjs` loads `.env*` files into it for `dev` and `build`; `npm start` loads them with Node's `--env-file-if-exists`.
- `localOnly()` in `src/lib/server/http.ts` checks `import.meta.env.PROD` because the standalone server does not set `NODE_ENV`. Keep production fail-closed.
- Add any new Lucide icon to `src/components/icons.ts`; `Icon` references the page's sprite.
