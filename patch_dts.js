const fs = require('fs');

const dtsConfigPath = 'F:/Work/Fireball/Test/creator.d.ts';
let content = fs.readFileSync(dtsConfigPath, 'utf8');

// Known components and enum properties from our previous extraction
const targetClasses = [
    { cls: "ParticleSystem", props: [{ name: "positionType", type: "ParticleSystem.PositionType" }, { name: "emitterMode", type: "ParticleSystem.EmitterMode" }, { name: "srcBlendFactor", type: "macro.BlendFactor" }, { name: "dstBlendFactor", type: "macro.BlendFactor" }] },
    { cls: "VideoPlayer", props: [{ name: "resourceType", type: "VideoPlayer.ResourceType" }] },
    { cls: "Camera", props: [{ name: "clearFlags", type: "Camera.ClearFlags" }] },
    { cls: "Button", props: [{ name: "transition", type: "Button.Transition" }] },
    { cls: "Label", props: [{ name: "horizontalAlign", type: "Label.HorizontalAlign" }, { name: "verticalAlign", type: "Label.VerticalAlign" }, { name: "overflow", type: "Label.Overflow" }, { name: "cacheMode", type: "Label.CacheMode" }] },
    { cls: "Layout", props: [{ name: "type", type: "Layout.Type" }, { name: "resizeMode", type: "Layout.ResizeMode" }, { name: "startAxis", type: "Layout.AxisDirection" }, { name: "verticalDirection", type: "Layout.VerticalDirection" }, { name: "horizontalDirection", type: "Layout.HorizontalDirection" }] },
    { cls: "Mask", props: [{ name: "type", type: "Mask.Type" }] },
    { cls: "MotionStreak", props: [{ name: "srcBlendFactor", type: "macro.BlendFactor" }, { name: "dstBlendFactor", type: "macro.BlendFactor" }] },
    { cls: "PageView", props: [{ name: "sizeMode", type: "PageView.SizeMode" }, { name: "direction", type: "PageView.Direction" }] },
    { cls: "ProgressBar", props: [{ name: "mode", type: "ProgressBar.Mode" }] },
    { cls: "PageViewIndicator", props: [{ name: "direction", type: "PageViewIndicator.Direction" }] },
    { cls: "RichText", props: [{ name: "horizontalAlign", type: "macro.TextAlignment" }, { name: "cacheMode", type: "Label.CacheMode" }] },
    { cls: "Scrollbar", props: [{ name: "direction", type: "Scrollbar.Direction" }] },
    { cls: "Slider", props: [{ name: "direction", type: "Slider.Direction" }] },
    { cls: "Sprite", props: [{ name: "type", type: "Sprite.Type" }, { name: "fillType", type: "Sprite.FillType" }, { name: "sizeMode", type: "Sprite.SizeMode" }, { name: "srcBlendFactor", type: "macro.BlendFactor" }, { name: "dstBlendFactor", type: "macro.BlendFactor" }] },
    { cls: "Widget", props: [{ name: "alignMode", type: "Widget.AlignMode" }] },
    { cls: "Graphics", props: [{ name: "lineJoin", type: "Graphics.LineJoin" }, { name: "lineCap", type: "Graphics.LineCap" }] },
    { cls: "MeshRenderer", props: [{ name: "shadowCastingMode", type: "MeshRenderer.ShadowCastingMode" }] },
    { cls: "RigidBody", props: [{ name: "type", type: "RigidBodyType" }] },
    { cls: "ParticleSystem3D", props: [{ name: "simulationSpace", type: "ParticleSystem3DAssembler.Space" }, { name: "scaleSpace", type: "ParticleSystem3DAssembler.Space" }, { name: "renderMode", type: "ParticleSystem3DAssembler.RenderMode" }] },
    { cls: "EditBox", props: [{ name: "returnType", type: "EditBox.KeyboardReturnType" }, { name: "inputFlag", type: "EditBox.InputFlag" }, { name: "inputMode", type: "EditBox.InputMode" }] }
];

let replacedCount = 0;

for (const { cls, props } of targetClasses) {
    // Regex to find the class definition
    const classRegex = new RegExp(`(export\\s+class\\s+${cls}\\s+extends\\s+[A-Za-z0-9_.]+(?:\\s+implements\\s+[A-Za-z0-9_.,\\s]+)?\\s*\\{[\\s\\S]*?\\n\\t\\})`, 'g');
    
    content = content.replace(classRegex, (classBody) => {
        let newBody = classBody;
        for (const prop of props) {
            // Find property line, e.g. `type: Sprite.Type;`
            const propRegex = new RegExp(`(\\n\\t\\t(?:/\\*\\*.*?\\*/\\n\\t\\t)?)${prop.name}:\\s*${prop.type.replace('.', '\\.')};`, 'g');
            newBody = newBody.replace(propRegex, (match, prefix) => {
                if (match.includes('@property')) return match; // already modified
                replacedCount++;
                return `${prefix}@property({ type: cc.Enum(${prop.type}) })\n\t\t${prop.name}: ${prop.type};`;
            });
            
            // what if it's single line jsdoc without \n? It's fine, the regex captures the line before.
        }
        return newBody;
    });
}

fs.writeFileSync(dtsConfigPath, content, 'utf8');
console.log(`Successfully added @property enum decorators to ${replacedCount} properties.`);
