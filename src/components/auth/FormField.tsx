export function FormField({
  label,
  id,
  ...props
}: {
  label: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-onyx-700"
      >
        {label}
      </label>
      <input
        id={id}
        className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] text-onyx-900 outline-none placeholder:text-onyx-300 focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
        {...props}
      />
    </div>
  );
}
