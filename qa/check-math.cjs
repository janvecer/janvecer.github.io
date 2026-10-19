#!/usr/bin/env node
'use strict';

// Static TeX validation; no browser or preview server is started.
// Install the optional validator dependency outside the website:
//   npm install --prefix /tmp/site-math-check mathjax-full@3.2.2
// Then, from the project root:
//   MATHJAX_NODE_MODULES=/tmp/site-math-check/node_modules \
//     node qa/check-math.cjs docs qa/math-typesetting-report.json
// A normal local installation of mathjax-full is also supported.

const fs = require('node:fs');
const path = require('node:path');

function dependency(relative) {
  const moduleName = `mathjax-full/${relative}`;
  if (process.env.MATHJAX_NODE_MODULES) {
    return require(path.join(path.resolve(process.env.MATHJAX_NODE_MODULES), moduleName));
  }
  return require(moduleName);
}

let mathjax, TeX, SVG, liteAdaptor, RegisterHTMLHandler, AllPackages, version;
try {
  ({mathjax} = dependency('js/mathjax.js'));
  ({TeX} = dependency('js/input/tex.js'));
  ({SVG} = dependency('js/output/svg.js'));
  ({liteAdaptor} = dependency('js/adaptors/liteAdaptor.js'));
  ({RegisterHTMLHandler} = dependency('js/handlers/html.js'));
  ({AllPackages} = dependency('js/input/tex/AllPackages.js'));
  ({version} = dependency('package.json'));
} catch (error) {
  console.error('Optional math validation requires mathjax-full. See the instructions at the top of qa/check-math.cjs.');
  console.error(error.message);
  process.exit(2);
}

const root = path.resolve(process.argv[2] || 'docs');
const reportFile = path.resolve(process.argv[3] || 'qa/math-typesetting-report.json');
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

// These two packages display invalid TeX as text instead of raising an error.
// Exclude them so a typo cannot silently pass this check.
const packages = AllPackages.filter(name => !['noerrors', 'noundefined'].includes(name));

function htmlFiles(directory) {
  return fs.readdirSync(directory, {withFileTypes: true})
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? htmlFiles(file) : entry.isFile() && entry.name.endsWith('.html') ? [file] : [];
    });
}

const report = {
  generatedAt: new Date().toISOString(),
  method: 'MathJax TeX parser and SVG output with liteAdaptor in Node.js; no browser',
  scope: 'Static rendered HTML elements with class math; dynamic widget output and browser layout are not checked',
  mathjaxVersion: version,
  nodeVersion: process.version,
  packages: 'AllPackages excluding noerrors and noundefined error suppression',
  htmlPages: 0,
  pagesWithMath: 0,
  formulas: 0,
  inlineFormulas: 0,
  displayFormulas: 0,
  failures: [],
  pages: []
};

for (const file of htmlFiles(root)) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  const document = adaptor.parse(fs.readFileSync(file, 'utf8'), 'text/html');
  const elements = adaptor.elementsByClass(adaptor.body(document), 'math');
  const page = {file: relative, formulas: elements.length, inline: 0, display: 0, failures: 0};
  report.htmlPages++;
  if (elements.length) report.pagesWithMath++;

  // Keep TeX definitions and equation numbering scoped to one HTML page.
  const renderer = mathjax.document('', {
    InputJax: new TeX({packages, formatError: (_jax, error) => {throw error;}}),
    OutputJax: new SVG({fontCache: 'none'}),
    compileError: (_doc, _math, error) => {throw error;},
    typesetError: (_doc, _math, error) => {throw error;}
  });

  elements.forEach((element, index) => {
    const display = adaptor.hasClass(element, 'display');
    const raw = adaptor.textContent(element).trim();
    const open = display ? '\\[' : '\\(';
    const close = display ? '\\]' : '\\)';
    let tex = raw;
    report.formulas++;
    if (display) {report.displayFormulas++; page.display++;}
    else {report.inlineFormulas++; page.inline++;}
    try {
      if (!raw.startsWith(open) || !raw.endsWith(close)) {
        throw new Error(`Expected ${open}...${close} delimiters in rendered math element`);
      }
      tex = raw.slice(open.length, -close.length).trim();
      const output = renderer.convert(tex, {display});
      if (adaptor.tags(output, 'merror').length || /data-mjx-error=/.test(adaptor.outerHTML(output))) {
        throw new Error('MathJax produced an error node');
      }
    } catch (error) {
      page.failures++;
      report.failures.push({file: relative, formula: index + 1, display, tex, message: error.message || String(error)});
    }
  });
  report.pages.push(page);
}

report.failedFormulas = report.failures.length;
report.passed = report.htmlPages > 0 && report.formulas > 0 && report.failedFormulas === 0;
fs.mkdirSync(path.dirname(reportFile), {recursive: true});
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
console.log(`${report.passed ? 'PASS' : 'FAIL'}: ${report.formulas} formulas (${report.inlineFormulas} inline, ${report.displayFormulas} display), ${report.pagesWithMath}/${report.htmlPages} pages with math, ${report.failedFormulas} failures.`);
console.log(`Report: ${reportFile}`);
for (const failure of report.failures) {
  console.error(`${failure.file}, formula ${failure.formula}: ${failure.message}`);
}
process.exitCode = report.passed ? 0 : 1;
