const multer = require('multer');
const path = require('path');
const upload = multer({ dest: 'uploads/' });
require('dotenv').config();
const express = require('express'), cors = require('cors'), bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken');
const db = require('./db');
const app = express(); app.use(cors()); app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
const DOMAIN = process.env.COLLEGE_EMAIL_DOMAIN || 'vitstudent.ac.in';

const wrap = fn => (req, res) => fn(req, res).catch(e => {
  if (e.sqlState === '45000') return res.status(409).json({ error: e.sqlMessage });
  if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Duplicate College ID or email.' });
  console.error(e); res.status(500).json({ error: 'Something went wrong. Please try again.' });
});
const auth = (...roles) => (req, res, next) => {
  try { const u = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET);
    if (roles.length && !roles.includes(u.role)) return res.status(403).json({ error: 'Unauthorized action.' });
    req.user = u; next(); } catch { res.status(401).json({ error: 'Please log in.' }); }
};
const sign = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '8h' });

app.post('/api/auth/register', wrap(async (req, res) => {
  const { college_id, name, email, password, department_id, year, phone } = req.body;
  if (![college_id, name, email, password, department_id, year, phone].every(Boolean)) return res.status(400).json({ error: 'All fields are required.' });
  if (!email.toLowerCase().endsWith('@' + DOMAIN)) return res.status(400).json({ error: `Use your college email (@${DOMAIN}).` });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  await db.query('INSERT INTO students(college_id,name,email,password_hash,department_id,year,phone) VALUES (?,?,?,?,?,?,?)',
    [college_id, name, email.toLowerCase(), await bcrypt.hash(password, 10), department_id, year, phone]);
  res.status(201).json({ message: 'Registered. An admin must verify your account before you can log in.' });
}));
app.post('/api/auth/login', wrap(async (req, res) => {
  const { college_id, email, password } = req.body;
  const [[row]] = college_id
    ? await db.query('SELECT student_id id, password_hash, account_status FROM students WHERE college_id=?', [college_id])
    : await db.query("SELECT admin_id id, password_hash, 'ACTIVE' account_status FROM admins WHERE email=?", [email]);
  if (!row || !(await bcrypt.compare(password || '', row.password_hash))) return res.status(401).json({ error: 'Invalid login details.' });
  if (row.account_status !== 'ACTIVE') return res.status(403).json({ error: 'Account not active. Contact admin.' });
  res.json({ token: sign(row.id, college_id ? 'STUDENT' : 'ADMIN'), role: college_id ? 'STUDENT' : 'ADMIN' });
}));

app.get('/api/tools', auth(), wrap(async (req, res) => {
  const { q = '', category, status, condition } = req.query; const w = ['t.name LIKE ?'], p = [`%${q}%`];
  if (category) { w.push('t.category_id=?'); p.push(category); }
  if (status) { w.push('t.status=?'); p.push(status); }
  if (condition) { w.push('t.`condition`=?'); p.push(condition); }
  const [rows] = await db.query(`SELECT t.*, c.name category, s.name owner_name, s.reputation_score, st.avg_rating, st.reviews
    FROM tools t JOIN categories c USING(category_id) JOIN students s ON s.student_id=t.owner_id
    JOIN v_tool_statistics st ON st.tool_id=t.tool_id WHERE ${w.join(' AND ')} ORDER BY t.created_at DESC`, p);
  res.json(rows);
}));
app.post('/api/tools', auth('STUDENT'), upload.single('image'), wrap(async (req, res) => {
   const { category_id, name, description, condition, location, deposit_amount = 0 } = req.body;
const image = req.file ? req.file.filename : null;
  if (!name || !category_id || !location) return res.status(400).json({ error: 'Name, category and location are required.' });
  const [r] = await db.query('INSERT INTO tools(owner_id,category_id,name,description,image,`condition`,location,deposit_amount) VALUES (?,?,?,?,?,?,?,?)',
    [req.user.id, category_id, name, description, image, condition || 'GOOD', location, deposit_amount]);
  res.status(201).json({ tool_id: r.insertId });
}));
app.delete('/api/tools/:id', auth('STUDENT'), wrap(async (req, res) => {
  const [[busy]] = await db.query("SELECT COUNT(*) n FROM borrow_requests WHERE tool_id=? AND status IN ('ACTIVE','OVERDUE','APPROVED')", [req.params.id]);
  if (busy.n) return res.status(409).json({ error: 'Tool has an active borrowing and cannot be deleted.' });
  const [r] = await db.query("UPDATE tools SET status='INACTIVE' WHERE tool_id=? AND owner_id=?", [req.params.id, req.user.id]);
  if (!r.affectedRows) return res.status(403).json({ error: 'Unauthorized action.' });
  res.json({ message: 'Tool removed.' });
}));

