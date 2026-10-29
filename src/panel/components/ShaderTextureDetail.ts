const { defineComponent, ref, computed, toRefs } = require('vue');

/**
 * 着色器与纹理绑定详情组件
 * 展示详细的 Shader 切换和纹理绑定统计，帮助诊断渲染性能问题
 * 支持点击跳转到编辑器资源管理器
 */
export const ShaderTextureDetail = defineComponent({
    name: 'ShaderTextureDetail',
    props: {
        details: {
            type: Object,
            default: () => ({
                shaderCount: 0,
                textureCount: 0,
                shaders: [],
                textures: [],
                summary: { totalShaderSwitches: 0, totalTextureBinds: 0 }
            })
        }
    },
    emits: ['locate-asset'],
    setup(props: any, { emit }: any) {
        const { details } = toRefs(props);

        const activeTab = ref('shaders');
        const sortBy = ref('count');

        const sortedShaders = computed(() => {
            const arr = details.value?.shaders || [];
            return [...arr].sort((a: any, b: any) => {
                return sortBy.value === 'count' ? b.count - a.count : b.lastUsed - a.lastUsed;
            });
        });

        const sortedTextures = computed(() => {
            const arr = details.value?.textures || [];
            return [...arr].sort((a: any, b: any) => {
                return sortBy.value === 'count' ? b.count - a.count : b.lastUsed - a.lastUsed;
            });
        });

        const formatTime = (timestamp: number) => {
            if (!timestamp) return '-';
            const now = Date.now();
            const diff = now - timestamp;
            if (diff < 1000) return '刚刚';
            if (diff < 60000) return `${Math.floor(diff / 1000)}秒前`;
            return `${Math.floor(diff / 60000)}分钟前`;
        };

        // 跳转到资源
        const locateAsset = (item: any) => {
            if (item && item.assetUuid) {
                emit('locate-asset', item.assetUuid);
            }
        };

        return {
            activeTab,
            sortBy,
            sortedShaders,
            sortedTextures,
            formatTime,
            locateAsset
        };
    },
    template: `
        <div class="shader-texture-detail">
            <!-- 汇总统计 -->
            <div class="detail-summary">
                <div class="summary-item">
                    <span class="summary-label">着色器数量</span>
                    <span class="summary-value">{{ details?.shaderCount || 0 }}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">着色器切换总数</span>
                    <span class="summary-value warn">{{ details?.summary?.totalShaderSwitches || 0 }}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">纹理数量</span>
                    <span class="summary-value">{{ details?.textureCount || 0 }}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">纹理绑定总数</span>
                    <span class="summary-value warn">{{ details?.summary?.totalTextureBinds || 0 }}</span>
                </div>
            </div>

            <!-- 标签切换 -->
            <div class="detail-tabs">
                <div :class="['detail-tab', activeTab === 'shaders' ? 'active' : '']" @click="activeTab = 'shaders'">
                    着色器切换 ({{ details?.shaderCount || 0 }})
                </div>
                <div :class="['detail-tab', activeTab === 'textures' ? 'active' : '']" @click="activeTab = 'textures'">
                    纹理绑定 ({{ details?.textureCount || 0 }})
                </div>
                <div class="detail-sort">
                    <span>排序:</span>
                    <select v-model="sortBy" class="sort-select">
                        <option value="count">按次数</option>
                        <option value="lastUsed">按最近使用</option>
                    </select>
                </div>
            </div>

            <!-- 详情列表 -->
            <div class="detail-list">
                <!-- 着色器列表 -->
                <div v-if="activeTab === 'shaders'" class="detail-table-wrap">
                    <table class="detail-table">
                        <thead>
                            <tr>
                                <th>着色器标识</th>
                                <th>切换次数 ⬇</th>
                                <th>最近使用</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(shader, idx) in sortedShaders" :key="idx">
                                <td class="shader-id" :title="shader.id">{{ shader.id }}</td>
                                <td>
                                    <div class="count-bar">
                                        <div class="count-fill" :style="{ width: Math.min((shader.count / (sortedShaders[0]?.count || 1)) * 100, 100) + '%' }"></div>
                                        <span class="count-text">{{ shader.count }}</span>
                                    </div>
                                </td>
                                <td class="time-text">{{ formatTime(shader.lastUsed) }}</td>
                                <td>
                                    <button v-if="shader.assetUuid" class="locate-btn" @click="locateAsset(shader)"
                                        :title="'在资源管理器中定位: ' + shader.assetName">🎯 定位</button>
                                    <span v-else class="no-asset">-</span>
                                </td>
                            </tr>
                            <tr v-if="sortedShaders.length === 0">
                                <td colspan="4" class="empty-row">暂无数据</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- 纹理列表 -->
                <div v-else class="detail-table-wrap">
                    <table class="detail-table">
                        <thead>
                            <tr>
                                <th>纹理标识</th>
                                <th>尺寸</th>
                                <th>绑定次数 ⬇</th>
                                <th>最近使用</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(texture, idx) in sortedTextures" :key="idx">
                                <td class="texture-id" :title="texture.id">{{ texture.id }}</td>
                                <td class="size-text">{{ texture.size || '-' }}</td>
                                <td>
                                    <div class="count-bar">
                                        <div class="count-fill" :style="{ width: Math.min((texture.count / (sortedTextures[0]?.count || 1)) * 100, 100) + '%' }"></div>
                                        <span class="count-text">{{ texture.count }}</span>
                                    </div>
                                </td>
                                <td class="time-text">{{ formatTime(texture.lastUsed) }}</td>
                                <td>
                                    <button v-if="texture.assetUuid" class="locate-btn" @click="locateAsset(texture)"
                                        :title="'在资源管理器中定位: ' + texture.assetName">🎯 定位</button>
                                    <span v-else class="no-asset">-</span>
                                </td>
                            </tr>
                            <tr v-if="sortedTextures.length === 0">
                                <td colspan="5" class="empty-row">暂无数据</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 优化建议 -->
            <div class="detail-hints">
                <div class="hint-title">💡 优化建议</div>
                <ul class="hint-list">
                    <li>着色器切换过多：检查材质排序，合并相似材质，减少状态切换</li>
                    <li>纹理绑定过多：使用图集(Texture Atlas)，合并小纹理，减少纹理切换</li>
                    <li>批次优化：相同材质/纹理的节点尽量连续渲染</li>
                    <li>点击 🎯 定位按钮可跳转到资源管理器查看具体资源</li>
                </ul>
            </div>
        </div>
    `
});
