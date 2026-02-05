"""
WebSocket connection manager for real-time notifications.
Broadcasts events to all connected POS terminals.
"""
import asyncio
from datetime import datetime
from typing import Dict, List, Any, Optional
from fastapi import WebSocket
import logging

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Manages WebSocket connections and broadcasts messages to connected clients.
    Thread-safe for use with FastAPI async handlers.
    """

    def __init__(self):
        # Map of client_id -> WebSocket connection
        self.active_connections: Dict[str, WebSocket] = {}
        # Lock for thread-safe operations
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, client_id: str) -> None:
        """Accept a new WebSocket connection."""
        await websocket.accept()
        async with self._lock:
            # Close existing connection with same client_id if any
            if client_id in self.active_connections:
                try:
                    await self.active_connections[client_id].close()
                except Exception:
                    pass
            self.active_connections[client_id] = websocket
        logger.info(f"WebSocket connected: {client_id} (total: {len(self.active_connections)})")

    async def disconnect(self, client_id: str) -> None:
        """Remove a WebSocket connection."""
        async with self._lock:
            if client_id in self.active_connections:
                del self.active_connections[client_id]
        logger.info(f"WebSocket disconnected: {client_id} (total: {len(self.active_connections)})")

    async def send_personal_message(self, message: dict, client_id: str) -> bool:
        """Send a message to a specific client."""
        async with self._lock:
            websocket = self.active_connections.get(client_id)
        if websocket:
            try:
                await websocket.send_json(message)
                return True
            except Exception as e:
                logger.warning(f"Failed to send to {client_id}: {e}")
                await self.disconnect(client_id)
        return False

    async def broadcast(self, message: dict, exclude: Optional[str] = None) -> int:
        """
        Broadcast a message to all connected clients.
        Returns the number of clients that received the message.
        """
        async with self._lock:
            connections = list(self.active_connections.items())

        sent_count = 0
        disconnected = []

        for client_id, websocket in connections:
            if exclude and client_id == exclude:
                continue
            try:
                await websocket.send_json(message)
                sent_count += 1
            except Exception as e:
                logger.warning(f"Broadcast failed for {client_id}: {e}")
                disconnected.append(client_id)

        # Clean up disconnected clients
        for client_id in disconnected:
            await self.disconnect(client_id)

        return sent_count

    def get_connection_count(self) -> int:
        """Return the number of active connections."""
        return len(self.active_connections)

    def get_connected_clients(self) -> List[str]:
        """Return list of connected client IDs."""
        return list(self.active_connections.keys())


# Global connection manager instance
manager = ConnectionManager()


# --- Event Types ---

class EventType:
    """Standard event types for WebSocket messages."""
    # M-Pesa events
    MPESA_PAYMENT_RECEIVED = "mpesa.payment_received"
    MPESA_PAYMENT_FAILED = "mpesa.payment_failed"
    MPESA_STK_CALLBACK = "mpesa.stk_callback"

    # Inventory events
    INVENTORY_UPDATED = "inventory.updated"
    INVENTORY_LOW_STOCK = "inventory.low_stock"

    # Transaction events
    TRANSACTION_CREATED = "transaction.created"
    TRANSACTION_VOIDED = "transaction.voided"

    # Shift events
    SHIFT_OPENED = "shift.opened"
    SHIFT_CLOSED = "shift.closed"

    # Order events
    ORDER_HELD = "order.held"
    ORDER_RECALLED = "order.recalled"
    ORDER_DELETED = "order.deleted"

    # System events
    SYSTEM_BACKUP = "system.backup"
    SYSTEM_SYNC = "system.sync"

    # Connection events
    PING = "ping"
    PONG = "pong"


def create_event(event_type: str, data: Any, source: Optional[str] = None) -> dict:
    """Create a standardized WebSocket event message."""
    return {
        "type": event_type,
        "data": data,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "source": source or "server",
    }


# --- Broadcast helpers (can be called from anywhere in the app) ---

async def broadcast_mpesa_payment(trans_id: str, amount: float, phone: Optional[str] = None):
    """Broadcast M-Pesa payment received event."""
    event = create_event(
        EventType.MPESA_PAYMENT_RECEIVED,
        {
            "trans_id": trans_id,
            "amount": amount,
            "phone": phone,
        }
    )
    await manager.broadcast(event)


async def broadcast_inventory_update(product_id: int, product_name: str, new_quantity: int):
    """Broadcast inventory update event."""
    event = create_event(
        EventType.INVENTORY_UPDATED,
        {
            "product_id": product_id,
            "product_name": product_name,
            "new_quantity": new_quantity,
        }
    )
    await manager.broadcast(event)


async def broadcast_transaction(transaction_id: int, total: float, payment_method: str):
    """Broadcast new transaction event."""
    event = create_event(
        EventType.TRANSACTION_CREATED,
        {
            "transaction_id": transaction_id,
            "total": total,
            "payment_method": payment_method,
        }
    )
    await manager.broadcast(event)


async def broadcast_shift_event(event_type: str, shift_id: int, cashier_id: int):
    """Broadcast shift open/close event."""
    event = create_event(
        event_type,
        {
            "shift_id": shift_id,
            "cashier_id": cashier_id,
        }
    )
    await manager.broadcast(event)


# Sync helper for calling from non-async contexts
def broadcast_sync(event: dict):
    """
    Broadcast from synchronous code by scheduling on the event loop.
    Use this when calling from sync FastAPI endpoints.
    """
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(manager.broadcast(event))
    except RuntimeError:
        # No running loop - create one
        asyncio.run(manager.broadcast(event))
