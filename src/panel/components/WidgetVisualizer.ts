const { ref, computed } = require('vue');

export const WidgetVisualizer = {
    props: {
        comp: Object
    },
    emits: ['update-prop'],
    template: `
        <div class="widget-visualizer" style="font-size: 11px; color: var(--text-main, #d4d4d4); margin-bottom: 8px;">
            <!-- Viz Area -->
            <div class="viz-area" style="position: relative; width: 100%; height: 160px; background: var(--bg-input, #1e1e1e); border-radius: var(--radius, 4px); margin-bottom: 10px; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 1px solid var(--border-color, #3e3e3e);">
                
                <!-- Center Square -->
                <div style="width: 50px; height: 50px; border: 1px dashed #666; background: rgba(255,255,255,0.05); position: relative; border-radius: 4px;">
                    <!-- Center Checks -->
                    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                        <label style="display:flex; align-items:center; gap: 4px; cursor: pointer; color: var(--text-main);" title="Horizontal Center">
                            <input type="checkbox" :checked="getProp('isAlignHorizontalCenter')" @change="setProp('isAlignHorizontalCenter', $event.target.checked)" style="margin:0; accent-color: var(--accent-blue);" /> <span style="font-size: 10px;">H</span>
                        </label>
                        <label style="display:flex; align-items:center; gap: 4px; cursor: pointer; color: var(--text-main);" title="Vertical Center">
                            <input type="checkbox" :checked="getProp('isAlignVerticalCenter')" @change="setProp('isAlignVerticalCenter', $event.target.checked)" style="margin:0; accent-color: var(--accent-blue);" /> <span style="font-size: 10px;">V</span>
                        </label>
                    </div>
                </div>

                <!-- Top -->
                <div style="position: absolute; top: 5px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; z-index: 10;">
                    <label style="display:flex; align-items:center; gap: 4px; cursor: pointer; background: rgba(0,0,0,0.5); padding: 2px 4px; border-radius: 3px;">
                        <input type="checkbox" :checked="getProp('isAlignTop')" @change="setProp('isAlignTop', $event.target.checked)" style="margin:0; accent-color: var(--accent-blue);" /> Top
                    </label>
                    <div v-show="getProp('isAlignTop')" style="display:flex; gap: 2px; margin-top:2px; background: rgba(255,255,255,0.05); padding: 2px; border-radius: 3px;">
                        <input type="number" step="1" :value="formatNumber(getProp('top'))" @change="setProp('top', parseFloat($event.target.value))" style="width: 45px; background:transparent; color:#e5c07b; border:none; outline:none; font-size:10px; text-align:right;" />
                        <span style="font-size:9px; cursor:pointer; color:var(--text-muted); padding: 0 2px;" @click="toggleAbs('isAbsoluteTop')" :title="'单位切换: ' + (getProp('isAbsoluteTop')?'px':'%')">{{ getProp('isAbsoluteTop') ? 'px' : '%' }}</span>
                    </div>
                </div>

                <!-- Bottom -->
                <div style="position: absolute; bottom: 5px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; z-index: 10;">
                    <div v-show="getProp('isAlignBottom')" style="display:flex; gap: 2px; margin-bottom:2px; background: rgba(255,255,255,0.05); padding: 2px; border-radius: 3px;">
                        <input type="number" step="1" :value="formatNumber(getProp('bottom'))" @change="setProp('bottom', parseFloat($event.target.value))" style="width: 45px; background:transparent; color:#e5c07b; border:none; outline:none; font-size:10px; text-align:right;" />
                        <span style="font-size:9px; cursor:pointer; color:var(--text-muted); padding: 0 2px;" @click="toggleAbs('isAbsoluteBottom')">{{ getProp('isAbsoluteBottom') ? 'px' : '%' }}</span>
                    </div>
                    <label style="display:flex; align-items:center; gap: 4px; cursor: pointer; background: rgba(0,0,0,0.5); padding: 2px 4px; border-radius: 3px;">
                        <input type="checkbox" :checked="getProp('isAlignBottom')" @change="setProp('isAlignBottom', $event.target.checked)" style="margin:0; accent-color: var(--accent-blue);" /> Bottom
                    </label>
                </div>

                <!-- Left -->
                <div style="position: absolute; left: 5px; top: 50%; transform: translateY(-50%); display: flex; align-items: center; gap: 6px; z-index: 10;">
                    <label style="display:flex; flex-direction:column; align-items:center; gap: 4px; cursor: pointer; background: rgba(0,0,0,0.5); padding: 4px 2px; border-radius: 3px;">
                        <input type="checkbox" :checked="getProp('isAlignLeft')" @change="setProp('isAlignLeft', $event.target.checked)" style="margin:0; accent-color: var(--accent-blue);" /> Left
                    </label>
                    <div v-show="getProp('isAlignLeft')" style="display:flex; flex-direction:column; gap: 2px; background: rgba(255,255,255,0.05); padding: 2px; border-radius: 3px;">
                        <input type="number" step="1" :value="formatNumber(getProp('left'))" @change="setProp('left', parseFloat($event.target.value))" style="width: 45px; background:transparent; color:#e5c07b; border:none; outline:none; font-size:10px; text-align:center;" />
                        <span style="font-size:9px; cursor:pointer; text-align:center; color:var(--text-muted); border-top: 1px solid var(--border-color);" @click="toggleAbs('isAbsoluteLeft')">{{ getProp('isAbsoluteLeft') ? 'px' : '%' }}</span>
                    </div>
                </div>

                <!-- Right -->
                <div style="position: absolute; right: 5px; top: 50%; transform: translateY(-50%); display: flex; align-items: center; gap: 6px; z-index: 10;">
                    <div v-show="getProp('isAlignRight')" style="display:flex; flex-direction:column; gap: 2px; background: rgba(255,255,255,0.05); padding: 2px; border-radius: 3px;">
                        <input type="number" step="1" :value="formatNumber(getProp('right'))" @change="setProp('right', parseFloat($event.target.value))" style="width: 45px; background:transparent; color:#e5c07b; border:none; outline:none; font-size:10px; text-align:center;" />
                        <span style="font-size:9px; cursor:pointer; text-align:center; color:var(--text-muted); border-top: 1px solid var(--border-color);" @click="toggleAbs('isAbsoluteRight')">{{ getProp('isAbsoluteRight') ? 'px' : '%' }}</span>
                    </div>
                    <label style="display:flex; flex-direction:column; align-items:center; gap: 4px; cursor: pointer; background: rgba(0,0,0,0.5); padding: 4px 2px; border-radius: 3px;">
                        <input type="checkbox" :checked="getProp('isAlignRight')" @change="setProp('isAlignRight', $event.target.checked)" style="margin:0; accent-color: var(--accent-blue);" /> Right
                    </label>
                </div>
            </div>

            <!-- Horizontal / Vertical Center Inputs -->
            <div style="display: flex; gap: 10px; margin-bottom: 12px; justify-content: center;">
                <div v-show="getProp('isAlignHorizontalCenter')" style="display:flex; align-items:center; gap:4px; background: rgba(255,255,255,0.02); padding: 4px 6px; border-radius: var(--radius); border: 1px solid var(--border-color);">
                    <span style="color:var(--text-muted);">H.Center</span>
                    <input type="number" step="1" :value="formatNumber(getProp('horizontalCenter'))" @change="setProp('horizontalCenter', parseFloat($event.target.value))" style="width: 45px; background:var(--bg-input); color:var(--text-main); border:1px solid var(--border-color); border-radius: 2px; text-align: right;" />
                    <span style="font-size:9px; cursor:pointer; color:var(--text-muted);" @click="toggleAbs('isAbsoluteHorizontalCenter')">{{ getProp('isAbsoluteHorizontalCenter') ? 'px' : '%' }}</span>
                </div>
                <div v-show="getProp('isAlignVerticalCenter')" style="display:flex; align-items:center; gap:4px; background: rgba(255,255,255,0.02); padding: 4px 6px; border-radius: var(--radius); border: 1px solid var(--border-color);">
                    <span style="color:var(--text-muted);">V.Center</span>
                    <input type="number" step="1" :value="formatNumber(getProp('verticalCenter'))" @change="setProp('verticalCenter', parseFloat($event.target.value))" style="width: 45px; background:var(--bg-input); color:var(--text-main); border:1px solid var(--border-color); border-radius: 2px; text-align: right;" />
                    <span style="font-size:9px; cursor:pointer; color:var(--text-muted);" @click="toggleAbs('isAbsoluteVerticalCenter')">{{ getProp('isAbsoluteVerticalCenter') ? 'px' : '%' }}</span>
                </div>
            </div>

            <!-- Advanced Section -->
            <div style="border-top: 1px solid var(--border-color); padding-top: 8px;">
                <div @click="showAdv = !showAdv" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center; color:var(--text-muted); margin-bottom: 8px; font-weight: bold;">
                    <span>高级设置</span>
                    <span style="font-size: 10px;">{{ showAdv ? '▼' : '◀' }}</span>
                </div>
                <div v-show="showAdv" style="display: flex; flex-direction: column; gap: 6px; padding: 0 4px;">
                    <!-- target -->
                    <div style="display:flex; justify-content:space-between; align-items: center; border-bottom: 1px dashed var(--border-color); padding-bottom: 4px;">
                        <span style="color: var(--text-muted);">Target</span>
                        <div v-if="getProp('target') && getProp('target').uuid" class="asset-link" style="width: auto; max-width: 140px; padding: 0 8px; min-height: 20px;">
                            <span class="asset-name" :title="getProp('target').uuid">{{ getProp('target').name || 'Node' }}</span>
                        </div>
                        <span v-else style="color:#ff6b6b; font-size:10px;">无 (父节点)</span>
                    </div>
                    <!-- alignMode -->
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px dashed var(--border-color); padding-bottom: 4px;">
                        <span style="color: var(--text-muted);">Align Mode</span>
                        <select :value="getProp('alignMode')" @change="setProp('alignMode', parseInt($event.target.value))" style="background:var(--bg-input); color:var(--text-main); border:1px solid var(--border-color); border-radius: var(--radius); padding: 2px; outline: none;">
                            <option :value="0">ONCE</option>
                            <option :value="1">ON_WINDOW_RESIZE</option>
                            <option :value="2">ALWAYS</option>
                        </select>
                    </div>
                    <!-- stretch -->
                    <label style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; border-bottom: 1px dashed var(--border-color); padding-bottom: 4px;">
                        <span style="color: var(--text-muted);">Stretch Width</span>
                        <input type="checkbox" :checked="getProp('isStretchWidth')" @change="setProp('isStretchWidth', $event.target.checked)" style="margin: 0; accent-color: var(--accent-blue);" />
                    </label>
                    <label style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
                        <span style="color: var(--text-muted);">Stretch Height</span>
                        <input type="checkbox" :checked="getProp('isStretchHeight')" @change="setProp('isStretchHeight', $event.target.checked)" style="margin: 0; accent-color: var(--accent-blue);" />
                    </label>
                </div>
            </div>
        </div>
    `,
    setup(props: any, { emit }: any) {
        const showAdv = ref(false);

        const getProp = (key: string) => {
            if (!props.comp || !props.comp.properties) return undefined;
            const p = props.comp.properties.find((x: any) => x.key === key);
            return p ? p.value : undefined;
        };

        const setProp = (key: string, value: any) => {
            emit('update-prop', key, value);
        };

        const toggleAbs = (key: string) => {
            const current = getProp(key);
            setProp(key, !current); // isAbsoluteXXX is boolean
        };

        const formatNumber = (val: any) => {
            if (val === undefined || val === null) return 0;
            const res = parseFloat(val);
            return isNaN(res) ? 0 : Number(res.toFixed(3));
        };

        return {
            showAdv,
            getProp,
            setProp,
            toggleAbs,
            formatNumber
        };
    }
};
