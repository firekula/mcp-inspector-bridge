// @ts-nocheck
import { Logger } from './logger';
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
                if (node._prefab && node._prefab.asset) {
                    prefabUuid = node._prefab.asset._uuid || node._prefab.asset.uuid || node._prefab.asset.id;
                }
            } catch(e) {}

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

                Logger.log(`%c[MCP] 组件 (${compName}) 数据导出成功 👇`, 'color: #00ff00; font-weight: bold;');
                Logger.log(jsonStr);
                Logger.log(`%c---------------------------------------`, 'color: #00ff00; font-weight: bold;');

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
        }
    };
}

export function syncNodeTree() {
    const scene = window.cc ? window.cc.director.getScene() : null;
    if (!scene) return;

    const treeData = serializeNode(scene, 0);
    const pauseStatus = (typeof window.cc.game !== 'undefined' && window.cc.game.isPaused) ? window.cc.game.isPaused() : false;
    
    if (window.__mcpInspector && window.__mcpInspector.updateTree) {
        window.__mcpInspector.updateTree(JSON.stringify({ tree: treeData, isPaused: pauseStatus }));
    }
}

function serializeNode(node, currentPrefabDepth = 0) {
    if (!node) return null;
    if (node.name === '__mcp_hover_overlay__' || node.name === '__mcp_select_overlay__' || node.name === 'McpInspectorRoot' || node.name === 'InspectorCamera') return null; // 排除内部创建的高亮渲染层
    
    let isActive = true;
    let isActiveInHierarchy = true;
    let isScene = false;

    // 彻底规避 cc.Scene 会在 getter 内部直接用 cc.error 打印日志的问题
    if (typeof window.cc !== 'undefined' && node instanceof window.cc.Scene) {
        isActive = true;
        isActiveInHierarchy = true;
        isScene = true;
    } else {
        try {
            isActive = node.active !== false;
            isActiveInHierarchy = node.activeInHierarchy !== false;
        } catch (e) { }
    }

    let isPrefab = !!node._prefab;
    let prefabRoot = isPrefab && node._prefab.root === node;
    let nextPrefabDepth = currentPrefabDepth;
    if (prefabRoot) {
        nextPrefabDepth++;
    }

    const componentNames = [];
    if (node._components) {
        for (let k = 0; k < node._components.length; k++) {
            const comp = node._components[k];
            let cClass = comp.name || (comp.constructor ? comp.constructor.name : '');
            if (typeof window.cc !== 'undefined' && window.cc.js && typeof window.cc.js.getClassName === 'function') {
                const cName = window.cc.js.getClassName(comp);
                if (cName) cClass = cName;
            }
            if (cClass) {
                const m = cClass.match(/<(.+)>/);
                componentNames.push(m ? m[1] : cClass);
            }
        }
    }

    const data = {
        id: node.uuid || node.id,
        name: node.name,
        active: isActive,
        activeInHierarchy: isActiveInHierarchy,
        childrenCount: node.childrenCount || 0,
        components: node._components ? node._components.length : 0,
        componentNames: componentNames,
        children: [],
        isScene: isScene,
        isPrefab: isPrefab,
        prefabRoot: prefabRoot,
        prefabDepth: nextPrefabDepth
    };

    if (node.children) {
        for (let i = 0; i < node.children.length; i++) {
            const childData = serializeNode(node.children[i], nextPrefabDepth);
            if (childData) {
                data.children.push(childData);
            }
        }
    }
    return data;
}
