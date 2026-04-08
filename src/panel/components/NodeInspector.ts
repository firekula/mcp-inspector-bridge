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
                
                <!-- 场景节点专属显示区块 -->
                <div v-if="nodeDetail.isScene" class="inspector-section scene-hint" style="background: #2b2b2b; padding: 30px 10px; border-radius: 4px; border: 1px solid #444; margin-bottom: 10px; text-align: center; color: #aaa;">
                    <div style="font-size: 32px; margin-bottom: 12px; filter: grayscale(0.5);">🌍</div>
                    <div style="font-weight: bold; font-size: 14px; color: #ddd; margin-bottom: 6px;">[场景] {{ nodeDetail.name }}</div>
                    <div style="font-size: 12px; opacity: 0.7;">场景根节点不可直接编辑变换属性</div>
                </div>

                <!-- 常规节点属性区块 -->
                <template v-else>
                    <div class="inspector-card node-basics">
                        <div class="component-header">
                            <input type="checkbox" class="enable-toggle" :checked="nodeDetail.active" @change="onUpdateProp(null, 'active', $event.target.checked)" title="激活/禁用节点" />
                            <div style="flex: 1; min-width: 0; margin-left: 8px; margin-right: 8px; display: flex; align-items: center;">
                                <input type="text" :value="nodeDetail.name" @change="onUpdateProp(null, 'name', $event.target.value)" style="width: 100%; box-sizing: border-box; padding: 2px 4px; background: var(--bg-input); color: var(--text-main); border: 1px solid transparent; border-radius: var(--radius); min-width: 0; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='var(--accent-blue)'" onblur="this.style.borderColor='transparent'" />
                                <span v-if="nodeDetail.prefabUuid" @click.stop="$emit('locate-asset', nodeDetail.prefabUuid)" style="cursor: pointer; font-size: 14px; margin-left: 8px; color: var(--accent-blue); filter: drop-shadow(0 0 4px var(--accent-blue));" title="在资源管理器中定位预制体">🎯</span>
                            </div>
                            <div class="header-right">
                                <span class="size-tag" style="background: rgba(0,0,0,0.3); border-color: transparent;">Node</span>
                            </div>
                        </div>
                    
                        <div class="properties-body" style="padding: 10px;">
                            <div class="transform-grid" style="display: grid; grid-template-columns: 78px 1fr 1fr; gap: 6px; align-items: center; font-size: 12px;">
                                <!-- Position -->
                                <span style="color: var(--text-muted);">position</span>
                                <div class="prop-input-wrap" style="display: flex; align-items: center;">
                                    <span style="color: #ff6b6b; margin-right: 4px;">x</span>
                                    <input type="number" step="1" :value="formatNumber(nodeDetail.x)" @change="onUpdateProp(null, 'x', parseFloat($event.target.value))" style="width: 100%; padding: 2px 4px; background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-color); border-radius: var(--radius); min-width: 0; box-sizing: border-box;" />
                                </div>
                                <div class="prop-input-wrap" style="display: flex; align-items: center;">
                                    <span style="color: #69b02a; margin-right: 4px;">y</span>
                                    <input type="number" step="1" :value="formatNumber(nodeDetail.y)" @change="onUpdateProp(null, 'y', parseFloat($event.target.value))" style="width: 100%; padding: 2px 4px; background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-color); border-radius: var(--radius); min-width: 0; box-sizing: border-box;" />
                                </div>
                                
                                <!-- Rotation -->
                                <span style="color: var(--text-muted);">{{ nodeDetail.hasAngle ? 'angle' : 'rotation' }}</span>
                                <div class="prop-input-wrap" style="display: flex; align-items: center; grid-column: span 2;">
                                    <span style="color: #4fa1ff; margin-right: 4px;">∠</span>
                                    <input type="number" step="1" :value="formatNumber(nodeDetail.rotation)" @change="onUpdateProp(null, 'rotation', parseFloat($event.target.value))" style="width: 100%; padding: 2px 4px; background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-color); border-radius: var(--radius); min-width: 0; box-sizing: border-box;" />
                                </div>

                                <!-- Scale -->
                                <span style="color: var(--text-muted);">scale</span>
                                <div class="prop-input-wrap" style="display: flex; align-items: center;">
                                    <span style="color: #ff6b6b; margin-right: 4px;">x</span>
                                    <input type="number" step="0.1" :value="formatNumber(nodeDetail.scaleX)" @change="onUpdateProp(null, 'scaleX', parseFloat($event.target.value))" style="width: 100%; padding: 2px 4px; background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-color); border-radius: var(--radius); min-width: 0; box-sizing: border-box;" />
                                </div>
                                <div class="prop-input-wrap" style="display: flex; align-items: center;">
                                    <span style="color: #69b02a; margin-right: 4px;">y</span>
                                    <input type="number" step="0.1" :value="formatNumber(nodeDetail.scaleY)" @change="onUpdateProp(null, 'scaleY', parseFloat($event.target.value))" style="width: 100%; padding: 2px 4px; background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-color); border-radius: var(--radius); min-width: 0; box-sizing: border-box;" />
                                </div>

                                <!-- Anchor -->
                                <span style="color: var(--text-muted);">anchorPoint</span>
                                <div class="prop-input-wrap" style="display: flex; align-items: center;">
                                    <span style="color: #ff6b6b; margin-right: 4px;">x</span>
                                    <input type="number" step="0.1" :value="formatNumber(nodeDetail.anchorX)" @change="onUpdateProp(null, 'anchorX', parseFloat($event.target.value))" style="width: 100%; padding: 2px 4px; background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-color); border-radius: var(--radius); min-width: 0; box-sizing: border-box;" />
                                </div>
                                <div class="prop-input-wrap" style="display: flex; align-items: center;">
                                    <span style="color: #69b02a; margin-right: 4px;">y</span>
                                    <input type="number" step="0.1" :value="formatNumber(nodeDetail.anchorY)" @change="onUpdateProp(null, 'anchorY', parseFloat($event.target.value))" style="width: 100%; padding: 2px 4px; background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-color); border-radius: var(--radius); min-width: 0; box-sizing: border-box;" />
                                </div>

                                <!-- Size -->
                                <span style="color: var(--text-muted);">contentSize</span>
                                <div class="prop-input-wrap" style="display: flex; align-items: center;">
                                    <span style="color: var(--text-muted); margin-right: 4px;">width</span>
                                    <input type="number" step="1" :value="formatNumber(nodeDetail.width)" @change="onUpdateProp(null, 'width', parseFloat($event.target.value))" style="width: 100%; padding: 2px 4px; background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-color); border-radius: var(--radius); min-width: 0; box-sizing: border-box;" />
                                </div>
                                <div class="prop-input-wrap" style="display: flex; align-items: center;">
                                    <span style="color: var(--text-muted); margin-right: 4px;">height</span>
                                    <input type="number" step="1" :value="formatNumber(nodeDetail.height)" @change="onUpdateProp(null, 'height', parseFloat($event.target.value))" style="width: 100%; padding: 2px 4px; background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-color); border-radius: var(--radius); min-width: 0; box-sizing: border-box;" />
                                </div>

                                <!-- Color -->
                                <span style="color: var(--text-muted);">color</span>
                                <div class="prop-input-wrap" style="display: flex; align-items: center; grid-column: span 2;">
                                    <input type="color" :value="nodeDetail.color ? nodeDetail.color.substring(0, 7) : '#ffffff'" @change="onUpdateProp(null, 'color', $event.target.value)" style="width: 24px; height: 24px; padding: 0; border: none; background: transparent; cursor: pointer; margin-right: 6px;" />
                                    <input type="text" :value="nodeDetail.color" @change="onUpdateProp(null, 'color', $event.target.value)" style="flex: 1; padding: 2px 4px; background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-color); border-radius: var(--radius); min-width: 0; box-sizing: border-box;" />
                                </div>

                                <!-- Opacity -->
                                <span style="color: var(--text-muted);">opacity</span>
                                <div class="prop-input-wrap" style="display: flex; align-items: center; grid-column: span 2;">
                                    <input type="number" step="1" :value="nodeDetail.opacity" @change="onUpdateProp(null, 'opacity', parseInt($event.target.value) || 0)" min="0" max="255" style="width: 100%; padding: 2px 4px; background: var(--bg-input); color: #ff9800; border: 1px solid var(--border-color); border-radius: var(--radius); min-width: 0; box-sizing: border-box; font-weight: bold;" />
                                </div>

                                <!-- Skew -->
                                <span style="color: var(--text-muted);">skew</span>
                                <div class="prop-input-wrap" style="display: flex; align-items: center;">
                                    <span style="color: #ff6b6b; margin-right: 4px;">x</span>
                                    <input type="number" step="1" :value="formatNumber(nodeDetail.skewX)" @change="onUpdateProp(null, 'skewX', parseFloat($event.target.value))" style="width: 100%; padding: 2px 4px; background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-color); border-radius: var(--radius); min-width: 0; box-sizing: border-box;" />
                                </div>
                                <div class="prop-input-wrap" style="display: flex; align-items: center;">
                                    <span style="color: #69b02a; margin-right: 4px;">y</span>
                                    <input type="number" step="1" :value="formatNumber(nodeDetail.skewY)" @change="onUpdateProp(null, 'skewY', parseFloat($event.target.value))" style="width: 100%; padding: 2px 4px; background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-color); border-radius: var(--radius); min-width: 0; box-sizing: border-box;" />
                                </div>

                                <!-- Group -->
                                <span style="color: var(--text-muted);">groupIndex</span>
                                <div class="prop-input-wrap" style="display: flex; align-items: center; grid-column: span 2;">
                                    <select v-if="nodeDetail.groupList && nodeDetail.groupList.length > 0" :value="nodeDetail.groupIndex" @change="onUpdateProp(null, 'groupIndex', parseInt($event.target.value))" style="width: 100%; padding: 2px 4px; background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-color); border-radius: var(--radius); box-sizing: border-box;">
                                        <option v-for="(gName, idx) in nodeDetail.groupList" :key="idx" :value="idx">{{ gName }}</option>
                                    </select>
                                    <input v-else type="number" step="1" :value="nodeDetail.groupIndex" @change="onUpdateProp(null, 'groupIndex', parseInt($event.target.value) || 0)" style="width: 100%; padding: 2px 4px; background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-color); border-radius: var(--radius); min-width: 0; box-sizing: border-box;" />
                                </div>
                            </div>
                        </div>
                    </div>

                <!-- 组件区块 -->
                <!-- 组件区块 -->
                <div v-for="(comp, index) in nodeDetail.components" :key="'comp_'+index" class="inspector-card" :class="{'disabled': !comp.enabled}">
                    <div class="component-header">
                        <input type="checkbox" class="enable-toggle" :checked="comp.enabled" @change="onUpdateProp(comp.name, 'enabled', $event.target.checked, comp.realIndex)" title="启用/禁用当前组件">
                        <span class="component-name" @click="toggleComp(index)" style="cursor: pointer; flex: 1;">{{ comp.name }}</span>
                        <span class="print-btn" @click.stop="onPrintComponent(nodeDetail.id, comp.realIndex)" title="将当前组件数据打印/导出为JSON">🖨️</span>
                        <div class="header-right" @click="toggleComp(index)" style="cursor: pointer;">
                            <span class="size-tag">属性: {{ comp.properties ? comp.properties.length : 0 }}</span>
                            <span style="font-size: 10px; color: #888;">{{ expandedComps[index] ? '▼' : '◀' }}</span>
                        </div>
                    </div>
                    
                    <div v-show="expandedComps[index]" class="properties-body">
                        <div v-if="comp.name === 'cc.Widget' || comp.name === 'Widget' || comp.name === 'Widget<cc.Widget>'" style="padding: 0 12px;">
                            <widget-visualizer :comp="comp" @update-prop="(k, v) => onUpdateProp(comp.name, k, v, comp.realIndex)" />
                        </div>
                        <div v-else>
                            <div v-if="comp.properties.length === 0" style="color: #666; font-size: 12px; font-style: italic; padding: 0 12px;">
                                无公开基础属性
                            </div>
                            <template v-else v-for="prop in comp.properties" :key="prop.key">
                                <div class="prop-row" v-if="prop.type !== 'array'">
                                    <span class="prop-label" :title="prop.key">{{ prop.name || prop.key }}</span>
                                    <div class="prop-val">
                                        <!-- Boolean -->
                                        <input v-if="prop.type === 'boolean'" type="checkbox" :checked="prop.value" @change="onUpdateProp(comp.name, prop.key, $event.target.checked, comp.realIndex)" style="accent-color: var(--accent-blue);" />
                                        
                                        <!-- Number -->
                                        <input v-else-if="prop.type === 'number'" type="number" step="0.1" :value="formatNumber(prop.value)" @change="onUpdateProp(comp.name, prop.key, parseFloat($event.target.value), comp.realIndex)" />

                                        <!-- Enum -->
                                        <select v-else-if="prop.type === 'Enum'" :value="prop.value" @change="onUpdateProp(comp.name, prop.key, parseInt($event.target.value), comp.realIndex)">
                                            <option v-for="opt in prop.enumList" :key="opt.value" :value="opt.value">{{ opt.name }}</option>
                                        </select>
                                        
                                        <!-- String / Enum -->
                                        <template v-else-if="prop.type === 'string'">
                                            <select v-if="prop.enumList" :value="prop.value || '<None>'" @change="onUpdateProp(comp.name, prop.key, $event.target.value === '<None>' ? '' : $event.target.value, comp.realIndex)">
                                                <option v-for="opt in prop.enumList" :key="opt" :value="opt">{{ opt }}</option>
                                            </select>
                                            <input v-else type="text" :value="prop.value" @change="onUpdateProp(comp.name, prop.key, $event.target.value, comp.realIndex)" />
                                        </template>
                                        
                                        <!-- Node Ref -->
                                        <div v-else-if="prop.type === 'node_ref'" class="asset-link" @click.stop="onLocateNodeRef(prop.value.uuid)">
                                            <span style="font-size: 11px; padding: 0 2px;">📦</span>
                                            <span class="asset-name" :title="prop.value.uuid">{{ prop.value.name }} <span style="color:#777;font-size:9px;">[Node]</span></span>
                                            <span v-if="prop.value.uuid && prop.value.uuid !== ''" class="target-mark">🎯</span>
                                        </div>

                                        <!-- Asset Ref -->
                                        <div v-else-if="prop.type === 'asset_ref'" class="asset-link" @click.stop="onLocateAssetRef(prop.value.uuid)">
                                            <span style="font-size: 11px; padding: 0 2px;">{{ prop.value.className === 'cc.SpriteFrame' || prop.value.className === 'cc.Texture2D' ? '🖼️' : '🧩' }}</span>
                                            <span class="asset-name" :title="prop.value.uuid">{{ prop.value.name }} <span style="color:#777;font-size:9px;">[{{ prop.value.className }}]</span></span>
                                            <span v-if="prop.value.uuid && prop.value.uuid !== ''" class="target-mark">🎯</span>
                                        </div>
                                        
                                        <!-- Unsupported -->
                                        <div v-else style="color: #888; font-style: italic; background: #2a2a2a; padding: 2px 4px; font-size: 11px;">
                                            [不支持的类型]
                                        </div>
                                    </div>
                                </div>

                                <!-- Array -->
                                <div v-else-if="prop.type === 'array'" class="prop-row array-row">
                                    <div class="array-header" style="display:flex; width: 100%; justify-content: space-between; align-items: center;">
                                        <span class="prop-label array-label" :title="prop.key">{{ prop.name || prop.key }}</span>
                                        <div class="array-size" style="font-size: 11px; color:var(--text-muted);">数量: {{ prop.value ? prop.value.length : 0 }}</div>
                                    </div>
                                    <div class="array-items" v-if="prop.value && prop.value.length > 0" style="width: 100%; padding-left: 15px; margin-top: 6px; display:flex; flex-direction:column; gap:4px; box-sizing: border-box; min-width: 0;">
                                        <div v-for="(item, idx) in prop.value" :key="idx" class="array-item-row" style="display: flex; align-items: center; background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 4px; min-width: 0;">
                                            <span class="array-index" style="font-size: 10px; color:var(--text-muted); width: 28px; text-align: center; margin-right: 4px;">[{{ idx }}]</span>
                                            
                                            <template v-if="item && typeof item === 'object' && item.type === 'node_ref'">
                                                <div class="asset-link" style="flex:1; min-width: 0;" @click.stop="onLocateNodeRef(item.value.uuid)">
                                                    <span style="font-size: 11px; padding: 0 2px;">📦</span>
                                                    <span class="asset-name" :title="item.value.uuid">{{ item.value.name }} <span style="color:#777;font-size:9px;">[Node]</span></span>
                                                    <span v-if="item.value.uuid && item.value.uuid !== ''" class="target-mark">🎯</span>
                                                </div>
                                            </template>
                                            
                                            <template v-else-if="item && typeof item === 'object' && item.type === 'asset_ref'">
                                                <div class="asset-link" style="flex:1; min-width: 0;" @click.stop="onLocateAssetRef(item.value.uuid)">
                                                    <span style="font-size: 11px; padding: 0 2px;">{{ item.value.className === 'cc.SpriteFrame' || item.value.className === 'cc.Texture2D' ? '🖼️' : '🧩' }}</span>
                                                    <span class="asset-name" :title="item.value.uuid">{{ item.value.name }} <span style="color:#777;font-size:9px;">[{{ item.value.className }}]</span></span>
                                                    <span v-if="item.value.uuid && item.value.uuid !== ''" class="target-mark">🎯</span>
                                                </div>
                                            </template>

                                            <template v-else>
                                                <input type="text" disabled :value="item" style="flex: 1; min-width: 0; background: var(--bg-input); color: #999; border: 1px solid var(--border-color); border-radius: var(--radius); font-size: 11px; padding: 2px 6px;" :title="item"/>
                                            </template>
                                        </div>
                                    </div>
                                </div>
                            </template>
                        </div>
                    </div>
                </div>
                </template>

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
