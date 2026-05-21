// @ts-nocheck
import { Logger } from './logger';
export function initPicker() {
    window.__mcpNodePicker = {
        isActive: false,
        _onMouseMove: null,
        _onClick: null,
        _onKeyDown: null,

        enable: function () {
            const self = this;
            if (self.isActive) return;
            self.isActive = true;
            Logger.log("[Node Picker] 拾取模式已开启 🎯");

            // 部署 DOM 级阻击探针，免疫全部 Cocos 渲染管线错误
            if (!document.getElementById('__mcp_cursor_tracker')) {
                const tracker = document.createElement('div');
                tracker.id = '__mcp_cursor_tracker';
                tracker.style.position = 'fixed';
                tracker.style.zIndex = '2147483647';
                tracker.style.pointerEvents = 'none';
                tracker.style.width = '8px';
                tracker.style.height = '8px';
                tracker.style.borderRadius = '50%';
                tracker.style.backgroundColor = 'rgba(255, 0, 0, 0.8)';
                tracker.style.border = '1px solid white';
                tracker.style.transform = 'translate(-50%, -50%)';
                tracker.style.boxShadow = '0 0 5px rgba(255,0,0,1)';
                // 使用 shadowDOM 或者最外层 body 避免被游戏 canvas 截断
                document.body.appendChild(tracker);
            }

            self._lastMoveTime = 0;
            self._lastHoverUuid = null;

            self._onMouseMove = function (e) {
                if (!self.isActive) return;

                // 实时同步原生探针
                const tracker = document.getElementById('__mcp_cursor_tracker');
                if (tracker) {
                    tracker.style.left = e.clientX + 'px';
                    tracker.style.top = e.clientY + 'px';
                }
                // 节流，50ms一次
                const now = Date.now();
                if (now - self._lastMoveTime < 50) return;
                self._lastMoveTime = now;

                const hitNode = self.hitTest(e.clientX, e.clientY);
                const hitUuid = hitNode ? (hitNode.uuid || hitNode.id) : null;

                // 不再打印高频的 Hover 日志
                if (hitUuid !== self._lastHoverUuid) {
                    self._lastHoverUuid = hitUuid;
                }

                if (hitUuid && window.__mcpCrawler) {
                    window.__mcpCrawler.setHoverTarget(hitUuid);
                } else if (window.__mcpCrawler) {
                    window.__mcpCrawler.setHoverTarget(null);
                }
            };

            self._onClick = function (e) {
                if (!self.isActive) return;
                // 强制阻止物理拦截被别的 Input Manager 抢占
                e.stopPropagation();
                e.preventDefault();
                if (typeof e.stopImmediatePropagation === 'function') {
                    e.stopImmediatePropagation();
                }

                // 仅在 click 或 mouseup 确认拾取
                if (e.type === 'mousedown') return;

                const hitNode = self.hitTest(e.clientX, e.clientY); // 调试完毕，关闭 isDebug
                let hitUuid = '';
                if (hitNode) {
                    hitUuid = hitNode.uuid || hitNode.id;
                }

                Logger.log(`[Picker Trigger] 鼠标点击完成，决议抛出的 hitUuid 值为: ${hitUuid || 'null'} (Node: ${hitNode ? hitNode.name : 'Unknown'})`);

                // 同步持久化高亮框焦点
                if (window.__mcpCrawler && window.__mcpCrawler.setSelectionTarget) {
                    window.__mcpCrawler.setSelectionTarget(hitUuid || '');
                }

                // 强制发送无差别 IPC 闭环，确保面板按钮能正确复位
                if (window.__mcpInspector && window.__mcpInspector.sendNodeSelected) {
                    Logger.log(`[Selection-Debug] Trigger: Probe-Picker-sendNodeSelected | HitUuid: ${hitUuid || 'null'} | Broadcasting to IPC channel...`);
                    window.__mcpInspector.sendNodeSelected(hitUuid || '');
                }

                self.disable();
            };

            self._onKeyDown = function (e) {
                if (e.key === 'Escape') {
                    if (window.__mcpInspector && window.__mcpInspector.sendNodeSelected) {
                        window.__mcpInspector.sendNodeSelected('');
                    }
                    self.disable();
                }
            };

            // 使用 document.documentElement 绑定在最顶层捕获，防止被任意阻止
            document.documentElement.addEventListener('mousemove', self._onMouseMove, true);
            document.documentElement.addEventListener('mousedown', self._onClick, true);
            document.documentElement.addEventListener('mouseup', self._onClick, true);
            document.documentElement.addEventListener('click', self._onClick, true);
            document.documentElement.addEventListener('keydown', self._onKeyDown, true);
        },

        disable: function () {
            const self = this;
            if (!self.isActive) return;
            self.isActive = false;
            Logger.log("[Node Picker] 拾取模式已关闭 🛑");

            const tracker = document.getElementById('__mcp_cursor_tracker');
            if (tracker && tracker.parentNode) {
                tracker.parentNode.removeChild(tracker);
            }

            if (self._onMouseMove) document.documentElement.removeEventListener('mousemove', self._onMouseMove, true);
            if (self._onClick) {
                document.documentElement.removeEventListener('mousedown', self._onClick, true);
                document.documentElement.removeEventListener('mouseup', self._onClick, true);
                document.documentElement.removeEventListener('click', self._onClick, true);
            }
            if (self._onKeyDown) document.documentElement.removeEventListener('keydown', self._onKeyDown, true);

            if (window.__mcpCrawler) {
                window.__mcpCrawler.setHoverTarget(null);
            }
        },

        hitTest: function (clientX, clientY) {
            const eng = window.cc;
            if (!eng || !eng.director || !eng.view) return null;
            const scene = eng.director.getScene();
            if (!scene) return null;

            // DOM坐标换算到逻辑屏幕坐标 screenPt
            const canvas = document.getElementById('GameCanvas');
            const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight };

            const frameSize = eng.view.getFrameSize();
            const visibleOrigin = eng.view.getVisibleOrigin ? eng.view.getVisibleOrigin() : { x: 0, y: 0 };
            const visibleSize = eng.view.getVisibleSize ? eng.view.getVisibleSize() : { width: frameSize.width, height: frameSize.height };

            // DOM 坐标换算到逻辑屏幕坐标，使用引擎标准 API 补偿 viewport 偏移
            const x = visibleOrigin.x + (clientX - rect.left) * (visibleSize.width / rect.width);
            const y = visibleOrigin.y + (rect.bottom - clientY) * (visibleSize.height / rect.height);
            const screenPt = eng.v2(x, y);

            let cameras = [];
            if (eng.Camera && eng.Camera.cameras) {
                cameras = eng.Camera.cameras;
            }

            // 过滤并排序相机 (排除高亮专用摄像机)
            const validCameras = [];
            for (let i = 0; i < cameras.length; i++) {
                if (cameras[i].node && cameras[i].node.name === 'InspectorCamera') continue;
                validCameras.push(cameras[i]);
            }
            
            // 按照 depth 降序排序，确保最顶层的相机最先发射射线
            const sortedCameras = validCameras.sort(function (a, b) { return b.depth - a.depth; });
            if (sortedCameras.length === 0) return null;

            // 递归拦截探测
            function walkSceneForCamera(node, camera, worldPos, depth = 0, parentValidated = false) {
                if (eng.Scene && node instanceof eng.Scene) {
                    const children = node.children;
                    for (let i = children.length - 1; i >= 0; i--) {
                        let hitChild = walkSceneForCamera(children[i], camera, worldPos, depth + 1, parentValidated);
                        if (hitChild) return hitChild;
                    }
                    return null;
                }

                try {
                    if (node.activeInHierarchy === false || node.active === false) return null;
                    if (node.opacity === 0 || (node.color && node.color.a === 0)) return null;
                    if (node.scale === 0 || node.scaleX === 0 || node.scaleY === 0) return null;
                } catch (e) { return null; }

                if (node.name === '__mcp_hover_overlay__' || node.name === '__mcp_select_overlay__') return null;

                // 逆后序遍历子代（视觉上的从上往下探索）
                const children = node.children;

                // 核心：基于基因继承预判子辈的 parentValidated 归属权限
                let isNodeValidated = (camera.cullingMask & (1 << node.groupIndex)) !== 0;
                let passCheck = false;

                if (isNodeValidated) {
                    passCheck = true; // 1. 摄像机直接命中合法组
                } else if (node.groupIndex === 0 && parentValidated) {
                    passCheck = true; // 2. 属于 default 默认组且父辈曾合法，获得连带特权
                }

                if (children && children.length > 0) {
                    for (let i = children.length - 1; i >= 0; i--) {
                        let hitChild = walkSceneForCamera(children[i], camera, worldPos, depth + 1, passCheck);
                        if (hitChild) return hitChild;
                    }
                }

                // 子树没被选中，接下来看自己
                try {
                    // 必须满足校验才能选自己！
                    if (!passCheck) {
                        return null; 
                    }
                } catch (e) { return null; }

                // 实体校验逻辑
                if (node.width > 0 && node.height > 0) {
                    let hasRenderComp = false;

                    if (node._components) {
                        for (let k = 0; k < node._components.length; k++) {
                            const comp = node._components[k];
                            if (comp && comp.enabled === false) continue;
                            
                            let compName = '';
                            if (comp.constructor && comp.constructor.name) {
                                compName = comp.constructor.name;
                            } else if (comp.name) {
                                compName = comp.name;
                            }
                            
                            // 排除隐形遮罩组件与对象组空壳
                            if (compName.indexOf('Mask') > -1 || compName.indexOf('TiledObjectGroup') > -1) continue;

                            const isRender = (eng.RenderComponent && comp instanceof eng.RenderComponent) ||
                                (compName.indexOf('Sprite') > -1 || compName.indexOf('Label') > -1 ||
                                    compName.indexOf('RichText') > -1 || compName.indexOf('Graphics') > -1 ||
                                    compName.indexOf('Skeleton') > -1 || compName.indexOf('Particle') > -1 ||
                                    compName.indexOf('Mesh') > -1 || compName.indexOf('VideoPlayer') > -1 ||
                                    compName.indexOf('WebView') > -1 || compName.indexOf('UIStaticBatch') > -1 ||
                                    compName.indexOf('Spine') > -1 || compName.indexOf('DragonBones') > -1 ||
                                    compName.indexOf('Tiled') > -1 || compName.indexOf('Light') > -1 || 
                                    compName.indexOf('MotionStreak') > -1);

                            const isInteractive = compName.indexOf('Button') > -1 ||
                                compName.indexOf('Toggle') > -1 ||
                                compName.indexOf('Slider') > -1 ||
                                compName.indexOf('ScrollView') > -1 ||
                                compName.indexOf('BlockInputEvents') > -1 ||
                                compName.indexOf('EditBox') > -1;
                                    
                            if (isRender || isInteractive) {
                                if (compName.indexOf('Sprite') > -1 && (!comp.spriteFrame && !comp._spriteFrame)) continue;
                                if ((compName.indexOf('Label') > -1 && compName === 'cc.Label') && (!comp.string || comp.string === '')) continue;
                                if (compName.indexOf('RichText') > -1 && (!comp.string || comp.string === '')) continue;
                                hasRenderComp = true;
                                break;
                            }
                        }
                    }

                    if (!hasRenderComp) {
                        return null;
                    }

                    if (typeof node.convertToNodeSpaceAR === 'function') {
                        const localPt = node.convertToNodeSpaceAR(worldPos);
                        const ax = node.anchorX !== undefined ? node.anchorX : 0.5;
                        const ay = node.anchorY !== undefined ? node.anchorY : 0.5;

                        const rectTest = eng.rect(-ax * node.width, -ay * node.height, node.width, node.height);
                        if (rectTest.contains(localPt)) {
                            return node;
                        }
                    }
                }
                
                return null;
            }

            // 摄像机降序发牌 (Camera Loop) -> Camera-First Raycast
            for (let c = 0; c < sortedCameras.length; c++) {
                const camera = sortedCameras[c];
                if (camera.enabled === false) continue;

                if (typeof camera.getScreenToWorldPoint !== 'function') continue;

                // 直接生成最受相机透视、位移、DPR、Viewport影响的最还原的专属射线点
                const worldPos = camera.getScreenToWorldPoint(screenPt);
                if (!worldPos) continue;

                // 向该相机的业务范围发射专署探寻，寻找其管辖下可发生阻拦的最近节点
                let hitNode = walkSceneForCamera(scene, camera, worldPos, 0, false);
                if (hitNode) {
                    Logger.log(`[Picker Result] 摄像机层级拦截响应！选中目标 = ${hitNode.name}，所属摄像机 = ${camera.node ? camera.node.name : 'Unknown'}`);
                    return hitNode;
                }
            }
            return null;
        }
    };
}
