import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/reagraph-umd-entry.js',
  output: {
    file: 'lib/reagraph.umd.js',
    format: 'umd',
    name: 'reagraphBundle',
    exports: 'named',
    sourcemap: false
  },
  plugins: [
    resolve({ browser: true, preferBuiltins: false }),
    commonjs(),
    terser()
  ]
};
