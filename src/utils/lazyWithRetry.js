const CHUNK_RELOAD_KEY = "chunk-reload-attempted";

const isChunkLoadError = (error) => {
  const text = String(error?.message || error || "").toLowerCase();
  return (
    text.includes("failed to fetch dynamically imported module") ||
    text.includes("loading chunk") ||
    text.includes("chunkloaderror") ||
    text.includes("importing a module script failed")
  );
};

export default function lazyWithRetry(importer) {
  return async () => {
    try {
      const module = await importer();
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(CHUNK_RELOAD_KEY, "false");
      }
      return module;
    } catch (error) {
      if (typeof window !== "undefined" && isChunkLoadError(error)) {
        const alreadyRetried =
          window.sessionStorage.getItem(CHUNK_RELOAD_KEY) === "true";
        if (!alreadyRetried) {
          window.sessionStorage.setItem(CHUNK_RELOAD_KEY, "true");
          window.location.reload();
          return new Promise(() => {});
        }
      }
      throw error;
    }
  };
}
