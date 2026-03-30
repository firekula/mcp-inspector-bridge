const { ref, watch, onMounted, onUnmounted } = require('vue');
declare const Editor: any;

export const RenderDebugger = {
    template: `
        <div style="padding: 10px; color: #eee; font-family: sans-serif; display: flex; flex-direction: column; height: 100%; box-sizing: border-box;">
            <!-- 头部控制栏 -->
            <div style="flex-shrink: 0; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
                <div>
                    <h3 style="margin: 0 0 5px 0; color: #fff;">Render Pipeline 流水线诊断</h3>
                    <div style="font-size: 12px; color: #aaa;">
                        <span v-if="!isFrozen">底层动态探测会导致 DrawCall 断流的深层根因。</span>
                        <span v-else>快照已锁定（帧号 {{ frozenSnapshot?.frameId }}）。可逐层追溯每一个 DrawCall 与原始 RenderCommand 的绑定及物理画面。</span>
                    </div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <label v-if="!isFrozen" style="display: flex; align-items: center; cursor: pointer; background: #222; padding: 6px 12px; border-radius: 4px; border: 1px solid #555;">
                        <input type="checkbox" v-model="isCapturing" style="margin-right: 8px;" />
                        <span style="font-size: 13px; font-weight: bold;" :style="{ color: isCapturing ? '#4caf50' : '#ccc' }">
                            {{ isCapturing ? '断流侦听中...' : '开启断流侦听' }}
                        </span>
                    </label>
                    <button @click="toggleFreeze" :disabled="!latestSnapshot && !isFrozen"
                            :style="{ background: isFrozen ? '#e65100' : (latestSnapshot ? '#1976d2' : '#333'), color: '#fff', border: '1px solid #555', padding: '6px 12px', borderRadius: '4px', cursor: (latestSnapshot||isFrozen) ? 'pointer' : 'not-allowed', fontWeight: 'bold' }">
                        {{ isFrozen ? '⏸ 恢复实时嗅探' : '⏺ 截流当前帧做深入分析' }}
                    </button>
                    <button v-if="!isFrozen" @click="clearLogs" style="padding: 6px 12px; background: #444; color: #fff; border: 1px solid #555; border-radius: 4px; cursor: pointer; font-size: 12px;">
                        🗑 清空历史断批
                    </button>
                </div>
            </div>

            <!-- 数据列表示图 (未冻结时显示动态断批断点) -->
            <div v-show="!isFrozen" style="flex: 1; min-height: 0; border: 1px solid #333; background: #1a1a1c; overflow-y: auto; border-radius: 4px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                    <thead style="position: sticky; top: 0; background: #2a2a2a; color: #ccc; z-index: 10;">
                        <tr>
                            <th style="padding: 6px;">打断节点 (Culprit)</th>
                            <th style="padding: 6px;">上游节点 (Victim)</th>
                            <th style="padding: 6px;">断批特征原因</th>
                            <th style="padding: 6px; width: 60px;">频次</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="record in batchBreakRecords" :key="record.hashKey" style="border-bottom: 1px dashed #333;">
                            <td style="padding: 6px; color: #ff5252; font-weight: bold;">
                                {{ record.culprit }}
                                <span v-if="record.culpritId" @click="locateNode(record.culpritId)" style="cursor: pointer; margin-left: 4px; border: 1px solid #ff5252; padding: 0 4px; border-radius: 3px; font-size: 10px; opacity: 0.8;" title="点击定位节点">📌</span>
                            </td>
                            <td style="padding: 6px; color: #81d4fa;">
                                {{ record.victim }}
                                <span v-if="record.victimId" @click="locateNode(record.victimId)" style="cursor: pointer; margin-left: 4px; border: 1px solid #81d4fa; padding: 0 4px; border-radius: 3px; font-size: 10px; opacity: 0.8;" title="点击定位节点">📌</span>
                            </td>
                            <td style="padding: 6px; color: #e0e0e0;">
                                <div v-for="(rs, idx) in record.reasons" :key="idx" style="margin-bottom: 2px;">• {{ rs }}</div>
                            </td>
                            <td style="padding: 6px;">
                                <span style="background: #e65100; color: #fff; padding: 2px 6px; border-radius: 10px; font-size: 11px;">
                                    x{{ record.hitCount }}
                                </span>
                            </td>
                        </tr>
                        <tr v-if="batchBreakRecords.length === 0">
                            <td colspan="4" style="text-align: center; padding: 30px; color: #666;">
                                {{ isCapturing ? '侦听中... 尚未捕获到断批事件' : '请开启探针诊断开关开始捕获' }}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- 全景三栏布局区 (快照冻结时显示) -->
            <div v-if="isFrozen && frozenSnapshot" style="flex: 1; min-height: 0; display: flex; gap: 10px; overflow: hidden; margin-top: 5px;">
                <!-- 左侧：渲染工序拆解 -->
                <div style="width: 25%; background: #1a1a1c; border: 1px solid #333; border-radius: 4px; display: flex; flex-direction: column; overflow: hidden;">
                    <div style="background: #2a2a2a; padding: 6px 10px; font-weight: bold; font-size: 12px; flex-shrink: 0; border-bottom: 1px solid #333;">
                        渲染队列 ({{ frozenSnapshot.totalDrawCalls }} DCs)
                    </div>
                    <div style="flex: 1; overflow-y: auto; overflow-x: hidden; padding: 5px;">
                        <div v-for="(dc, dcIdx) in frozenSnapshot.drawCalls" :key="'dc_'+dcIdx" style="margin-bottom: 4px;">
                            <div @click="selectDrawCall(dcIdx)" 
                                 :style="{ background: selectedDrawCallIndex === dcIdx ? '#0277bd' : '#222', padding: '6px 8px', cursor: 'pointer', borderRadius: '3px', border: '1px solid #444', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }">
                                <div>
                                    <span style="color: #4fc3f7; font-weight: bold; margin-right: 5px; font-size: 12px;">DrawCall #{{ dcIdx }}</span>
                                </div>
                                <span style="font-size: 10px; color: #aaa; background: rgba(0,0,0,0.5); padding: 2px 4px; border-radius: 3px;">Idx: {{ dc.indicesCount }}</span>
                            </div>
                            
                            <!-- Command List (只在选中该 DrawCall 时触发展开) -->
                            <div v-if="selectedDrawCallIndex === dcIdx && dc.commands && dc.commands.length > 0" style="margin-top: 2px; padding-left: 10px; border-left: 2px solid #444;">
                                <div v-for="(cmd, cmdIdx) in dc.commands" :key="'cmd_'+cmdIdx"
                                     @click.stop="selectCommand(dcIdx, cmdIdx)"
                                     :style="{ background: selectedCommandIndex === cmdIdx ? '#455a64' : 'transparent', padding: '4px 6px', cursor: 'pointer', borderRadius: '2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333' }">
                                     <div style="display: flex; align-items: center; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">
                                         <span style="color: #ffb74d; margin-right: 6px; font-size: 12px;" v-if="cmd.type.includes('Sprite')">🖼️</span>
                                         <span style="color: #64b5f6; margin-right: 6px; font-size: 12px;" v-else-if="cmd.type.includes('Label')">🅰️</span>
                                         <span style="color: #81c784; margin-right: 6px; font-size: 12px;" v-else-if="cmd.type.includes('Graphics')">🖌️</span>
                                         <span style="color: #ba68c8; margin-right: 6px; font-size: 12px;" v-else>🧩</span>
                                         <span style="font-size: 11px; color: #eee;" :title="cmd.name">{{ cmd.name }}</span>
                                     </div>
                                     <!-- 📌 溯源定位按钮 -->
                                     <span v-if="cmd.nodeUuid" @click.stop="locateNode(cmd.nodeUuid)" style="cursor: pointer; margin-left: 4px; border: 1px solid #555; padding: 0 4px; border-radius: 3px; font-size: 10px; background: #333; opacity: 0.8;" title="在节点树中定位">📌</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 中央：离屏重绘画布 -->
                <div style="width: 50%; background: #000; border: 1px solid #333; border-radius: 4px; display: flex; flex-direction: column; overflow: hidden;">
                    <div style="background: #2a2a2a; padding: 6px 10px; font-weight: bold; font-size: 12px; flex-shrink: 0; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: #66bb6a;">单步图传 (Step Replay)</span>
                        <div style="display: flex; gap: 4px;">
                            <button @click="replayStep('prev')" style="background: #444; color: #fff; border: 0; cursor: pointer; padding: 2px 6px; border-radius: 2px;">👈 前进一步</button>
                            <button @click="replayStep('next')" style="background: #444; color: #fff; border: 0; cursor: pointer; padding: 2px 6px; border-radius: 2px;">👉 后进一步</button>
                        </div>
                    </div>
                    <div style="flex: 1; display: flex; align-items: center; justify-content: center; position: relative;">
                         <img v-if="replayImageData" :src="replayImageData" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
                         <span v-else style="color: #444; font-size: 13px; font-weight: bold;">( 尚未挂载游戏底层回读算法 )</span>
                    </div>
                </div>

                <!-- 右侧：管线明细 -->
                <div style="width: 25%; background: #1a1a1c; border: 1px solid #333; border-radius: 4px; display: flex; flex-direction: column; overflow: hidden;">
                    <div style="background: #2a2a2a; padding: 6px 10px; font-weight: bold; font-size: 12px; flex-shrink: 0; border-bottom: 1px solid #333; color: #ffa726;">
                        批次参数明细 (Details)
                    </div>
                    <div style="flex: 1; overflow-y: auto; padding: 10px; font-size: 12px; color: #ccc;">
                        <div v-if="selectedDrawCallIndex > -1 && frozenSnapshot.drawCalls[selectedDrawCallIndex]">
                            <!-- DrawCall Level Details -->
                            <div v-if="selectedCommandIndex === -1">
                                <h4 style="margin: 0 0 10px 0; color: #4fc3f7; border-bottom: 1px solid #333; padding-bottom: 5px;">DrawCall #{{ selectedDrawCallIndex }} 全局状态</h4>
                                <div style="margin-bottom: 10px;">
                                    <div style="color: #888; margin-bottom: 2px;">物理类型 (Primitive)</div>
                                    <div style="background: #111; padding: 4px 6px; border-radius: 3px;">{{ frozenSnapshot.drawCalls[selectedDrawCallIndex].primitiveType === 4 ? 'PT_TRIANGLES' : 'UNKNOWN' }}</div>
                                </div>
                                <div style="margin-bottom: 10px;">
                                    <div style="color: #888; margin-bottom: 2px;">填充索引数 (Indices Count)</div>
                                    <div style="background: #111; padding: 4px 6px; border-radius: 3px; color: #69f0ae;">{{ frozenSnapshot.drawCalls[selectedDrawCallIndex].indiceCount }}</div>
                                </div>
                                <div style="margin-bottom: 10px;">
                                    <div style="color: #888; margin-bottom: 2px;">预估顶点数 (Vertices Count)</div>
                                    <div style="background: #111; padding: 4px 6px; border-radius: 3px;">~{{ frozenSnapshot.drawCalls[selectedDrawCallIndex].vertexCount }}</div>
                                </div>
                                <div style="margin-bottom: 10px;">
                                    <div style="color: #888; margin-bottom: 2px;">合计合并指令 (Commands)</div>
                                    <div style="background: #111; padding: 4px 6px; border-radius: 3px;">{{ frozenSnapshot.drawCalls[selectedDrawCallIndex].commands ? frozenSnapshot.drawCalls[selectedDrawCallIndex].commands.length : 0 }} 个</div>
                                </div>
                            </div>
                            <!-- Command Level Details -->
                            <div v-else-if="frozenSnapshot.drawCalls[selectedDrawCallIndex].commands[selectedCommandIndex]">
                                <h4 style="margin: 0 0 10px 0; color: #ffb74d; border-bottom: 1px solid #333; padding-bottom: 5px;">Command #{{ selectedCommandIndex }} 独立状态</h4>
                                <div style="margin-bottom: 10px;">
                                    <div style="color: #888; margin-bottom: 2px;">指令类型 (Type)</div>
                                    <div style="background: #111; padding: 4px 6px; border-radius: 3px; color: #e1bee7;">{{ frozenSnapshot.drawCalls[selectedDrawCallIndex].commands[selectedCommandIndex].type }}</div>
                                </div>
                                <div style="margin-bottom: 10px;">
                                    <div style="color: #888; margin-bottom: 2px;">节点名称 (Node Name)</div>
                                    <div style="background: #111; padding: 4px 6px; border-radius: 3px; word-break: break-all;">{{ frozenSnapshot.drawCalls[selectedDrawCallIndex].commands[selectedCommandIndex].name }}</div>
                                </div>
                                <div style="margin-bottom: 10px;">
                                    <div style="color: #888; margin-bottom: 2px;">材质哈希 (Material Hash)</div>
                                    <div style="background: #111; padding: 4px 6px; border-radius: 3px; font-family: monospace;">{{ frozenSnapshot.drawCalls[selectedDrawCallIndex].commands[selectedCommandIndex].materialHash }}</div>
                                </div>
                                <div style="margin-bottom: 10px; display: flex; gap: 10px;">
                                    <div style="flex: 1;">
                                        <div style="color: #888; margin-bottom: 2px;">Blend Src</div>
                                        <div style="background: #111; padding: 4px 6px; border-radius: 3px;">{{ frozenSnapshot.drawCalls[selectedDrawCallIndex].commands[selectedCommandIndex].blendSrc ?? 'N/A' }}</div>
                                    </div>
                                    <div style="flex: 1;">
                                        <div style="color: #888; margin-bottom: 2px;">Blend Dst</div>
                                        <div style="background: #111; padding: 4px 6px; border-radius: 3px;">{{ frozenSnapshot.drawCalls[selectedDrawCallIndex].commands[selectedCommandIndex].blendDst ?? 'N/A' }}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div v-else style="color: #555; text-align: center; margin-top: 30px;">
                            请在左侧选择一个 DrawCall<br/>或展开查看内部 Command
                        </div>
                    </div>
                </div>
            </div>

        <!-- 底层数据嗅探 (小横条) -->
            <div v-if="!isFrozen" style="flex-shrink: 0; padding: 8px 12px; background: #222; border-top: 2px solid #333; margin-top: 10px; border-radius: 4px;">
                <h4 style="margin: 0 0 8px 0; color: #4caf50; font-size: 13px;">[实时帧快照通道 (底层数据嗅探)]</h4>
                <div v-if="latestSnapshot" style="color: #00ffcc; font-size: 12px; line-height: 1.5;">
                    ✅ <strong>接收到渲染管线重组快照！</strong><br/>
                    • 当前帧号: <span style="color:#fff">{{ latestSnapshot.frameId }}</span><br/>
                    • 游戏内共收集到 <span style="background: #e65100; color: #fff; padding: 1px 4px; border-radius: 4px;">{{ latestSnapshot.drawCalls.reduce((s, dc) => s + (dc.commands ? dc.commands.length : 0), 0) }}</span> 个 RenderCommand (渲染指令)<br/>
                    • 最终物理打包为 <span style="background: #1976d2; color: #fff; padding: 1px 4px; border-radius: 4px;">{{ latestSnapshot.drawCalls.length }}</span> 个 GPU DrawCall<br/>
                    • 时间戳: <span style="color:#888">{{ latestSnapshot.timestamp }}</span>
                </div>
                <div v-else style="color: #888; font-size: 12px; font-style: italic;">
                    ⏳ 正在等待引擎挂钩回传每帧快照，请确保游戏处于运行状态...
                </div>
            </div>
        </div>
    `,
    emits: ['toggle', 'locate-node'],
    setup(props: any, { emit }: any) {
        const isCapturing = ref(false);
        const batchBreakRecords = ref([]);
        const totalHits = ref(0);
        const latestSnapshot = ref(null);

        const clearLogs = () => {
            batchBreakRecords.value = [];
            totalHits.value = 0;
            latestSnapshot.value = null;
        };

        const locateNode = (id: string) => {
            if (id) emit('locate-node', id);
        };

        const isFrozen = ref(false);
        const frozenSnapshot = ref(null as any);
        const selectedDrawCallIndex = ref(-1);
        const selectedCommandIndex = ref(-1);
        const replayImageData = ref('');

        const toggleFreeze = () => {
            if (isFrozen.value) {
                isFrozen.value = false;
                frozenSnapshot.value = null;
                selectedDrawCallIndex.value = -1;
                selectedCommandIndex.value = -1;
                replayImageData.value = '';
                // 告知探针解除由于重绘导致的暂停与限制
                try {
                    if (typeof window.dispatchEvent === 'function') {
                        window.dispatchEvent(new CustomEvent('render-debugger:send-macro', {
                            detail: `if(window.__mcpRenderDebuggerHook) { window.__mcpRenderDebuggerHook._replayLimit = -1; var eng = window.cc || window.editorEngine; if(eng && eng.director) { eng.director.mainLoop(eng.director._deltaTime); } }`
                        }));
                    }
                } catch (err) {}
            } else {
                if (latestSnapshot.value) {
                    isFrozen.value = true;
                    frozenSnapshot.value = JSON.parse(JSON.stringify(latestSnapshot.value));
                    selectedDrawCallIndex.value = frozenSnapshot.value.drawCalls.length > 0 ? 0 : -1;
                    triggerBackendStep();
                }
            }
        };

        const selectDrawCall = (idx: number) => {
            selectedDrawCallIndex.value = idx;
            selectedCommandIndex.value = -1;
            triggerBackendStep();
        };

        const selectCommand = (dcIdx: number, cmdIdx: number) => {
            selectedDrawCallIndex.value = dcIdx;
            selectedCommandIndex.value = cmdIdx;
            triggerBackendStep();
        };

        const replayStep = (dir: 'next'|'prev') => {
            if (!frozenSnapshot.value || selectedDrawCallIndex.value === -1) return;
            const len = frozenSnapshot.value.drawCalls.length;
            if (dir === 'next' && selectedDrawCallIndex.value < len - 1) {
                selectedDrawCallIndex.value++;
            } else if (dir === 'prev' && selectedDrawCallIndex.value > 0) {
                selectedDrawCallIndex.value--;
            }
            triggerBackendStep();
        };

        let debounceTimer: any = null;
        const triggerBackendStep = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                console.log(`[Vue] 请求 Backend 回放至 DrawCall #${selectedDrawCallIndex.value}`);
                try {
                    if (typeof window.dispatchEvent === 'function') {
                        window.dispatchEvent(new CustomEvent('render-debugger:send-macro', {
                            detail: `if(window.__mcpRenderDebuggerHook) window.__mcpRenderDebuggerHook.stepToDrawCall(${selectedDrawCallIndex.value}, ${JSON.stringify(frozenSnapshot.value)});`
                        }));
                    }
                } catch (err) {}
            }, 100);
        };

        const onPayloadReceived = (e: any) => {
            const payload = e.detail;
            if (!payload || !payload.data) return;

            // 拦截新型快照数据 (随时更新，不受诊断开关限制)
            if (payload.type === 'render-debugger:snapshot') {
                latestSnapshot.value = payload.data;
                return;
            }

            // 拦截反发回来的 Base64 重绘画布
            if (payload.type === 'render-debugger:replay-result') {
                replayImageData.value = payload.data;
                return;
            }

            if (!isCapturing.value || isFrozen.value) return;

            const { culprit, culpritId, victim, victimId, reasons } = payload.data;
            const reasonsStr = (reasons || []).join('#');
            const hashKey = culprit + '||' + victim + '||' + reasonsStr;

            // 寻找去重记录
            const existing = batchBreakRecords.value.find((r: any) => r.hashKey === hashKey);
            
            if (existing) {
                existing.hitCount++;
            } else {
                // 如果数量超过 200 条，保护性摘除最早的
                if (batchBreakRecords.value.length >= 200) {
                    batchBreakRecords.value.shift();
                }
                batchBreakRecords.value.push({
                    hashKey,
                    culprit,
                    culpritId,
                    victim,
                    victimId,
                    reasons: reasons || [],
                    hitCount: 1
                } as never);
            }
            totalHits.value++;
        };

        onMounted(() => {
            window.addEventListener('render-debugger-payload', onPayloadReceived as EventListener);
        });

        onUnmounted(() => {
            window.removeEventListener('render-debugger-payload', onPayloadReceived as EventListener);
        });

        watch(isCapturing, (newVal: boolean) => {
            if (newVal) clearLogs(); // 每次重新开启时自动清空
            emit('toggle', newVal);
        });

        return {
            isCapturing,
            batchBreakRecords,
            totalHits,
            latestSnapshot,
            isFrozen,
            frozenSnapshot,
            selectedDrawCallIndex,
            selectedCommandIndex,
            replayImageData,
            clearLogs,
            locateNode,
            toggleFreeze,
            selectDrawCall,
            selectCommand,
            replayStep
        };
    }
};