app.post('/api/borrow', auth('STUDENT'), wrap(async (req, res) => {
  const { tool_id, start_date, due_date, message } = req.body;
  if (!start_date || !due_date || due_date < start_date) return res.status(400).json({ error: 'Invalid date range.' });
  const [[t]] = await db.query('SELECT owner_id, status FROM tools WHERE tool_id=?', [tool_id]);
  if (!t || t.status !== 'AVAILABLE') return res.status(409).json({ error: 'Tool unavailable.' });
  if (t.owner_id === req.user.id) return res.status(400).json({ error: 'You cannot borrow your own tool.' });
  const [r] = await db.query('INSERT INTO borrow_requests(tool_id,borrower_id,start_date,due_date,message) VALUES (?,?,?,?,?)', [tool_id, req.user.id, start_date, due_date, message]);
  await db.query('INSERT INTO notifications(student_id,message) VALUES (?,?)', [t.owner_id, 'You have a new borrow request.']);
  res.status(201).json({ borrow_request_id: r.insertId });
}));
app.get('/api/borrow/mine', auth('STUDENT'), wrap(async (req, res) => {
  const [rows] = await db.query(`SELECT b.*, t.name tool_name, o.name owner_name, IFNULL(f.amount,0) fine, (SELECT COUNT(*) FROM feedback fb WHERE fb.borrow_request_id=b.borrow_request_id) rated
    FROM borrow_requests b JOIN tools t USING(tool_id) JOIN students o ON o.student_id=t.owner_id
    LEFT JOIN fines f ON f.borrow_request_id=b.borrow_request_id WHERE b.borrower_id=? ORDER BY b.created_at DESC`, [req.user.id]);
  res.json(rows);
}));
async function canManage(req, id) {
  if (req.user.role === 'ADMIN') return true;
  const [[r]] = await db.query('SELECT t.owner_id FROM borrow_requests b JOIN tools t USING(tool_id) WHERE b.borrow_request_id=?', [id]);
  return r && r.owner_id === req.user.id;
}
app.post('/api/borrow/:id/approve', auth(), wrap(async (req, res) => {
  if (!(await canManage(req, req.params.id))) return res.status(403).json({ error: 'Unauthorized action.' });
  await db.query('CALL sp_approve_request(?)', [req.params.id]); res.json({ message: 'Approved.' });
}));
app.post('/api/borrow/:id/reject', auth(), wrap(async (req, res) => {
  if (!(await canManage(req, req.params.id))) return res.status(403).json({ error: 'Unauthorized action.' });
  await db.query("UPDATE borrow_requests SET status='REJECTED' WHERE borrow_request_id=? AND status='PENDING'", [req.params.id]);
  res.json({ message: 'Rejected.' });
}));
app.post('/api/borrow/:id/cancel', auth('STUDENT'), wrap(async (req, res) => {
  const [r] = await db.query("UPDATE borrow_requests SET status='CANCELLED' WHERE borrow_request_id=? AND borrower_id=? AND status='PENDING'", [req.params.id, req.user.id]);
  if (!r.affectedRows) return res.status(403).json({ error: 'Cannot cancel this request.' }); res.json({ message: 'Cancelled.' });
}));

