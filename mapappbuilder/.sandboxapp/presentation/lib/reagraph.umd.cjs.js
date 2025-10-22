(function(factory){
  if (typeof module === 'object' && typeof module.exports !== 'undefined') {
    module.exports = require('./reagraph.umd.js');
  } else {
    factory();
  }
})(function(){
  var globalScope = typeof globalThis !== 'undefined'
    ? globalThis
    : (typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : {}));
  if (!globalScope || !globalScope.document) return;
  if (globalScope.reagraph) return;
  var script = globalScope.document.createElement('script');
  script.src = 'reagraph.umd.js';
  script.defer = true;
  globalScope.document.head.appendChild(script);
});
