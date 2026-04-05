const fs = require('fs');
const file = process.argv[2];
const content = fs.readFileSync(file, 'utf8');

// The file might be wrapped in `declare namespace cc { ... }`
// We want to find all classes that extend Component or a subclass of Component.
// Actually, many extend things like RenderComponent -> Component.
// Let's first build a class inheritance map.
const classRegex = /export\s+class\s+([A-Za-z0-9_]+)\s+extends\s+([A-Za-z0-9_.]+)(?:\s+implements\s+[A-Za-z0-9_.,\s]+)?\s*\{([\s\S]*?)\n\t\}/g;
let match;

const classes = {};
const extendsMap = {};

while ((match = classRegex.exec(content)) !== null) {
    const className = match[1];
    const parentName = match[2];
    const body = match[3];
    
    extendsMap[className] = parentName;
    classes[className] = body;
}

// resolve inheritance to see if it eventually extends Component
function isComponentSubclass(cls) {
    if (cls === 'Component' || cls === 'cc.Component') return true;
    const parent = extendsMap[cls];
    if (!parent) return false;
    return isComponentSubclass(parent);
}

// For each component subclass, find enum properties
// We can guess enum properties if they have a type like `Class.Enum` or if there's an enum defined with that name.
// Let's also extract all enums to be sure.
const enumRegex = /export\s+enum\s+([A-Za-z0-9_]+)\s*\{/g;
const enums = new Set();
let enumMatch;
while ((enumMatch = enumRegex.exec(content)) !== null) {
    enums.add(enumMatch[1]);
}

const results = [];

for (const cls in classes) {
    if (isComponentSubclass(cls)) {
        const body = classes[cls];
        // find properties: name: type;
        // regex: \t([A-Za-z0-9_]+):\s*([A-Za-z0-9_.]+);
        const propRegex = /^\s*([A-Za-z0-9_]+):\s*([A-Za-z0-9_.]+);/gm;
        let propMatch;
        const enumProps = [];
        while ((propMatch = propRegex.exec(body)) !== null) {
            const propName = propMatch[1];
            const propType = propMatch[2];
            
            // is propType an enum?
            // propType could be like `Sprite.Type` or `Type`
            let typeBase = propType;
            if (propType.includes('.')) {
                typeBase = propType.split('.').pop();
            }
            if (enums.has(typeBase) || propType.includes('.')) {
                // If it includes a dot, it's highly likely an enum in cocos, like Label.HorizontalAlign
                // Let's just collect it. We'll filter later or just print.
                // Except Node, Vec2, Size, Rect, Color, which are classes/interfaces
                const isBuiltinClass = ['cc.Node', 'cc.Vec2', 'cc.Size', 'cc.Rect', 'cc.Color', 'cc.Event', 'cc.Texture2D', 'cc.SpriteFrame', 'cc.AudioClip', 'cc.Font', 'cc.Prefab'].includes(propType);
                if (!isBuiltinClass && !propType.endsWith('Callback') && !propType.endsWith('Manager')) {
                    enumProps.push({ propName, propType });
                }
            }
        }
        if (enumProps.length > 0) {
            results.push({ cls, enumProps });
        }
    }
}

console.log(JSON.stringify({
    componentCount: Object.keys(classes).filter(isComponentSubclass).length,
    results: results.slice(0, 50) // limit output
}, null, 2));

// Also let's find the lines of these classes to generate our file:/// links
// Let's just do a simple line search for a couple of them
content.split('\n').forEach((line, idx) => {
    if (line.includes('export class Sprite extends')) {
        console.log(`Sprite: L${idx+1}`);
    }
    if (line.includes('export class Label extends')) {
        console.log(`Label: L${idx+1}`);
    }
    if (line.includes('export class Button extends')) {
         console.log(`Button: L${idx+1}`);
    }
});
