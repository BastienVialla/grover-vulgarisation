import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANT: change 'base' to match your GitHub repo name exactly.
  // e.g. if your repo is https://github.com/yourname/quantum-engine,
  // base should be '/quantum-engine/'
export default defineConfig({
  plugins: [react()],
  base: '/grover-vulgarisation/',
})
