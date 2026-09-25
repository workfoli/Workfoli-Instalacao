import { useState } from 'react';
import { initials } from '../lib/format';

/** Marca da EMPRESA (não da Workfoli): símbolo da Base ou monograma. "Essa é a minha empresa." */
export function BrandMark({ name, symbol, size = 36 }: { name: string; symbol: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="brand-mark" style={{ width: size, height: size }} aria-hidden="true">
      {symbol && !failed ? <img src={symbol} alt="" onError={() => setFailed(true)} /> : <>{initials(name)}<span className="dot" /></>}
    </span>
  );
}

export function Brand({ name, tagline, symbol }: { name: string; tagline?: string | null; symbol: string | null }) {
  return (
    <div className="brand">
      <BrandMark name={name} symbol={symbol} />
      <div style={{ minWidth: 0 }}>
        <div className="brand-name">{name}</div>
        <div className="brand-sub">{tagline ? tagline : 'Workfoli Hub'}</div>
      </div>
    </div>
  );
}
