// Simple benchmark logger: records timestamps for mount, first render, layout done, and samples FPS
export function createBenchmarkLogger() {
  const samples = [];
  let rafId = null;
  let last = performance.now();
  let frames = 0;

  function tick(now) {
    frames++;
    if (now - last >= 1000) {
      samples.push({ ts: Date.now(), fps: frames });
      frames = 0;
      last = now;
    }
    rafId = requestAnimationFrame(tick);
  }

  return {
    start() { samples.length = 0; last = performance.now(); frames = 0; rafId = requestAnimationFrame(tick); },
    stop() { if (rafId) cancelAnimationFrame(rafId); rafId = null; },
    mark(name) { console.log(`[bench] ${name}`, Date.now()); },
    getSamples() { return samples.slice(); },
    dump() { console.log('benchmark samples', samples); return samples.slice(); }
  };
}
