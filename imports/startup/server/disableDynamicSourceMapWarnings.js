import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';

const DYNAMIC_NODE_MODULE_MAP = /^\/dynamic\/node_modules\/[^?]+\.map(?:\?.*)?$/;
const STUB_SOURCE_CONTENT = '// Source map intentionally stubbed to silence noisy console warnings.\n';

if (Meteor.isDevelopment) {
  WebApp.rawConnectHandlers.use((req, res, next) => {
    try {
      const url = req && typeof req.url === 'string' ? req.url : '';
      if (!url || !DYNAMIC_NODE_MODULE_MAP.test(url)) {
        next();
        return;
      }

      const pathname = decodeURIComponent(url.split('?')[0] || '/dynamic/node_modules');
      const body = JSON.stringify({
        version: 3,
        file: pathname.replace(/^\//, ''),
        sources: ['[external:npm]'],
        sourcesContent: [STUB_SOURCE_CONTENT],
        names: [],
        mappings: '',
      });

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=0, stale-while-revalidate=60');
      res.setHeader('Content-Length', Buffer.byteLength(body));
      res.end(body);
    } catch (err) {
      console.warn('Source map stub handler failed, falling back to default response', err);
      next();
    }
  });
}
