// @ts-nocheck
/**
 * 遮罩（cc.Mask）诊断模块
 *
 * 背景：部分项目在插件面板的 <webview> 中运行时，cc.Mask 遮罩下的子节点会整体消失、
 * 露出底下的白色背景，而在普通浏览器预览中正常。cc.Mask 完全依赖模板缓冲（stencil）：
 *   1. clear 阶段：stencilFunc(NEVER) + failOp=ZERO/REPLACE 清位
 *   2. area  阶段：stencilFunc(NEVER) + failOp=REPLACE 写入形状对应的位
 *   3. 子节点：    stencilFunc(EQUAL, 累计位) 只画在形状内
 * 只要"写入"没发生或"测试位"与"写入位"对不上，子节点就会被整体裁掉，露出父级白底。
 *
 * 本模块只做旁路观测（所有 GL 包装都是原样透传），不会修改任何渲染状态：
 *   - 记录 WebGL 上下文真实属性（stencil / STENCIL_BITS）与上下文的来源，判断是否有人抢跑
 *     创建了无模板缓冲的上下文；
 *   - 统计每帧 stencil 调用，并在"场景里有 Mask 但一帧内没有任何 stencil 调用"时告警；
 *   - 遍历场景导出每个 Mask 的类型 / inverted / alphaThreshold / 材质完整性 / 贴图匹配情况；
 *   - 暴露 window.__mcpMaskDiag() 手动取完整报告（游戏 DevTools 控制台可直接执行）。
 */

import { getCcEngine } from './engine-helper';
import { Logger } from './logger';

const FRAME_TRACE_LIMIT = 240;

const DS_FUNC_NAMES: any = {
    512: 'NEVER',
    513: 'LESS',
    514: 'EQUAL',
    515: 'LEQUAL',
    516: 'GREATER',
    517: 'NOTEQUAL',
    518: 'GEQUAL',
    519: 'ALWAYS',
};

const STENCIL_OP_NAMES: any = {
    0: 'ZERO',
    7680: 'KEEP',
    7681: 'REPLACE',
    7682: 'INCR',
    7683: 'DECR',
    5386: 'INVERT',
    34055: 'INCR_WRAP',
    34056: 'DECR_WRAP',
};

// gfx 枚举（注意与 GL 常量不同：gfx 里 DISABLE=0 / ENABLE=1 / INHERIT=2）
const GFX_STENCIL_TEST_NAMES: any = { 0: 'DISABLE', 1: 'ENABLE', 2: 'INHERIT' };

const MASK_TYPE_NAMES: any = { 0: 'RECT', 1: 'ELLIPSE', 2: 'IMAGE_STENCIL' };

const RENDER_COMP_KEYWORDS = [
    'Sprite', 'Label', 'RichText', 'Graphics', 'Skeleton', 'Particle',
    'Mesh', 'MotionStreak', 'DragonBones', 'Tiled', 'VideoPlayer', 'WebView',
];

interface DiagState {
    gl: any;
    glSource: string;
    hooked: boolean;
    backup: any;
    frames: number;
    frameStamp: number;
    opsThisFrame: number;
    opsLastFrame: number;
    opsTotal: number;
    framesWithOps: number;
    traces: any[];
    lastFrameTraces: any[];
    directorBound: boolean;
}

const state: DiagState = {
    gl: null,
    glSource: 'unknown',
    hooked: false,
    backup: null,
    frames: 0,
    frameStamp: 0,
    opsThisFrame: 0,
    opsLastFrame: 0,
    opsTotal: 0,
    framesWithOps: 0,
    traces: [],
    lastFrameTraces: [],
    directorBound: false,
};

function safe(fn: any, fallback: any = null) {
    try { return fn(); } catch (e) { return fallback; }
}

function getEngine() {
    return safe(() => getCcEngine(), null);
}

function fmtFunc(v: any) {
    return DS_FUNC_NAMES[v] !== undefined ? DS_FUNC_NAMES[v] : String(v);
}

