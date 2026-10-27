import { useState, useEffect } from 'react';
import { LayoutDashboard, Compass, Wrench, ArrowLeftRight, CalendarDays, Hammer, Bell, User, Users, MessageSquare, BarChart3, LogOut, Menu, Plus, Package, Trash2, Search } from 'lucide-react';
import api from './api';
import { card, inp, pri, ghost, sm, Badge, Stat, Empty, Skeleton, Bars, Stars, Table, Modal, Field, useFetch, act, fmt, setToast } from './ui';

const nav = {
  STUDENT: [['dashboard', 'Dashboard', LayoutDashboard], ['discover', 'Discover Tools', Compass], ['mytools', 'My Tools', Wrench], ['requests', 'Borrow Requests', ArrowLeftRight],
    ['reservations', 'Reservations', CalendarDays], ['notifications', 'Notifications', Bell], ['profile', 'Profile', User]],
  ADMIN: [['dashboard', 'Dashboard', LayoutDashboard], ['students', 'Students', Users], ['tools', 'Tools', Wrench], ['requests', 'Borrow Requests', ArrowLeftRight],
    ['reservations', 'Reservations', CalendarDays],  ['feedback', 'Feedback', MessageSquare], ['reports', 'Reports', BarChart3]] };

/* ---------- AUTH ---------- */
function Auth({ onDone }) {
  const [mode, setMode] = useState('student'), [reg, setReg] = useState(false), [f, setF] = useState({}), [meta] = useFetch('/meta');
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = async e => { e.preventDefault(); try {
    if (reg) { const r = await api('/auth/register', { method: 'POST', body: f }); setToastMsg(r.message); setReg(false); }
    else { const r = await api('/auth/login', { method: 'POST', body: mode === 'admin' ? { email: f.email, password: f.password } : { college_id: f.college_id, password: f.password } });
      localStorage.setItem('token', r.token); localStorage.setItem('role', r.role); onDone(r.role); }
  } catch (er) { setToastMsg(er.message, 1); } };
  const setToastMsg = (m, e) => window.dispatchEvent(new CustomEvent('toast', { detail: { m, e } }));
  return (<div className="min-h-screen grid place-items-center p-4"><form onSubmit={submit} className={card + ' w-full max-w-md space-y-3'}>
    <div className="flex items-center gap-2 mb-2"><Package className="text-indigo-300" /><h1 className="text-xl font-semibold">Campus Share</h1></div>
    <p className="text-sm text-slate-400">Borrow, lend and reserve equipment with verified students on campus.</p>
    {!reg && <div className="grid grid-cols-2 gap-2">{['student', 'admin'].map(m => <button type="button" key={m} onClick={() => setMode(m)} className={mode === m ? pri : ghost}>{m[0].toUpperCase() + m.slice(1)}</button>)}</div>}
    {reg ? <>
      <Field label="College ID"><input className={inp} required onChange={set('college_id')} /></Field>
      <Field label="Full name"><input className={inp} required onChange={set('name')} /></Field>
      <Field label="College email"><input type="email" className={inp} required onChange={set('email')} /></Field>
      <div className="grid grid-cols-2 gap-2"><Field label="Department"><select className={inp} required onChange={set('department_id')}><option value="">Select</option>{meta?.departments.map(d => <option key={d.department_id} value={d.department_id}>{d.name}</option>)}</select></Field>
        <Field label="Year"><select className={inp} required onChange={set('year')}><option value="">Select</option>{[1, 2, 3, 4, 5].map(y => <option key={y}>{y}</option>)}</select></Field></div>
      <Field label="Phone"><input className={inp} required onChange={set('phone')} /></Field></>
      : mode === 'admin' ? <Field label="Admin email"><input type="email" className={inp} required onChange={set('email')} /></Field>
      : <Field label="College ID"><input className={inp} required onChange={set('college_id')} /></Field>}
    <Field label="Password"><input type="password" className={inp} required onChange={set('password')} /></Field>
    <button className={pri + ' w-full'}>{reg ? 'Create account' : 'Sign in'}</button>
    {mode === 'student' && <button type="button" className="text-xs text-indigo-300 w-full" onClick={() => setReg(!reg)}>{reg ? 'Back to sign in' : 'New student? Register'}</button>}
  </form></div>);
}

