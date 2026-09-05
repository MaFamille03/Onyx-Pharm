export function TextareaField({
  label,
  id,
  ...props
}: {
  label: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-onyx-700"
      >
        {label}
      </label>
      <textarea
        id={id}
        rows={2}
        className="w-full rounded-lg border border-onyx-200 px-3.5 py-2.5 text-[15px] text-onyx-900 outline-none placeholder:text-onyx-300 focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
        {...props}
      />
    </div>
  );
}

export function SelectField({
  label,
  id,
  children,
  ...props
}: {
  label: string;
  children: React.ReactNode;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-onyx-700"
      >
        {label}
      </label>
      <select
        id={id}
        className="w-full rounded-lg border border-onyx-200 bg-white px-3.5 py-2.5 text-[15px] text-onyx-900 outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
        {...props}
      >
        {children}
      </select>
    </div>
  );
}
