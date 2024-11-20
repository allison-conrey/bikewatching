import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    fs: {
      allow: [
        './', // Default project root
        'C:/Users/Allison Conrey/OneDrive/Desktop/UCSD DSC Program/DSC 209/Labs/bikewatching'
      ]
    }
  }
});