function fmtOp(v: any) {
    return STENCIL_OP_NAMES[v] !== undefined ? STENCIL_OP_NAMES[v] : String(v);
}

function getStore(): any {
    return safe(() => (window.__mcpMaskDiagState = state), state);
}

function pushTrace(entry: any) {
    state.traces.push(entry);
    if (state.traces.length > FRAME_TRACE_LIMIT) state.traces.shift();
}

/**
 * 在引擎真实上下文上安装只读的 stencil 旁路记录器。
 * 所有函数均为原样透传，唯一副作用是计数器与环形缓冲。
 */
export function installMaskDiagnostics(gl: any, source?: string) {
    if (!gl || state.hooked || state.gl === gl) return;
    state.gl = gl;
    state.glSource = source || (() => {
        try {
            const ccEng = getEngine();
            if (ccEng && ccEng.game && ccEng.game._renderContext === gl) return 'cc.game._renderContext';
            if (window.__mcpGLContext === gl) return 'getContext-capture';
        } catch (e) { }
        return 'unknown';
    })();
    state.hooked = true;

    const backup: any = {};
    const wrap = (name: string, recorder?: (args: any[]) => any) => {
        const original = gl[name];
        if (typeof original !== 'function') return;
        backup[name] = original;
        gl[name] = function (...args: any[]) {
            if (recorder) {
                try { recorder(args); } catch (e) { }
                state.opsThisFrame++;
                state.opsTotal++;
            }
            return original.apply(this, args);
        };
    };

    const record = (name: string, args: any[], detail: string) => {
        const entry = {
            f: state.frameStamp,
            t: Math.round(performance.now()),
            c: name,
            d: detail,
        };
        pushTrace(entry);
    };

    wrap('stencilFunc', (args) => record('stencilFunc', args, `func=${fmtFunc(args[0])} ref=${args[1]} mask=${args[2]}`));
    wrap('stencilFuncSeparate', (args) => record('stencilFuncSeparate', args, `face=${args[0]} func=${fmtFunc(args[1])} ref=${args[2]} mask=${args[3]}`));
    wrap('stencilOp', (args) => record('stencilOp', args, `fail=${fmtOp(args[0])} zfail=${fmtOp(args[1])} zpass=${fmtOp(args[2])}`));
    wrap('stencilOpSeparate', (args) => record('stencilOpSeparate', args, `face=${args[0]} fail=${fmtOp(args[1])} zfail=${fmtOp(args[2])} zpass=${fmtOp(args[3])}`));
    wrap('stencilMask', (args) => record('stencilMask', args, `mask=${args[0]}`));
    wrap('stencilMaskSeparate', (args) => record('stencilMaskSeparate', args, `face=${args[0]} mask=${args[1]}`));
    wrap('clearStencil', (args) => record('clearStencil', args, `s=${args[0]}`));

    // enable / disable 只在 STENCIL_TEST 上计数，避免污染 trace
    const STENCIL_TEST = gl.STENCIL_TEST;
    const originalEnable = gl.enable;
    if (typeof originalEnable === 'function') {
        backup.enable = originalEnable;
        gl.enable = function (cap: any) {
            if (cap === STENCIL_TEST) {
                state.opsThisFrame++;
                state.opsTotal++;
                pushTrace({ f: state.frameStamp, t: Math.round(performance.now()), c: 'enable', d: 'STENCIL_TEST' });
            }
            return originalEnable.apply(this, arguments);
        };
    }
    const originalDisable = gl.disable;
    if (typeof originalDisable === 'function') {
        backup.disable = originalDisable;
        gl.disable = function (cap: any) {
            if (cap === STENCIL_TEST) {
                state.opsThisFrame++;
                state.opsTotal++;
                pushTrace({ f: state.frameStamp, t: Math.round(performance.now()), c: 'disable', d: 'STENCIL_TEST' });
            }
            return originalDisable.apply(this, arguments);
        };
    }
    const originalClear = gl.clear;
    if (typeof originalClear === 'function') {
        backup.clear = originalClear;
        const STENCIL_BUFFER_BIT = gl.STENCIL_BUFFER_BIT;
        gl.clear = function (bits: any) {
            // 帧首清屏也会带 STENCIL_BUFFER_BIT，只进 trace 不计数，避免掩盖"整帧没有遮罩批次"的告警
            if (bits & STENCIL_BUFFER_BIT) {
                pushTrace({ f: state.frameStamp, t: Math.round(performance.now()), c: 'clear', d: 'STENCIL_BUFFER_BIT' });
            }
            return originalClear.apply(this, arguments);
        };
    }

    state.backup = backup;
    try {
        window.__mcpGLStencilRecorder = { state, backup };
        Logger.log('[McpMaskDiag] stencil 旁路记录器已挂载（只读透传，不改渲染状态）');
    } catch (e) { }
}

