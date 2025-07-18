import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import tailwindcss from '@tailwindcss/vite';

// import node from '@astrojs/node';

import ZAstroNode from 'zastro-websockets-node';

// https://astro.build/config
export default defineConfig({
  site: process.env.SITE_URL || `http://127.0.0.1:4270`,

  integrations: [
    vue({ 
      appEntrypoint: '/src/app.ts'
    }),
  ],

  output: 'server',

  build: {
    assets: 'assets'
  },

  vite: {
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production')
    },

    plugins: [tailwindcss()]
  },

  adapter: ZAstroNode({
    mode: 'standalone',
  }),
});