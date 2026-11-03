// ============================================================================
// SYSTEM & RENDER FARM LOGIC (frontend/js/farm.js)
// ============================================================================

(function() {

    // 1. WEBSOCKET HOOK (Smart Interceptor)
    window._farmActiveTasks = window._farmActiveTasks || {};
    
    if (!window._wsHooked) {
        window._wsHooked = true;
        const NativeWebSocket = window.WebSocket;
        window.WebSocket = function(...args) {
            const ws = new NativeWebSocket(...args);
            ws.addEventListener('message', function(event) {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'system_update') {
                        window._farmActiveTasks = data.active_tasks || {};
                        
                        // FIX: Ensure UI nodes are re-rendered immediately when node dies or comes alive
                        if (document.getElementById('modalSystemSettings')?.classList.contains('show')) {
                            if (typeof window.renderSystemNodes === 'function') window.renderSystemNodes();
                            window.renderLiveQueue();
                        }
                    }
                } catch(e) {}
            });
            return ws;
        };
    }

    const originalUpdateSystemNodesUI = window.updateSystemNodesUI;
    window.updateSystemNodesUI = function() {
        if (originalUpdateSystemNodesUI) originalUpdateSystemNodesUI();
        if (document.getElementById('modalSystemSettings') && document.getElementById('modalSystemSettings').classList.contains('show')) {
            window.renderSystemNodes();
            window.renderLiveQueue();
        }
    };

    const btnOpenSettings = document.getElementById('btnOpenSettings');
    if(btnOpenSettings) {
        btnOpenSettings.addEventListener('click', async () => {
            if (typeof window.fetchSystemNodes === 'function') await window.fetchSystemNodes();
            window.renderSystemNodes();
            window.renderLiveQueue();
        });
    }

    // ============================================================================
    // 3. GPU NODES RENDER
    // ============================================================================
    window.renderSystemNodes = function() {
        const grid = document.getElementById('renderNodesGrid');
        if (!grid) return;
        
        const nodes = state.renderNodes || [];
        
        if (nodes.length === 0) {
            grid.innerHTML = '<div class="text-muted text-sm" style="grid-column: 1/-1; padding:20px; text-align:center; background: rgba(0,0,0,0.3); border-radius: 8px;">No GPU nodes configured. Click "+ Add New Node" to start building your render farm.</div>';
            return;
        }
        
        let html = '';
        nodes.forEach(n => {
            let statusClass = (n.status === 'offline' || n.status === 'error') ? 'bad' : (n.status === 'processing' ? 'mode' : 'ready');
            let statusText = n.status.toUpperCase();
            let toggleChecked = n.is_active ? 'checked' : '';
            
            if (!n.is_active) {
                statusClass = 'warn';
                statusText = 'PAUSED';
            }

            html += `
            <div class="card" style="padding: 16px; display: flex; flex-direction: column; gap: 12px; background: rgba(0,0,0,0.4);">
                <div class="flex justify-between items-center">
                    <strong class="text-sm" style="color:var(--text); font-size: 14px;">${escapeHtml(n.name)}</strong>
                    <label class="switch" title="Enable/Disable this Node">
                        <input type="checkbox" onchange="window.toggleNodeActive('${n.id}', this.checked)" ${toggleChecked}>
                        <span class="slider"></span>
                    </label>
                </div>
                
                <div class="text-xs text-muted mono" style="word-break: break-all; background: rgba(255,255,255,0.05); padding: 6px; border-radius: 4px;">
                    🔗 ${escapeHtml(n.url)}
                </div>
                
                <div class="flex justify-between items-center mt-auto pt-2" style="border-top: 1px solid var(--border);">
                    <span class="badge ${statusClass}">${statusText}</span>
                    
                    <div class="flex items-center" style="gap:10px">
                        ${n.locked_proj 
                            ? `<span class="badge warn" title="Locked to: ${escapeHtml(n.locked_proj)}">🔒 ${escapeHtml(n.locked_proj).substring(0,8)}...</span>` 
                            : `<span class="badge" style="opacity:0.5">🔓 Global Pool</span>`
                        }
                        <button class="btn icon text-xs" onclick="window.openEditNodeModal('${n.id}')" title="Edit Node Settings">⚙️</button>
                    </div>
                </div>
            </div>`;
        });
        grid.innerHTML = html;
    };

    function populateLockDropdown(selectedProjId) {
        const select = document.getElementById('nodeEditLock');
        if(!select) return;
        
        let html = '<option value="">-- Global Pool (Unlocked) --</option>';
        Object.values(state.projects).forEach(p => {
            const isSelected = (p.id === selectedProjId) ? 'selected' : '';
            html += `<option value="${p.id}" ${isSelected}>${escapeHtml(p.name)} (${p.id.substring(0,8)})</option>`;
        });
        select.innerHTML = html;
    }

    // ============================================================================
    // 4. GPU NODES CRUD ACTIONS
    // ============================================================================
    
    window.openAddNodeModal = function() {
        document.getElementById('nodeEditTitle').textContent = 'Add New GPU Node';
        document.getElementById('nodeEditId').value = 'node_' + Math.random().toString(36).substr(2, 9);
        
        const randomHex = Math.floor(Math.random() * 65536).toString(16).toUpperCase().padStart(4, '0');
        document.getElementById('nodeEditName').value = 'Render-Node-' + randomHex;
        
        document.getElementById('nodeEditUrl').value = 'http://127.0.0.1:8188';
        document.getElementById('nodeEditKey').value = '';
        document.getElementById('nodeEditPaused').checked = false; 
        
        document.getElementById('btnDeleteNode').classList.add('hidden'); 
        
        populateLockDropdown('');
        document.getElementById('modalNodeEdit').classList.add('show');
    };

    window.openEditNodeModal = function(nodeId) {
        const nodes = state.renderNodes || [];
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;

        document.getElementById('nodeEditTitle').textContent = 'Edit GPU Node';
        document.getElementById('nodeEditId').value = node.id;
        document.getElementById('nodeEditName').value = node.name;
        document.getElementById('nodeEditUrl').value = node.url;
        document.getElementById('nodeEditKey').value = node.api_key || '';
        document.getElementById('nodeEditPaused').checked = (node.is_active === 0);
        
        document.getElementById('btnDeleteNode').classList.remove('hidden'); 
        
        populateLockDropdown(node.locked_proj || '');
        document.getElementById('modalNodeEdit').classList.add('show');
    };

    window.saveNodeConfig = async function() {
        const id = document.getElementById('nodeEditId').value;
        const name = document.getElementById('nodeEditName').value.trim();
        let url = document.getElementById('nodeEditUrl').value.trim();
        const key = document.getElementById('nodeEditKey').value.trim();
        const lockedProj = document.getElementById('nodeEditLock').value;
        const isPaused = document.getElementById('nodeEditPaused').checked;

        if (!name || !url) return toast("Error", "Name and URL are required", "error");

        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'http://' + url;
        }
        url = url.replace(/\/+$/, '');

        const isNew = !(state.renderNodes || []).some(n => n.id === id);

        const payload = {
            is_new: isNew,
            id: id,
            name: name,
            url: url,
            api_key: key,
            locked_proj: lockedProj === "" ? null : lockedProj,
            is_active: isPaused ? 0 : 1,
            status: "idle"
        };

        try {
            const res = await fetch('/api/nodes/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                toast("Success", `GPU Node ${isNew ? 'added' : 'updated'} successfully!`, "success");
                document.getElementById('modalNodeEdit').classList.remove('show');
                if (typeof window.fetchSystemNodes === 'function') {
                    await window.fetchSystemNodes();
                }
            } else throw new Error("Server failed to update node.");
        } catch (e) { toast("Error", e.message, "error"); }
    };

    window.deleteNode = async function() {
        const id = document.getElementById('nodeEditId').value;
        if (!id) return;
        if (!confirm("⚠️ Are you sure you want to permanently delete this GPU Node?")) return;

        try {
            const res = await fetch('/api/nodes/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id })
            });
            if (res.ok) {
                toast("Deleted", "GPU Node removed successfully.", "success");
                document.getElementById('modalNodeEdit').classList.remove('show');
                if (typeof window.fetchSystemNodes === 'function') {
                    await window.fetchSystemNodes();
                }
            } else throw new Error("Server failed to delete node.");
        } catch (e) { toast("Error", e.message, "error"); }
    };

    window.toggleNodeActive = async function(id, isActive) {
        try {
            await fetch('/api/nodes/update', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, is_active: isActive ? 1 : 0 })
            });
            if (typeof window.fetchSystemNodes === 'function') {
                await window.fetchSystemNodes();
            }
            if(isActive) toast("Node Active", "GPU is ready to accept tasks.", "success");
            else toast("Node Paused", "GPU will not accept new tasks.", "warn");
        } catch(e) { toast("Error", e.message, "error"); }
    };


    // ============================================================================
    // 5. LIVE QUEUE RENDER
    // ============================================================================
    window.renderLiveQueue = function() {
        const tbody = document.getElementById('liveQueueTbody');
        if (!tbody) return;

        let queueItems = [];

        Object.values(state.projects).forEach(proj => {
            if(proj.outputs) {
                proj.outputs.forEach(out => {
                    out.variations.forEach(v => {
                        if (v.status === 'queued' || v.status === 'processing') {
                            queueItems.push({ id: v.id, projId: proj.id, projName: proj.name, target: `Scene: ${out.sceneId}`, status: v.status, createdAt: v.createdAt });
                        }
                    });
                });
            }
            if(proj.charRefs) {
                Object.keys(proj.charRefs).forEach(refName => {
                    proj.charRefs[refName].variations.forEach(v => {
                        if (v.status === 'queued' || v.status === 'processing') {
                            queueItems.push({ id: v.id, projId: proj.id, projName: proj.name, target: `CharRef: ${refName.split('.')[0]}`, status: v.status, createdAt: v.createdAt });
                        }
                    });
                });
            }
        });

        // Papildomai itraukiame aktyvias uduotis tiesiai is serverio (pvz. sfx_ generavima)
        if (window._farmActiveTasks) {
            Object.keys(window._farmActiveTasks).forEach(pId => {
                const pTasks = window._farmActiveTasks[pId] || {};
                const pName = (state.projects[pId] && state.projects[pId].name) || pId;
                Object.keys(pTasks).forEach(reqId => {
                    if (!queueItems.some(item => item.id === reqId)) {
                        const td = pTasks[reqId];
                        let targetLabel = `Task: ${reqId.substring(0, 8)}`;
                        if (reqId.startsWith('sfx_')) {
                            targetLabel = `🔊 SFX Garsas (Scene: ${td.scene_id || '?'})`;
                        } else if (td.scene_id) {
                            targetLabel = `Scene: ${td.scene_id}`;
                        }
                        queueItems.push({
                            id: reqId,
                            projId: pId,
                            projName: pName,
                            target: targetLabel,
                            status: td.status || 'processing',
                            createdAt: td.created_at || new Date().toISOString()
                        });
                    }
                });
            });
        }

        queueItems.forEach(item => {
            item.isVip = false;
            item.targetNode = null;
            if (window._farmActiveTasks[item.projId] && window._farmActiveTasks[item.projId][item.id]) {
                const td = window._farmActiveTasks[item.projId][item.id];
                if (td.priority === 0) item.isVip = true;
                item.targetNode = td.target_node;
            }
        });

        queueItems.sort((a, b) => {
            if (a.status === 'processing' && b.status !== 'processing') return -1;
            if (b.status === 'processing' && a.status !== 'processing') return 1;
            
            if (a.isVip && !b.isVip) return -1;
            if (b.isVip && !a.isVip) return 1;
            
            return new Date(a.createdAt) - new Date(b.createdAt);
        });

        if (queueItems.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding:40px; font-size:14px;">Relax. The queue is currently empty. ☕</td></tr>`;
            return;
        }

        const nodes = state.renderNodes || [];
        let html = '';
        
        queueItems.forEach((item, index) => {
            const statusClass = item.status === 'processing' ? 'mode' : 'warn';
            const statusText = item.status === 'processing' ? '⚡ Processing' : '⏳ Queued';
            const timeStr = item.createdAt ? item.createdAt.split(' ')[1] : 'Unknown';
            const isQueued = item.status === 'queued';
            
            let gpuDisplay = '';
            
            if (item.status === 'processing') {
                let assignedNodeName = "Unknown";
                if (window._farmActiveTasks[item.projId] && window._farmActiveTasks[item.projId][item.id]) {
                    const taskData = window._farmActiveTasks[item.projId][item.id];
                    if (taskData.node_name) assignedNodeName = taskData.node_name;
                }
                gpuDisplay = `<span style="color:var(--accent); font-weight:bold;">🔵 ${escapeHtml(assignedNodeName)}</span>`;
            } else {
                let selectHtml = `<select onchange="window.assignTaskNode('${item.id}', this.value)" style="padding:4px; border-radius:4px; font-size:11px; background:rgba(0,0,0,0.5); border:1px solid var(--border); color:var(--text); width:150px; outline:none;">`;
                selectHtml += `<option value="">Auto / Load Balancer</option>`;
                
                nodes.forEach(n => {
                    let isSelected = (item.targetNode === n.id) ? 'selected' : '';
                    selectHtml += `<option value="${n.id}" ${isSelected}>${escapeHtml(n.name)}</option>`;
                });
                
                selectHtml += `</select>`;
                gpuDisplay = selectHtml;
            }

            let actionsHtml = '';
            if (isQueued) {
                if (item.isVip) {
                    actionsHtml = `
                        <button class="btn icon text-xs" style="margin-right:5px; opacity:0.3; cursor:not-allowed;" title="Already VIP" disabled>⭐</button>
                        <button class="btn bad icon text-xs" title="Force Cancel Task" onclick="window.cancelTask('${item.id}')">❌</button>
                    `;
                } else {
                    actionsHtml = `
                        <button class="btn icon text-xs" style="margin-right:5px; border-color:var(--warn); color:var(--warn);" title="Make VIP (Bump to Top)" onclick="window.vipTask('${item.id}')">⭐</button>
                        <button class="btn bad icon text-xs" title="Force Cancel Task" onclick="window.cancelTask('${item.id}')">❌</button>
                    `;
                }
            } else {
                actionsHtml = `
                    <button class="btn bad icon text-xs" title="Force Cancel Task" onclick="window.cancelTask('${item.id}')">❌</button>
                `;
            }
            
            let rowBg = item.isVip ? 'rgba(255, 204, 102, 0.08)' : (index % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent');
            
            let displayId = item.isVip 
                ? `<span style="color:var(--warn); font-weight:bold; margin-right:4px;">⭐ VIP</span><span class="mono text-xs text-muted">${item.id.substring(0,8)}...</span>` 
                : `<span class="mono text-xs text-muted">${item.id.substring(0,8)}...</span>`;
            
            html += `
            <tr style="background: ${rowBg}; transition: background 0.2s;">
                <td>${displayId}</td>
                <td class="font-bold text-xs" style="color:var(--text)">${escapeHtml(item.projName)}</td>
                <td class="font-bold text-xs">${escapeHtml(item.target)}</td>
                <td>${gpuDisplay}</td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td>
                    <div class="flex items-center">
                        ${actionsHtml}
                    </div>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html;
    };

    window.assignTaskNode = async function(reqId, targetNode) {
        try {
            const res = await fetch('/api/queue/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ req_id: reqId, target_node: targetNode || null })
            });
            const data = await res.json();
            if(data.status === 'success') {
                toast("Routed", "Task routing updated successfully", "success");
            } else toast("Error", data.message, "error");
        } catch(e) { toast("Error", e.message, "error"); }
    };

    window.cancelTask = async function(reqId) {
        try {
            const res = await fetch('/api/queue/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ req_id: reqId })
            });
            const data = await res.json();
            if(data.status === 'success') {
                // Pašaliname arba atstatome atšauktą užduotį iš esamų projektų variacijų
                Object.values(state.projects || {}).forEach(proj => {
                    let changed = false;
                    (proj.outputs || []).forEach(out => {
                        const vIdx = (out.variations || []).findIndex(v => v.id === reqId);
                        if (vIdx >= 0) {
                            out.variations.splice(vIdx, 1);
                            if (out.mainId === reqId) {
                                const prevDone = out.variations.slice().reverse().find(x => x.status === 'done' && x.url) || out.variations[out.variations.length - 1];
                                out.mainId = prevDone ? prevDone.id : null;
                            }
                            out.generating = out.variations.some(x => x.status === 'queued' || x.status === 'processing');
                            changed = true;
                        }
                    });
                    (Object.values(proj.charRefs || {})).forEach(charData => {
                        const vIdx = (charData.variations || []).findIndex(v => v.id === reqId);
                        if (vIdx >= 0) {
                            charData.variations.splice(vIdx, 1);
                            if (charData.mainId === reqId) {
                                const prevDone = charData.variations.slice().reverse().find(x => x.status === 'done' && x.url) || charData.variations[charData.variations.length - 1];
                                charData.mainId = prevDone ? prevDone.id : null;
                            }
                            charData.generating = charData.variations.some(x => x.status === 'queued' || x.status === 'processing');
                            changed = true;
                        }
                    });
                    if (changed && typeof window.saveProjectToDB === 'function') {
                        window.saveProjectToDB(proj.id);
                    }
                });
                if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images');
                window.renderLiveQueue();
                toast("Cancelled", "Task forcefully removed from queue", "success");
            } else toast("Error", data.message, "error");
        } catch(e) { toast("Error", e.message, "error"); }
    };

    window.vipTask = async function(reqId) {
        try {
            const res = await fetch('/api/queue/vip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ req_id: reqId })
            });
            const data = await res.json();
            if(data.status === 'success') {
                toast("VIP Status", "Task bumped to the top of the queue!", "success");
            }
        } catch(e) { toast("Error", e.message, "error"); }
    };

    window.clearSystemQueue = async function() {
        if (!confirm("⚠️ WARNING! Are you sure you want to FORCE CLEAR ALL pending and processing tasks?")) return;
        
        try {
            const res = await fetch('/api/queue/clear', { method: 'POST' });
            if(res.ok) {
                // Išvalome visas nebaigtas laukiančias variacijas iš projekto ir atstatome buvusius kadrus
                Object.values(state.projects || {}).forEach(proj => {
                    let changed = false;
                    (proj.outputs || []).forEach(out => {
                        const beforeCount = out.variations ? out.variations.length : 0;
                        if (out.variations) {
                            out.variations = out.variations.filter(v => v.status === 'done' && v.url);
                        }
                        if (beforeCount !== (out.variations ? out.variations.length : 0)) {
                            changed = true;
                            const prevDone = out.variations.slice().reverse().find(x => x.status === 'done' && x.url);
                            out.mainId = prevDone ? prevDone.id : null;
                            out.generating = false;
                        }
                    });
                    (Object.values(proj.charRefs || {})).forEach(charData => {
                        const beforeCount = charData.variations ? charData.variations.length : 0;
                        if (charData.variations) {
                            charData.variations = charData.variations.filter(v => v.status === 'done' && v.url);
                        }
                        if (beforeCount !== (charData.variations ? charData.variations.length : 0)) {
                            changed = true;
                            const prevDone = charData.variations.slice().reverse().find(x => x.status === 'done' && x.url);
                            charData.mainId = prevDone ? prevDone.id : null;
                            charData.generating = false;
                        }
                    });
                    if (changed && typeof window.saveProjectToDB === 'function') {
                        window.saveProjectToDB(proj.id);
                    }
                });

                if (typeof window.triggerUIRefresh === 'function') {
                    window.triggerUIRefresh('images');
                    window.triggerUIRefresh('chars');
                }
                window.renderLiveQueue();
                toast("Cleared", "System queue has been forcefully emptied. Ankstesni kadrai atstatyti.", "success");
            }
        } catch(e) {
            toast("Error", "Failed to clear queue: " + e.message, "error");
        }
    };

    setInterval(() => {
        const modal = document.getElementById('modalSystemSettings');
        if (modal && modal.classList.contains('show')) {
            window.renderLiveQueue();
        }
    }, 3000);

})();