/** 还原 stencil 记录器（A/B 排查用，不影响 profiler 的统计 Hook） */
export function restoreMaskDiagnostics() {
    if (!state.hooked || !state.gl || !state.backup) return false;
    const gl = state.gl;
    Object.keys(state.backup).forEach((name) => {
        try { gl[name] = state.backup[name]; } catch (e) { }
    });
    state.backup = null;
    state.hooked = false;
    Logger.log('[McpMaskDiag] stencil 旁路记录器已还原');
    return true;
}

function bindDirectorFrames() {
    if (state.directorBound) return;
    const eng = getEngine();
    if (!eng || !eng.director || !eng.Director) return;
    state.directorBound = true;
    safe(() => {
        eng.director.on(eng.Director.EVENT_BEFORE_DRAW, () => {
            state.opsLastFrame = state.opsThisFrame;
            if (state.opsLastFrame > 0) {
                state.framesWithOps++;
                state.lastFrameTraces = state.traces.filter((t) => t.f === state.frameStamp);
            }
            state.opsThisFrame = 0;
            state.frameStamp++;
            state.frames++;
            // 只保留最近两帧的 trace，避免无限增长
            if (state.traces.length > FRAME_TRACE_LIMIT / 2) {
                state.traces = state.traces.slice(-Math.floor(FRAME_TRACE_LIMIT / 2));
            }
        });
    });
}

function componentClassName(comp: any) {
    const eng = getEngine();
    let name = '';
    if (eng && eng.js && typeof eng.js.getClassName === 'function') {
        name = safe(() => eng.js.getClassName(comp), '') || '';
    }
    if (!name) name = comp && (comp.name || (comp.constructor && comp.constructor.name)) || '';
    const m = String(name).match(/<(.+)>/);
    return m ? m[1] : String(name);
}

function isMaskComponent(comp: any) {
    if (!comp) return false;
    const eng = getEngine();
    if (eng && eng.Mask && safe(() => comp instanceof eng.Mask, false)) return true;
    return componentClassName(comp).indexOf('Mask') !== -1;
}

function isRenderComponent(comp: any) {
    const name = componentClassName(comp);
    if (!name) return false;
    for (let i = 0; i < RENDER_COMP_KEYWORDS.length; i++) {
        if (name.indexOf(RENDER_COMP_KEYWORDS[i]) !== -1) return true;
    }
    return false;
}

function getMaskType(mask: any) {
    const eng = getEngine();
    const typeMap = eng && eng.Mask && eng.Mask.Type ? eng.Mask.Type : null;
    const value = safe(() => mask.type, undefined);
    let name = MASK_TYPE_NAMES[value] || String(value);
    if (typeMap) {
        for (const key in typeMap) {
            if (typeMap[key] === value) { name = key; break; }
        }
    }
    return { value, name };
}

