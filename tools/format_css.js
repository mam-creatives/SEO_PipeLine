#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const input = path.join(process.cwd(), 'Untitled-1.css');
const output = path.join(process.cwd(), 'Untitled-1.prettified.css');

if (!fs.existsSync(input)) {
  console.error('Input file not found:', input);
  process.exit(2);
}

let css = fs.readFileSync(input, 'utf8');

// Normalize newlines
css = css.replace(/\r\n/g, '\n');

// Make sure comment blocks end with a newline
css = css.replace(/\*\/\s*/g, '*/\n');

// Add spacing around braces and statements to improve readability.
// This is a lightweight prettifier — it inserts line breaks after
// opening braces and semicolons and before closing braces.
css = css.replace(/\s*{\s*/g, ' {\n  ');
css = css.replace(/;\s*/g, ';\n  ');
css = css.replace(/\n\s*}\s*/g, '\n}\n');
css = css.replace(/}\s*/g, '\n}\n');

// Collapse accidental multiple blank lines
css = css.replace(/\n{3,}/g, '\n\n');

// Trim trailing spaces on each line
css = css.split('\n').map(l => l.replace(/\s+$/g, '')).join('\n');

fs.writeFileSync(output, css, 'utf8');
console.log('Created:', output);
