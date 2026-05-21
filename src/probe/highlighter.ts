// @ts-nocheck
import { Logger } from './logger';
export function initHighlighter() {
    // 初始化高亮状态存储
    window.__mcpHighlightData = {
        hoverId: null,
        selectId: null,
        hoverNode: null,
        hoverGraphics: null,
        selectNode: null,
        selectGraphics: null,
        rootNode: null,
        lastLoggedDrawID: null
    };
}

export function startHighlighterHook() {
    Logger.log('[Highlighter] startHighlighterHook 被触发，准备首次调用 _initHighlightLayer');
    _initHighlightLayer();

    if (window.cc && window.cc.director) {
        window.cc.director.on(window.cc.Director.EVENT_AFTER_SCENE_LAUNCH, () => {
            Logger.log('[Highlighter] EVENT_AFTER_SCENE_LAUNCH 触发 — 清除旧场景选中状态');
            // 清除旧场景的选中/悬停状态（节点已随旧场景销毁）
            window.__mcpHighlightData.selectId = null;
            window.__mcpHighlightData.hoverId = null;
            _initHighlightLayer();
            // 通知面板同步清除树选中状态
            if (window.__mcpInspector && window.__mcpInspector.sendClearSelection) {
                window.__mcpInspector.sendClearSelection();
            }
        });

        // 监听渲染帧重绘
        window.cc.director.on(window.cc.Director.EVENT_AFTER_UPDATE, () => {
            // 添加一个心跳日志，确认事件被触发
            const heartBeat = (window.__mcpHighlightData._heartbeat || 0) + 1;
            window.__mcpHighlightData._heartbeat = heartBeat;
            if (heartBeat % 60 === 0) { // 每60帧打印一次
                Logger.log(`[Highlighter] 心跳: ${heartBeat}, selectId=${window.__mcpHighlightData.selectId}, hoverId=${window.__mcpHighlightData.hoverId}`);
            }

            const data = window.__mcpHighlightData;
            const eng = window.cc;
            if (!data.hoverGraphics || !data.hoverNode || !data.hoverNode.isValid ||
                !data.selectGraphics || !data.selectNode || !data.selectNode.isValid) {
                // 兜底清除：节点已销毁则清空对应 ID
                if (data.selectNode && !data.selectNode.isValid && data.selectId) {
                    Logger.log('[Highlighter] 选中节点已销毁，清除 selectId');
                    data.selectId = null;
                    if (window.__mcpInspector && window.__mcpInspector.sendClearSelection) {
                        window.__mcpInspector.sendClearSelection();
                    }
                }
                if (data.hoverNode && !data.hoverNode.isValid && data.hoverId) {
                    data.hoverId = null;
                }
                if (eng && eng.director && eng.director.getScene()) {
                    _initHighlightLayer();
                }
                return;
            }

            const hoverG = data.hoverGraphics;
            const selectG = data.selectGraphics;

            hoverG.clear();
            selectG.clear();

            function getAccurateWorldCorners(node) {
                if (!node || typeof node.convertToWorldSpaceAR !== 'function') return null;
                const width = node.width || 0;
                const height = node.height || 0;
                const ax = node.anchorX !== undefined ? node.anchorX : 0.5;
                const ay = node.anchorY !== undefined ? node.anchorY : 0.5;
                const l = -ax * width;
                const b = -ay * height;
                const r = (1 - ax) * width;
                const t = (1 - ay) * height;

                const corners = [
                    eng.v2(l, b), // bl
                    eng.v2(r, b), // br
                    eng.v2(r, t), // tr
                    eng.v2(l, t)  // tl
                ];

                const worldCorners = [];
                for (let i = 0; i < corners.length; i++) {
                    const pt = node.convertToWorldSpaceAR(corners[i]);
                    worldCorners.push(pt);
                }
                return worldCorners;
            }

            function drawNodeBox(uuid, g, isHover, graphicsNode) {
                if (!uuid) return;
                const target = window.__mcpCrawler ? window.__mcpCrawler.findNodeByUuid(uuid) : null;
                if (!target || !target.isValid || target === data.hoverNode || target === data.selectNode) return;

                let effectiveGroupIndex = target.groupIndex || 0;
                if (effectiveGroupIndex === 0) {
                    let p = target.parent;
                    while (p) {
                        if (p.groupIndex !== 0 && p.groupIndex !== undefined) {
                            effectiveGroupIndex = p.groupIndex;
                            break;
                        }
                        p = p.parent;
                    }
                }

                if (graphicsNode.groupIndex !== effectiveGroupIndex) {
                    graphicsNode.groupIndex = effectiveGroupIndex;
                }

                if (isHover) {
                    g.strokeColor = new eng.Color(0, 204, 255, 255); // 浅蓝色边框
                    g.fillColor = new eng.Color(0, 204, 255, 40);    // 浅蓝透明填充
                } else {
                    g.strokeColor = new eng.Color(255, 80, 0, 255);  // 偏红橙色强调边框
                    g.fillColor = new eng.Color(255, 80, 0, 80);     // 较高透明度填充
                }

                const width = target.width || 0;
                const height = target.height || 0;
                
                // 节点尺寸都为 0 时走点兜底画圈
                if (width === 0 && height === 0) {
                    let center = eng.v2(0, 0);
                    if (typeof target.convertToWorldSpaceAR === 'function') {
                        center = target.convertToWorldSpaceAR(center);
                    }
                    if (isNaN(center.x) || isNaN(center.y)) return; // 彻底损坏的节点不予绘制


                    g.circle(center.x, center.y, 8);
                    g.fill();
                    g.moveTo(center.x - 12, center.y);
                    g.lineTo(center.x + 12, center.y);
                    g.moveTo(center.x, center.y - 12);
                    g.lineTo(center.x, center.y + 12);
                    g.stroke();
                    return;
                }

                let worldCorners = getAccurateWorldCorners(target);
                if (worldCorners && (isNaN(worldCorners[0].x) || isNaN(worldCorners[0].y))) {
                    worldCorners = null;
                }

                if (!worldCorners) return;

                if (!isHover && window.__mcpHighlightData && window.__mcpHighlightData.lastLoggedDrawID !== uuid) {
                    window.__mcpHighlightData.lastLoggedDrawID = uuid;
                    Logger.log(`[Highlight Render] Selecting Node: ${target.name} (${uuid})`);
                    Logger.log(`[Highlight Render] Size: ${width}x${height}`);
                    Logger.log(`[Highlight Render] W_P0: x=${worldCorners[0].x.toFixed(2)}, y=${worldCorners[0].y.toFixed(2)}`);
                }

                g.moveTo(worldCorners[0].x, worldCorners[0].y);
                g.lineTo(worldCorners[1].x, worldCorners[1].y);
                g.lineTo(worldCorners[2].x, worldCorners[2].y);
                g.lineTo(worldCorners[3].x, worldCorners[3].y);

                g.close();
                g.fill();
                g.stroke();
            }

            if (data.selectId) {
                drawNodeBox(data.selectId, selectG, false, data.selectNode);
            }

            // 如果悬停对象与选中焦点为同一个（或者为父级选中的同组逻辑等但 UUID 一致的情况则屏蔽画笔）
            if (data.hoverId && data.hoverId !== data.selectId) {
                drawNodeBox(data.hoverId, hoverG, true, data.hoverNode);
            }
        });
    }
}

