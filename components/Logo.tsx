import React from 'react';

/**
 * Canto AI in-app mark — a clean SVG that echoes the app icon (play + a
 * multi-colour editing timeline + an AI spark) but stays crisp and legible at
 * small header sizes. The detailed raster app icon is used for the home-screen /
 * favicon / App Store only. Each instance gets a unique gradient id.
 */
let _uid = 0;
export const LogoMark: React.FC<{ size?: number; className?: string; radius?: number }> = ({
  size = 36,
  className,
  radius = 11,
}) => {
  const id = React.useMemo(() => `cl${++_uid}`, []);
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className} role="img" aria-label="Canto AI">
      <defs>
        <linearGradient id={`${id}t`} x1="4" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3FCBB3" />
          <stop offset="0.55" stopColor="#119C89" />
          <stop offset="1" stopColor="#0A6358" />
        </linearGradient>
      </defs>

      {/* Tile + glossy highlight */}
      <rect width="40" height="40" rx={radius} fill={`url(#${id}t)`} />
      <rect width="40" height="19" rx={radius} fill="#FFFFFF" opacity="0.10" />

      {/* Play triangle (hero) */}
      <path d="M16 12.6a1.4 1.4 0 0 1 2.13-1.2l9.2 5.6a1.4 1.4 0 0 1 0 2.4l-9.2 5.6A1.4 1.4 0 0 1 16 23.8V12.6Z" fill="#FFFFFF" />

      {/* Multi-colour editing timeline */}
      <g>
        <rect x="8.5" y="29" width="9" height="3.2" rx="1.6" fill="#9FF0E2" />
        <rect x="18.7" y="29" width="6.4" height="3.2" rx="1.6" fill="#F6B73C" />
        <rect x="26.3" y="29" width="5.2" height="3.2" rx="1.6" fill="#FF8A6B" />
      </g>

      {/* AI spark */}
      <path d="M31.7 5.1c.18 1.55.86 2.23 2.4 2.4-1.54.18-2.22.86-2.4 2.4-.17-1.54-.85-2.22-2.4-2.4 1.55-.17 2.23-.85 2.4-2.4Z" fill="#F6B73C" />
    </svg>
  );
};

/** Mark + wordmark. `subtitle` shows the tagline line under the name. */
export const Logo: React.FC<{
  size?: number;
  className?: string;
  subtitle?: string;
  badge?: React.ReactNode;
}> = ({ size = 36, className, subtitle, badge }) => (
  <div className={`flex items-center gap-3 ${className || ''}`}>
    <LogoMark size={size} className="shadow-[0_4px_12px_-2px_rgba(17,156,137,0.45)] rounded-[11px]" />
    <div className="leading-none">
      <h1 className="font-display font-extrabold text-[19px] leading-none text-ink dark:text-white tracking-tight flex items-center gap-2">
        Canto AI
        {badge}
      </h1>
      {subtitle && <p className="text-[11px] text-ink-muted dark:text-paper-muted mt-1">{subtitle}</p>}
    </div>
  </div>
);

export default Logo;
