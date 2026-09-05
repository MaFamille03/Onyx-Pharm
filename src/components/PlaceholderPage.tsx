import { Construction } from "lucide-react";

export function PlaceholderPage({
  title,
  description,
  step,
}: {
  title: string;
  description: string;
  step: number;
}) {
  return (
    <div>
      <h1 className="text-xl font-semibold text-onyx-900 sm:text-2xl">
        {title}
      </h1>
      <p className="mt-1 text-sm text-onyx-500">{description}</p>

      <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-onyx-200 bg-white px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-50 text-accent-500">
          <Construction size={22} />
        </div>
        <p className="mt-4 text-sm font-medium text-onyx-700">
          Module en construction
        </p>
        <p className="mt-1 max-w-sm text-sm text-onyx-400">
          Cette page sera développée à l&apos;étape {step} du projet. La
          navigation, l&apos;authentification et l&apos;accès sécurisé sont
          déjà fonctionnels.
        </p>
      </div>
    </div>
  );
}
