/**
 * Module resolution hook for `node --test`.
 *
 * The app is built by Next, so `src/` uses bundler-style imports: no file
 * extensions and a `@/` alias for `src/`. Node's own ESM resolver requires
 * explicit extensions and knows nothing about the alias, so tests importing
 * app modules would fail on the first transitive `./catalog` import.
 *
 * This teaches the resolver those two conventions and nothing else, which
 * keeps the test runner dependency-free (Node strips the types natively).
 * Register with: node --import ./test/resolver.mjs --test "test/*.test.ts"
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./resolver-hooks.mjs", pathToFileURL(import.meta.filename));
