import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/reagraph-umd-entry.js',
  output: {
    file: 'lib/reagraph.umd.js',
    format: 'umd',
    name: 'reagraphBundle',
    exports: 'named',
    sourcemap: false,
    inlineDynamicImports: true
  },
  plugins: [
    replace({
      'process.env.NODE_ENV': JSON.stringify('production'),
      preventAssignment: true
    }),
    resolve({ browser: true, preferBuiltins: false }),
    commonjs(),
    terser()
  ]
};
