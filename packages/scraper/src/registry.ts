import type { SiteAdapter } from "./adapter.js";
import sampleRealtor from "./adapters/sample-realtor/index.js";

/** 有効なアダプター一覧。新しいソースはここに登録する */
export const adapters: Record<string, SiteAdapter> = {
  [sampleRealtor.meta.id]: sampleRealtor,
};
