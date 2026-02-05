/**
 * WebSocket hook for real-time POS notifications.
 * Connects to the backend WebSocket and provides:
 * - Connection state
 * - Event listeners for M-Pesa payments, inventory updates, etc.
 * - Auto-reconnection with exponential backoff
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { apiUrl } from "@/lib/api";

// Event types (must match backend EventType)
export const EventType = {
  // M-Pesa events
  MPESA_PAYMENT_RECEIVED: "mpesa.payment_received",
  MPESA_PAYMENT_FAILED: "mpesa.payment_failed",
  MPESA_STK_CALLBACK: "mpesa.stk_callback",

  // Inventory events
  INVENTORY_UPDATED: "inventory.updated",
  INVENTORY_LOW_STOCK: "inventory.low_stock",

  // Transaction events
  TRANSACTION_CREATED: "transaction.created",
  TRANSACTION_VOIDED: "transaction.voided",

  // Shift events
  SHIFT_OPENED: "shift.opened",
  SHIFT_CLOSED: "shift.closed",

  // Order events
  ORDER_HELD: "order.held",
  ORDER_RECALLED: "order.recalled",
  ORDER_DELETED: "order.deleted",

  // System events
  SYSTEM_BACKUP: "system.backup",
  SYSTEM_SYNC: "system.sync",

  // Connection events
  PING: "ping",
  PONG: "pong",
  CONNECTED: "connected",
} as const;

export type EventTypeValue = typeof EventType[keyof typeof EventType];

export interface WebSocketEvent {
  type: string;
  data: unknown;
  timestamp: string;
  source: string;
}

export interface MpesaPaymentEvent {
  trans_id: string;
  amount: number;
  phone?: string;
  customer_name?: string;
  matched_transaction_id?: number;
  source?: string;
}

export interface MpesaStkCallbackEvent {
  status: "success" | "failed";
  checkout_request_id: string;
  mpesa_receipt?: string;
  transaction_id?: number;
  amount?: number;
  result_code?: number;
}

export interface InventoryUpdateEvent {
  product_id: number;
  product_name: string;
  new_quantity: number;
}

type EventHandler = (event: WebSocketEvent) => void;

interface UseWebSocketOptions {
  /** Unique client ID for this POS terminal */
  clientId?: string;
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean;
  /** Reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Max reconnect attempts (default: 10) */
  maxReconnectAttempts?: number;
  /** Initial reconnect delay in ms (default: 1000) */
  reconnectDelay?: number;
}

interface UseWebSocketReturn {
  /** WebSocket connection state */
  isConnected: boolean;
  /** Last error message */
  error: string | null;
  /** Number of reconnect attempts */
  reconnectAttempts: number;
  /** Manually connect */
  connect: () => void;
  /** Manually disconnect */
  disconnect: () => void;
  /** Send a message */
  send: (data: object) => void;
  /** Send ping to keep connection alive */
  ping: () => void;
  /** Subscribe to specific event types */
  subscribe: (eventType: string, handler: EventHandler) => () => void;
  /** Subscribe to all events */
  subscribeAll: (handler: EventHandler) => () => void;
}

/**
 * Generate a unique client ID for this POS terminal.
 * Uses localStorage to persist across sessions.
 */
