const fs = require('fs');
const vm = require('vm');
const path = require('path');

const bundlePath = path.resolve(__dirname, 'presentation-template/lib/reagraph.umd.js');
const code = fs.readFileSync(bundlePath, 'utf8');

const g = {
  console,
  setTimeout,
  clearTimeout,
};

g.globalThis = g;
g.window = g;
g.self = g;
g.document = {
  createElement: () => ({ getContext: () => ({}) }),
  body: { appendChild() {}, removeChild() {} },
};

g.performance = {
  now: () => 0,
};

g.requestAnimationFrame = (fn) => setTimeout(() => fn(0), 0);
g.cancelAnimationFrame = (id) => clearTimeout(id);
g.navigator = { userAgent: 'node' };
g.Image = function Image() {};
g.OffscreenCanvas = function OffscreenCanvas() {};
g.HTMLCanvasElement = function HTMLCanvasElement() {};
g.WebGLRenderingContext = function WebGLRenderingContext() {};
g.HTMLElement = function HTMLElement() {};
g.ResizeObserver = function ResizeObserver() {};
g.MutationObserver = function MutationObserver() {};
g.fetch = () => Promise.reject(new Error('no fetch in test context'));

g.__DEV__ = false;

g.addEventListener = () => {};
g.removeEventListener = () => {};

const context = vm.createContext(g);
vm.runInContext(code, context);

const api = context.reagraphBundle || context.reagraph;
console.log('Exports:', Object.keys(api).slice(0, 20));
console.log('Has render:', typeof api.render);
console.log('Has GraphCanvas:', typeof api.GraphCanvas);
