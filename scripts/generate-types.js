const fs = require('fs/promises');
const path = require('path');
const { compile } = require('json-schema-to-typescript');

async function main() {
    const rootDir = path.resolve(__dirname, '..');
    const schemaPath = path.join(rootDir, 'schema', 'neo-ledger-data-model.schema.json');
    const outputPath = path.join(rootDir, 'types', 'neo-ledger.generated.d.ts');

    const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));
    const output = await compile(schema, 'NeoLedgerDataModel', {
        bannerComment: [
            '/**',
            ' * AUTO-GENERATED FILE. DO NOT EDIT.',
            ' * Run `npm run generate:types` to regenerate from schema/neo-ledger-data-model.schema.json.',
            ' */'
        ].join('\n'),
        unreachableDefinitions: true,
        style: {
            singleQuote: true,
            semi: true,
            trailingComma: 'none'
        }
    });

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, output, 'utf8');
    console.log(`Generated ${path.relative(rootDir, outputPath)}`);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
