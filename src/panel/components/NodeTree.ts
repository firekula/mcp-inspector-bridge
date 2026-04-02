const { ref, computed } = require('vue');

// @ts-ignore
export const NodeTree = {
    props: {
        treeData: {
            type: Object,
            default: () => ({ children: [] })
        }
    },
    emits: ['select', 'hover'],
    template: `
        <div class="node-tree-wrap" @click="onContainerClick">
            <div class="search-bar" style="position: relative;">
                <input type="text" v-model="searchQuery" placeholder="🔍 搜索节点名称..." style="padding-right: 24px;" />
                <span v-if="searchQuery" @click="clearSearch" title="清空搜索与定位"
                      style="position: absolute; right: 10px; top: 46%; transform: translateY(-50%); cursor: pointer; color: #888; font-size: 16px; font-weight: bold;">
                    &times;
                </span>
            </div>
            <div class="tree-content">
                <div v-if="visibleNodes.length === 0" class="empty-hint">
                    没有找到匹配的节点
                </div>
                <div v-for="node in visibleNodes" :key="node.id" 
                     class="tree-node" 
                     :class="[
                        { 
                            active: node.id === selectedId, 
                            inactive: !node.activeInHierarchy 
                        },
                        getPrefabClass(node)
                     ]"
                     :style="{ paddingLeft: (node.depth * 15 + 5) + 'px' }"
                     @click="selectNode(node)"
                     @mouseenter="hoverNode(node)"
                     @mouseleave="clearHover()">
                     
                    <span class="caret" 
                          :class="{ expanded: node.expanded, hidden: !node.hasChildren }"
                          @click.stop="toggleExpand(node)">▶</span>
                          
                    <span class="node-icon" v-if="getIcon(node)">{{ getIcon(node) }}</span>
                    <span class="node-name" v-html="highlight(node.name, node.isMatch)"></span>
                    
                    <span v-if="node.matchedComponent" style="margin-left: auto; font-size: 11px; color: #888; display: inline-block;">
                        ({{ node.matchedComponent }})
                    </span>
                    
                    <span v-if="node.componentsCount > 0" class="comp-badge" :style="node.matchedComponent ? 'margin-left: 5px;' : ''">
                        {{ node.componentsCount }} 📄
                    </span>
                </div>
            </div>
        </div>
    `,
    setup(props: any, { emit }: any) {
        const searchQuery = ref('');
        const selectedId = ref('');
        // 保存节点的展开状态 id -> boolean
        const expandedState = ref({} as Record<string, boolean>);

        // 打平层级树结构为一维数组，便于执行虚拟列表渲染和搜索过滤
        const visibleNodes = computed(() => {
            const list: any[] = [];
            const queries = searchQuery.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
            const isSearching = queries.length > 0;
            
            // 第一遍：深搜打上匹配标记缓存
            const matchState = new Map<string, { isMatch: boolean, hasMatchedDescendant: boolean, matchedComponent: string }>();
            
            function markMatches(node: any): { isMatch: boolean, hasMatchedDescendant: boolean, matchedComponent: string } {
                if (!node || !node.id) return { isMatch: false, hasMatchedDescendant: false, matchedComponent: '' };
                
                let isMatch = true;
                let matchedComponent = '';
                
                if (isSearching) {
                    const nodeNameLower = (node.name || '').toLowerCase();
                    const cList = node.componentNames || (Array.isArray(node.components) ? node.components : []);
                    const cNamesLower = cList.map((c: string) => c.toLowerCase());
                    isMatch = queries.every((q: string) => {
                        if (nodeNameLower.includes(q)) return true;
                        const matchIdx = cNamesLower.findIndex((c: string) => c.includes(q));
                        if (matchIdx !== -1) {
                            if (!matchedComponent) matchedComponent = cList[matchIdx];
                            return true;
                        }
                        return false;
                    });
                } else {
                    isMatch = false;
                }
                
                let hasMatchedDescendant = false;
                if (node.children && node.children.length > 0) {
                    for (const child of node.children) {
                        const childRes = markMatches(child);
                        if (childRes.isMatch || childRes.hasMatchedDescendant) {
                            hasMatchedDescendant = true;
                        }
                    }
                }
                
                const state = { isMatch, hasMatchedDescendant, matchedComponent };
                matchState.set(node.id, state);
                return state;
            }

            if (isSearching) {
                if (props.treeData && props.treeData.id) {
                    markMatches(props.treeData);
                } else if (props.treeData && props.treeData.children) {
                    for (const child of props.treeData.children) {
                        markMatches(child);
                    }
                }
            }

            // 第二遍：入队可见渲染列表
            function traverse(node: any, depth: number, isVisible: boolean, isRevealedByParent: boolean, currentPath: string[]) {
                if (!node || !node.id) return;
                
                const hasChildren = node.children && node.children.length > 0;
                
                if (expandedState.value[node.id] === undefined) {
                    expandedState.value[node.id] = depth < 1;
                }

                let matches = false;
                let matchedComponent = '';
                let hasMatchedDescendant = false;
                
                if (isSearching) {
                    const state = matchState.get(node.id);
                    if (state) {
                        matches = state.isMatch;
                        matchedComponent = state.matchedComponent;
                        hasMatchedDescendant = state.hasMatchedDescendant;
                    }
                }

                let shouldPush = false;
                if (!isSearching) {
                    shouldPush = isVisible;
                } else {
                    shouldPush = isVisible && (matches || hasMatchedDescendant); // 严格路径过滤，只塞入匹配链
                }

                if (shouldPush) {
                    list.push({
                        ...node,
                        depth,
                        expanded: isSearching && hasMatchedDescendant ? true : !!expandedState.value[node.id],
                        hasChildren,
                        componentsCount: node.components ? node.components.length : 0,
                        matchedComponent,
                        isMatch: isSearching ? matches : undefined,
                        ancestorIds: currentPath
                    });
                }

                if (hasChildren) {
                    const nextPath = [...currentPath, node.id];
                    for (const child of node.children) {
                        let childVisible = false;
                        let childRevealedByParent = false;
                        
                        if (!isSearching) {
                            childVisible = isVisible && !!expandedState.value[node.id];
                        } else {
                            const childState = matchState.get(child.id);
                            const childOnTrack = childState ? (childState.isMatch || childState.hasMatchedDescendant) : false;
                            
                            if (childOnTrack) {
                                childVisible = isVisible; // 只有位于匹配树干上的子节点才有资格向下钻递可见性
                            } else {
                                childVisible = false; // 严格剔除一切不相关的并列节点以及普通子节点
                            }
                        }
                        
                        traverse(child, depth + 1, childVisible, false, nextPath);
                    }
                }
            }

            if (props.treeData && props.treeData.id) {
                traverse(props.treeData, 0, true, false, []);
            } else if (props.treeData && props.treeData.children) {
                for (const child of props.treeData.children) {
                    traverse(child, 0, true, false, []);
                }
            }
            
            return list;
        });

        const toggleExpand = (node: any) => {
            if (!node.hasChildren) return;
            expandedState.value[node.id] = !expandedState.value[node.id];
        };

        const selectNode = (node: any) => {
            console.log(`[Selection-Debug] Trigger: Panel-Tree-Click | NodeID: ${node.id} | Name: ${node.name || 'Unknown'}`);
            selectedId.value = node.id;
            // 记录下所有的祖先级 ID 以便清除搜索后能自动连级展开
            if (node.ancestorIds) {
                node.ancestorIds.forEach((pid: string) => {
                    expandedState.value[pid] = true;
                });
            }
            emit('select', node);
        };

        const hoverNode = (node: any) => {
            emit('hover', node);
        };

        const clearHover = () => {
            emit('hover', null);
        };

        const expandToNode = (targetId: string) => {
            let path: string[] | null = null;
            function findPath(node: any, currentPath: string[]): boolean {
                if (!node) return false;
                if (node.id === targetId) {
                    path = currentPath;
                    return true;
                }
                const nextPath = [...currentPath, node.id];
                if (node.children) {
                    for (const child of node.children) {
                        if (findPath(child, nextPath)) return true;
                    }
                }
                return false;
            }

            let found = false;
            if (props.treeData && props.treeData.id) {
                found = findPath(props.treeData, []);
            } else if (props.treeData && props.treeData.children) {
                for (const child of props.treeData.children) {
                    if (findPath(child, [])) {
                        found = true;
                        break;
                    }
                }
            }

            if (found && path) {
                // 1. 展开所有长辈节点
                (path as string[]).forEach((pid: string) => {
                    expandedState.value[pid] = true;
                });
                
                // 2. 模拟高亮选中对象
                selectedId.value = targetId;

                // 3. 将元素滑向视野中央
                setTimeout(() => {
                    const el = document.querySelector('.tree-node.active');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);

                console.log(`[Selection-Debug] Trigger: Panel-Tree-ExpandToNode | TargetID: ${targetId}`);

                // 发送给外层通知数据装配
                emit('select', { id: targetId });
                return true;
            }
            return false;
        };

        const clearSearch = () => {
            searchQuery.value = '';
        };

        const onContainerClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('.search-bar') || target.closest('.tree-node')) {
                return;
            }
            if (selectedId.value !== '') {
                selectedId.value = '';
                emit('select', null);
            }
        };

        const highlight = (name: string, isMatch?: boolean) => {
            if (isMatch === false) return name; // 搜索模式下此节点并不匹配
            const queries = searchQuery.value.trim().split(/\s+/).filter(Boolean);
            if (queries.length === 0) return name;
            
            const escapedQueries = queries.map((q: string) => q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            const regex = new RegExp('(' + escapedQueries.join('|') + ')', 'gi');
            return name.replace(regex, '<mark>$1</mark>');
        };

        const getIcon = (node: any) => {
            if (node.isScene) return '🌐';
            if (node.prefabRoot) return '📦';
            return ''; // 普通节点没有任何图标，避免任何像复选框的错觉
        };

        const getPrefabClass = (node: any) => {
            if (!node.isPrefab) return '';
            const depth = Math.min(node.prefabDepth, 3);
            return `prefab-depth-${depth}`;
        };

        return {
            searchQuery,
            selectedId,
            visibleNodes,
            toggleExpand,
            selectNode,
            clearSearch,
            highlight,
            getIcon,
            getPrefabClass,
            expandToNode,
            hoverNode,
            clearHover,
            onContainerClick
        };
    }
};
