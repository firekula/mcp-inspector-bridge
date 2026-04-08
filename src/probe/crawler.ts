// @ts-nocheck
import { Logger } from './logger';
import { syncNodeTree } from './crawler-serialize';

function initVisualFeedbackStyle() {
    if (document.getElementById('__mcp_simulate_style')) return;
    const style = document.createElement('style');
    style.id = '__mcp_simulate_style';
    style.textContent = `
    .mcp-visual-base {
        position: fixed;
        pointer-events: none;
        z-index: 2147483647;
        transform: translate(-50%, -50%);
    }
    .mcp-visual-click {
        width: 20px; height: 20px;
        border: 2px solid rgba(255, 0, 0, 0.8);
        border-radius: 50%;
        animation: mcp-ripple 0.5s ease-out forwards;
    }
    .mcp-visual-click::after, .mcp-visual-click::before {
        content: ""; position: absolute; background: rgba(255, 0, 0, 0.8);
    }
    .mcp-visual-click::before { top: 50%; left: -5px; right: -5px; height: 1px; }
    .mcp-visual-click::after { left: 50%; top: -5px; bottom: -5px; width: 1px; }
    
    .mcp-visual-long-press {
        width: 40px; height: 40px;
        border-radius: 50%;
        border: 4px solid rgba(255, 165, 0, 0.3);
        border-top-color: rgba(255, 165, 0, 1);
        animation: mcp-spin linear forwards;
    }
    .mcp-visual-swipe {
        width: 16px; height: 16px;
        background-color: rgba(0, 150, 255, 0.8);
        border-radius: 50%;
        box-shadow: 0 0 8px rgba(0, 150, 255, 1);
    }
    @keyframes mcp-ripple {
        0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; }
    }
    @keyframes mcp-spin {
        0% { transform: translate(-50%, -50%) rotate(0deg); }
        100% { transform: translate(-50%, -50%) rotate(360deg); }
    }
    `;
    if (document.head) {
        document.head.appendChild(style);
    } else {
        document.body.appendChild(style);
    }
}

