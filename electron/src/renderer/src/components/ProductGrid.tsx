import { useState, useEffect } from "react";

import { apiUrl } from "@/lib/api";
import { formatKsh } from "@/lib/format";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";

interface Product {
  id: number;
  name: string;
  barcode: string;
  price_selling: number;
  stock_quantity: number;
  min_stock_alert: number;
}

interface ProductGridProps {
  onSelectProduct: (product: any) => void;
}

export function ProductGrid({ onSelectProduct }: ProductGridProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    try {
      const res = await fetch(apiUrl("products"));
      if (!res.ok) throw new Error("Failed to load products");
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode.includes(search)
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b bg-card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b bg-muted/30 text-[10px] uppercase font-black tracking-widest text-muted-foreground">
                  <th className="px-4 py-3">Product Name</th>
                  <th className="px-4 py-3">Barcode</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredProducts.map((product) => (
                  <tr
                    key={product.id}
                    className="hover:bg-muted/50 cursor-pointer transition-colors group"
                    onClick={() => onSelectProduct(product)}
                  >
                    <td className="px-4 py-4">
                      <div className="text-sm font-semibold">{product.name}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-xs font-mono text-muted-foreground">{product.barcode}</div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="text-sm font-bold text-primary">{formatKsh(product.price_selling)}</div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${product.stock_quantity <= product.min_stock_alert
                        ? "bg-red-100 text-red-700"
                        : "bg-green-100 text-green-700"
                        }`}>
                        {product.stock_quantity} units
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredProducts.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No products found matching your search.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