/* ---------- STUDENT PAGES ---------- */
function SDashboard() {
  const [d, , l] = useFetch('/dashboard'); if (l || !d) return <Skeleton />;
  const list = (title, items, fn) => <div className={card}><p className="text-sm font-medium mb-2">{title}</p>{items.length ? items.map(fn) : <Empty text="Nothing yet" />}</div>;
  return (<div className="space-y-5">
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3"><Stat label="Active borrowings" value={d.active} icon={ArrowLeftRight} /><Stat label="Pending requests" value={d.pending} /><Stat label="Upcoming reservations" value={d.upcoming} icon={CalendarDays} />
      <Stat label="Overdue items" value={d.overdue} warn={d.overdue > 0} /><Stat label="Current fine" value={`₹${d.fine}`} warn={d.fine > 0} /></div>
    <div className="grid lg:grid-cols-2 gap-4"><Bars title="Borrowing activity by month" data={[...d.monthly].reverse()} />
      {list('Upcoming returns', d.returns, (r, i) => <div key={i} className="flex justify-between text-sm py-1"><span>{r.tool_name}</span><span className="text-slate-400">{fmt(r.due_date)}</span></div>)}
      {list('Recently borrowed', d.recent, (r, i) => <div key={i} className="flex justify-between text-sm py-1"><span>{r.tool_name}</span><Badge s={r.status} /></div>)}
      {list('My tools', d.myTools, (r, i) => <div key={i} className="flex justify-between text-sm py-1"><span>{r.name}</span><Badge s={r.status} /></div>)}
      {list('Recommended tools', d.recommended, (r, i) => <div key={i} className="flex justify-between text-sm py-1"><span>{r.name}</span><span className="text-slate-400">{r.location}</span></div>)}</div></div>);
}

function ToolDetail({ id, onClose }) {
  const [t, reload] = useFetch('/tools/' + id), [m, setM] = useState({}), [tab, setTab] = useState('borrow');
  if (!t) return <Modal title="Loading…" onClose={onClose}><Skeleton /></Modal>;
  const set = k => e => setM({ ...m, [k]: e.target.value });
  const canBorrow = t.status === 'AVAILABLE', canReserve = !['MAINTENANCE', 'INACTIVE'].includes(t.status);
  const submit = e => { e.preventDefault(); act(() => tab === 'borrow'
    ? api('/borrow', { method: 'POST', body: { tool_id: id, start_date: m.start, due_date: m.end, message: m.message } })
    : api('/reservations', { method: 'POST', body: { tool_id: id, start_date: m.start, end_date: m.end } }), tab === 'borrow' ? 'Request sent to the owner' : 'Reservation submitted', () => { reload(); onClose(); }); };
  return (<Modal title={t.name} onClose={onClose}>
    <div className="flex gap-2 mb-2"><Badge s={t.status} /><span className="text-xs text-slate-400">{t.category} · {t.condition}</span></div>
    <p className="text-sm text-slate-300">{t.description || 'No description.'}</p>
    <p className="text-xs text-slate-400 mt-2">Owner: {t.owner_name} <Stars v={t.reputation_score} /> · {t.location} · Rating <Stars v={t.avg_rating} /> ({t.reviews} reviews)</p>
    {t.booked.length > 0 && <div className="mt-3 text-xs"><p className="text-slate-400">Already reserved:</p>{t.booked.map((b, i) => <p key={i} className="text-amber-300">{fmt(b.start_date)} → {fmt(b.end_date)}</p>)}</div>}
    <div className="grid grid-cols-2 gap-2 my-4"><button disabled={!canBorrow} onClick={() => setTab('borrow')} className={tab === 'borrow' ? pri : ghost}>Request to borrow</button>
      <button disabled={!canReserve} onClick={() => setTab('reserve')} className={tab === 'reserve' ? pri : ghost}>Reserve tool</button></div>
    {(canBorrow || canReserve) ? <form onSubmit={submit} className="space-y-3"><div className="grid grid-cols-2 gap-2">
      <Field label={tab === 'borrow' ? 'Start date' : 'From'}><input type="date" required className={inp} onChange={set('start')} /></Field>
      <Field label={tab === 'borrow' ? 'Return by' : 'To'}><input type="date" required className={inp} onChange={set('end')} /></Field></div>
      {tab === 'borrow' && <Field label="Message to owner"><input className={inp} onChange={set('message')} /></Field>}
      <button className={pri + ' w-full'}>Submit</button></form> : <p className="text-sm text-rose-300">This tool is not available.</p>}
    {t.reviewsList.length > 0 && <div className="mt-4 text-xs space-y-1"><p className="text-slate-400">Recent reviews</p>{t.reviewsList.map((r, i) => <p key={i}>★ {r.rating} — {r.comment || 'No comment'}</p>)}</div>}</Modal>);
}

