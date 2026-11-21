import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

function publicFiles(directory: string, prefix = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? publicFiles(resolve(directory, entry.name), `${prefix}${entry.name}/`)
    : [`${prefix}${entry.name}`]);
}
// Each deployment gets a new worker URL, including behind immutable CDN caches.
const pwaBuildId = randomBytes(8).toString('hex');

// https://vitejs.dev/config/
export default defineConfig({
  define: { __PWA_BUILD_ID__: JSON.stringify(pwaBuildId) },
  plugins: [react(), {
    name: 'portal-pwa-shell',
    apply: 'build',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const index = bundle['index.html'];
        if (!index || index.type !== 'asset') throw new Error('PWA shell requires built index.html');
        const html = String(index.source);
        const files = publicFiles(resolve(__dirname, 'public'));
        const assets = [...Object.keys(bundle).filter(name => name !== 'index.html' && !name.endsWith('.map')), ...files].map(name => `/${name}`);
        const hash = createHash('sha256').update(html).update(assets.join('\n'));
        for (const file of files) hash.update(readFileSync(resolve(__dirname, 'public', file)));
        const source = readFileSync(resolve(__dirname, 'pwa/service-worker.js'), 'utf8')
          .replace('__CACHE_NAME__', JSON.stringify(`learners-portal-shell-${hash.digest('hex').slice(0, 16)}`))
          .replace('__SHELL_HTML__', JSON.stringify(html))
          .replace('__PUBLIC_ASSETS__', JSON.stringify(assets));
        this.emitFile({ type: 'asset', fileName: `sw-${pwaBuildId}.js`, source });
      },
    },
  }],
  build: {
    // The main bundle is ~2.5 MB (PDF viewer and charts included); only warn above 3 MB
    chunkSizeWarningLimit: 3000,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