function readPassStencil(material: any) {
    return safe(() => {
        if (!material) return null;
        const rendererMat = material.effect || material._effect || material;
        const passes = rendererMat && (rendererMat._passes || rendererMat.passes);
        const pass = passes && passes[0];
        if (!pass) return null;
        return {
            test: GFX_STENCIL_TEST_NAMES[pass._stencilTest] || String(pass._stencilTest),
            func: fmtFunc(pass._stencilFuncFront),
            ref: pass._stencilRefFront,
            readMask: pass._stencilMaskFront,
            writeMask: pass._stencilWriteMaskFront,
            failOp: fmtOp(pass._stencilFailOpFront),
            zFailOp: fmtOp(pass._stencilZFailOpFront),
            zPassOp: fmtOp(pass._stencilZPassOpFront),
        };
    }, null);
}

function getSpriteFrameTextures(spriteFrame: any) {
    const eng = getEngine();
    return safe(() => {
        if (!spriteFrame) return null;
        const tex = spriteFrame.getTexture ? spriteFrame.getTexture() : spriteFrame._texture;
        const info: any = {
            loaded: typeof spriteFrame.textureLoaded === 'function' ? !!spriteFrame.textureLoaded() : null,
            uuid: spriteFrame._uuid || spriteFrame.uuid || '',
            name: spriteFrame.name || spriteFrame._name || '',
            texture: null,
        };
        if (tex) {
            info.texture = {
                uuid: tex._uuid || tex.uuid || '',
                name: tex.name || tex._name || '',
                width: tex.width || 0,
                height: tex.height || 0,
                isDynamicAtlas: !!tex._isDynamicAtlas,
                isRenderTexture: !!(eng && eng.RenderTexture && safe(() => tex instanceof eng.RenderTexture, false)),
            };
        }
        return info;
    }, null);
}

function countDescendantRenderComponents(node: any, limit = 500) {
    let count = 0;
    let visited = 0;
    const walk = (n: any) => {
        if (!n || visited >= limit) return;
        visited++;
        const comps = n._components || [];
        for (let i = 0; i < comps.length; i++) {
            if (isRenderComponent(comps[i])) { count++; break; }
        }
        const children = n.children || [];
        for (let i = 0; i < children.length; i++) walk(children[i]);
    };
    walk(node);
    return count;
}

function buildNodePath(node: any) {
    const names = [];
    let cur = node;
    let guard = 0;
    while (cur && cur.name && guard < 40) {
        names.unshift(cur.name);
        cur = cur.parent;
        guard++;
    }
    return names.join('/');
}