app.post('/api/borrow/:id/return', auth(), wrap(async (req, res) => {
  if (!(await canManage(req, req.params.id))) {
    return res.status(403).json({ error: 'Unauthorized action.' });
  }

  const [[borrow]] = await db.query(
    'SELECT due_date, status FROM borrow_requests WHERE borrow_request_id=?',
    [req.params.id]
  );

  if (!borrow) {
    return res.status(404).json({ error: 'Borrow request not found.' });
  }

  if (!['ACTIVE', 'OVERDUE'].includes(borrow.status)) {
    return res.status(409).json({ error: 'Request is not active.' });
  }

  const returnedOn = req.body.returned_on ||
    new Date().toISOString().slice(0, 10);

  const dateOnly = (value) => {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
  };

  const dueDate = dateOnly(borrow.due_date);
  const daysLate = Math.max(
    0,
    Math.floor(
      (Date.parse(returnedOn + 'T00:00:00Z') -
       Date.parse(dueDate + 'T00:00:00Z')) / 86400000
    )
  );

  const fineAmount = daysLate * 10;

  await db.query(
    "UPDATE borrow_requests SET status='RETURNED', actual_return_date=? WHERE borrow_request_id=?",
    [returnedOn, req.params.id]
  );

  const [[existingFine]] = await db.query(
    'SELECT fine_id FROM fines WHERE borrow_request_id=?',
    [req.params.id]
  );

  if (daysLate > 0) {
    if (existingFine) {
      await db.query(
        'UPDATE fines SET days_overdue=?, amount=? WHERE borrow_request_id=?',
        [daysLate, fineAmount, req.params.id]
      );
    } else {
      await db.query(
        "INSERT INTO fines (borrow_request_id, days_overdue, amount, status) VALUES (?, ?, ?, 'UNPAID')",
        [req.params.id, daysLate, fineAmount]
      );
    }
  }

  const [[fine]] = await db.query(
    'SELECT amount FROM fines WHERE borrow_request_id=?',
    [req.params.id]
  );

  res.json({
    message: 'Returned.',
    days_late: daysLate,
    fine: fine ? Number(fine.amount) : 0
  });
}));


app.post('/api/reservations', auth('STUDENT'), wrap(async (req, res) => {
  const { tool_id, start_date, end_date } = req.body;
  if (!start_date || !end_date || end_date < start_date) return res.status(400).json({ error: 'Invalid date range.' });
  const [r] = await db.query('INSERT INTO reservations(tool_id,student_id,start_date,end_date) VALUES (?,?,?,?)', [tool_id, req.user.id, start_date, end_date]);
  res.status(201).json({ reservation_id: r.insertId });
}));
app.post('/api/feedback', auth('STUDENT'), wrap(async (req, res) => {
  const { borrow_request_id, rating, comment } = req.body;
  const [[b]] = await db.query('SELECT status FROM borrow_requests WHERE borrow_request_id=? AND borrower_id=?', [borrow_request_id, req.user.id]);
  if (!b || b.status !== 'RETURNED') return res.status(409).json({ error: 'You can rate only after returning the tool.' });
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Rating must be 1-5.' });
  await db.query('INSERT INTO feedback(borrow_request_id,rating,comment) VALUES (?,?,?)', [borrow_request_id, rating, comment]);
  res.status(201).json({ message: 'Thanks for your feedback.' });
}));
app.post('/api/maintenance', auth('STUDENT'), wrap(async (req, res) => {
  const { tool_id, issue_type, description } = req.body;
  await db.query('INSERT INTO maintenance(tool_id,reported_by,issue_type,description) VALUES (?,?,?,?)', [tool_id, req.user.id, issue_type || 'GENERAL', description]);
  res.status(201).json({ message: 'Reported.' });
}));
app.put('/api/admin/maintenance/:id', auth('ADMIN'), wrap(async (req, res) => {
  const { status, admin_notes } = req.body;
  await db.query("UPDATE maintenance SET status=?, admin_notes=?, resolved_at=IF(?='RESOLVED',NOW(),NULL) WHERE maintenance_id=?", [status, admin_notes, status, req.params.id]);
  res.json({ message: 'Updated.' });
}));
app.get('/api/notifications', auth('STUDENT'), wrap(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM notifications WHERE student_id=? ORDER BY created_at DESC LIMIT 50', [req.user.id]); res.json(rows);
}));
app.put('/api/admin/students/:id/status', auth('ADMIN'), wrap(async (req, res) => {
  await db.query('UPDATE students SET account_status=? WHERE student_id=?', [req.body.status, req.params.id]); res.json({ message: 'Updated.' });
}));
app.get('/api/admin/stats', auth('ADMIN'), wrap(async (req, res) => {
  const [[s]] = await db.query(`SELECT (SELECT COUNT(*) FROM students) students, (SELECT COUNT(*) FROM tools) tools,
    (SELECT COUNT(*) FROM tools WHERE status='AVAILABLE') available, (SELECT COUNT(*) FROM tools WHERE status='BORROWED') borrowed,
    (SELECT COUNT(*) FROM borrow_requests WHERE status='PENDING') pending, (SELECT COUNT(*) FROM v_overdue_borrowings) overdue,
    (SELECT IFNULL(SUM(amount),0) FROM fines) total_fines, (SELECT COUNT(*) FROM tools WHERE status='MAINTENANCE') maintenance`);
  res.json(s);
}));
require('./extra')(app, db, auth, wrap);
app.listen(process.env.PORT || 5000, () => console.log('API running'));
