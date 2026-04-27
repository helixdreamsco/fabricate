import { EventEmitter } from "node:events";

/**
 * Module-level event bus for SSE fan-out in dev.
 *
 * In production with multiple Node processes this needs to become Redis
 * pub/sub (or Postgres LISTEN/NOTIFY). For a single-process dev server it
 * works perfectly — every SSE subscriber in every browser tab is attached
 * to the same emitter instance.
 *
 * The singleton pattern through globalThis avoids duplicate emitters when
 * Next.js hot-reloads modules in dev.
 */
const g = globalThis as unknown as { fabricateBus?: EventEmitter };

export const bus = (g.fabricateBus ??= (() => {
  const e = new EventEmitter();
  e.setMaxListeners(0); // many concurrent SSE subscribers
  return e;
})());

export type CommunityMessageEvent = {
  type: "message:new";
  communityId: string;
  message: {
    id: string;
    communityId: string;
    authorId: string;
    authorName: string | null;
    authorImage: string | null;
    body: string;
    createdAt: string;
  };
};

export type CommunityEvent = CommunityMessageEvent;

export function emitCommunityEvent(e: CommunityEvent) {
  bus.emit(`community:${e.communityId}`, e);
}