function collectMasks() {
    const eng = getEngine();
    const scene = safe(() => eng.director.getScene(), null);
    if (!scene) return [];
    const result = [];
    const walk = (node: any, parentMaskDepth: number) => {
        if (!node || node.isValid === false) return;
        const comps = node._components || [];
        let maskComp: any = null;
        for (let i = 0; i < comps.length; i++) {
            if (isMaskComponent(comps[i])) { maskComp = comps[i]; break; }
        }
        if (maskComp) {
            const type = getMaskType(maskComp);
            const spriteFrame = safe(() => maskComp.spriteFrame, null);
            const sfTextures = getSpriteFrameTextures(spriteFrame);
            const mainMaterial = safe(() => (maskComp._materials && maskComp._materials[0]) || null, null);
            const enableMaterial = safe(() => maskComp._enableMaterial || null, null);
            const clearMaterial = safe(() => maskComp._clearMaterial || null, null);
            const exitMaterial = safe(() => maskComp._exitMaterial || null, null);

            let textureMatches = null;
            if (type.name === 'IMAGE_STENCIL' && spriteFrame) {
                const expected = safe(() => spriteFrame.getTexture(), null);
                const actual = safe(() => mainMaterial && mainMaterial.getProperty && mainMaterial.getProperty('texture'), null);
                if (expected && actual) {
                    const a = expected._uuid || expected.uuid || expected.id;
                    const b = actual._uuid || actual.uuid || actual.id;
                    textureMatches = !!(a && b && a === b);
                }
            }

            const sameNodeRenderComps = [];
            for (let i = 0; i < comps.length; i++) {
                if (comps[i] !== maskComp && isRenderComponent(comps[i])) sameNodeRenderComps.push(componentClassName(comps[i]));
            }

            const cameras = eng && eng.Camera && eng.Camera.cameras ? eng.Camera.cameras : [];
            let renderedByCamera = null;
            if (cameras && cameras.length) {
                const group = safe(() => node.groupIndex, 0) || 0;
                renderedByCamera = false;
                for (let c = 0; c < cameras.length; c++) {
                    const cam = cameras[c];
                    if (!cam || cam.enabled === false) continue;
                    if (((cam.cullingMask >>> 0) & (1 << group)) !== 0) { renderedByCamera = true; break; }
                }
            }

            result.push({
                path: buildNodePath(node),
                uuid: safe(() => node.uuid, '') || '',
                active: safe(() => node.active !== false, null),
                activeInHierarchy: safe(() => node.activeInHierarchy !== false, null),
                enabled: safe(() => maskComp.enabled !== false, null),
                type: type.name,
                typeValue: type.value,
                inverted: safe(() => !!maskComp.inverted, false),
                alphaThreshold: safe(() => maskComp.alphaThreshold, null),
                nestingDepth: parentMaskDepth + 1,
                groupIndex: safe(() => node.groupIndex, null),
                renderedByCamera,
                spriteFrame: sfTextures,
                maskTextureMatchesSpriteFrame: textureMatches,
                materials: {
                    main: !!mainMaterial,
                    enable: !!enableMaterial,
                    exit: !!exitMaterial,
                    clear: !!clearMaterial,
                },
                stencil: {
                    main: readPassStencil(mainMaterial),
                    enable: readPassStencil(enableMaterial),
                    clear: readPassStencil(clearMaterial),
                },
                sameNodeRenderComponents: sameNodeRenderComps,
                descendantRenderComponents: countDescendantRenderComponents(node),
            });
        }
        const children = node.children || [];
        for (let i = 0; i < children.length; i++) {
            walk(children[i], maskComp ? parentMaskDepth + 1 : parentMaskDepth);
        }
    };
    walk(scene, 0);
    return result;
}

function decodeStencilTrace(traces: any[]) {
    // 把一帧内的调用序列压缩成可读的"遮罩批次"摘要：
    // write 批次（NEVER + ZERO/REPLACE 的位操作）与最后的测试位（EQUAL）
    const writes = [];
    let lastTest = null;
    let enabled = null;
    for (let i = 0; i < traces.length; i++) {
        const t = traces[i];
        if (t.c === 'enable' || t.c === 'disable') {
            enabled = t.c === 'enable';
            continue;
        }
        if (t.c === 'stencilFunc' || t.c === 'stencilFuncSeparate') {
            const func = t.c === 'stencilFunc' ? t.d.match(/func=(\w+)/) : t.d.match(/func=(\w+)/);
            const ref = t.d.match(/ref=(-?\d+)/);
            const mask = t.d.match(/mask=(-?\d+)/);
            const funcName = func ? func[1] : '';
            if (funcName === 'NEVER' && ref && mask) {
                writes.push({ func: funcName, ref: Number(ref[1]), mask: Number(mask[1]) });
            } else if (funcName === 'EQUAL' && ref && mask) {
                lastTest = { func: funcName, ref: Number(ref[1]), mask: Number(mask[1]) };
            }
            continue;
        }
        if (t.c === 'stencilOp' || t.c === 'stencilOpSeparate') {
            const fail = t.d.match(/fail=(\w+)/);
            if (fail && writes.length) writes[writes.length - 1].failOp = fail[1];
        }
    }
    let refMatch = null;
    if (lastTest && writes.length) {
        let written = 0;
        for (let i = 0; i < writes.length; i++) {
            if (writes[i].failOp === 'REPLACE') written |= (writes[i].ref & writes[i].mask);
            else if (writes[i].failOp === 'ZERO') written &= ~((writes[i].ref & writes[i].mask) >>> 0);
        }
        refMatch = ((lastTest.ref & lastTest.mask) === (written & lastTest.mask));
    }
    return { enabled, writes, lastTest, refMatch };
}

