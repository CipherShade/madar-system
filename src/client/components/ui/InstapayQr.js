import { jsx as _jsx } from "react/jsx-runtime";
import { useState } from 'react';
/**
 * Instapay payment QR code served from the Vite public dir (public/instapay-qr.jpg).
 * Hidden automatically until the owner drops the QR image at that path.
 */
export function InstapayQr({ size = 168 }) {
    const [failed, setFailed] = useState(false);
    if (failed)
        return null;
    return (_jsx("img", { src: "/instapay-qr.jpg", alt: "\u0631\u0645\u0632 QR \u0644\u0644\u062F\u0641\u0639 \u0639\u0628\u0631 \u0625\u0646\u0633\u062A\u0627\u0628\u0627\u064A", width: size, height: size, loading: "lazy", style: { borderRadius: 12, border: '1px solid #e2e0dc', background: '#fff', display: 'block', margin: '0 auto' }, onError: () => setFailed(true) }));
}
