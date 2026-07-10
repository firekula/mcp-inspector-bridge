const { ref, computed, watch } = require('vue');
declare const Editor: any;

interface CustomResolution {
    id: string;
    name: string;
    width: number;
    height: number;
}

export function useLayout(globalState: any, wrapMount: any, wrapperSize: any) {
    const selectedResolution = ref('FIT');
    const isLandscape = ref(false);
    
    // --- 自定义分辨率 ---
    const customResolutions: any = ref([]);
    const editingResId: any = ref(null);
    const newResName = ref('');
    const newResWidth = ref('');
    const newResHeight = ref('');
    const editResName = ref('');
    const editResWidth = ref('');
    const editResHeight = ref('');

    let projectKey = 'default';
    try {
        if (typeof Editor !== 'undefined' && Editor.Project && Editor.Project.path) {
            projectKey = Editor.Project.path.replace(/[^a-zA-Z0-9]/g, '_');
        }
    } catch(e) {}
    const storageKey = `mcp-inspector-landscape-${projectKey}`;

    try {
        if (window.localStorage.getItem(storageKey) === '1') {
            isLandscape.value = true;
        }
    } catch(e) {}

    watch(isLandscape, (newVal: boolean) => {
        try {
            window.localStorage.setItem(storageKey, newVal ? '1' : '0');
        } catch(e) {}
    });
    
    // Split pane logic
    const rightPanelWidth = ref(400);
    const isDragging = ref(false);

    const startDrag = (downEvent: MouseEvent) => {
        isDragging.value = true;
        const startX = downEvent.clientX;
        const startWidth = rightPanelWidth.value;

        const onMouseMove = (e: MouseEvent) => {
            if (!isDragging.value) return;
            const deltaX = (e.clientX - startX) / (globalState.uiScale || 1.0);
            const newWidth = startWidth - deltaX;

            if (newWidth > 200 && newWidth < document.body.clientWidth - 300) {
                rightPanelWidth.value = newWidth;
            }
        };
        const onMouseUp = () => {
            isDragging.value = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            try {
                if (typeof Editor !== 'undefined' && Editor.Ipc) {
                    Editor.Ipc.sendToMain('mcp-inspector-bridge:save-panel-width', rightPanelWidth.value);
                }
            } catch (e) { }
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const nodeTreePanelWidth = ref(250);
    const nodeTreePanelHeight = ref(250);
    const isNodeTreeDragging = ref(false);

    try {
        const savedW = window.localStorage.getItem('mcp-inspector-nodetree-width');
        if (savedW) {
            const wNum = parseInt(savedW, 10);
            if (!isNaN(wNum) && wNum >= 150) {
                nodeTreePanelWidth.value = wNum;
            }
        }
        const savedH = window.localStorage.getItem('mcp-inspector-nodetree-height');
        if (savedH) {
            const hNum = parseInt(savedH, 10);
            if (!isNaN(hNum) && hNum >= 100) {
                nodeTreePanelHeight.value = hNum;
            }
        }
    } catch(e) {}

    const startNodeTreeDrag = (downEvent: MouseEvent) => {
        isNodeTreeDragging.value = true;
        if (downEvent.preventDefault) downEvent.preventDefault();
        
        const isVertical = globalState.inspectorLayout === 'vertical';
        const startX = downEvent.clientX;
        const startY = downEvent.clientY;
        const startWidth = nodeTreePanelWidth.value;
        const startHeight = nodeTreePanelHeight.value;

        const onMouseMove = (e: MouseEvent) => {
            if (!isNodeTreeDragging.value) return;
            
            if (isVertical) {
                const deltaY = (e.clientY - startY) / (globalState.uiScale || 1.0);
                const newHeight = startHeight + deltaY;
                const wrapCtx = document.querySelector('.right-panel-wrap-ctx') || document.body;
                const maxH = wrapCtx.clientHeight - 150;
                
                if (newHeight > 100 && newHeight < (maxH > 100 ? maxH : 9999)) {
                    nodeTreePanelHeight.value = newHeight;
                }
            } else {
                const deltaX = (e.clientX - startX) / (globalState.uiScale || 1.0);
                const newWidth = startWidth + deltaX;
                const maxW = rightPanelWidth.value - 250;
                
                if (newWidth > 150 && newWidth < (maxW > 150 ? maxW : 9999)) {
                    nodeTreePanelWidth.value = newWidth;
                }
            }
        };
        const onMouseUp = () => {
            isNodeTreeDragging.value = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            try {
                if (isVertical) {
                    window.localStorage.setItem('mcp-inspector-nodetree-height', nodeTreePanelHeight.value.toString());
                } else {
                    window.localStorage.setItem('mcp-inspector-nodetree-width', nodeTreePanelWidth.value.toString());
                }
            } catch (e) { }
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    // --- 内置分辨率选项定义 ---
    const BUILTIN_RESOLUTION_GROUPS = [
        {
            label: null as string | null,
            options: [
                { value: 'FIT', text: '自动充满 (Fit Window)' }
            ]
        },
        {
            label: 'iOS/iPadOS 阵营',
            options: [
                { value: '1290x2796', text: 'iPhone 16 Pro Max/15 Pro Max (2796x1290)' },
                { value: '1206x2622', text: 'iPhone 16 Pro (2622x1206)' },
                { value: '1284x2778', text: 'iPhone 16 Plus/12 Pro Max (2778x1284)' },
                { value: '1170x2532', text: 'iPhone 14/13 (2532x1170)' },
                { value: '750x1334', text: 'iPhone 7/SE (1334x750)' },
                { value: '2048x2732', text: 'iPad Pro 12.9" (2732x2048)' },
                { value: '1488x2266', text: 'iPad mini 7 (2266x1488)' },
            ]
        },
        {
            label: '安卓直板手机',
            options: [
                { value: '1440x3176', text: '华为Mate 70 Pro+ (3176x1440)' },
                { value: '1440x3088', text: '三星Galaxy S24 Ultra (3088x1440)' },
                { value: '1440x3200', text: '主流2K旗舰标杆 (3200x1440)' },
                { value: '1080x2340', text: '三星Galaxy S24/A55 (2340x1080)' },
                { value: '1644x3840', text: '索尼Xperia 1 VI 全屏 (3840x1644)' },
                { value: '1440x3120', text: '中兴Axon 60 Ultra/全面屏 (3120x1440)' },
                { value: '1240x2772', text: '主流1.5K中端标杆 (2772x1240)' },
                { value: '720x1600', text: '入门机基准下限测试 (1600x720)' },
            ]
        },
        {
            label: '折叠屏全形态',
            options: [
                { value: '1080x2440', text: '华为Mate X6 (外屏 2440x1080)' },
                { value: '2230x2460', text: '华为Mate X6 (内屏 2460x2230)' },
                { value: '904x2316', text: '三星Z Fold6 (外屏 2316x904)' },
                { value: '2160x2592', text: '三星Z Fold6 (内屏 2592x2160)' },
                { value: '2200x2480', text: '华为Mate Xs 2 (外折单屏 2480x2200)' },
                { value: '1080x2640', text: '三星Z Flip6/竖折 (内屏 2640x1080)' },
                { value: '2700x3120', text: '华为Mate XT (三折展开 3120x2700)' },
            ]
        },
        {
            label: '平板游戏横态',
            options: [
                { value: '1840x2880', text: '华为MatePad Pro 13.2" (2880x1840)' },
                { value: '1848x3088', text: '三星Tab S10 Ultra (3088x1848)' },
                { value: '1440x2560', text: '联想Y700 游戏专属平板 (2560x1440)' },
                { value: '1200x2000', text: '联想小新Pad/主销级 (2000x1200)' },
                { value: '1200x1920', text: '亚马逊Fire HD 10/出海基准 (1920x1200)' },
            ]
        },
    ];

    function getResolutionDisplayName(res: CustomResolution): string {
        if (res.name && res.name.trim()) {
            return `${res.name.trim()}（${res.width}×${res.height}）`;
        }
        return `自定义分辨率（${res.width}×${res.height}）`;
    }

    const resolutionOptions = computed(() => {
        const groups = BUILTIN_RESOLUTION_GROUPS.map(g => ({
            label: g.label,
            options: [...g.options]
        }));

        if (customResolutions.value.length > 0) {
            groups.push({
                label: '自定义',
                options: customResolutions.value.map((r: CustomResolution) => ({
                    value: `${r.width}x${r.height}`,
                    text: getResolutionDisplayName(r)
                }))
            });
        }

        return groups;
    });

    const gameContainerStyle = computed(() => {
        if (selectedResolution.value === 'FIT' || wrapperSize.value.width === 0) {
            return { width: '100%', height: '100%', position: 'relative', overflow: 'hidden' };
        }
        const parts = selectedResolution.value.split('x');
        let targetW = parseInt(parts[0]);
        let targetH = parseInt(parts[1]);

        if (isLandscape.value) {
            const tmp = targetW; targetW = targetH; targetH = tmp;
        }

        const scale = Math.min(
            (wrapperSize.value.width * 0.95) / targetW,
            (wrapperSize.value.height * 0.95) / targetH
        );

        return {
            width: Math.floor(targetW) + 'px',
            height: Math.floor(targetH) + 'px',
            left: '50%',
            top: '50%',
            position: 'absolute',
            overflow: 'hidden',
            transform: `translate(-50%, -50%) scale(${scale})`,
            transformOrigin: 'center center'
        };
    });

    const rotateScreen = () => { isLandscape.value = !isLandscape.value; };

    const setupResizeObserver = () => {
        const wrap = wrapMount.value;
        if (wrap) {
            try {
                new ResizeObserver((entries: any) => {
                    window.requestAnimationFrame(() => {
                        if (!entries.length) return;
                        const rect = entries[0].contentRect;
                        if (rect.width <= 0 || rect.height <= 0) {
                            if (!globalState.isHidden) {
                                globalState.isHidden = true;
                                window.dispatchEvent(new CustomEvent('panel-visibility-change', { detail: { hidden: true } }));
                            }
                            return;
                        } else {
                            if (globalState.isHidden) {
                                globalState.isHidden = false;
                                window.dispatchEvent(new CustomEvent('panel-visibility-change', { detail: { hidden: false } }));
                            }
                        }
                        wrapperSize.value.width = rect.width;
                        wrapperSize.value.height = rect.height;
                        globalState.isNarrow = rect.width < 500;
                    });
                }).observe(wrap);
            } catch (e) {
                if (wrap.clientWidth > 0 && wrap.clientHeight > 0) {
                    wrapperSize.value.width = wrap.clientWidth;
                    wrapperSize.value.height = wrap.clientHeight;
                }
                window.addEventListener('resize', () => {
                    const isHidden = wrap.clientWidth <= 0 || wrap.clientHeight <= 0;
                    if (isHidden) {
                        if (!globalState.isHidden) {
                            globalState.isHidden = true;
                            window.dispatchEvent(new CustomEvent('panel-visibility-change', { detail: { hidden: true } }));
                        }
                        return;
                    } else {
                        if (globalState.isHidden) {
                            globalState.isHidden = false;
                            window.dispatchEvent(new CustomEvent('panel-visibility-change', { detail: { hidden: false } }));
                        }
                    }
                    wrapperSize.value.width = wrap.clientWidth;
                    wrapperSize.value.height = wrap.clientHeight;
                    globalState.isNarrow = wrap.clientWidth < 500;
                });
            }
        }
    };

    function persistResolutions() {
        if (typeof Editor !== 'undefined' && Editor.Ipc) {
            Editor.Ipc.sendToMain('mcp-inspector-bridge:save-custom-resolutions',
                JSON.parse(JSON.stringify(customResolutions.value)));
        }
    }

    function loadCustomResolutions() {
        if (typeof Editor !== 'undefined' && Editor.Ipc) {
            Editor.Ipc.sendToMain('mcp-inspector-bridge:query-custom-resolutions', (err: any, res: CustomResolution[]) => {
                if (!err && Array.isArray(res)) {
                    customResolutions.value = res;
                }
            });
        }
    }

    function addCustomResolution() {
        const w = parseInt(newResWidth.value);
        const h = parseInt(newResHeight.value);
        if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return;

        customResolutions.value.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name: newResName.value.trim(),
            width: w,
            height: h
        });

        newResName.value = '';
        newResWidth.value = '';
        newResHeight.value = '';
        persistResolutions();
    }

    function startEditResolution(res: CustomResolution) {
        editingResId.value = res.id;
        editResName.value = res.name;
        editResWidth.value = res.width.toString();
        editResHeight.value = res.height.toString();
    }

    function cancelEditResolution() {
        editingResId.value = null;
        editResName.value = '';
        editResWidth.value = '';
        editResHeight.value = '';
    }

    function saveEditResolution() {
        const w = parseInt(editResWidth.value);
        const h = parseInt(editResHeight.value);
        if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return;

        const idx = customResolutions.value.findIndex((r: CustomResolution) => r.id === editingResId.value);
        if (idx !== -1) {
            customResolutions.value[idx].name = editResName.value.trim();
            customResolutions.value[idx].width = w;
            customResolutions.value[idx].height = h;
        }

        cancelEditResolution();
        persistResolutions();
    }

    function deleteCustomResolution(id: string) {
        const idx = customResolutions.value.findIndex((r: CustomResolution) => r.id === id);
        if (idx === -1) return;

        const deleted = customResolutions.value[idx];
        customResolutions.value.splice(idx, 1);

        // 如果当前选中的是被删除的自定义分辨率，回退到 FIT
        const deletedValue = `${deleted.width}x${deleted.height}`;
        if (selectedResolution.value === deletedValue) {
            selectedResolution.value = 'FIT';
        }

        persistResolutions();
    }

    // 初始化加载
    loadCustomResolutions();

    // 监听：如果选中的自定义分辨率已不在列表中，回退到 FIT
    watch([customResolutions, selectedResolution], () => {
        if (selectedResolution.value === 'FIT') return;
        // 检查是否匹配内置分辨率
        for (const group of BUILTIN_RESOLUTION_GROUPS) {
            if (group.options.some(o => o.value === selectedResolution.value)) return;
        }
        // 检查是否匹配自定义分辨率
        if (customResolutions.value.some((r: CustomResolution) => `${r.width}x${r.height}` === selectedResolution.value)) return;
        // 不匹配任何已知分辨率，且不是 FIT，回退
        selectedResolution.value = 'FIT';
    });

    watch(selectedResolution, (newVal: string) => {
        try {
            if (typeof Editor !== 'undefined' && Editor.Ipc) {
                Editor.Ipc.sendToMain('mcp-inspector-bridge:save-resolution', newVal);
            }
        } catch (e) { }
    });

    return {
        selectedResolution,
        isLandscape,
        resolutionOptions,
        rightPanelWidth,
        isDragging,
        startDrag,
        nodeTreePanelWidth,
        nodeTreePanelHeight,
        isNodeTreeDragging,
        startNodeTreeDrag,
        gameContainerStyle,
        rotateScreen,
        setupResizeObserver,
        // 自定义分辨率
        customResolutions,
        editingResId,
        newResName,
        newResWidth,
        newResHeight,
        editResName,
        editResWidth,
        editResHeight,
        addCustomResolution,
        startEditResolution,
        cancelEditResolution,
        saveEditResolution,
        deleteCustomResolution,
        getResolutionDisplayName,
        loadCustomResolutions,
    };
}