export function collectMaskReport() {
    const eng = getEngine();
    const gl = state.gl || safe(() => eng.game._renderContext, null);
    const masks = collectMasks();
    const attrs = safe(() => (gl && gl.getContextAttributes ? gl.getContextAttributes() : null), null);
    const stencilBits = safe(() => (gl ? gl.getParameter(gl.STENCIL_BITS) : null), null);
    const depthBits = safe(() => (gl ? gl.getParameter(gl.DEPTH_BITS) : null), null);
    const contextLost = safe(() => (gl && gl.isContextLost ? gl.isContextLost() : null), null);
    const renderType = safe(() => eng.game.renderType, null);
    const webglRenderType = safe(() => eng.game.RENDER_TYPE_WEBGL, 1);

    const probeInfo = safe(() => window.__mcpGLContextInfo || null, null);
    const lastFrame = state.lastFrameTraces && state.lastFrameTraces.length ? state.lastFrameTraces : state.traces;
    const lastFrameTrace = lastFrame.slice(-80).map((t: any) => `f${t.f} ${t.c} ${t.d}`);
    const decoded = decodeStencilTrace(lastFrame);
    const warnings: string[] = [];

    if (eng && renderType !== null && webglRenderType !== null && renderType !== webglRenderType) {
        warnings.push(`引擎当前不是 WebGL 渲染模式（renderType=${renderType}），cc.Mask 在 Canvas 模式下不受支持`);
    }
    if (attrs && attrs.stencil === false) {
        warnings.push('WebGL 上下文的 stencil 属性为 false：模板缓冲缺失，cc.Mask 会失效（注意：无模板缓冲时 clear-stencil 的全屏白色矩形会通过模板测试，可能整片刷白）');
    }
    if (stencilBits === 0) {
        warnings.push('gl.getParameter(STENCIL_BITS) = 0：当前帧缓冲没有模板位，cc.Mask 无法工作');
    }
    if (stencilBits !== null && stencilBits > 0 && stencilBits < 8 && masks.length) {
        warnings.push(`STENCIL_BITS=${stencilBits}（引擎按 8 层遮罩设计），嵌套遮罩超过 ${stencilBits} 层会裁剪异常`);
    }
    if (contextLost) warnings.push('WebGL 上下文已丢失（isContextLost=true），所有遮罩状态都会失效');
    if (masks.length && state.frames > 30 && state.opsTotal === 0) {
        warnings.push(`场景中存在 ${masks.length} 个 Mask，但从未观察到任何 stencil 调用（遮罩可能没有走模板路径）`);
    } else if (masks.length && state.frames > 30 && state.opsLastFrame === 0) {
        warnings.push(`场景中存在 ${masks.length} 个 Mask，但上一帧没有任何 stencil 调用（遮罩可能被跳过/未渲染）`);
    }
    if (decoded.lastTest && decoded.writes.length && decoded.refMatch === false) {
        warnings.push(`疑似遮罩写入位与测试位不匹配：最后测试 ref=${decoded.lastTest.ref}/mask=${decoded.lastTest.mask}，` +
            `写入批次=${JSON.stringify(decoded.writes)}。这会让遮罩子节点整体被裁掉，露出父级底色`);
    }
    masks.forEach((m: any) => {
        if (!m.materials.main || !m.materials.enable || !m.materials.clear) {
            warnings.push(`[${m.path}] Mask 材质不完整（main/enable/clear=${m.materials.main}/${m.materials.enable}/${m.materials.clear}），会触发 Error 9000 类问题`);
        }
        if (m.type === 'IMAGE_STENCIL') {
            if (!m.spriteFrame || !m.spriteFrame.texture) {
                warnings.push(`[${m.path}] IMAGE_STENCIL 遮罩没有 spriteFrame/贴图，stencil 形状不会被写入`);
            } else if (m.spriteFrame.loaded === false) {
                warnings.push(`[${m.path}] IMAGE_STENCIL 遮罩贴图尚未加载完成（textureLoaded=false）`);
            }
            if (m.maskTextureMatchesSpriteFrame === false) {
                warnings.push(`[${m.path}] 遮罩材质上的贴图与 spriteFrame 当前贴图不一致（动态图集重打包后材质未刷新）`);
            }
        }
        if (m.sameNodeRenderComponents.length) {
            warnings.push(`[${m.path}] Mask 与渲染组件挂在同一节点（${m.sameNodeRenderComponents.join(',')}），官方限制会导致遮罩区域显示为白底`);
        }
        if (m.renderedByCamera === false) {
            warnings.push(`[${m.path}] 没有任何启用的相机 cullingMask 包含该节点分组（groupIndex=${m.groupIndex}），其子节点不会被绘制`);
        }
        if (m.activeInHierarchy === false) {
            warnings.push(`[${m.path}] Mask 节点在层级中未激活（activeInHierarchy=false）`);
        }
    });

    return {
        generatedAt: new Date().toISOString(),
        engine: {
            version: safe(() => eng.ENGINE_VERSION, null),
            renderType,
            webglRenderType,
            isWebGL: renderType !== null && webglRenderType !== null ? renderType === webglRenderType : null,
            maskClassPresent: !!(eng && eng.Mask),
        },
        context: {
            attributes: attrs,
            stencilBits,
            depthBits,
            contextLost,
            versionString: safe(() => (gl ? gl.getParameter(gl.VERSION) : null), null),
            rendererString: safe(() => (gl ? gl.getParameter(gl.RENDERER) : null), null),
            probeSource: state.glSource || safe(() => window.__mcpGLContextSource || (probeInfo && probeInfo.source) || 'unknown', 'unknown'),
            capturedByProbe: probeInfo,
            hookedByProbe: state.hooked,
        },
        stencil: {
            framesObserved: state.frames,
            opsTotal: state.opsTotal,
            opsLastFrame: state.opsLastFrame,
            framesWithOps: state.framesWithOps,
            lastFrameDecoded: decoded,
            lastFrameTrace,
        },
        masks,
        warnings,
    };
}

