const { reactive } = require('vue');

export const globalState = reactive({
    cocosInfo: null as any,
    nodeTree: null as any,
    lastTreeUpdate: 0 as number,
    isFallbackMode: false as boolean,
    showFallbackWarning: false as boolean,
    devToolsError: null as string | null,
    nodeDetail: null as any,
    isGamePaused: false as boolean,
    isNarrow: false as boolean,
    webviewSrc: '' as string,
    profiler: {
        tick: { fps: 0, drawCall: 0, logicTime: 0, renderTime: 0 },
        memoryStats: null as any,
        expandedBundles: {} as any
    },
    renderDebugger: {
        snapshots: [] as any[],
        batchBreaks: [] as any[]
    },
    isInspectorHovered: false as boolean,
    isEditorSceneActive: false as boolean,
    isNodePickerActive: false as boolean,
    mcpStatus: { active: false, port: 4456, error: '', projectName: '', projectPath: '' } as { active: boolean, port: number, error: string, projectName: string, projectPath: string },
    previewPort: 7456 as number,
    uiScale: 1.0 as number,
    baseFontSize: 13 as number,
    inspectorLayout: 'horizontal' as 'horizontal' | 'vertical',
    mcpClientList: [] as any[],
    mcpSelectedClientId: 0 as number,
    mcpPayload: '' as string,
    mcpScanning: false as boolean,
    mcpInjectLog: '' as string
});
