import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Table2 } from 'lucide-react';

/**
 * Gráficos do Hub, no método da skill de dataviz com a identidade Workfoli: a marca só tem UMA cor de
 * dado (o verde), então todo gráfico é de série única — várias medidas viram gráficos separados
 * (small multiples), nunca eixo duplo. Marcas finas, grade em linha fina, tooltip no ponteiro e no
 * teclado, e sempre uma visão em tabela com os mesmos números.
 */

export type Provenance = 'platform' | 'workfoli' | 'crm';
const PROVENANCE: Record<Provenance, string> = { platform: 'Dado da plataforma', workfoli: 'Calculado pela Workfoli', crm: 'Do CRM' };

export function ProvenanceBadge({ kind, detail }: { kind: Provenance; detail?: string | null }) {
  return <span className={`provenance ${kind}`}>{PROVENANCE[kind]}{detail ? ` · ${detail}` : ''}</span>;
}

/** Indicador (stat tile): rótulo, valor em algarismos proporcionais e de onde o número vem. */
export function Metric({ label, value, hint, provenance, detail }: { label: string; value: ReactNode; hint?: ReactNode; provenance?: Provenance; detail?: string | null }) {
  return (
    <div className="stat metric">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {hint ? <span className="hint">{hint}</span> : null}
      {provenance ? <ProvenanceBadge kind={provenance} detail={detail} /> : null}
    </div>
  );
}

// ————————————————— Período (um filtro, acima de tudo que ele recorta) —————————————————

export interface PeriodValue { from: string; to: string; preset: '7' | '30' | '90' | 'month' | 'custom'; }

const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function periodPreset(preset: PeriodValue['preset'], base = new Date()): PeriodValue {
  const to = iso(base);
  if (preset === 'month') return { from: iso(new Date(base.getFullYear(), base.getMonth(), 1)), to, preset };
  const days = preset === '7' ? 7 : preset === '90' ? 90 : 30;
  const start = new Date(base);
  start.setDate(start.getDate() - (days - 1));
  return { from: iso(start), to, preset: preset === 'custom' ? '30' : preset };
}

export function PeriodFilter({ value, onChange, children }: { value: PeriodValue; onChange: (value: PeriodValue) => void; children?: ReactNode }) {
  const presets: Array<[PeriodValue['preset'], string]> = [['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias'], ['month', 'Este mês']];
  return (
    <div className="filter-row" role="group" aria-label="Período">
      <div className="segmented">
        {presets.map(([id, label]) => <button key={id} type="button" aria-pressed={value.preset === id} onClick={() => onChange(periodPreset(id))}>{label}</button>)}
      </div>
      <label className="date-range">
        <span className="sr-only">De</span>
        <input className="input" type="date" value={value.from} max={value.to} onChange={event => event.target.value && onChange({ from: event.target.value, to: value.to, preset: 'custom' })} />
      </label>
      <span className="faint">até</span>
      <label className="date-range">
        <span className="sr-only">Até</span>
        <input className="input" type="date" value={value.to} min={value.from} onChange={event => event.target.value && onChange({ from: value.from, to: event.target.value, preset: 'custom' })} />
      </label>
      {children}
    </div>
  );
}

// ————————————————— Escala —————————————————

/** Topo "limpo" do eixo (1, 2, 2.5, 5 × 10^k) e ~4 marcações; contagens só com marcações inteiras. */
function niceScale(max: number, integer = false): number[] {
  if (!(max > 0)) return [0, 1];
  const step0 = max / 4;
  const power = 10 ** Math.floor(Math.log10(step0));
  let step = [1, 2, 2.5, 5, 10].map(m => m * power).find(candidate => candidate >= step0) ?? 10 * power;
  if (integer) step = Math.max(1, Math.ceil(step));
  const ticks: number[] = [];
  for (let value = 0; value <= max + step * 0.001 || ticks.length < 2; value += step) ticks.push(Number(value.toFixed(10)));
  if (ticks[ticks.length - 1]! < max) ticks.push(Number((ticks[ticks.length - 1]! + step).toFixed(10)));
  return ticks;
}

/** Largura do contêiner (ref por callback: funciona mesmo quando o gráfico aparece depois da tabela). */
function useWidth(fallback = 640): [(node: HTMLDivElement | null) => void, number] {
  const [width, setWidth] = useState(fallback);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    if (!node) return;
    const update = () => setWidth(Math.max(240, Math.floor(node.getBoundingClientRect().width)));
    update();
    observer.current = new ResizeObserver(update);
    observer.current.observe(node);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, width];
}

