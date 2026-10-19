// Quarto runs this with its bundled Deno runtime after each render.
// All target browsers support ES2015. Remove the obsolete external polyfill
// inserted by Quarto's MathJax template so the site remains usable offline.
const output = Deno.env.get('QUARTO_PROJECT_OUTPUT_DIR') || 'docs';
function withoutPolyfill(html: string): string {
  return html.replace(/\s*<script\b[^>]*\bsrc=["']https:\/\/cdnjs\.cloudflare\.com\/polyfill\/v3\/polyfill\.min\.js\?features=es6["'][^>]*>\s*<\/script>/g, '');
}
function clean(directory: string) {
  for (const entry of Deno.readDirSync(directory)) {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory) clean(file);
    else if (entry.isFile && entry.name.endsWith('.html')) {
      const original = Deno.readTextFileSync(file);
      const updated = withoutPolyfill(original);
      if (updated !== original) Deno.writeTextFileSync(file, updated);
    }
  }
}
clean(output);

// Some Quarto render/cache paths leave intermediate HTML beside the sources.
// Remove a copy only when its QMD source and finished output exist. Quarto 1.9
// can postprocess the output after making the intermediate copy, so the two
// files may differ in resolved links/navigation. In that case, require the same
// explicit Quarto generator and page title. Preserve handwritten/unmatched HTML.
function quartoIdentity(html: string): string | null {
  const generator = html.match(/<meta\s+name=["']generator["']\s+content=["'](quarto-[^"']+)["'][^>]*>/i);
  const title = html.match(/<title>([\s\S]*?)<\/title>/i);
  return generator && title ? `${generator[1]}\n${title[1].trim()}` : null;
}
const separateOutput = Deno.realPathSync(output) !== Deno.realPathSync('.');
for (const directory of separateOutput ? ['.', 'likelihood', 'research'] : []) {
  try { if (!Deno.statSync(directory).isDirectory) continue; }
  catch (error) { if (error instanceof Deno.errors.NotFound) continue; throw error; }
  for (const entry of Deno.readDirSync(directory)) {
    if (!entry.isFile || !entry.name.endsWith('.html')) continue;
    const relative = directory === '.' ? entry.name : `${directory}/${entry.name}`;
    const source = relative.replace(/\.html$/, '.qmd');
    const rendered = `${output}/${relative}`;
    try {
      if (!Deno.statSync(source).isFile || !Deno.statSync(rendered).isFile) continue;
      const intermediate = Deno.readTextFileSync(relative);
      const finished = Deno.readTextFileSync(rendered);
      const identity = quartoIdentity(intermediate);
      if (withoutPolyfill(intermediate) === withoutPolyfill(finished) ||
          (identity !== null && identity === quartoIdentity(finished))) {
        Deno.removeSync(relative);
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
  }
}
