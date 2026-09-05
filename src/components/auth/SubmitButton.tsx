import { Loader2 } from "lucide-react";

export function SubmitButton({
  loading,
  children,
  ...props
}: {
  loading?: boolean;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="submit"
      disabled={loading || props.disabled}
      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-onyx-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-onyx-800 disabled:cursor-not-allowed disabled:opacity-60"
      {...props}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}