function _initHighlightLayer() {
    Logger.log('[Highlighter] _initHighlightLayer 触发调用');
    try {
        const eng = window.cc;
        if (!eng || !eng.director) {
            Logger.warn('[Highlighter] _initHighlightLayer 终止：window.cc 或 window.cc.director 不存在');
            return;
        }
        const scene = eng.director.getScene();
        if (!scene) {
            Logger.warn('[Highlighter] _initHighlightLayer 终止：director.getScene() 返回为空');
            return;
        }

        let root = scene.getChildByName('McpInspectorRoot');
        if (root) {
            Logger.log('[Highlighter] 清理历史遗留的 McpInspectorRoot');
            root.destroy();
        }

        const oldCam = scene.getChildByName('InspectorCamera');
        if (oldCam) {
            oldCam.destroy();
        }

        function getOrCreateOverlay(name) {
            let existing = scene.getChildByName(name);
            if (existing) {
                let g = existing.getComponent(eng.Graphics);
                if (!g) g = existing.addComponent(eng.Graphics);
                existing.zIndex = eng.macro ? eng.macro.MAX_ZINDEX : 2147483647;
                return { node: existing, graphics: g };
            }
            const node = new eng.Node(name);
            node.setAnchorPoint(0, 0);
            node.setPosition(0, 0);
            
            const graphics = node.addComponent(eng.Graphics);
            graphics.lineWidth = 2;
            node.zIndex = eng.macro ? eng.macro.MAX_ZINDEX : 2147483647;
            scene.addChild(node);
            return { node, graphics };
        }

        const hover = getOrCreateOverlay('__mcp_hover_overlay__');
        window.__mcpHighlightData.hoverNode = hover.node;
        window.__mcpHighlightData.hoverGraphics = hover.graphics;

        const select = getOrCreateOverlay('__mcp_select_overlay__');
        window.__mcpHighlightData.selectNode = select.node;
        window.__mcpHighlightData.selectGraphics = select.graphics;

        
        Logger.log('[Highlighter] _initHighlightLayer 完整执行成功，相关 Graphics 工具已就绪！');
    } catch (err) {
        console.error('[Highlighter] _initHighlightLayer 执行中发生严重错误而中断！', err);
    }
}