export function formatMaskReport(report: any) {
    const lines: string[] = [];
    lines.push('==================== 遮罩(Mask)诊断报告 ====================');
    lines.push(`生成时间: ${report.generatedAt}`);
    const e = report.engine || {};
    lines.push(`引擎: ${e.version || '?'} | renderType=${e.renderType} | WebGL模式=${e.isWebGL} | cc.Mask=${e.maskClassPresent}`);
    const c = report.context || {};
    const attrs = c.attributes || {};
    lines.push(`上下文: ${c.probeSource} | stencil属性=${attrs.stencil} | STENCIL_BITS=${c.stencilBits} | DEPTH_BITS=${c.depthBits} | lost=${c.contextLost}`);
    lines.push(`渲染器: ${c.rendererString} | ${c.versionString}`);
    if (c.capturedByProbe) {
        lines.push(`上下文捕获: type=${c.capturedByProbe.type} canvas=#${c.capturedByProbe.canvasId} size=${c.capturedByProbe.canvasSize} 请求属性=${JSON.stringify(c.capturedByProbe.attrs)}`);
    }
    const s = report.stencil || {};
    lines.push(`stencil 调用: 总计=${s.opsTotal} 上一帧=${s.opsLastFrame} 有调用的帧数=${s.framesWithOps}/${s.framesObserved}`);
    const d = s.lastFrameDecoded || {};
    if (d.lastTest) {
        lines.push(`一帧解码: 测试=${d.lastTest.func}(ref=${d.lastTest.ref},mask=${d.lastTest.mask}) 写入批次=${JSON.stringify(d.writes)} 位匹配=${d.refMatch}`);
    }
    lines.push(`Mask 数量: ${report.masks.length}`);
    report.masks.forEach((m: any, idx: number) => {
        lines.push(`  [${idx}] ${m.path}`);
        lines.push(`      类型=${m.type} inverted=${m.inverted} alphaThreshold=${m.alphaThreshold} 嵌套层=${m.nestingDepth} active=${m.active}/${m.activeInHierarchy} enabled=${m.enabled} group=${m.groupIndex} 相机可见=${m.renderedByCamera}`);
        lines.push(`      材质 main/enable/exit/clear=${m.materials.main}/${m.materials.enable}/${m.materials.exit}/${m.materials.clear} | 同节点渲染组件=${m.sameNodeRenderComponents.length ? m.sameNodeRenderComponents.join(',') : '无'} | 子树渲染组件=${m.descendantRenderComponents}`);
        if (m.spriteFrame) {
            lines.push(`      spriteFrame=${m.spriteFrame.name || m.spriteFrame.uuid} loaded=${m.spriteFrame.loaded} texture=${m.spriteFrame.texture ? (m.spriteFrame.texture.name || m.spriteFrame.texture.uuid) + ' ' + m.spriteFrame.texture.width + 'x' + m.spriteFrame.texture.height + ' atlas=' + m.spriteFrame.texture.isDynamicAtlas + ' rt=' + m.spriteFrame.texture.isRenderTexture : 'null'} 贴图一致=${m.maskTextureMatchesSpriteFrame}`);
        }
        if (m.stencil && m.stencil.enable) {
            const st = m.stencil.enable;
            lines.push(`      enable材质模板: test=${st.test} func=${st.func} ref=${st.ref} readMask=${st.readMask} writeMask=${st.writeMask} ops=${st.failOp}/${st.zFailOp}/${st.zPassOp}`);
        }
    });
    if (s.lastFrameTrace && s.lastFrameTrace.length) {
        lines.push('上一帧 stencil 调用序列:');
        s.lastFrameTrace.forEach((t: string) => lines.push(`  ${t}`));
    }
    if (report.warnings.length) {
        lines.push('⚠ 告警:');
        report.warnings.forEach((w: string) => lines.push(`  - ${w}`));
    } else {
        lines.push('未发现模板缓冲/材质层面的硬性异常。若画面仍然异常，请对比普通浏览器预览，并对同一场景执行 __mcpMaskDiag() 比对报告。');
    }
    lines.push('===========================================================');
    return lines.join('\n');
}

