import { useState, useEffect, useCallback } from 'react';
import api from './api';
export let toast = () => {}; export const setToast = f => { toast = f; };
export const card = 'rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 shadow-lg shadow-black/20';
export const inp = 'w-full rounded-xl bg-slate-900/70 border border-white/10 px-3 py-2 text-sm outline-none focus:border-indigo-400';
const b = 'rounded-xl px-4 py-2 text-sm font-medium transition hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0 ';
export const pri = b + 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-500/30';
export const ghost = b + 'border border-white/15 hover:bg-white/10';
export const sm = 'rounded-lg px-2.5 py-1 text-xs font-medium border border-white/15 hover:bg-white/10 transition ';
const tone = { g: 'bg-emerald-500/15 text-emerald-300', b: 'bg-sky-500/15 text-sky-300', a: 'bg-amber-500/15 text-amber-300', r: 'bg-rose-500/15 text-rose-300', s: 'bg-slate-500/20 text-slate-300', o: 'bg-orange-500/15 text-orange-300' };
const map = { AVAILABLE: 'g', APPROVED: 'g', CONFIRMED: 'g', RESOLVED: 'g', ACTIVE: 'b', BORROWED: 'b', IN_PROGRESS: 'b', PAID: 'g', PENDING: 'a', REPORTED: 'a', UNDER_REVIEW: 'a', UNPAID: 'r', REJECTED: 'r', OVERDUE: 'r', SUSPENDED: 'r', MAINTENANCE: 'o', RESERVED: 'o' };
export const Badge = ({ s }) => <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${tone[map[s] || 's']}`}>{s}</span>;
export const Stat = ({ label, value, icon: I, warn }) => (
  <div className={card + ' hover:-translate-y-1 transition'}><div className="flex justify-between items-start"><p className="text-xs text-slate-400">{label}</p>{I && <I size={18} className={warn ? 'text-rose-400' : 'text-indigo-300'} />}</div>
    <p className={`mt-2 text-2xl font-semibold ${warn ? 'text-rose-300' : ''}`}>{value ?? 0}</p></div>);
export const Empty = ({ text }) => <div className="text-center text-slate-400 text-sm py-10">{text}</div>;
export const Skeleton = () => <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-12 rounded-xl bg-white/5 animate-pulse" />)}</div>;
export const Bars = ({ data = [], title }) => { const max = Math.max(1, ...data.map(d => d.n)); return (
  <div className={card}><p className="text-sm font-medium mb-3">{title}</p>{!data.length ? <Empty text="No data yet" /> : <div className="space-y-2">
    {data.map(d => <div key={d.label} className="text-xs"><div className="flex justify-between text-slate-400 mb-1"><span>{d.label}</span><span>{d.n}</span></div>
      <div className="h-2 rounded-full bg-white/5"><div className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-400" style={{ width: `${(d.n / max) * 100}%` }} /></div></div>)}</div>}</div>); };
export const Stars = ({ v }) => <span className="text-amber-300 text-xs">★ {v ? Number(v).toFixed(1) : '—'}</span>;
export function Table({ cols, rows, empty = 'Nothing here yet' }) { if (!rows.length) return <Empty text={empty} />; return (
  <div className={card + ' !p-0 overflow-x-auto'}><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-400 border-b border-white/10">
    {cols.map(c => <th key={c[0]} className="px-4 py-3 font-medium whitespace-nowrap">{c[0]}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-white/5 hover:bg-white/5">{cols.map(c => <td key={c[0]} className="px-4 py-3 whitespace-nowrap">{c[1](r)}</td>)}</tr>)}</tbody></table></div>); }
export const Modal = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3" onClick={onClose}>
    <div className={card + ' w-full max-w-lg max-h-[90vh] overflow-y-auto !bg-slate-900'} onClick={e => e.stopPropagation()}>
      <div className="flex justify-between mb-4"><h3 className="font-semibold">{title}</h3><button onClick={onClose} className="text-slate-400">✕</button></div>{children}</div></div>);
export const Field = ({ label, children }) => <label className="block text-xs text-slate-400 space-y-1"><span>{label}</span>{children}</label>;
export function useFetch(path) {
  const [d, setD] = useState(null), [l, setL] = useState(true);
  const load = useCallback(() => api(path).then(setD).catch(e => toast(e.message, 1)).finally(() => setL(false)), [path]);
  useEffect(() => { setL(true); load(); }, [load]); return [d, load, l];
}
export const act = async (fn, msg, reload) => { try { await fn(); toast(msg); reload && reload(); } catch (e) { toast(e.message, 1); } };
export const fmt = d => d ? String(d).slice(0, 10) : '—';