function getOrCreateClientId(): string {
  const storageKey = "dukapos_ws_client_id";
  let clientId = localStorage.getItem(storageKey);
  if (!clientId) {
    clientId = `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(storageKey, clientId);
  }
  return clientId;
}

/**
 * Get WebSocket URL from API URL.
 * Converts http://host:port to ws://host:port/ws/{clientId}
 */
function getWebSocketUrl(clientId: string): string {
  // Get the base API URL and convert to WebSocket URL
  const baseUrl = apiUrl("").replace(/\/$/, "");
  const wsUrl = baseUrl
    .replace(/^http:/, "ws:")
    .replace(/^https:/, "wss:");
  return `${wsUrl}/ws/${clientId}`;
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    clientId = getOrCreateClientId(),
    autoConnect = true,
    autoReconnect = true,
    maxReconnectAttempts = 10,
    reconnectDelay = 1000,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventHandlersRef = useRef<Map<string, Set<EventHandler>>>(new Map());
  const allHandlersRef = useRef<Set<EventHandler>>(new Set());

  // Clear reconnect timeout
  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // Disconnect WebSocket
  const disconnect = useCallback(() => {
    clearReconnectTimeout();
    if (wsRef.current) {
      wsRef.current.close(1000, "Client disconnect");
      wsRef.current = null;
    }
    setIsConnected(false);
  }, [clearReconnectTimeout]);

  // Connect WebSocket
  const connect = useCallback(() => {
    // Don't connect if already connected
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const url = getWebSocketUrl(clientId);
    console.log(`[WebSocket] Connecting to ${url}`);

    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log("[WebSocket] Connected");
        setIsConnected(true);
        setError(null);
        setReconnectAttempts(0);
      };

      ws.onclose = (event) => {
        console.log(`[WebSocket] Disconnected: ${event.code} ${event.reason}`);
        setIsConnected(false);
        wsRef.current = null;

        // Auto-reconnect with exponential backoff
        if (autoReconnect && event.code !== 1000) {
          setReconnectAttempts((prev) => {
            const attempts = prev + 1;
            if (attempts <= maxReconnectAttempts) {
              const delay = Math.min(reconnectDelay * Math.pow(2, attempts - 1), 30000);
              console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${attempts})`);
              reconnectTimeoutRef.current = setTimeout(connect, delay);
            } else {
              setError(`Failed to reconnect after ${maxReconnectAttempts} attempts`);
            }
            return attempts;
          });
        }
      };

      ws.onerror = (event) => {
        console.error("[WebSocket] Error:", event);
        setError("WebSocket connection error");
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketEvent = JSON.parse(event.data);
          console.log("[WebSocket] Received:", message.type, message.data);

          // Call type-specific handlers
          const handlers = eventHandlersRef.current.get(message.type);
          if (handlers) {
            handlers.forEach((handler) => handler(message));
          }

          // Call all-event handlers
          allHandlersRef.current.forEach((handler) => handler(message));
        } catch (e) {
          console.error("[WebSocket] Failed to parse message:", e);
        }
      };

      wsRef.current = ws;
    } catch (e) {
      console.error("[WebSocket] Failed to create connection:", e);
      setError(`Failed to connect: ${e}`);
    }
  }, [clientId, autoReconnect, maxReconnectAttempts, reconnectDelay]);

  // Send message
  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
      console.warn("[WebSocket] Cannot send - not connected");
    }
  }, []);

  // Send ping
  const ping = useCallback(() => {
    send({ type: EventType.PING });
  }, [send]);

  // Subscribe to specific event type
  const subscribe = useCallback((eventType: string, handler: EventHandler): (() => void) => {
    if (!eventHandlersRef.current.has(eventType)) {
      eventHandlersRef.current.set(eventType, new Set());
    }
    eventHandlersRef.current.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      eventHandlersRef.current.get(eventType)?.delete(handler);
    };
  }, []);

  // Subscribe to all events
  const subscribeAll = useCallback((handler: EventHandler): (() => void) => {
    allHandlersRef.current.add(handler);
    return () => {
      allHandlersRef.current.delete(handler);
    };
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  // Ping every 30 seconds to keep connection alive
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(ping, 30000);
    return () => clearInterval(interval);
  }, [isConnected, ping]);

  return {
    isConnected,
    error,
    reconnectAttempts,
    connect,
    disconnect,
    send,
    ping,
    subscribe,
    subscribeAll,
  };
}

/**
 * Hook specifically for M-Pesa payment notifications.
 * Simplifies subscribing to payment events.
 */
export function useMpesaPaymentNotifications(
  onPaymentReceived?: (event: MpesaPaymentEvent) => void,
  onStkCallback?: (event: MpesaStkCallbackEvent) => void,
  onPaymentFailed?: (event: MpesaStkCallbackEvent) => void
) {
  const ws = useWebSocket();

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    if (onPaymentReceived) {
      unsubs.push(
        ws.subscribe(EventType.MPESA_PAYMENT_RECEIVED, (event) => {
          onPaymentReceived(event.data as MpesaPaymentEvent);
        })
      );
    }

    if (onStkCallback) {
      unsubs.push(
        ws.subscribe(EventType.MPESA_STK_CALLBACK, (event) => {
          onStkCallback(event.data as MpesaStkCallbackEvent);
        })
      );
    }

    if (onPaymentFailed) {
      unsubs.push(
        ws.subscribe(EventType.MPESA_PAYMENT_FAILED, (event) => {
          onPaymentFailed(event.data as MpesaStkCallbackEvent);
        })
      );
    }

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [ws, onPaymentReceived, onStkCallback, onPaymentFailed]);

  return ws;
}
