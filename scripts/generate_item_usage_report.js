const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const outputDir = path.join(root, 'reports');

function loadJson(file) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
}

const items = loadJson('items.json');
const gatheringItems = loadJson('items_gathering.json');

const usage = new Map();

function register(item) {
  if (!item?.id) return;
  usage.set(item.id, {
    id: item.id,
    name: item.name || item.id,
    uses: 0,
    sources: new Set()
  });
}

items.forEach(register);
gatheringItems.forEach(register);

const skipFiles = new Set(['items.json', 'items_gathering.json']);
const dataFiles = fs.readdirSync(dataDir).filter(file => file.endsWith('.json') && !skipFiles.has(file));

function traverse(node, file) {
  if (node == null) return;
  if (typeof node === 'string') {
    const entry = usage.get(node);
    if (entry) {
      entry.uses += 1;
      entry.sources.add(file);
    }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach(child => traverse(child, file));
    return;
  }
  if (typeof node === 'object') {
    for (const value of Object.values(node)) {
      traverse(value, file);
    }
  }
}

for (const file of dataFiles) {
  try {
    const json = loadJson(file);
    traverse(json, file);
  } catch (error) {
    console.error(`Failed to process ${file}:`, error.message);
  }
}

const rows = Array.from(usage.values())
  .map(entry => ({
    id: entry.id,
    name: entry.name,
    uses: entry.uses,
    sources: Array.from(entry.sources).sort().join('|')
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

const header = 'id,name,uses,sources\n';
const body = rows
  .map(row => {
    const escapedName = row.name.replace(/"/g, '""');
    const escapedSources = row.sources.replace(/"/g, '""');
    return `${row.id},"${escapedName}",${row.uses},"${escapedSources}"`;
  })
  .join('\n');

const outPath = path.join(outputDir, 'item_usage_report.csv');
fs.writeFileSync(outPath, header + body, 'utf8');

console.log(`Generated ${outPath} with ${rows.length} entries.`);
