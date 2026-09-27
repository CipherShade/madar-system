import { useState } from 'react';

/**
 * Instapay payment QR code served from the Vite public dir (public/instapay-qr.jpg).
 * Hidden automatically until the owner drops the QR image at that path.
 */
export function InstapayQr({ size = 168 }: { size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src="/instapay-qr.jpg"
      alt="رمز QR للدفع عبر إنستاباي"
      width={size}
      height={size}
      loading="lazy"
      style={{ borderRadius: 12, border: '1px solid #e2e0dc', background: '#fff', display: 'block', margin: '0 auto' }}
      onError={() => setFailed(true)}
    />
  );
}