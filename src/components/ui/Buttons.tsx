import { Loader2 } from "lucide-react";

export function PrimaryButton({
  loading,
  children,
  className = "",
  ...props
}: {
  loading?: boolean;
  children: React.ReactNode;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      disabled={loading || props.disabled}
      className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-onyx-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-onyx-800 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...props}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  className = "",
  loading,
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  loading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      disabled={loading || props.disabled}
      className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-onyx-200 px-4 py-2.5 text-sm font-medium text-onyx-700 transition-colors hover:bg-onyx-50 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...props}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}
