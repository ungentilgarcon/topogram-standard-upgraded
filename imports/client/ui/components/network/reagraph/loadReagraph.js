let cachedReagraphPromise = null;

async function dynamicImportReagraph() {
  const literalSpecifier = 'reagraph';
  if (typeof module !== 'undefined' && module && typeof module.dynamicImport === 'function') {
    try {
      return await module.dynamicImport(literalSpecifier);
    } catch (err) {
      // ignore and fall through to other strategies
    }
  }
  try {
    return await import('reagraph');
  } catch (err) {
    // ignore and try CommonJS fallback
  }
  try {
    if (typeof require === 'function') {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      return require(literalSpecifier);
    }
  } catch (err) {
    // ignore
  }
  return null;
}

export async function loadReagraphModule() {
  if (!cachedReagraphPromise) {
    cachedReagraphPromise = (async () => {
      const mod = await dynamicImportReagraph();
      if (!mod) return null;
      return mod && (mod.default || mod);
    })();
  }
  return cachedReagraphPromise;
}

export default loadReagraphModule;
