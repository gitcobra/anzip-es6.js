import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/anzip-es6.ts',
  plugins: [typescript()],
  output: [
    {
      file: 'dist/anzip-es6.js',
      format: 'esm',
      sourcemap: true,
    }, {
      file: 'dist/anzip-es6.min.js',
      format: 'esm',
      plugins: [terser()],
      sourcemap: true,
    }
  ]
};
