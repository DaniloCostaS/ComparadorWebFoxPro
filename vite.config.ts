import { defineConfig } from 'vite'

export default defineConfig({
  base: './', // Permite rodar o HTML diretamente do disco via file://
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
})