export function initCrawler() {
    window.__mcpCrawler = {
        findNodeByUuid: function (uuid, root) {
            const eng = window.cc;
            if (!eng || !eng.director) return null;
            const startNode = root || eng.director.getScene();
            if (!startNode) return null;
            if (startNode.uuid === uuid || startNode.id === uuid) return startNode;
            for (let i = 0; i < startNode.childrenCount; i++) {
                const found = this.findNodeByUuid(uuid, startNode.children[i]);
                if (found) return found;
            }
            return null;
        },
        getNodeDetail: function (uuid) {
            const node = this.findNodeByUuid(uuid);
            if (!node) return null;

            if (typeof window.cc !== 'undefined' && node instanceof window.cc.Scene) {
                return {
                    id: node.uuid || node.id,
                    name: node.name,
                    isScene: true,
                    active: true,
                    components: [],
                };
            }

            let isActive = true;
            try { isActive = node.active !== false; } catch(e) {}

            let prefabUuid = null;
            try {
                if (node._prefab) {
                    if (node._prefab.asset) {
                        prefabUuid = node._prefab.asset._uuid || node._prefab.asset.uuid || node._prefab.asset.id;
                    }
                    if (!prefabUuid && node._prefab.fileId) {
                        prefabUuid = node._prefab.fileId;
                    }
                    if (!prefabUuid && node._prefab._prefab) {
                        prefabUuid = node._prefab._prefab._uuid || node._prefab._prefab.uuid;
                    }
                    if (!prefabUuid) {
                        var cur = node;
                        while (cur) {
                            if (cur._prefab && cur._prefab.root === cur && cur._prefab.asset) {
                                prefabUuid = cur._prefab.asset._uuid || cur._prefab.asset.uuid || cur._prefab.asset.id;
                                break;
                            }
                            cur = cur.parent;
                        }
                    }
                }
            } catch (e) {}

            let sx = 1, sy = 1;
            if ('scale' in node && typeof node.scale === 'object' && 'x' in node.scale) {
                sx = node.scale.x !== undefined ? node.scale.x : 1;
                sy = node.scale.y !== undefined ? node.scale.y : 1;
            } else {
                sx = node.scaleX !== undefined ? node.scaleX : 1;
                sy = node.scaleY !== undefined ? node.scaleY : 1;
            }

            const detail = {
                id: node.uuid || node.id,
                name: node.name,
                isScene: false,
                prefabUuid: prefabUuid,
                active: isActive,
                x: node.x !== undefined ? node.x : 0,
                y: node.y !== undefined ? node.y : 0,
                worldPolygon: this.getNodeWorldPolygon(node),
                interactable: (window.cc && window.cc.Button && node.getComponent(window.cc.Button)) ? node.getComponent(window.cc.Button).interactable : null,
                hasAngle: ('angle' in node),
                rotation: ('angle' in node) ? -node.angle : (node.rotation !== undefined ? node.rotation : 0),
                scaleX: sx,
                scaleY: sy,
                width: node.width !== undefined ? node.width : 0,
                height: node.height !== undefined ? node.height : 0,
                anchorX: node.anchorX !== undefined ? node.anchorX : 0.5,
                anchorY: node.anchorY !== undefined ? node.anchorY : 0.5,
                color: node.color ? '#' + node.color.toHEX() : '#ffffff',
                opacity: node.opacity !== undefined ? node.opacity : 255,
                skewX: node.skewX || 0,
                skewY: node.skewY || 0,
                groupIndex: node.groupIndex !== undefined ? node.groupIndex : 0,
                groupList: window.cc && window.cc.game ? window.cc.game.groupList : null,
                components: [],
            };

            if (node._components) {
                for (let i = 0; i < node._components.length; i++) {
                    const comp = node._components[i];
                    let cname = comp.name || comp.__classname__ || "UnknownComponent";
                    const match = cname.match(/<([^>]+)>/);
                    if (match) cname = match[1];
                    const props = [];

                    let propKeys = [];
                    if (comp.constructor && Array.isArray(comp.constructor.__props__)) {
                        propKeys = comp.constructor.__props__;
                    } else {
                        propKeys = Object.keys(comp);
                    }

                    const hiddenBuiltins = ["name", "uuid", "node", "enabled", "enabledInHierarchy", "_scriptAsset", "__scriptAsset", "_isOnLoadCalled", "_objFlags"];

                    for (let j = 0; j < propKeys.length; j++) {
                        const key = propKeys[j];
                        try {
                            if (hiddenBuiltins.indexOf(key) !== -1) continue;

                            let isVisible = true;
                            if (comp.constructor && comp.constructor.__attrs__) {
                                const visibleAttr = comp.constructor.__attrs__[key + "|visible"];
                                if (visibleAttr !== undefined) {
                                    isVisible = typeof visibleAttr === "function" ? !!visibleAttr.call(comp) : !!visibleAttr;
                                } else if (key.startsWith("_")) {
                                    isVisible = false;
                                }
                            } else if (key.startsWith("_")) {
                                isVisible = false;
                            }
                            if (!isVisible) continue;

                            const val = comp[key];
                            if (typeof val === "function") continue;

                            let type = "unsupported";
                            let exportValue = val;
                            if (val === null || val === undefined) type = "unsupported";
                            else if (typeof val === "number") type = "number";
                            else if (typeof val === "string") type = "string";
                            else if (typeof val === "boolean") type = "boolean";
                            else if (Array.isArray(val)) {
                                type = "array";
                                exportValue = val.map((item) => {
                                    if (item === null) return "null";
                                    if (item === undefined) return "undefined";
                                    if (typeof item === "number" || typeof item === "string" || typeof item === "boolean") return item;

                                    const eng = window.cc;
                                    if (eng && eng.Node && item instanceof eng.Node) {
                                        return { type: "node_ref", value: { uuid: item.uuid || item.id, name: item.name } };
                                    } else if (eng && eng.Asset && item instanceof eng.Asset) {
                                        let clsName = "cc.Asset";
                                        if (item.__classname__) clsName = item.__classname__;
                                        else if (item.constructor && item.constructor.name) clsName = item.constructor.name;
                                        return { type: "asset_ref", value: { uuid: item._uuid || item.uuid || item.id || "unknown", name: item.name || "Unnamed Asset", className: clsName } };
                                    }

                                    if (item.__classname__ || item.name) return `[${item.__classname__ || "对象"}] ${item.name || ""}`;
                                    return "[复杂对象]";
                                });
                            }
                            else if (typeof val === "object") {
                                const eng = window.cc;
                                if (eng && eng.Node && val instanceof eng.Node) {
                                    type = "node_ref";
                                    exportValue = { uuid: val.uuid || val.id, name: val.name };
                                } else if (eng && eng.Asset && val instanceof eng.Asset) {
                                    type = "asset_ref";
                                    let clsName = "cc.Asset";
                                    if (val.__classname__) clsName = val.__classname__;
                                    else if (val.constructor && val.constructor.name) clsName = val.constructor.name;
                                    exportValue = { uuid: val._uuid || val.uuid || val.id || "unknown", name: val.name || "Unnamed Asset", className: clsName };
                                }
                            }

                            if (type !== "unsupported") {
                                let enumList = null;
                                
                                // Test if component property relies on a Cocos Enum
                                let eList = null;
                                if (window.cc && window.cc.Class && typeof window.cc.Class.attr === 'function') {
                                    const attrObj = window.cc.Class.attr(comp.constructor, key);
                                    if (attrObj && attrObj.enumList) {
                                        eList = attrObj.enumList;
                                    }
                                }
                                if (!eList && comp.constructor && comp.constructor.__attrs__) {
                                    eList = comp.constructor.__attrs__[key + "|enumList"];
                                }
                                
                                if (eList && Array.isArray(eList)) {
                                    // Make sure it contains {name, value} or at least valid items
                                    if (eList.length > 0 && eList[0].name !== undefined && eList[0].value !== undefined) {
                                        enumList = eList;
                                        type = "Enum";
                                    } else {
                                        // Some EnumLists in CC are plain arrays? Convert to {name, value}
                                        enumList = eList.map(e => (typeof e === 'object' ? e : {name: e.toString(), value: e}));
                                        type = "Enum";
                                    }
                                }

                                if (cname === "sp.Skeleton" || cname === "Skeleton") {
                                    if ((key === "animation" || key === "defaultAnimation") && comp.skeletonData) {
                                        try {
                                            const rd = comp.skeletonData.getRuntimeData();
                                            if (rd && rd.animations) enumList = ["<None>"].concat(rd.animations.map((a) => a.name));
                                        } catch (e) { }
                                    } else if (key === "defaultSkin" && comp.skeletonData) {
                                        try {
                                            const rd = comp.skeletonData.getRuntimeData();
                                            if (rd && rd.skins) enumList = rd.skins.map((s) => s.name);
                                        } catch (e) { }
                                    }
                                }
                                const propData = { key, value: exportValue, type };
                                if (enumList) propData.enumList = enumList;
                                props.push(propData);
                            }
                        } catch (e) { }
                    }
                    detail.components.push({
                        name: cname,
                        realIndex: i,
                        enabled: comp.enabled !== false,
                        properties: props,
                    });
                }
            }
            return detail;
        },
        updateNodeProperty: function (uuid, compName, propKey, value, compIndex) {
            const node = this.findNodeByUuid(uuid);
            if (!node || !node.isValid) {
                Logger.warn("[MCP Crawler] Node " + uuid + " is invalid or already destroyed.");
                return false;
            }

            try {
                if (!compName || compName === 'null') {
                    // Update property on the node directly
                    if (propKey === 'rotation' && 'angle' in node) {
                        node.angle = -value;
                    } else if (propKey === 'color' && window.cc && window.cc.Color) {
                        let hex = String(value);
                        if (hex.startsWith('#')) hex = hex.slice(1);
                        let r = parseInt(hex.slice(0, 2), 16) || 0;
                        let g = parseInt(hex.slice(2, 4), 16) || 0;
                        let b = parseInt(hex.slice(4, 6), 16) || 0;
                        node.color = new window.cc.Color(r, g, b, node.color ? node.color.a : 255);
                    } else if (propKey === 'opacity') {
                        node.opacity = Math.max(0, Math.min(255, parseInt(value, 10) || 0));
                    } else if (propKey === 'scaleX' || propKey === 'scaleY') {
                        if ('scale' in node && typeof node.scale === 'object' && 'x' in node.scale) {
                            let vec = node.scale;
                            if (propKey === 'scaleX') vec.x = value;
                            if (propKey === 'scaleY') vec.y = value;
                            node.scale = vec;
                        } else {
                            node[propKey] = value;
                        }
                    } else {
                        node[propKey] = value;
                    }
                    return true;
                } else {
                    // Update property on a specific component
                    if (node._components) {
                        // Use compIndex if valid, otherwise fallback to name searching
                        let targetComp = null;
                        if (compIndex !== undefined && compIndex >= 0 && compIndex < node._components.length) {
                            targetComp = node._components[compIndex];
                        } else {
                            for (let i = 0; i < node._components.length; i++) {
                                const comp = node._components[i];
                                let cname = comp.name || comp.__classname__ || "Unknown";
                                const match = cname.match(/<([^>]+)>/);
                                if (match) cname = match[1];

                                if (cname === compName) {
                                    targetComp = comp;
                                    break;
                                }
                            }
                        }

                        if (targetComp) {
                            targetComp[propKey] = value;
                            if (typeof targetComp.updateAlignment === 'function') {
                                targetComp.updateAlignment();
                            }
                            return true;
                        }
                        Logger.warn("[MCP Crawler] Component " + compName + " not found on node " + node.name);
                        return false;
                    }
                }
            } catch (e) {
                console.error("[MCP Crawler] Exception in updateNodeProperty: ", e);
            }
            return false;
        },

        printComponentData: function (uuid, compIndex) {
            const node = this.findNodeByUuid(uuid);
            if (!node || !node._components || compIndex < 0 || compIndex >= node._components.length) {
                Logger.warn("[MCP Crawler] Target node or component not found for printing.", uuid, compIndex);
                return;
            }

            const comp = node._components[compIndex];
            const eng = window.cc || {};

            function getNodePath(n) {
                if (!n) return '';
                let isValidStr = (n.isValid === false) ? ' (Destroyed)' : '';
                let path = n.name + isValidStr;
                let current = n.parent;
                while (current) {
                    let curValidStr = (current.isValid === false) ? ' (Destroyed)' : '';
                    path = current.name + curValidStr + '/' + path;
                    current = current.parent;
                }
                return path;
            }

            const seen = new WeakSet();
            const replacer = function (key, value) {
                if (value === null || value === undefined) return value;

                // 处理 cc.Node
                if (eng.Node && value instanceof eng.Node) {
                    return `[ cc.Node: ${getNodePath(value)} ]`;
                }

                // 处理 cc.Asset
                if (eng.Asset && value instanceof eng.Asset) {
                    let clsName = "cc.Asset";
                    if (value.__classname__) clsName = value.__classname__;
                    else if (value.constructor && value.constructor.name) clsName = value.constructor.name;
                    return `[ ${clsName}: ${value.name || value._name || 'Unnamed'} ]`;
                }

                if (typeof value === 'object') {
                    if (seen.has(value)) {
                        return "[Circular]";
                    }
                    seen.add(value);
                }

                return value;
            };

            try {
                const jsonStr = JSON.stringify(comp, replacer, 4);
                let compName = comp.name || comp.__classname__ || "Unknown";
                const match = compName.match(/<([^>]+)>/);
                if (match) compName = match[1];

                console.log(`%c[MCP] 组件 (${compName}) 数据导出成功 👇`, 'color: #00ff00; font-weight: bold;');
                console.log(jsonStr);
                console.log(`%c---------------------------------------`, 'color: #00ff00; font-weight: bold;');

                // 尝试写入剪贴板
                if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(jsonStr).catch(function (err) { });
                }
            } catch (err) {
                console.error("[MCP Crawler] 序列化组件数据失败: ", err);
            }
        },

        getNodeWorldPolygon: function (target) {
            const eng = window.cc;
            if (!target || typeof target.convertToWorldSpaceAR !== 'function') return null;
            const width = target.width || 0;
            const height = target.height || 0;
            if (width === 0 && height === 0) return null;

            const ax = target.anchorX !== undefined ? target.anchorX : 0.5;
            const ay = target.anchorY !== undefined ? target.anchorY : 0.5;

            const ptLeft = -ax * width;
            const ptRight = (1 - ax) * width;
            const ptBottom = -ay * height;
            const ptTop = (1 - ay) * height;

            let bl = target.convertToWorldSpaceAR(eng.v2(ptLeft, ptBottom));
            let br = target.convertToWorldSpaceAR(eng.v2(ptRight, ptBottom));
            let tr = target.convertToWorldSpaceAR(eng.v2(ptRight, ptTop));
            let tl = target.convertToWorldSpaceAR(eng.v2(ptLeft, ptTop));

            return [bl, br, tr, tl];
        },

        setHoverTarget: function (uuid) {
            if (window.__mcpHighlightData) {
                window.__mcpHighlightData.hoverId = uuid;
            }
        },

        setSelectionTarget: function (uuid) {
            if (window.__mcpHighlightData) {
                Logger.log(`[Selection-Debug] Trigger: Probe-Crawler-setSelectionTarget | NodeID: ${uuid}`);
                window.__mcpHighlightData.selectId = uuid;
            }
        },
        getSimplifiedNode: function (uuid) {
            const node = this.findNodeByUuid(uuid);
            if (!node || !node.isValid) return null;
            let compNames = [];
            if (node._components) {
                compNames = node._components.map(function(c) {
                    let cname = c.name || c.__classname__ || "Unknown";
                    const m = cname.match(/<([^>]+)>/);
                    return m ? m[1] : cname;
                });
            }
            return {
                name: node.name,
                uuid: node.uuid || node.id,
                active: node.active !== false,
                position: { x: node.x || 0, y: node.y || 0 },
                size: { width: node.width || 0, height: node.height || 0 },
                components: compNames
            };
        },
        simulateInput: function (args) {
            const eng = window.cc;
            if (!eng || !eng.director) return { error: 'ENGINE_NOT_READY' };

            let screenPt = eng.v2(0, 0);
            let targetSource = '';

            if (args && args.uuid) {
                const node = this.findNodeByUuid(args.uuid);
                if (!node || !node.isValid) return { error: 'NODE_NOT_FOUND', msg: 'Node not found or destroyed.' };
                let worldPos = eng.v2(0, 0);
                if (typeof node.convertToWorldSpaceAR === 'function') {
                    worldPos = node.convertToWorldSpaceAR(eng.v2(0, 0));
                }
                
                let camera = null;
                if (eng.Camera && eng.Camera.cameras) {
                    camera = eng.Camera.cameras.sort(function(a, b){ return b.depth - a.depth; })[0];
                }
                screenPt = (camera && typeof camera.getWorldToScreenPoint === 'function') 
                               ? camera.getWorldToScreenPoint(worldPos) : worldPos;
                targetSource = 'UUID ' + args.uuid.substring(0,6) + ' (World ' + Math.round(worldPos.x) + ',' + Math.round(worldPos.y) + ')';
            } else if (args && (args.x !== undefined || args.y !== undefined)) {
                // If AI provides raw x,y, it is assumed strictly as Cocos Screen Coordinates (bottom-left = 0,0)
                screenPt.x = args.x || 0;
                screenPt.y = args.y || 0;
                targetSource = 'Raw ScreenPos (' + screenPt.x + ', ' + screenPt.y + ')';
            } else {
                return { error: 'INVALID_ARGS', msg: 'Please provide either uuid or x/y coordinates' };
            }

            const canvas = document.getElementById('GameCanvas') || document.querySelector('canvas');
            if (!canvas) return { error: 'CANVAS_NOT_FOUND' };
            const rect = canvas.getBoundingClientRect();
            const frameSize = eng.view.getFrameSize();

            const clientX = rect.left + screenPt.x * (rect.width / frameSize.width);
            const clientY = rect.bottom - screenPt.y * (rect.height / frameSize.height);

            function dispatchNativeEvent(type, cx, cy) {
                let dispatched = false;
                try {
                    const evt = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0 });
                    canvas.dispatchEvent(evt);
                    dispatched = true;
                } catch(e) {}

                try {
                    const touchMap = { 'mousedown': 'touchstart', 'mousemove': 'touchmove', 'mouseup': 'touchend' };
                    const tType = touchMap[type];
                    if (tType && typeof Touch !== 'undefined' && typeof TouchEvent !== 'undefined') {
                        const touch = new Touch({ identifier: 0, target: canvas, clientX: cx, clientY: cy });
                        const touchEvt = new TouchEvent(tType, {
                            bubbles: true, cancelable: true, 
                            touches: [touch], targetTouches: [touch], changedTouches: [touch]
                        });
                        canvas.dispatchEvent(touchEvt);
                    }
                } catch(e) {}
            }

            const mode = (args && args.inputType) ? args.inputType : 'click';
            const duration = Math.min((args && args.duration) ? args.duration : 100, 3000);

            try { initVisualFeedbackStyle(); } catch(e) {}

            dispatchNativeEvent('mousedown', clientX, clientY);

            let visualPointer = document.createElement('div');
            visualPointer.className = 'mcp-visual-base';
            visualPointer.style.left = clientX + 'px';
            visualPointer.style.top = clientY + 'px';
            document.body.appendChild(visualPointer);

            if (mode === 'click') {
                visualPointer.className += ' mcp-visual-click';
                setTimeout(function() { dispatchNativeEvent('mouseup', clientX, clientY); }, 50);
                setTimeout(function() { 
                    if(visualPointer && visualPointer.parentNode) visualPointer.parentNode.removeChild(visualPointer); 
                }, 500);
            } else if (mode === 'long_press') {
                visualPointer.className += ' mcp-visual-long-press';
                visualPointer.style.animationDuration = duration + 'ms';
                setTimeout(function() { 
                    dispatchNativeEvent('mouseup', clientX, clientY); 
                    if(visualPointer && visualPointer.parentNode) visualPointer.parentNode.removeChild(visualPointer);
                }, duration);
            } else if (mode === 'swipe') {
                visualPointer.className += ' mcp-visual-swipe';
                const endX = clientX + ((args && args.swipeDeltaX) ? args.swipeDeltaX : 0);
                const endY = clientY - ((args && args.swipeDeltaY) ? args.swipeDeltaY : 0);
                
                let startTime = Date.now();
                function step() {
                    let progress = (Date.now() - startTime) / duration;
                    if (progress >= 1) {
                        visualPointer.style.left = endX + 'px';
                        visualPointer.style.top = endY + 'px';
                        dispatchNativeEvent('mousemove', endX, endY);
                        dispatchNativeEvent('mouseup', endX, endY);
                        if(visualPointer && visualPointer.parentNode) visualPointer.parentNode.removeChild(visualPointer);
                    } else {
                        let curX = clientX + (endX - clientX) * progress;
                        let curY = clientY + (endY - clientY) * progress;
                        visualPointer.style.left = curX + 'px';
                        visualPointer.style.top = curY + 'px';
                        dispatchNativeEvent('mousemove', curX, curY);
                        requestAnimationFrame(step);
                    }
                }
                requestAnimationFrame(step);
            }

            return { success: true, msg: 'Simulated ' + mode + ' from ' + targetSource + ' -> Screen DOM (' + Math.round(clientX) + 'px, ' + Math.round(clientY) + 'px)' };
        }
    };
}

export { syncNodeTree };
