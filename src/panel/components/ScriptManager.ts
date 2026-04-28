module.exports = {
    name: 'ScriptManager',
    props: { scriptList: { type: Array, default: () => [] } },
    emits: ['new-script', 'import-script', 'enable-script', 'disable-script', 'edit-script', 'export-script', 'delete-script'],
    template: `
<div style="background: #252525; padding: 12px; border-radius: 4px; border: 1px solid #333;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <div style="font-size: var(--base-font-size, 13px); font-weight: bold;">用户脚本管理</div>
        <div style="display: flex; gap: 5px;">
            <button class="icon-btn" style="width: auto; padding: 2px 8px;" @click="$emit('new-script')">+ 新建</button>
            <button class="icon-btn" style="width: auto; padding: 2px 8px;" @click="$emit('import-script')">导入</button>
        </div>
    </div>
    <div v-if="scriptList.length === 0" style="color: #666; text-align: center; padding: 20px; font-size: calc(var(--base-font-size, 13px) - 1px);">
        暂无用户脚本。<br>点击「新建」从模板创建或「导入」已有 .user.js 文件。
    </div>
    <div v-for="script in scriptList" :key="script.name"
        style="margin-bottom: 8px; background: #1e1e1e; border: 1px solid #333; border-radius: 4px; padding: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="color: #e0e0e0; font-weight: bold; font-size: calc(var(--base-font-size, 13px));">{{ script.name }}</span>
                    <span style="color: #666; font-size: calc(var(--base-font-size, 13px) - 2px);">v{{ script.version }}</span>
                    <span :style="{
                        display: 'inline-block', padding: '2px 6px', borderRadius: '3px', fontSize: 'calc(var(--base-font-size, 13px) - 3px)',
                        background: script.status === 'running' ? 'rgba(76,175,80,0.2)' : (script.status === 'error' ? 'rgba(244,67,54,0.2)' : 'rgba(255,152,0,0.2)'),
                        color: script.status === 'running' ? '#4caf50' : (script.status === 'error' ? '#f44336' : '#ff9800')
                    }">{{ script.status === 'running' ? '运行中' : (script.status === 'error' ? '错误' : '已停用') }}</span>
                </div>
                <div style="color: #888; font-size: calc(var(--base-font-size, 13px) - 2px); margin-top: 3px;">
                    {{ script.description || '无描述' }}
                    <span style="margin-left: 8px; color: #666;" v-if="script.author">by {{ script.author }}</span>
                    <span style="margin-left: 8px; color: #666;" v-if="script.grants.length">| 权限: {{ script.grants.join(', ') }}</span>
                    <span style="margin-left: 8px; color: #666;" v-if="script.toolCount > 0">| {{ script.toolCount }} MCP工具</span>
                </div>
                <div v-if="script.status === 'error'" style="color: #f44336; font-size: calc(var(--base-font-size, 13px) - 3px); margin-top: 3px;">
                    错误: {{ script.errorMsg }}
                </div>
            </div>
            <div style="display: flex; gap: 5px; flex-shrink: 0;">
                <button v-if="script.status !== 'running'" class="icon-btn" style="width: auto; padding: 2px 8px; color: #4caf50;" @click="$emit('enable-script', script.fileName)">启用</button>
                <button v-else class="icon-btn" style="width: auto; padding: 2px 8px; color: #ff9800;" @click="$emit('disable-script', script.fileName)">停用</button>
                <button class="icon-btn" style="width: auto; padding: 2px 8px;" @click="$emit('edit-script', script.fileName)">编辑</button>
                <button class="icon-btn" style="width: auto; padding: 2px 8px;" @click="$emit('export-script', script.fileName)">导出</button>
                <button class="icon-btn" style="width: auto; padding: 2px 8px; color: #f44336;" @click="$emit('delete-script', script.fileName)">删除</button>
            </div>
        </div>
    </div>
</div>`
};
