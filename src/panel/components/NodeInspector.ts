const { ref, watch, computed } = require('vue');
const { WidgetVisualizer } = require('./WidgetVisualizer');

export const NodeInspector = {
    props: {
        nodeDetail: {
            type: Object,
            default: null
        }
    },
    emits: ['update-prop', 'hover-change', 'locate-node', 'locate-asset', 'print-comp'],
    template: `
        <div class="node-inspector-wrap" style="padding: 10px; overflow-y: auto; height: 100%; color: #d0d0d0;"
             @mouseenter="onHover(true)" @mouseleave="onHover(false)">

            <div v-if="!nodeDetail" class="empty-hint" style="text-align: center; margin-top: 50px; color: #888;">
                未选中任何节点 (No node selected)
            </div>
            
            <div v-else class="inspector-content">
                <!-- 节点基础属性区块 -->
                <div class="inspector-section node-basics" style="background: #2b2b2b; padding: 10px; border-radius: 4px; border: 1px solid #444; margin-bottom: 10px;">
                    <div class="flex-row" style="display: flex; align-items: center; margin-bottom: 10px;">
                        <input type="checkbox" :checked="nodeDetail.active" @change="onUpdateProp(null, 'active', $event.target.checked)" style="margin-right: 8px;" title="激活/禁用节点" />
                        <input type="text" :value="nodeDetail.name" @change="onUpdateProp(null, 'name', $event.target.value)" style="flex: 1; padding: 4px; background: #1e1e1e; color: #fff; border: 1px solid #555; border-radius: 3px; min-width: 0; box-sizing: border-box;" />
                    </div>
                    
                    <div class="transform-grid" style="display: grid; grid-template-columns: 40px 1fr 1fr; gap: 5px; align-items: center; font-size: 12px;">
                        <!-- Position -->
                        <span style="color: #bbb;">Pos</span>
                        <div class="prop-input-wrap" style="display: flex; align-items: center;">
                            <span style="color: #ff6b6b; margin-right: 4px;">X</span>
                            <input type="number" step="1" :value="formatNumber(nodeDetail.x)" @change="onUpdateProp(null, 'x', parseFloat($event.target.value))" style="width: 100%; padding: 2px 4px; background: #1e1e1e; color: #fff; border: 1px solid #444; border-radius: 2px; min-width: 0; box-sizing: border-box;" />
                        </div>
                        <div class="prop-input-wrap" style="display: flex; align-items: center;">
                            <span style="color: #69b02a; margin-right: 4px;">Y</span>
                            <input type="number" step="1" :value="formatNumber(nodeDetail.y)" @change="onUpdateProp(null, 'y', parseFloat($event.target.value))" style="width: 100%; padding: 2px 4px; background: #1e1e1e; color: #fff; border: 1px solid #444; border-radius: 2px; min-width: 0; box-sizing: border-box;" />
                        </div>
                        
                        <!-- Rotation -->
                        <span style="color: #bbb;">Rot</span>
                        <div class="prop-input-wrap" style="display: flex; align-items: center; grid-column: span 2;">
                            <span style="color: #4fa1ff; margin-right: 4px;">∠</span>
                            <input type="number" step="1" :value="formatNumber(nodeDetail.rotation)" @change="onUpdateProp(null, 'rotation', parseFloat($event.target.value))" style="width: 100%; padding: 2px 4px; background: #1e1e1e; color: #fff; border: 1px solid #444; border-radius: 2px; min-width: 0; box-sizing: border-box;" />
                        </div>

                        <!-- Scale -->
                        <span style="color: #bbb;">Scale</span>
                        <div class="prop-input-wrap" style="display: flex; align-items: center;">
                            <span style="color: #ff6b6b; margin-right: 4px;">X</span>
                            <input type="number" step="0.1" :value="formatNumber(nodeDetail.scaleX)" @change="onUpdateProp(null, 'scaleX', parseFloat($event.target.value))" style="width: 100%; padding: 2px 4px; background: #1e1e1e; color: #fff; border: 1px solid #444; border-radius: 2px; min-width: 0; box-sizing: border-box;" />
                        </div>
                        <div class="prop-input-wrap" style="display: flex; align-items: center;">
                            <span style="color: #69b02a; margin-right: 4px;">Y</span>
                            <input type="number" step="0.1" :value="formatNumber(nodeDetail.scaleY)" @change="onUpdateProp(null, 'scaleY', parseFloat($event.target.value))" style="width: 100%; padding: 2px 4px; background: #1e1e1e; color: #fff; border: 1px solid #444; border-radius: 2px; min-width: 0; box-sizing: border-box;" />
                        </div>

                        <!-- Size -->
                        <span style="color: #bbb;">Size</span>
                        <div class="prop-input-wrap" style="display: flex; align-items: center;">
                            <span style="color: #ccc; margin-right: 4px;">W</span>
                            <input type="number" step="1" :value="formatNumber(nodeDetail.width)" @change="onUpdateProp(null, 'width', parseFloat($event.target.value))" style="width: 100%; padding: 2px 4px; background: #1e1e1e; color: #fff; border: 1px solid #444; border-radius: 2px; min-width: 0; box-sizing: border-box;" />
                        </div>
                        <div class="prop-input-wrap" style="display: flex; align-items: center;">
                            <span style="color: #ccc; margin-right: 4px;">H</span>
                            <input type="number" step="1" :value="formatNumber(nodeDetail.height)" @change="onUpdateProp(null, 'height', parseFloat($event.target.value))" style="width: 100%; padding: 2px 4px; background: #1e1e1e; color: #fff; border: 1px solid #444; border-radius: 2px; min-width: 0; box-sizing: border-box;" />
                        </div>
                    </div>
                </div>

                <!-- 组件区块 -->
                <div v-for="(comp, index) in nodeDetail.components" :key="'comp_'+index" class="inspector-section comp-section" style="background: #252525; margin-bottom: 8px; border: 1px solid #3a3a3a; border-radius: 4px;">
                    <div class="comp-header" style="background: #333; padding: 6px 10px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <input type="checkbox" :checked="comp.enabled" @change="onUpdateProp(comp.name, 'enabled', $event.target.checked, comp.realIndex)" />
                            <span @click="toggleComp(index)" style="cursor: pointer; font-weight: bold; font-size: 13px;">{{ comp.name }}</span>
                            <span @click.stop="onPrintComponent(nodeDetail.id, comp.realIndex)" style="cursor: pointer; font-size: 14px; opacity: 0.5; transition: opacity 0.2s;" title="将当前组件数据打印/导出为JSON" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.5'">🖨️</span>
                        </div>
                        <span @click="toggleComp(index)" style="cursor: pointer; font-size: 10px; color: #888;">{{ expandedComps[index] ? '▼' : '◀' }}</span>
                    </div>
                    
                    <div v-show="expandedComps[index]" class="comp-body" style="padding: 10px;">
                        <div v-if="comp.name === 'cc.Widget' || comp.name === 'Widget' || comp.name === 'Widget<cc.Widget>'">
                            <widget-visualizer :comp="comp" @update-prop="(k, v) => onUpdateProp(comp.name, k, v, comp.realIndex)" />
                        </div>
                        <div v-else>
                            <div v-if="comp.properties.length === 0" style="color: #666; font-size: 12px; font-style: italic;">
                                无公开基础属性
                            </div>
                            <div v-else class="prop-row" v-for="prop in comp.properties" :key="prop.key" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 12px;">
                                <span class="prop-label" style="width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 10px; color: #aaa;" :title="prop.key">{{ prop.key }}</span>
                                <div class="prop-val" style="width: 60%;">
                                    <!-- Boolean -->
                                    <input v-if="prop.type === 'boolean'" type="checkbox" :checked="prop.value" @change="onUpdateProp(comp.name, prop.key, $event.target.checked, comp.realIndex)" />
                                    
                                    <!-- Number -->
                                    <input v-else-if="prop.type === 'number'" type="number" step="0.1" :value="formatNumber(prop.value)" @change="onUpdateProp(comp.name, prop.key, parseFloat($event.target.value), comp.realIndex)" style="width: 100%; box-sizing: border-box; padding: 2px 4px; background: #1e1e1e; color: #fff; border: 1px solid #444; border-radius: 2px; min-width: 0; box-sizing: border-box;" />
                                    
                                    <!-- String / Enum -->
                                    <template v-else-if="prop.type === 'string'">
                                        <select v-if="prop.enumList" :value="prop.value || '<None>'" @change="onUpdateProp(comp.name, prop.key, $event.target.value === '<None>' ? '' : $event.target.value, comp.realIndex)" style="width: 100%; box-sizing: border-box; padding: 2px 4px; background: #1e1e1e; color: #fff; border: 1px solid #444; border-radius: 2px;">
                                            <option v-for="opt in prop.enumList" :key="opt" :value="opt">{{ opt }}</option>
                                        </select>
                                        <input v-else type="text" :value="prop.value" @change="onUpdateProp(comp.name, prop.key, $event.target.value, comp.realIndex)" style="width: 100%; box-sizing: border-box; padding: 2px 4px; background: #1e1e1e; color: #fff; border: 1px solid #444; border-radius: 2px; min-width: 0; box-sizing: border-box;" />
                                    </template>
                                    
                                    <!-- Node Ref -->
                                    <div v-else-if="prop.type === 'node_ref'" style="display: flex; align-items: center; background: #1a1a1a; border: 1px solid #3a3a3a; border-radius: 2px; padding: 2px;">
                                        <span style="font-size: 10px; color:#4fa1ff; padding: 0 4px;">Node</span>
                                        <input type="text" disabled :value="prop.value.name" style="flex: 1; min-width: 0; background: transparent; color: #aaa; border: none; font-size: 11px; padding: 2px;" :title="prop.value.uuid"/>
                                        <span v-if="prop.value.uuid && prop.value.uuid !== ''" @click.stop="onLocateNodeRef(prop.value.uuid)" style="cursor: pointer; font-size: 11px; padding: 0 4px; opacity: 0.8;" title="在节点树中定位" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.8'">🎯</span>
                                    </div>

                                    <!-- Asset Ref -->
                                    <div v-else-if="prop.type === 'asset_ref'" style="display: flex; align-items: center; background: #1a1a1a; border: 1px solid #3a3a3a; border-radius: 2px; padding: 2px;">
                                        <span style="font-size: 10px; color:#cda34f; padding: 0 4px; text-overflow: ellipsis; white-space: nowrap; overflow: hidden; max-width: 80px;" :title="prop.value.className">[{{ prop.value.className }}]</span>
                                        <input type="text" disabled :value="prop.value.name" style="flex: 1; min-width: 0; background: transparent; color: #aaa; border: none; font-size: 11px; padding: 2px;" :title="prop.value.uuid"/>
                                        <span v-if="prop.value.uuid && prop.value.uuid !== ''" @click.stop="onLocateAssetRef(prop.value.uuid)" style="cursor: pointer; font-size: 11px; padding: 0 4px; opacity: 0.8;" title="在资源管理器中定位" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.8'">🎯</span>
                                    </div>
                                    
                                    <!-- Array -->
                                    <div v-else-if="prop.type === 'array'" style="display: flex; flex-direction: column; width: 100%; gap: 4px;">
                                        <div style="font-size: 11px; color:#777; margin-bottom: 2px; text-align: right;">Size: {{ prop.value ? prop.value.length : 0 }}</div>
                                        <div v-for="(item, idx) in prop.value" :key="idx" style="display: flex; align-items: center; background: #1a1a1a; border: 1px solid #3a3a3a; border-radius: 2px; padding: 2px;">
                                            <span style="font-size: 10px; color:#666; width: 24px; text-align: center;">[{{ idx }}]</span>
                                            
                                            <template v-if="item && typeof item === 'object' && item.type === 'node_ref'">
                                                <span style="font-size: 10px; color:#4fa1ff; padding: 0 4px;">Node</span>
                                                <input type="text" disabled :value="item.value.name" style="flex: 1; min-width: 0; background: transparent; color: #aaa; border: none; font-size: 11px; padding: 2px;" :title="item.value.uuid"/>
                                                <span v-if="item.value.uuid && item.value.uuid !== ''" @click.stop="onLocateNodeRef(item.value.uuid)" style="cursor: pointer; font-size: 11px; padding: 0 4px; opacity: 0.8;" title="在节点树中定位" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.8'">🎯</span>
                                            </template>
                                            
                                            <template v-else-if="item && typeof item === 'object' && item.type === 'asset_ref'">
                                                <span style="font-size: 10px; color:#cda34f; padding: 0 4px; text-overflow: ellipsis; white-space: nowrap; overflow: hidden; max-width: 80px;" :title="item.value.className">[{{ item.value.className }}]</span>
                                                <input type="text" disabled :value="item.value.name" style="flex: 1; min-width: 0; background: transparent; color: #aaa; border: none; font-size: 11px; padding: 2px;" :title="item.value.uuid"/>
                                                <span v-if="item.value.uuid && item.value.uuid !== ''" @click.stop="onLocateAssetRef(item.value.uuid)" style="cursor: pointer; font-size: 11px; padding: 0 4px; opacity: 0.8;" title="在资源管理器中定位" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.8'">🎯</span>
                                            </template>

                                            <template v-else>
                                                <input type="text" disabled :value="item" style="flex: 1; min-width: 0; background: transparent; color: #999; border: none; font-size: 11px; padding: 2px;" :title="item"/>
                                            </template>
                                        </div>
                                    </div>
                                    
                                    <!-- Unsupported -->
                                    <div v-else style="color: #888; font-style: italic; background: #2a2a2a; padding: 2px 4px; font-size: 11px;">
                                        [不支持的类型]
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    `,
    components: {
        'widget-visualizer': WidgetVisualizer
    },
    setup(props: any, { emit }: any) {
        const expandedComps = ref({} as Record<number, boolean>);

        // 默认展开所有组件
        watch(() => props.nodeDetail, (newVal: any) => {
            if (newVal && newVal.components) {
                newVal.components.forEach((_: any, idx: number) => {
                    if (expandedComps.value[idx] === undefined) {
                        expandedComps.value[idx] = true;
                    }
                });
            }
        }, { immediate: true });

        const toggleComp = (index: number) => {
            expandedComps.value[index] = !expandedComps.value[index];
        };

        const onUpdateProp = (compName: string | null, propKey: string, value: any, compIndex?: number) => {
            if (!props.nodeDetail) return;

            // 乐观更新 (Optimistic UI Update)
            if (compName) {
                const comp = props.nodeDetail.components.find((c: any) => c.name === compName);
                if (comp) {
                    if (propKey === 'enabled') {
                        comp.enabled = value;
                    } else {
                        const prop = comp.properties.find((p: any) => p.key === propKey);
                        if (prop) prop.value = value;
                    }
                }
            } else {
                props.nodeDetail[propKey] = value;
            }

            emit('update-prop', {
                uuid: props.nodeDetail.id,
                compName: compName,
                propKey: propKey,
                value: value,
                compIndex: compIndex
            });
        };

        const onHover = (hovering: boolean) => {
            emit('hover-change', hovering);
        };

        const formatNumber = (val: number | string | undefined) => {
            if (val === undefined || val === null) return 0;
            const res = parseFloat(val as string);
            return isNaN(res) ? 0 : Number(res.toFixed(3)); // 保留 3 位小数避免失真过长
        };

        const onLocateNodeRef = (uuid: string) => {
            emit('locate-node', uuid);
        };

        const onLocateAssetRef = (uuid: string) => {
            emit('locate-asset', uuid);
        };

        const onPrintComponent = (uuid: string, compIndex: number) => {
            emit('print-comp', uuid, compIndex);
        };

        return {
            expandedComps,
            toggleComp,
            onUpdateProp,
            onHover,
            formatNumber,
            onLocateNodeRef,
            onLocateAssetRef,
            onPrintComponent
        };
    }
};
