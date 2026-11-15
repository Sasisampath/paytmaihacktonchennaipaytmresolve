import Image from "next/image";

export function PaytmArt({ file, size, height = size, className }: {
  file: string;
  size: number;
  height?: number;
  className?: string;
}) {
  return <Image unoptimized loading="eager" src={`/assets/paytm-resolve/${file}`} width={size} height={height}
    alt="" className={`paytm-art ${className ?? ""}`} />;
}