const shortDay = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}`;
const longDay = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });

export interface Point { x: string; y: number | null; }

/**
 * Série diária única. `column` para quantidades por dia (investimento, leads); `line` para tendência
 * (sessões). Dia sem dado (`null`) fica em branco — não vira zero.
 */
export function DailyChart({ title, subtitle, points, format, axisFormat, kind = 'column', height = 200, emptyText = 'Sem dados no período.' }: {
  title: string; subtitle?: ReactNode; points: Point[]; format: (value: number) => string; axisFormat?: (value: number) => string;
  kind?: 'column' | 'line'; height?: number; emptyText?: string;
}) {
  const [wrapRef, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const titleId = useId();
  const values = points.map(point => point.y).filter((value): value is number => value !== null);
  const hasData = values.length > 0;
  const integer = values.every(value => Number.isInteger(value));
  const ticks = useMemo(() => niceScale(Math.max(0, ...values), integer), [values.join(','), integer]); // eslint-disable-line react-hooks/exhaustive-deps
  const top = ticks[ticks.length - 1]!;
  const margin = { left: 52, right: 12, top: 14, bottom: 26 };
  const plotW = Math.max(40, width - margin.left - margin.right);
  const plotH = height - margin.top - margin.bottom;
  const band = plotW / Math.max(1, points.length);
  const barW = Math.max(2, Math.min(24, band - 2));
  const y = (value: number) => margin.top + plotH - (top ? (value / top) * plotH : 0);
  const xCenter = (index: number) => margin.left + band * index + band / 2;
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(plotW / 64))));
  const maxIndex = hasData ? points.findIndex(point => point.y === Math.max(...values)) : -1;
  const lastIndex = (() => { for (let index = points.length - 1; index >= 0; index -= 1) if (points[index]!.y !== null) return index; return -1; })();
  const highlight = kind === 'column' ? maxIndex : lastIndex;
  const summary = hasData ? `${title}: ${values.length} dias com dados; máximo ${format(Math.max(...values))}.` : `${title}: ${emptyText}`;

  const move = (event: KeyboardEvent) => {
    if (!points.length) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      setActive(current => {
        const start = current ?? (event.key === 'ArrowRight' ? -1 : points.length);
        return Math.min(points.length - 1, Math.max(0, start + (event.key === 'ArrowRight' ? 1 : -1)));
      });
    } else if (event.key === 'Escape') setActive(null);
  };
  const pointerIndex = (clientX: number, rect: DOMRect) => Math.min(points.length - 1, Math.max(0, Math.floor((clientX - rect.left - margin.left) / band)));

  let line = '';
  if (kind === 'line') {
    let pen = false;
    points.forEach((point, index) => {
      if (point.y === null) { pen = false; return; }
      line += `${pen ? 'L' : 'M'}${xCenter(index).toFixed(1)},${y(point.y).toFixed(1)}`;
      pen = true;
    });
  }
  const current = active !== null ? points[active] : null;
  return (
    <figure className="chart" aria-labelledby={titleId}>
      <figcaption className="chart-head">
        <div><h3 id={titleId}>{title}</h3>{subtitle ? <div className="faint">{subtitle}</div> : null}</div>
        {hasData ? <button type="button" className="btn btn-ghost btn-sm" aria-pressed={table} onClick={() => setTable(!table)}><Table2 size={14} />{table ? 'Gráfico' : 'Tabela'}</button> : null}
      </figcaption>
      {!hasData ? <div className="chart-empty">{emptyText}</div> : table ? (
        <div className="table-wrap chart-table">
          <table className="table"><thead><tr><th>Dia</th><th className="num">Valor</th></tr></thead>
            <tbody>{points.map(point => <tr key={point.x}><td>{longDay(point.x)}</td><td className="num">{point.y === null ? 'sem dado' : format(point.y)}</td></tr>)}</tbody></table>
        </div>
      ) : (
        <div ref={wrapRef} className="chart-plot" style={{ height }}>
          <svg width={width} height={height} role="img" aria-label={summary} tabIndex={0} onKeyDown={move} onBlur={() => setActive(null)}
            onPointerMove={event => setActive(pointerIndex(event.clientX, event.currentTarget.getBoundingClientRect()))} onPointerLeave={() => setActive(null)}>
            {ticks.map(tick => (
              <g key={tick}>
                <line className="grid" x1={margin.left} x2={margin.left + plotW} y1={y(tick)} y2={y(tick)} />
                <text className="axis" x={margin.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">{(axisFormat ?? format)(tick)}</text>
              </g>
            ))}
            {points.map((point, index) => index % labelEvery === 0 || index === points.length - 1 ? (
              <text key={point.x} className="axis" x={xCenter(index)} y={height - 8} textAnchor="middle">{shortDay(point.x)}</text>
            ) : null)}
            {active !== null ? <rect className="band-hover" x={margin.left + band * active} y={margin.top} width={band} height={plotH} /> : null}
            {kind === 'column' ? points.map((point, index) => {
              if (point.y === null || point.y <= 0) return null;
              const x = xCenter(index) - barW / 2, yTop = y(point.y), h = margin.top + plotH - yTop, r = Math.min(4, barW / 2, h);
              return <path key={point.x} className="mark" d={`M${x},${yTop + h}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + barW - r}Q${x + barW},${yTop} ${x + barW},${yTop + r}V${yTop + h}Z`} />;
            }) : (
              <>
                <path className="mark-line" d={line} />
                {active !== null && current?.y !== null && current ? <line className="crosshair" x1={xCenter(active)} x2={xCenter(active)} y1={margin.top} y2={margin.top + plotH} /> : null}
                {(active !== null && current?.y !== null ? [active] : lastIndex >= 0 ? [lastIndex] : []).map(index => <circle key={index} className="mark-dot" cx={xCenter(index)} cy={y(points[index]!.y!)} r={4} />)}
              </>
            )}
            <line className="baseline" x1={margin.left} x2={margin.left + plotW} y1={margin.top + plotH} y2={margin.top + plotH} />
            {highlight >= 0 && active === null ? (
              <text className="direct-label" x={Math.min(margin.left + plotW - 4, Math.max(margin.left + 4, xCenter(highlight)))} y={y(points[highlight]!.y!) - 8}
                textAnchor={xCenter(highlight) > margin.left + plotW - 40 ? 'end' : xCenter(highlight) < margin.left + 40 ? 'start' : 'middle'}>{format(points[highlight]!.y!)}</text>
            ) : null}
          </svg>
          {current ? (
            <div className="chart-tip" role="status" style={{ left: Math.min(width - 150, Math.max(0, xCenter(active!) - 70)), top: 4 }}>
              <strong>{current.y === null ? 'sem dado' : format(current.y)}</strong><span>{longDay(current.x)}</span>
            </div>
          ) : null}
        </div>
      )}
    </figure>
  );
}

/** Lista de barras horizontais de UMA série (mesma cor), valor na ponta da barra. */
export function BarList({ title, subtitle, rows, format, emptyText = 'Nada no período.', action }: {
  title: string; subtitle?: ReactNode; rows: Array<{ id: string; label: string; value: number; hint?: string }>; format: (value: number) => string; emptyText?: string; action?: ReactNode;
}) {
  const max = Math.max(0, ...rows.map(row => row.value));
  return (
    <figure className="chart">
      <figcaption className="chart-head"><div><h3>{title}</h3>{subtitle ? <div className="faint">{subtitle}</div> : null}</div>{action}</figcaption>
      {!rows.length ? <div className="chart-empty">{emptyText}</div> : (
        <ul className="barlist">
          {rows.map(row => (
            <li key={row.id} title={`${row.label}: ${format(row.value)}`}>
              <span className="barlist-label">{row.label}{row.hint ? <small> · {row.hint}</small> : null}</span>
              <span className="barlist-track"><span className="barlist-bar" style={{ width: `${max ? Math.max(row.value > 0 ? 1.5 : 0, (row.value / max) * 100) : 0}%` }} /></span>
              <span className="barlist-value">{format(row.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

export const formatCount = (value: number) => Math.round(value).toLocaleString('pt-BR');
export const formatPercent = (value: number | null | undefined, digits = 1) => (value === null || value === undefined ? '—' : `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: digits })}%`);
export const formatMicros = (micros: number | null | undefined, currency: string | null, compact = false) => (micros === null || micros === undefined || !currency ? '—'
  : new Intl.NumberFormat('pt-BR', { style: 'currency', currency, ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : { maximumFractionDigits: 2 }) }).format(micros / 1_000_000));
