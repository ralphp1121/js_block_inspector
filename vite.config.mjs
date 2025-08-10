import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { resolve } from 'node:path'

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        background: resolve(__dirname, 'src/background/index.js'),
        content: resolve(__dirname, 'src/content/index.js')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background.js'
          if (chunkInfo.name === 'content') return 'content.js'
          return '[name].js'
        },
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return '[name][extname]'
          }
          return 'assets/[name][extname]'
        }
      }
    }
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'manifest.json', dest: '.' }
      ]
    })
  ]
}) 