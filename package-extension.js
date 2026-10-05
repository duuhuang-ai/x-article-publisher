// Generated assets are shipped: users load extension/ without Node or a build step.
const fs = require('node:fs');
const path = require('node:path');
for (const name of ['shared.js', 'xpage.js']) {
  const source = fs.readFileSync(path.join(__dirname, name));
  const target = path.join(__dirname, 'extension', name);
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(target) || !source.equals(fs.readFileSync(target))) {
      console.error(`FAIL: extension/${name} is stale; run node package-extension.js`);
      process.exitCode = 1;
    }
  } else fs.writeFileSync(target, source);
}
if (!process.exitCode) console.log('PASS: extension parser and engine match their sources');
