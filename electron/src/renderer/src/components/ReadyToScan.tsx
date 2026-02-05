import { Package } from "lucide-react";

export function ReadyToScan() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 animate-in fade-in zoom-in duration-700">
      <div className="relative mb-8">
        <div className="absolute -inset-8 bg-primary/5 rounded-full blur-3xl animate-pulse" />
        <Package className="size-48 text-primary stroke-[0.5] drop-shadow-2xl" />
      </div>
      <h2 className="text-4xl font-black tracking-tighter mb-3 uppercase italic text-foreground/80">
        Ready to Scan
      </h2>
      <p className="text-muted-foreground max-w-sm text-lg leading-relaxed">
        Point your scanner at a product barcode or use <span className="text-primary font-bold">F2</span> to search
      </p>
      <div className="mt-10 flex gap-4">
        <div className="flex flex-col items-center gap-2">
          <span className="px-4 py-2 bg-muted/50 rounded-xl text-xs uppercase font-black tracking-widest text-muted-foreground border shadow-sm">
            F2 - Search
          </span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="px-4 py-2 bg-muted/50 rounded-xl text-xs uppercase font-black tracking-widest text-muted-foreground border shadow-sm">
            F3 - Return
          </span>
        </div>
      </div>
    </div>
  );
}
