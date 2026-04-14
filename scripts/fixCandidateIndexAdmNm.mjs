import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function loadAdmNmMap() {
  const emdDir = path.join(ROOT, 'src/data/mock/eupmyeondong');
  const files = fs.readdirSync(emdDir).filter(f => f.endsWith('.json'));
  const map = {};
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(emdDir, file), 'utf8'));
    for (const ft of data.features) {
      map[ft.properties.adm_cd] = ft.properties.adm_nm;
    }
  }
  return map;
}

const CIDX_FILES = [
  'cidx_presidential.json',
  'cidx_assembly.json',
  'cidx_local_high.json',
  'cidx_local_basic.json',
];

function main() {
  const admNmMap = loadAdmNmMap();
  console.log(`Loaded ${Object.keys(admNmMap).length} adm_cd -> adm_nm mappings.`);

  for (const filename of CIDX_FILES) {
    const filePath = path.join(ROOT, 'src/data/static', filename);
    if (!fs.existsSync(filePath)) {
      console.log(`Skipping ${filename} (not found)`);
      continue;
    }

    const cidx = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let updatedCount = 0;
    for (const entry of cidx) {
      if (entry.cd && admNmMap[entry.cd]) {
        entry.an = admNmMap[entry.cd];
        updatedCount++;
      }
    }

    fs.writeFileSync(filePath, JSON.stringify(cidx));
    console.log(`Updated ${updatedCount} entries in ${filename} with 'an' (adm_nm) field.`);
  }
}

main();
