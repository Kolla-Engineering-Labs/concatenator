import { build } from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function compileSEAPayload() {
  console.log('[KEL Protocol] Initiating Phase D AST Bundling...');
  
  try {
    await build({
      entryPoints: [resolve(__dirname, '../src/cli/index.ts')],
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'cjs', 
      outfile: resolve(__dirname, '../dist/bundle.js'),
      minify: true,
      treeShaking: true,
      // Node SEA strictly requires CommonJS structure
      // We bundle all internal dependencies to ensure zero external resolution
    });

    console.log('✓ [KEL Protocol] Payload successfully flattened to dist/bundle.js');
  } catch (error) {
    console.error('✗ [KEL Protocol] Fatal error during AST flattening:', error);
    process.exit(1);
  }
}

compileSEAPayload();
