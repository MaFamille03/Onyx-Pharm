import { AlertCircle, CheckCircle2 } from "lucide-react";

export function FormAlert({
  type = "error",
  message,
}: {
  type?: "error" | "success";
  message: string;
}) {
  const isError = type === "error";
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm ${
        isError
          ? "border-red-100 bg-red-50 text-red-700"
          : "border-emerald-100 bg-emerald-50 text-emerald-700"
      }`}
    >
      {isError ? (
        <AlertCircle size={17} className="mt-0.5 shrink-0" />
      ) : (
        <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
      )}
      <span>{message}</span>
    </div>
  );
}
