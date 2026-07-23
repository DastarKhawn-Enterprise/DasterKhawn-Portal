'use client';

interface Props {
  method: string;
  size?: number;
  className?: string;
}

const FALLBACK_COLORS: Record<string, string> = {
  cash: '#10b981', bank: '#3b82f6', mobile_wallet: '#f59e0b', easypaisa: '#f59e0b',
  card: '#8b5cf6', credit: '#ef4444', other: '#6b7280',
};

function normalize(val: string): string {
  return val.toLowerCase().replace(/[\s_-]+/g, '').replace(/^(jazzcash|easypaisa)$/, (m) => m);
}

function FallbackSvg({ type, className, size }: { type: string; className: string; size: number }) {
  const color = FALLBACK_COLORS[type] || '#6b7280';
  if (type === 'bank') return (
    <svg className={className} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18"/><path d="M3 10h18"/><path d="M5 6l7-3 7 3"/><path d="M4 10v11"/><path d="M20 10v11"/><path d="M8 14v3"/><path d="M12 14v3"/><path d="M16 14v3"/>
    </svg>
  );
  if (type === 'card') return (
    <svg className={className} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  );
  if (type === 'credit') return (
    <svg className={className} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
    </svg>
  );
  return (
    <svg className={className} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
    </svg>
  );
}

const LOGO_MAP: Record<string, string> = {
  jazzcash: '/payment-logos/jazzcash.png',
  easypaisa: '/payment-logos/easypaisa.png',
  cash: '/payment-logos/cash.png',
};

export default function PaymentMethodLogo({ method, size = 24, className = '' }: Props) {
  const cls = `inline-block shrink-0 ${className}`;
  const norm = normalize(method);

  if (LOGO_MAP[norm]) {
    return (
      <img
        src={LOGO_MAP[norm]}
        alt={norm.charAt(0).toUpperCase() + norm.slice(1)}
        width={size}
        height={size}
        className={cls}
        style={{ objectFit: 'contain' }}
      />
    );
  }

  const fallbackType = norm === 'mobilewallet' || norm === 'mobile_wallet' ? 'mobile_wallet' :
    norm === 'banktransfer' || norm === 'bank_transfer' ? 'bank' : norm;

  return <FallbackSvg type={fallbackType} className={cls} size={size} />;
}
