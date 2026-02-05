"""
WebSocket endpoint for real-time POS notifications.
Clients connect to /ws/{client_id} to receive broadcasts.
"""
import uuid
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.websocket_manager import (
    manager,
    EventType,
    create_event,
)

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/{client_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    client_id: str,
):
    """
    WebSocket connection endpoint.
    
    Connect: ws://host:port/ws/{client_id}
    
    The client_id should be unique per POS terminal (e.g., "pos-1", "terminal-abc").
    
    Messages received from server:
    {
        "type": "mpesa.payment_received",
        "data": {"trans_id": "LXX123", "amount": 500.0},
        "timestamp": "2026-01-31T12:00:00Z",
        "source": "server"
    }
    
    Client can send:
    - {"type": "ping"} -> server responds with {"type": "pong"}
    - Any other message is echoed back for debugging
    """
    await manager.connect(websocket, client_id)
    
    # Send welcome message
    await websocket.send_json(create_event(
        "connected",
        {
            "client_id": client_id,
            "message": "Connected to DukaPOS WebSocket",
            "total_clients": manager.get_connection_count(),
        }
    ))
    
    try:
        while True:
            # Wait for messages from client
            data = await websocket.receive_json()
            
            msg_type = data.get("type", "")
            
            if msg_type == EventType.PING:
                # Respond to ping with pong
                await websocket.send_json(create_event(EventType.PONG, {"client_id": client_id}))
            else:
                # Echo other messages (useful for debugging)
                await websocket.send_json(create_event(
                    "echo",
                    {"received": data}
                ))
                
    except WebSocketDisconnect:
        await manager.disconnect(client_id)
    except Exception:
        await manager.disconnect(client_id)


@router.websocket("/ws")
async def websocket_auto_id(websocket: WebSocket):
    """
    WebSocket with auto-generated client ID.
    Use when client doesn't have a specific ID.
    """
    client_id = f"auto-{uuid.uuid4().hex[:8]}"
    await websocket_endpoint(websocket, client_id)


@router.get("/ws/status")
def websocket_status():
    """Get WebSocket connection status."""
    return {
        "connected_clients": manager.get_connection_count(),
        "client_ids": manager.get_connected_clients(),
    }


@router.post("/ws/broadcast")
async def manual_broadcast(
    event_type: str = Query(..., description="Event type"),
    message: str = Query("", description="Message data"),
):
    """
    Manually broadcast a message to all connected clients.
    Useful for testing or admin notifications.
    """
    event = create_event(event_type, {"message": message})
    sent = await manager.broadcast(event)
    return {
        "sent_to": sent,
        "event": event,
    }
