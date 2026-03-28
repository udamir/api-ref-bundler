import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  build: {
    lib: {
      entry: './src/index.ts',
      name: 'ApiRefBundler',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'mjs' : 'cjs'}`
    },
    rollupOptions: {
      external: ['json-crawl']
    },
    sourcemap: true,
    minify: 'terser'
  },
  plugins: [
    dts({ rollupTypes: true })
  ]
})
