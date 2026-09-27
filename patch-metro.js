const fs = require('fs');
const path = require('path');

const nodeModules = path.join(__dirname, 'node_modules');
if (!fs.existsSync(nodeModules)) process.exit(0);

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);
  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });
  return arrayOfFiles;
}

const dirs = fs.readdirSync(nodeModules).filter(d => d.startsWith('metro'));

for (const dir of dirs) {
  const pkgDir = path.join(nodeModules, dir);
  const pkgPath = path.join(pkgDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const mainFile = pkg.main || "./src/index.js";
      const exportsObj = {
        ".": mainFile.startsWith("./") ? mainFile : `./${mainFile}`,
        "./package.json": "./package.json",
        "./private/*": "./src/*.js"
      };
      
      const srcDir = path.join(pkgDir, 'src');
      if (fs.existsSync(srcDir)) {
        const allFiles = getAllFiles(srcDir);
        for (const file of allFiles) {
          const rel = path.relative(pkgDir, file).replace(/\\/g, '/');
          exportsObj[`./${rel}`] = `./${rel}`;
          if (rel.endsWith('.js')) {
            const noExt = rel.slice(0, -3);
            exportsObj[`./${noExt}`] = `./${rel}`;
          }
        }
      }
      pkg.exports = exportsObj;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    } catch (e) {
      console.error(e);
    }
  }
}
console.log('Metro exports dynamically patched with correct main entry point.');
