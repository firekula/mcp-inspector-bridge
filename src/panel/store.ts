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
        tick: {
            fps: 0,
            avgFps: 0,
            fps1pLow: 0,
            fps01pLow: 0,
            drawCall: 0,
            logicTime: 0,
            renderTime: 0,
            totalMemory: 0,
            nodeCount: 0,
            gpuTime: 0,
            shaderSwitches: 0,
            textureBinds: 0,
            vertices: 0,
            triangles: 0,
            physicsTime: 0,
            jsHeapUsed: 0,
            jsHeapTotal: 0
        },
        memoryStats: null as any,
        expandedBundles: {} as any,
        frameTimeline: {
            frameTimes: [] as number[],
            capacity: 600,
            lastUpdate: 0
        },
        memoryTimeline: {
            history: [] as Array<{ time: number; jsHeapUsed: number; jsHeapTotal: number; totalMemory: number; nodeCount: number }>,
            capacity: 150,
            lastUpdate: 0
        },
        leakDetection: {
            leakDetected: false,
            confidence: 0,
            trend: 'stable' as 'stable' | 'increasing' | 'decreasing' | 'insufficient_data',
            slopeKBPerSample: 0,
            rSquared: 0,
            sampleCount: 0,
            details: '',
            lastCheck: 0
        },
        shaderTextureDetails: {
            shaderCount: 0,
            textureCount: 0,
            shaders: [] as Array<{ id: string, count: number, lastUsed: number }>,
            textures: [] as Array<{ id: string, count: number, size: string, lastUsed: number }>,
            summary: { totalShaderSwitches: 0, totalTextureBinds: 0 },
            lastUpdate: 0
        }
    },
    renderDebugger: {
        snapshots: [] as any[],
        batchBreaks: [] as any[]
    },
    isInspectorHovered: false as boolean,
    isInspectorFocused: false as boolean,
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
    mcpInjectLog: '' as string,
    mcpLogs: [] as Array<{time: string, type: 'req'|'res'|'err', content: string}>,
    // 用户脚本系统
    scriptList: [] as Array<{
        name: string;
        version: string;
        description: string;
        author: string;
        grants: string[];
        status: 'running' | 'stopped' | 'error';
        errorMsg: string;
        toolCount: number;
        installedAt: number;
        fileName: string;
    }>,
    scriptEditorVisible: false as boolean,
    scriptEditorContent: '' as string,
    scriptEditorFileName: '' as string,
    /** 运行模式：'preview' (预览模式) | 'build' (Build 模式) | 'custom' (自定义页面) */
    runMode: 'preview' as 'preview' | 'build' | 'custom',
    /** 自定义 URL 页面地址 */
    customUrl: '' as string,
    /** 是否正在进行模式切换（用于防抖与重置保护） */
    isSwitchingMode: false as boolean,
    /** Build 模式下是否成功检测到 Web 构建包产物 */
    isBuildPackageFound: true as boolean,
});
