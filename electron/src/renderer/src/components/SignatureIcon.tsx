import { cn } from "@/lib/cn";

export function SignatureIcon({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "w-10 h-10 rounded-lg bg-gradient-to-br from-[#43B02A] to-[#2E7D32] flex items-center justify-center shadow-lg border border-[#43B02A]/20",
        className
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-6 text-white"
      >
        {/* Stylized 'B' for Billy */}
        <path d="M7 6h6a3 3 0 0 1 0 6H7V6z" />
        <path d="M7 12h7a3 3 0 0 1 0 6H7v-6z" />
        {/* Subtle developer slash */}
        <line x1="17" y1="4" x2="13" y2="20" className="opacity-40" />
      </svg>
    </div>
  );
}