/**
 * 初始化：只做静默准备（绑定帧事件 + 挂载 stencil 旁路记录器），默认不向控制台输出任何日志。
 * 诊断报告仅在显式调用 __mcpMaskDiag() 时输出。
 * 注意：绝不主动调用 canvas.getContext()，避免抢在引擎之前用默认属性（stencil:false）创建上下文。
 */
export function initMaskDiagnostics() {
    safe(() => getStore());
    // 静默轮询：绑定 director 帧事件 + 挂载只读 stencil 记录器
    const timer = setInterval(() => {
        safe(() => bindDirectorFrames());
        const eng = getEngine();
        if (eng && eng.director && !state.gl) {
            const gl = safe(() => (window.__mcpGLContext || (eng.game && eng.game._renderContext)), null);
            if (gl) installMaskDiagnostics(gl);
        }
    }, 1000);
    // 30 秒后停止主动轮询（已挂载的记录器与手动接口继续可用）
    setTimeout(() => {
        try { clearInterval(timer); } catch (e) { }
    }, 30000);

    safe(() => {
        window.__mcpMaskDiag = function (print = true) {
            const report = collectMaskReport();
            if (print) {
                try { console.log('[McpMaskDiag]\n' + formatMaskReport(report)); } catch (e) { }
            }
            return JSON.stringify(report);
        };
        window.__mcpMaskDiagRestore = restoreMaskDiagnostics;
        window.__mcpMaskDiagHelp = function () {
            console.log('[McpMaskDiag] 可用命令：\n' +
                '  __mcpMaskDiag()        - 打印并返回完整遮罩诊断报告(JSON)\n' +
                '  __mcpDisableGLHooks()  - 还原本插件全部 WebGL Hook（A/B 排查）\n' +
                '  __mcpGLHookStatus()    - 查看 Hook 状态\n' +
                '  __mcpMaskDiagRestore() - 仅还原 stencil 旁路记录器');
        };
    });
}
