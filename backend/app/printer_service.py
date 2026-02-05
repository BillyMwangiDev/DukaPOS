"""
ESC/POS printer and cash drawer for DukaPOS.
Hardware-agnostic: Usb, Network, Serial via python-escpos.
Standard kick sequence for RJ11-connected drawers.
Lightweight plain-text receipt template (no PDFs/images).
"""
from typing import Any, List, Optional
import threading

# Standard ESC/POS cash drawer pulse (RJ11)
CASH_DRAWER_KICK = bytes([0x1B, 0x70, 0x00, 0x19, 0xFA])

# Thread pool for non-blocking print/kick so UI stays fluid
_executor: Optional[Any] = None


def _get_executor():
    global _executor
    if _executor is None:
        import concurrent.futures
        _executor = concurrent.futures.ThreadPoolExecutor(max_workers=2, thread_name_prefix="pos_printer")
    return _executor


class ESCPOSPrinter:
    """Universal thermal printer (ESC/POS): Usb, Network, Serial, or Dummy."""

    def __init__(self, backend: str = "dummy", **kwargs: Any) -> None:
        """
        backend: 'dummy' | 'usb' | 'network' | 'serial'
        kwargs: usb -> idVendor, idProduct; network -> host, port=9100; serial -> port, baudrate=9600
        """
        self._backend = backend.lower()
        self._kwargs = kwargs
        self._printer: Any = None
        self._lock = threading.Lock()

    def _get_printer(self) -> Any:
        with self._lock:
            if self._printer is not None:
                return self._printer
            if self._backend == "dummy":
                from escpos.printer import Dummy
                self._printer = Dummy()
                return self._printer
            if self._backend == "usb":
                from escpos.printer import Usb
                self._printer = Usb(**self._kwargs)
                return self._printer
            if self._backend == "network":
                from escpos.printer import Network
                host = self._kwargs.get("host", "127.0.0.1")
                port = int(self._kwargs.get("port", 9100))
                timeout = int(self._kwargs.get("timeout", 5))
                self._printer = Network(host, port=port, timeout=timeout)
                return self._printer
            if self._backend == "serial":
                from escpos.printer import Serial
                self._printer = Serial(**self._kwargs)
                return self._printer
            raise ValueError(f"Unknown printer backend: {self._backend}")

    def kick_drawer(self) -> None:
        """Send standard cash drawer kick sequence (ESC p 0 0 25 250)."""
        p = self._get_printer()
        if hasattr(p, "raw") and callable(getattr(p, "raw")):
            p.raw(CASH_DRAWER_KICK)
        elif hasattr(p, "cashdraw") and callable(getattr(p, "cashdraw")):
            p.cashdraw(2)  # pin 2 typical for RJ11; Dummy supports this
        # else no-op (e.g. Dummy without raw)

    def print_receipt(
        self,
        shop_name: str,
        items: List[dict],
        total_gross: float,
        payment_method: str = "CASH",
        **kwargs: Any,
    ) -> None:
        """
        Lightweight receipt: plain text + ESC/POS (bold header, center shop name).
        items: list of { "name", "qty"|"quantity", "price" } (price = gross per unit).
        """
        p = self._get_printer()
        # Center + bold for shop name (header)
        p.set(align="center", bold=True)
        p.text(f"\n{shop_name}\n")
        p.set(bold=False)
        p.text("--------------------------------\n")
        p.set(align="left")
        for it in items:
            name = (it.get("name") or "Item")[:24]
            qty = it.get("quantity", it.get("qty", 1))
            price = float(it.get("price", 0))
            line_total = price * qty
            p.text(f"  {name} x{qty}  KSh {line_total:.2f}\n")
        p.text("--------------------------------\n")
        p.set(align="right")
        p.text(f"TOTAL: KSh {total_gross:.2f}\n")
        p.text(f"Payment: {payment_method}\n")
        p.set(align="center")
        p.text("\nThank you!\n\n\n")
        if self._backend != "dummy":
            p.cut()


_printer_instance: Optional[ESCPOSPrinter] = None


def get_printer() -> ESCPOSPrinter:
    global _printer_instance
    if _printer_instance is None:
        _printer_instance = _create_printer_from_env()
    return _printer_instance


def set_printer(instance: ESCPOSPrinter) -> None:
    global _printer_instance
    _printer_instance = instance


def _create_printer_from_env() -> ESCPOSPrinter:
    """Build printer from env: PRINTER_BACKEND, PRINTER_* connection params."""
    from app.config import config
    backend = config("PRINTER_BACKEND", default="dummy").lower()
    if backend == "network":
        return ESCPOSPrinter(
            backend="network",
            host=config("PRINTER_HOST", default="127.0.0.1"),
            port=int(config("PRINTER_PORT", default=9100)),
            timeout=int(config("PRINTER_TIMEOUT", default=5)),
        )
    if backend == "usb":
        return ESCPOSPrinter(
            backend="usb",
            idVendor=int(config("PRINTER_USB_VENDOR", default=1192)),  # 0x04b8 Epson
            idProduct=int(config("PRINTER_USB_PRODUCT", default=3624)),  # 0x0e28
        )
    if backend == "serial":
        return ESCPOSPrinter(
            backend="serial",
            port=config("PRINTER_SERIAL_PORT", default="/dev/ttyUSB0"),
            baudrate=int(config("PRINTER_BAUD", default=9600)),
        )
    return ESCPOSPrinter(backend="dummy")


def run_in_printer_thread(fn: Any, *args: Any, **kwargs: Any) -> Any:
    """Run print/kick in a worker thread. Returns a Future so caller can wait with timeout."""
    return _get_executor().submit(fn, *args, **kwargs)
