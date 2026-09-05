import Image from "next/image";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-onyx-950 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2.5">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white p-2">
            <Image
              src="/onyx-pharm-icon.png"
              alt="ONYX PHARM"
              width={48}
              height={48}
              priority
              className="h-full w-full object-contain"
            />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold tracking-tight text-white">
              ONYX PHARM
            </p>
            <p className="text-[11px] text-onyx-300">Gestion intégrée</p>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-xl sm:p-7">
          <h1 className="text-lg font-semibold text-onyx-900 sm:text-xl">
            {title}
          </h1>
          <p className="mt-1 text-sm text-onyx-500">{subtitle}</p>

          <div className="mt-6 space-y-4">{children}</div>
        </div>

        {footer && (
          <p className="mt-5 text-center text-sm text-onyx-300">{footer}</p>
        )}
      </div>
    </div>
  );
}