function Discover() {
  const [f, setF] = useState({ q: '', category: '', status: '', condition: '' }), [sort, setSort] = useState('new'), [open, setOpen] = useState(null), [meta] = useFetch('/meta');
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const [tools, , l] = useFetch('/tools?' + qs); const set = k => e => setF({ ...f, [k]: e.target.value });
  const list = [...(tools || [])].filter(t => t.status !== 'INACTIVE').sort((a, b) => sort === 'rated' ? (b.avg_rating || 0) - (a.avg_rating || 0) : sort === 'avail' ? (b.status === 'AVAILABLE') - (a.status === 'AVAILABLE') : 0);
  return (<div className="space-y-4"><div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
    <div className="relative lg:col-span-2"><Search size={16} className="absolute left-3 top-2.5 text-slate-400" /><input className={inp + ' pl-9'} placeholder="Search tools…" onChange={set('q')} /></div>
    <select className={inp} onChange={set('category')}><option value="">All categories</option>{meta?.categories.map(c => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}</select>
    <select className={inp} onChange={set('condition')}><option value="">Any condition</option>{['EXCELLENT', 'GOOD', 'FAIR'].map(c => <option key={c}>{c}</option>)}</select>
    <select className={inp} onChange={e => setSort(e.target.value)}><option value="new">Newest</option><option value="rated">Highest rated</option><option value="avail">Available now</option></select></div>
    {l ? <Skeleton /> : !list.length ? <Empty text="No tools found" /> : <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{list.map(t => (
      <div key={t.tool_id} className={card + ' hover:-translate-y-1 transition space-y-3'}>
  <div className="h-64 w-full overflow-hidden rounded-xl bg-slate-800">
    {t.image ? (
      <img
        src={`http://localhost:5000/uploads/${encodeURIComponent(t.image)}`}
        alt={t.name}
        className="h-full w-full object-cover"
      />
    ) : (
      <div className="h-full w-full grid place-items-center bg-gradient-to-br from-indigo-500/20 to-violet-500/10">
        <Package className="text-indigo-300" size={44} />
      </div>
    )}
  </div>
        <div className="flex justify-between"><h3 className="font-medium">{t.name}</h3><Badge s={t.status} /></div>
        <p className="text-xs text-slate-400">{t.category} · {t.condition} · {t.location}</p>
        <p className="text-xs text-slate-400">{t.owner_name} <Stars v={t.reputation_score} /> · tool <Stars v={t.avg_rating} /></p>
        <button className={ghost + ' w-full'} onClick={() => setOpen(t.tool_id)}>View details</button></div>))}</div>}
    {open && <ToolDetail id={open} onClose={() => setOpen(null)} />}</div>);
}

function MyTools() {
  const [tools, reload, l] = useFetch('/tools/mine');
  const [meta] = useFetch('/meta');
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ condition: 'GOOD' });
  const [image, setImage] = useState(null);

  const set = k => e => setF({ ...f, [k]: e.target.value });

  return (
    <div className="space-y-4">
      <button className={pri} onClick={() => setShow(true)}>
        <Plus size={14} className="inline mr-1" />Add new tool
      </button>

      {l ? (
        <Skeleton />
      ) : !tools.length ? (
        <Empty text="You haven't listed any tools yet" />
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {tools.map(t => (
            <div key={t.tool_id} className={card + ' space-y-2'}>
              
              {t.image && (
                <img
                  src={'http://localhost:5000/uploads/' + t.image}
                  alt={t.name}
                  className="w-full h-64 object-cover rounded-xl"
                />
              )}

              <div className="flex justify-between">
                <h3 className="font-medium">{t.name}</h3>
                <Badge s={t.status} />
              </div>

              <p className="text-xs text-slate-400">
                {t.category} · {t.condition}
              </p>

              <p className="text-xs">
                Rating <Stars v={t.avg_rating} />
                {t.borrower && (
                  <span className="text-sky-300"> · with {t.borrower}</span>
                )}
              </p>

              <button
                className={sm + 'text-rose-300 mt-2'}
                onClick={() =>
                  confirm('Delete this tool?') &&
                  act(
                    () => api('/tools/' + t.tool_id, { method: 'DELETE' }),
                    'Tool removed',
                    reload
                  )
                }
              >
                <Trash2 size={12} className="inline" /> Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {show && (
        <Modal title="Add new tool" onClose={() => setShow(false)}>
          <form
            className="space-y-3"
            onSubmit={e => {
              e.preventDefault();

              const fd = new FormData();

              Object.entries(f).forEach(([k, v]) => {
                fd.append(k, v);
              });

              if (image) {
                fd.append('image', image);
              }

              act(
                () => api('/tools', { method: 'POST', body: fd }),
                'Tool added',
                () => {
                  setShow(false);
                  setImage(null);
                  reload();
                }
              );
            }}
          >
            <Field label="Tool name">
              <input className={inp} required onChange={set('name')} />
            </Field>

            <Field label="Category">
              <select
                className={inp}
                required
                onChange={set('category_id')}
              >
                <option value="">Select</option>
                {meta?.categories.map(c => (
                  <option key={c.category_id} value={c.category_id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Description">
              <input className={inp} onChange={set('description')} />
            </Field>

            <Field label="Tool image">
              <input
                className={inp}
                type="file"
                accept="image/*"
                onChange={e => setImage(e.target.files[0])}
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Condition">
                <select
                  className={inp}
                  onChange={set('condition')}
                  defaultValue="GOOD"
                >
                  {['EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED'].map(c => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>

              <Field label="Location">
                <input
                  className={inp}
                  required
                  onChange={set('location')}
                />
              </Field>
            </div>

            <button className={pri + ' w-full'}>Save</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Requests() {
  const [tab, setTab] = useState('mine'), [mine, rm, l1] = useFetch('/borrow/mine'), [inc, ri, l2] = useFetch('/borrow/incoming'), [rate, setRate] = useState(null), [r, setR] = useState({ rating: 5 });
  const both = () => { rm(); ri(); };
  return (<div className="space-y-4"><div className="flex gap-2"><button className={tab === 'mine' ? pri : ghost} onClick={() => setTab('mine')}>My requests</button><button className={tab === 'inc' ? pri : ghost} onClick={() => setTab('inc')}>On my tools</button></div>
    {tab === 'mine' ? (l1 ? <Skeleton /> : <Table empty="No borrow requests yet" rows={mine} cols={[['Tool', x => x.tool_name], ['Owner', x => x.owner_name], ['Requested', x => fmt(x.created_at)], ['Borrow', x => fmt(x.start_date)], ['Due', x => fmt(x.due_date)],
      ['Status', x => <Badge s={x.status} />], ['Fine', x => x.fine > 0 ? <span className="text-rose-300">₹{x.fine}</span> : '—'],
      ['Actions', x => x.status === 'PENDING' ? <button className={sm} onClick={() => act(() => api(`/borrow/${x.borrow_request_id}/cancel`, { method: 'POST' }), 'Cancelled', both)}>Cancel</button>
        : x.status === 'RETURNED' && !x.rated ? <button className={sm} onClick={() => setRate(x)}>Rate</button> : '—']]} />)
      : (l2 ? <Skeleton /> : <Table empty="No requests on your tools" rows={inc} cols={[['Tool', x => x.tool_name], ['Borrower', x => x.borrower_name], ['Dates', x => `${fmt(x.start_date)} → ${fmt(x.due_date)}`], ['Message', x => x.message || '—'], ['Status', x => <Badge s={x.status} />],
      ['Actions', x => x.status === 'PENDING' ? <span className="space-x-1"><button className={sm} onClick={() => act(() => api(`/borrow/${x.borrow_request_id}/approve`, { method: 'POST' }), 'Approved', both)}>Approve</button>
        <button className={sm} onClick={() => act(() => api(`/borrow/${x.borrow_request_id}/reject`, { method: 'POST' }), 'Rejected', both)}>Reject</button></span>
        : ['ACTIVE', 'OVERDUE'].includes(x.status) ? <button className={sm} onClick={() => act(async () => { const d = await api(`/borrow/${x.borrow_request_id}/return`, { method: 'POST', body: {} }); if (d.fine > 0) toastFine(d.fine); }, 'Marked returned', both)}>Mark returned</button> : '—']]} />)}
    {rate && <Modal title={`Rate ${rate.tool_name}`} onClose={() => setRate(null)}><form className="space-y-3" onSubmit={e => { e.preventDefault(); act(() => api('/feedback', { method: 'POST', body: { borrow_request_id: rate.borrow_request_id, ...r } }), 'Thanks for rating', () => { setRate(null); both(); }); }}>
      <Field label="Stars (1-5)"><select className={inp} defaultValue="5" onChange={e => setR({ ...r, rating: +e.target.value })}>{[5, 4, 3, 2, 1].map(n => <option key={n}>{n}</option>)}</select></Field>
      <Field label="Comment (optional)"><input className={inp} onChange={e => setR({ ...r, comment: e.target.value })} /></Field><button className={pri + ' w-full'}>Submit</button></form></Modal>}</div>);
}
const toastFine = f => window.dispatchEvent(new CustomEvent('toast', { detail: { m: `Late return — fine of ₹${f} generated`, e: 1 } }));

function Reservations() {
  const [rows, reload, l] = useFetch('/reservations/mine'); if (l) return <Skeleton />;
  return <Table empty="No reservations yet" rows={rows} cols={[['Tool', x => x.tool_name], ['From', x => fmt(x.start_date)], ['To', x => fmt(x.end_date)], ['Status', x => <Badge s={x.status} />],
    ['', x => ['PENDING', 'CONFIRMED'].includes(x.status) && <button className={sm} onClick={() => act(() => api(`/reservations/${x.reservation_id}/cancel`, { method: 'POST' }), 'Cancelled', reload)}>Cancel</button>]]} />;
}

function Maintenance() {
  const [rows, reload, l] = useFetch('/maintenance/mine'), [tools] = useFetch('/tools'), [f, setF] = useState({ issue_type: 'GENERAL' }), set = k => e => setF({ ...f, [k]: e.target.value });
  return (<div className="space-y-4"><form className={card + ' grid sm:grid-cols-4 gap-2 items-end'} onSubmit={e => { e.preventDefault(); act(() => api('/maintenance', { method: 'POST', body: f }), 'Issue reported', reload); }}>
    <Field label="Tool"><select className={inp} required onChange={set('tool_id')}><option value="">Select</option>{tools?.map(t => <option key={t.tool_id} value={t.tool_id}>{t.name}</option>)}</select></Field>
    <Field label="Type"><select className={inp} onChange={set('issue_type')}>{['DAMAGE', 'MISSING_PARTS', 'MALFUNCTION', 'GENERAL'].map(c => <option key={c}>{c}</option>)}</select></Field>
    <Field label="Description"><input className={inp} required onChange={set('description')} /></Field><button className={pri}>Report</button></form>
    {l ? <Skeleton /> : <Table empty="No reports yet" rows={rows} cols={[['Tool', x => x.tool_name], ['Type', x => x.issue_type], ['Issue', x => x.description], ['Status', x => <Badge s={x.status} />], ['Admin notes', x => x.admin_notes || '—']]} />}</div>);
}

function Notifications() {
  const [rows, , l] = useFetch('/notifications'); useEffect(() => { api('/notifications/read', { method: 'PUT' }); }, []);
  if (l) return <Skeleton />; if (!rows.length) return <Empty text="No notifications" />;
  return <div className="space-y-2">{rows.map(n => <div key={n.notification_id} className={card + ' !py-3 text-sm flex justify-between'}><span>{n.message}</span><span className="text-xs text-slate-400">{fmt(n.created_at)}</span></div>)}</div>;
}

function Profile() {
  const [p, reload, l] = useFetch('/me'), [edit, setEdit] = useState(false), [f, setF] = useState({}); if (l || !p) return <Skeleton />;
  return (<div className={card + ' max-w-xl space-y-3'}><div className="flex items-center gap-4"><div className="h-16 w-16 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 grid place-items-center text-xl font-semibold">{p.name[0]}</div>
    <div><h2 className="text-lg font-semibold">{p.name}</h2><p className="text-xs text-slate-400">{p.college_id} · {p.department} · Year {p.year}</p></div></div>
    <p className="text-sm text-slate-300">{p.email} · {p.phone}</p>
    <div className="grid grid-cols-2 gap-3"><Stat label="Reputation" value={Number(p.reputation_score).toFixed(1)} /><Stat label="Reviews received" value={p.reviews} /><Stat label="Tools shared" value={p.tools_shared} /><Stat label="Completed borrowings" value={p.completed} /></div>
    <button className={ghost} onClick={() => { setF({ name: p.name, phone: p.phone, year: p.year }); setEdit(true); }}>Edit profile</button>
    {edit && <Modal title="Edit profile" onClose={() => setEdit(false)}><form className="space-y-3" onSubmit={e => { e.preventDefault(); act(() => api('/me', { method: 'PUT', body: f }), 'Profile updated', () => { setEdit(false); reload(); }); }}>
      {['name', 'phone', 'year'].map(k => <Field key={k} label={k}><input className={inp} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} /></Field>)}<button className={pri + ' w-full'}>Save</button></form></Modal>}</div>);
}

/* ---------- ADMIN PAGES ---------- */
function ADashboard() {
  const [s, , l] = useFetch('/admin/stats'), [r] = useFetch('/admin/reports'); if (l || !s) return <Skeleton />;
  return (<div className="space-y-5"><div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><Stat label="Total students" value={s.students} icon={Users} /><Stat label="Total tools" value={s.tools} icon={Wrench} /><Stat label="Available" value={s.available} />
    <Stat label="Currently borrowed" value={s.borrowed} /><Stat label="Pending requests" value={s.pending} /><Stat label="Overdue" value={s.overdue} warn={s.overdue > 0} /><Stat label="Total fines" value={`₹${s.total_fines}`} /><Stat label="Under maintenance" value={s.maintenance} /></div>
    {r && <div className="grid lg:grid-cols-2 gap-4"><Bars title="Borrowings by category" data={r.byCategory} /><Bars title="Borrowing activity" data={r.monthly} /><Bars title="Most borrowed tools" data={r.topTools} /><Bars title="Maintenance status" data={r.maintenance} /></div>}</div>);
}
function AStudents() {
  const [q, setQ] = useState(''), [rows, reload, l] = useFetch('/admin/students?q=' + q), st = (id, status, m) => act(() => api(`/admin/students/${id}/status`, { method: 'PUT', body: { status } }), m, reload);
  return (<div className="space-y-3"><input className={inp + ' max-w-sm'} placeholder="Search name or college ID" onChange={e => setQ(e.target.value)} />
    {l ? <Skeleton /> : <Table rows={rows} cols={[['College ID', x => x.college_id], ['Name', x => x.name], ['Dept', x => x.department], ['Year', x => x.year], ['Rep', x => <Stars v={x.reputation_score} />], ['Status', x => <Badge s={x.account_status} />],
      ['', x => x.account_status === 'ACTIVE' ? <button className={sm} onClick={() => st(x.student_id, 'SUSPENDED', 'Suspended')}>Suspend</button> : <button className={sm} onClick={() => st(x.student_id, 'ACTIVE', x.account_status === 'PENDING' ? 'Verified' : 'Activated')}>{x.account_status === 'PENDING' ? 'Verify' : 'Activate'}</button>]]} />}</div>);
}
function ATools() {
  const [rows, reload, l] = useFetch('/admin/tools'), set = (id, status) => act(() => api(`/admin/tools/${id}/status`, { method: 'PUT', body: { status } }), 'Updated', reload); if (l) return <Skeleton />;
  return <Table rows={rows} cols={[['Tool', x => x.name], ['Category', x => x.category], ['Owner', x => x.owner_name], ['Condition', x => x.condition], ['Status', x => <Badge s={x.status} />],
    ['', x => <span className="space-x-1"><button className={sm} onClick={() => set(x.tool_id, 'AVAILABLE')}>Activate</button><button className={sm} onClick={() => set(x.tool_id, 'INACTIVE')}>Deactivate</button></span>]]} />;
}
function ARequests() {
  const [rows, reload, l] = useFetch('/admin/borrow'), go = (id, a, m) => act(() => api(`/borrow/${id}/${a}`, { method: 'POST', body: {} }), m, reload); if (l) return <Skeleton />;
  return <Table rows={rows} cols={[['Tool', x => x.tool_name], ['Borrower', x => x.borrower_name], ['Due', x => fmt(x.due_date)], ['Status', x => <Badge s={x.status} />], ['Fine', x => x.fine > 0 ? `₹${x.fine}` : x.status === 'OVERDUE' ? <span className="text-rose-300">{x.days_late}d late</span> : '—'],
    ['', x => x.status === 'PENDING' ? <span className="space-x-1"><button className={sm} onClick={() => go(x.borrow_request_id, 'approve', 'Approved')}>Approve</button><button className={sm} onClick={() => go(x.borrow_request_id, 'reject', 'Rejected')}>Reject</button></span>
      : ['ACTIVE', 'OVERDUE'].includes(x.status) ? <button className={sm} onClick={() => go(x.borrow_request_id, 'return', 'Marked returned')}>Mark returned</button> : '—']]} />;
}
function AReservations() {
  const [rows, reload, l] = useFetch('/admin/reservations'), set = (id, status) => act(() => api('/admin/reservations/' + id, { method: 'PUT', body: { status } }), 'Updated', reload); if (l) return <Skeleton />;
  return <Table rows={rows} cols={[['Tool', x => x.tool_name], ['Student', x => x.student_name], ['Dates', x => `${fmt(x.start_date)} → ${fmt(x.end_date)}`], ['Status', x => <Badge s={x.status} />],
    ['', x => ['PENDING', 'CONFIRMED'].includes(x.status) && <span className="space-x-1">{x.status === 'PENDING' && <button className={sm} onClick={() => set(x.reservation_id, 'CONFIRMED')}>Confirm</button>}<button className={sm} onClick={() => set(x.reservation_id, 'CANCELLED')}>Cancel</button></span>]]} />;
}


function AFeedback() {
  const [rows, , l] = useFetch('/admin/feedback'); if (l) return <Skeleton />;
  return <Table rows={rows} cols={[['Tool', x => x.tool_name], ['From', x => x.borrower], ['Rating', x => '★'.repeat(x.rating)], ['Comment', x => x.comment || '—'], ['Date', x => fmt(x.created_at)]]} />;
}
function AReports() {
  const [f, setF] = useState({}), qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString(), [r] = useFetch('/admin/reports?' + qs), [fines, reload] = useFetch('/admin/fines'), [meta] = useFetch('/meta');
  const set = k => e => setF({ ...f, [k]: e.target.value });
  return (<div className="space-y-5"><div className="grid sm:grid-cols-4 gap-2"><input type="date" className={inp} onChange={set('from')} /><input type="date" className={inp} onChange={set('to')} />
    <select className={inp} onChange={set('department')}><option value="">All departments</option>{meta?.departments.map(d => <option key={d.department_id} value={d.department_id}>{d.name}</option>)}</select>
    <select className={inp} onChange={set('category')}><option value="">All categories</option>{meta?.categories.map(c => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}</select></div>
    {r && <div className="grid lg:grid-cols-2 gap-4"><Bars title="By category" data={r.byCategory} /><Bars title="By department" data={r.byDept} /><Bars title="Borrowing over time" data={r.monthly} /><Bars title="Overdue trend" data={r.overdue} /></div>}
    <h3 className="font-medium">Fines</h3>{fines && <Table empty="No fines generated" rows={fines} cols={[['Student', x => x.student_name], ['Tool', x => x.tool_name], ['Days', x => x.days_overdue], ['Amount', x => `₹${x.amount}`], ['Status', x => <Badge s={x.status} />],
      ['', x => x.status === 'UNPAID' && <span className="space-x-1"><button className={sm} onClick={() => act(() => api('/admin/fines/' + x.fine_id, { method: 'PUT', body: { status: 'PAID' } }), 'Marked paid', reload)}>Paid</button>
        <button className={sm} onClick={() => act(() => api('/admin/fines/' + x.fine_id, { method: 'PUT', body: { status: 'WAIVED' } }), 'Waived', reload)}>Waive</button></span>]]} />}</div>);
}

const pages = {
  STUDENT: { dashboard: SDashboard, discover: Discover, mytools: MyTools, requests: Requests, reservations: Reservations, notifications: Notifications, profile: Profile },
  ADMIN: { dashboard: ADashboard, students: AStudents, tools: ATools, requests: ARequests, reservations: AReservations, feedback: AFeedback, reports: AReports } };

export default function App() {
  const [role, setRole] = useState(localStorage.getItem('role')), [page, setPage] = useState('dashboard'), [open, setOpen] = useState(false), [msg, setMsg] = useState(null), [unread, setUnread] = useState(0);
  useEffect(() => { const h = e => { setMsg(e.detail); setTimeout(() => setMsg(null), 3500); }; window.addEventListener('toast', h); setToast((m, e) => h({ detail: { m, e } })); return () => window.removeEventListener('toast', h); }, []);
  useEffect(() => { if (role === 'STUDENT') api('/notifications').then(n => setUnread(n.filter(x => !x.is_read).length)).catch(() => {}); }, [role, page]);
  const Toast = msg && <div className={`fixed top-4 right-4 z-[60] rounded-xl px-4 py-3 text-sm shadow-xl ${msg.e ? 'bg-rose-600' : 'bg-emerald-600'}`}>{msg.m}</div>;
  if (!role) return <>{Toast}<Auth onDone={r => { setRole(r); setPage('dashboard'); }} /></>;
  const Page = pages[role][page], items = nav[role];
  const Side = <nav className="space-y-1">{items.map(([k, label, I]) => <button key={k} onClick={() => { setPage(k); setOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition ${page === k ? 'bg-indigo-500/20 text-indigo-200' : 'text-slate-300 hover:bg-white/5'}`}>
    <I size={16} />{label}{k === 'notifications' && unread > 0 && <span className="ml-auto bg-rose-500 text-[10px] rounded-full px-1.5">{unread}</span>}</button>)}
    <button onClick={() => { localStorage.clear(); setRole(null); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-400 hover:bg-white/5"><LogOut size={16} />Logout</button></nav>;
  return (<div className="min-h-screen md:flex">{Toast}
    <aside className="hidden md:block w-60 shrink-0 p-4 border-r border-white/10 sticky top-0 h-screen"><div className="flex items-center gap-2 mb-6 px-2"><Package className="text-indigo-300" /><b>Campus Share</b></div>{Side}</aside>
    <header className="md:hidden flex items-center justify-between p-3 border-b border-white/10 sticky top-0 bg-slate-950/90 backdrop-blur z-40"><b>Campus Share</b>
      <div className="flex gap-3">{role === 'STUDENT' && <button onClick={() => setPage('notifications')} className="relative"><Bell size={20} />{unread > 0 && <span className="absolute -top-1 -right-1 bg-rose-500 text-[10px] rounded-full px-1">{unread}</span>}</button>}<button onClick={() => setOpen(!open)}><Menu size={22} /></button></div></header>
    {open && <div className="md:hidden p-3 border-b border-white/10 bg-slate-900">{Side}</div>}
    <main className="flex-1 p-4 md:p-8 max-w-7xl"><h1 className="text-xl font-semibold mb-5">{items.find(i => i[0] === page)?.[1]}</h1><Page /></main></div>);
}
