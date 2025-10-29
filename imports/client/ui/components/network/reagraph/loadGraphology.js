let cachedGraphologyPromise = null;

async function dynamicImportGraphology() {
  const literalSpecifier = 'graphology';
  if (typeof module !== 'undefined' && module && typeof module.dynamicImport === 'function') {
    try {
      return await module.dynamicImport(literalSpecifier);
    } catch (err) {
      // ignore and fall through
    }
  }
  try {
    return await import('graphology');
  } catch (err) {
    // ignore and fall back to require
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

export async function loadGraphologyModule() {
  if (!cachedGraphologyPromise) {
    cachedGraphologyPromise = (async () => {
      const mod = await dynamicImportGraphology();
      if (!mod) return null;
      return mod && (mod.default || mod);
    })();
  }
  return cachedGraphologyPromise;
}

export default loadGraphologyModule;
