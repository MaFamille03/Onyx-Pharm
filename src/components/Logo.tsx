import Image from "next/image";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center ${className}`}>
      <Image
        src="/onyx-pharm-logo.png"
        alt="ONYX PHARM"
        width={160}
        height={37}
        priority
        className="h-8 w-auto object-contain"
      />
    </div>
  );
}
