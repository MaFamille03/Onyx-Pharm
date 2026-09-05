export function StatutBadge({ statut }: { statut: string }) {
  const actif = statut === "Actif";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        actif
          ? "bg-emerald-50 text-emerald-700"
          : "bg-onyx-100 text-onyx-500"
      }`}
    >
      {statut}
    </span>
  );
}

export function InlineBanner({
  type = "error",
  message,
}: {
  type?: "error" | "success";
  message: string;
}) {
  const isError = type === "error";
  return (
    <div
      className={`rounded-lg border px-3.5 py-2.5 text-sm ${
        isError
          ? "border-red-100 bg-red-50 text-red-700"
          : "border-emerald-100 bg-emerald-50 text-emerald-700"
      }`}
    >
      {message}
    </div>
  );
}
