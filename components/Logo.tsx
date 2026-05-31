import React from 'react';

/**
 * Canto AI brand mark — the generated app icon (voice wave + multi-track
 * timeline + play + AI spark). Rendered as a rounded raster tile so it matches
 * the home-screen / favicon / App Store icon exactly across the UI.
 */
export const LogoMark: React.FC<{ size?: number; className?: string; radius?: number }> = ({
  size = 36,
  className,
  radius = 11,
}) => (
  <img
    src="/brand/app-icon-256.png"
    width={size}
    height={size}
    alt="Canto AI"
    className={className}
    style={{ borderRadius: radius, objectFit: 'cover', display: 'block' }}
  />
);

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
