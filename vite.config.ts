import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.SPICESIM_BASE ?? '/',
  build: {
    // ELK is intentionally lazy-loaded only when users import or auto-arrange
    // schematics. Keep the production build warning focused on unexpected
    // initial-bundle growth instead of this known layout-engine chunk.
    chunkSizeWarningLimit: 1600,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'framework',
              test: /node_modules[\\/](react|react-dom)[\\/]/,
              priority: 10,
            },
            {
              name: 'layout-engine',
              test: /node_modules[\\/]elkjs[\\/]/,
              priority: 9,
            },
          ],
        },
      },
    },
  },
  plugins: [react()],
})
