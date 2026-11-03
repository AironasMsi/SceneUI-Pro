import sqlite3
from fastapi import WebSocket
from config import DB_PATH

class ConnectionManager:
    def __init__(self): 
        self.active_connections: list[WebSocket] = []
        
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        
    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections: 
            self.active_connections.remove(websocket)
            
    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try: await connection.send_json(message)
            except: pass

manager = ConnectionManager()

async def broadcast_system_state():
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    
    c.execute("SELECT * FROM nodes")
    nodes_data = [dict(n) for n in c.fetchall()]
    node_names = {n["id"]: n["name"] for n in nodes_data}
    
    c.execute("SELECT req_id, status, project_id, scene_id, assigned_node, target_node, priority, created_at FROM queue WHERE status IN ('queued', 'processing')")
    rows = c.fetchall()
    active_tasks = {}
    
    for r in rows:
        proj_id = r["project_id"]
        if proj_id not in active_tasks:
            active_tasks[proj_id] = {}
            
        n_id = r["assigned_node"]
        n_name = node_names.get(n_id, n_id) if n_id else None
        
        active_tasks[proj_id][r["req_id"]] = {
            "status": r["status"], 
            "scene_id": r["scene_id"],
            "node_id": n_id,
            "node_name": n_name,
            "target_node": r["target_node"],
            "priority": r["priority"],
            "created_at": r["created_at"]
        }

    queue_size = len(rows)
    conn.close()
    
    await manager.broadcast({
        "type": "system_update", 
        "queue_size": queue_size, 
        "active_tasks": active_tasks,
        "nodes": nodes_data
    })