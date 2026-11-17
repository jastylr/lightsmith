import { APP_NAME } from "../config";

/**
 * The Lightsmith mark: an anvil throwing three beams of coloured light.
 * Light is what gets forged here.
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo-mark">
      <defs>
        <linearGradient id="ls-beam-a" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#F2A73B" stopOpacity="1" />
          <stop offset="1" stopColor="#F2A73B" stopOpacity="0.15" />
        </linearGradient>
        <linearGradient id="ls-beam-m" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#E5487A" stopOpacity="0.95" />
          <stop offset="1" stopColor="#E5487A" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id="ls-beam-c" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#3BB6E8" stopOpacity="0.95" />
          <stop offset="1" stopColor="#3BB6E8" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      <path d="M16 15.5L4.5 3.5L8.5 2Z" fill="url(#ls-beam-m)" />
      <path d="M16 15.5L13.6 0.8H18.4Z" fill="url(#ls-beam-a)" />
      <path d="M16 15.5L23.5 2L27.5 3.5Z" fill="url(#ls-beam-c)" />
      <path
        d="M2.5 16.2H28.5V19.4H23.2L20.6 22.4V24.2H24.6V27.6H7.4V24.2H11.4V22.4L8.8 19.4H7.4C4.9 19.4 3 18.1 2.5 16.2Z"
        fill="#F1ECE4"
      />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="logo">
      <LogoMark size={30} />
      <span className="logo-word">{APP_NAME}</span>
    </span>
  );
}
