// Remaining student + admin endpoints
module.exports = (app, db, auth, wrap) => {
  const rows = async (s, p) => (await db.query(s, p))[0];
  const markOverdue = () => db.query("UPDATE borrow_requests SET status='OVERDUE' WHERE status='ACTIVE' AND due_date < CURDATE()");

  app.get('/api/meta', wrap(async (req, res) => res.json({
    departments: await rows('SELECT * FROM departments ORDER BY name'), categories: await rows('SELECT * FROM categories ORDER BY name') })));

  // ---- student ----
  app.get('/api/me', auth('STUDENT'), wrap(async (req, res) => {
    const [[me]] = await db.query(`SELECT s.student_id,s.college_id,s.name,s.email,s.year,s.phone,s.reputation_score,d.name department
      FROM students s JOIN departments d USING(department_id) WHERE s.student_id=?`, [req.user.id]);
    const [[st]] = await db.query(`SELECT (SELECT COUNT(*) FROM tools WHERE owner_id=? AND status<>'INACTIVE') tools_shared,
      (SELECT COUNT(*) FROM borrow_requests WHERE borrower_id=? AND status='RETURNED') completed,
      (SELECT total_reviews FROM v_student_reputation WHERE student_id=?) reviews,
      (SELECT avg_rating FROM v_student_reputation WHERE student_id=?) avg_rating`, [req.user.id, req.user.id, req.user.id, req.user.id]);
    res.json({ ...me, ...st });
  }));
  app.put('/api/me', auth('STUDENT'), wrap(async (req, res) => {
    const { name, phone, year } = req.body;
    if (!name || !phone || !(year >= 1 && year <= 6)) return res.status(400).json({ error: 'Name, phone and a valid year are required.' });
    await db.query('UPDATE students SET name=?, phone=?, year=? WHERE student_id=?', [name, phone, year, req.user.id]); res.json({ message: 'Profile updated.' });
  }));
  app.get('/api/tools/mine', auth('STUDENT'), wrap(async (req, res) => res.json(await rows(`SELECT t.*, c.name category, st.avg_rating,
      (SELECT s.name FROM borrow_requests b JOIN students s ON s.student_id=b.borrower_id WHERE b.tool_id=t.tool_id AND b.status IN ('ACTIVE','OVERDUE') LIMIT 1) borrower
      FROM tools t JOIN categories c USING(category_id) JOIN v_tool_statistics st ON st.tool_id=t.tool_id
      WHERE t.owner_id=? AND t.status<>'INACTIVE' ORDER BY t.created_at DESC`, [req.user.id]))));
  app.get('/api/tools/:id', auth(), wrap(async (req, res) => {
    const [[t]] = await db.query(`SELECT t.*, c.name category, s.name owner_name, s.reputation_score, st.avg_rating, st.reviews
      FROM tools t JOIN categories c USING(category_id) JOIN students s ON s.student_id=t.owner_id JOIN v_tool_statistics st ON st.tool_id=t.tool_id WHERE t.tool_id=?`, [req.params.id]);
    if (!t) return res.status(404).json({ error: 'Tool not found.' });
    t.booked = await rows("SELECT start_date, end_date FROM reservations WHERE tool_id=? AND status IN ('PENDING','CONFIRMED') AND end_date>=CURDATE() ORDER BY start_date", [t.tool_id]);
    t.reviewsList = await rows(`SELECT f.rating,f.comment,f.created_at FROM feedback f JOIN borrow_requests b USING(borrow_request_id) WHERE b.tool_id=? ORDER BY f.created_at DESC LIMIT 5`, [t.tool_id]);
    res.json(t);
  }));
  app.get('/api/borrow/incoming', auth('STUDENT'), wrap(async (req, res) => { await markOverdue(); res.json(await rows(`SELECT b.*, t.name tool_name, s.name borrower_name
      FROM borrow_requests b JOIN tools t USING(tool_id) JOIN students s ON s.student_id=b.borrower_id WHERE t.owner_id=? ORDER BY b.created_at DESC`, [req.user.id])); }));
  app.get('/api/reservations/mine', auth('STUDENT'), wrap(async (req, res) => res.json(await rows(
    'SELECT r.*, t.name tool_name FROM reservations r JOIN tools t USING(tool_id) WHERE r.student_id=? ORDER BY r.start_date DESC', [req.user.id]))));
  app.post('/api/reservations/:id/cancel', auth('STUDENT'), wrap(async (req, res) => {
    const [r] = await db.query("UPDATE reservations SET status='CANCELLED' WHERE reservation_id=? AND student_id=? AND status IN ('PENDING','CONFIRMED')", [req.params.id, req.user.id]);
    if (!r.affectedRows) return res.status(403).json({ error: 'Cannot cancel this reservation.' }); res.json({ message: 'Cancelled.' });
  }));
  app.get('/api/maintenance/mine', auth('STUDENT'), wrap(async (req, res) => res.json(await rows(
    'SELECT m.*, t.name tool_name FROM maintenance m JOIN tools t USING(tool_id) WHERE m.reported_by=? ORDER BY m.reported_at DESC', [req.user.id]))));
  app.put('/api/notifications/read', auth('STUDENT'), wrap(async (req, res) => { await db.query('UPDATE notifications SET is_read=TRUE WHERE student_id=?', [req.user.id]); res.json({ message: 'ok' }); }));
  app.get('/api/dashboard', auth('STUDENT'), wrap(async (req, res) => {
    await markOverdue(); const id = req.user.id;
    const [[c]] = await db.query("SELECT SUM(status='ACTIVE') active, SUM(status='PENDING') pending, SUM(status='OVERDUE') overdue FROM borrow_requests WHERE borrower_id=?", [id]);
    const [[u]] = await db.query("SELECT COUNT(*) n FROM reservations WHERE student_id=? AND status IN ('PENDING','CONFIRMED') AND end_date>=CURDATE()", [id]);
    const [[f]] = await db.query("SELECT IFNULL(SUM(amount),0) fine FROM fines WHERE student_id=? AND status='UNPAID'", [id]);
    res.json({ active: +c.active || 0, pending: +c.pending || 0, overdue: +c.overdue || 0, upcoming: u.n, fine: +f.fine,
      monthly: await rows("SELECT DATE_FORMAT(created_at,'%Y-%m') label, COUNT(*) n FROM borrow_requests WHERE borrower_id=? GROUP BY label ORDER BY label DESC LIMIT 6", [id]),
      recent: await rows('SELECT t.name tool_name, b.status, b.due_date FROM borrow_requests b JOIN tools t USING(tool_id) WHERE b.borrower_id=? ORDER BY b.created_at DESC LIMIT 5', [id]),
      returns: await rows("SELECT t.name tool_name, b.due_date FROM borrow_requests b JOIN tools t USING(tool_id) WHERE b.borrower_id=? AND b.status IN ('ACTIVE','OVERDUE') ORDER BY b.due_date LIMIT 5", [id]),
      myTools: await rows("SELECT name, status FROM tools WHERE owner_id=? AND status<>'INACTIVE' LIMIT 5", [id]),
      recommended: await rows('SELECT name, location FROM v_available_tools WHERE owner_id<>? ORDER BY created_at DESC LIMIT 4', [id]) });
  }));

  // ---- admin ----
  const A = auth('ADMIN');
  app.get('/api/admin/students', A, wrap(async (req, res) => res.json(await rows(`SELECT s.student_id,s.college_id,s.name,s.email,s.year,s.account_status,s.reputation_score,d.name department
      FROM students s JOIN departments d USING(department_id) WHERE s.name LIKE ? OR s.college_id LIKE ? ORDER BY s.created_at DESC`, [`%${req.query.q || ''}%`, `%${req.query.q || ''}%`]))));
  app.get('/api/admin/tools', A, wrap(async (req, res) => res.json(await rows(`SELECT t.tool_id,t.name,t.status,t.\`condition\`,t.location,c.name category,s.name owner_name
      FROM tools t JOIN categories c USING(category_id) JOIN students s ON s.student_id=t.owner_id ORDER BY t.created_at DESC`))));
  app.put('/api/admin/tools/:id/status', A, wrap(async (req, res) => {
    if (!['AVAILABLE', 'INACTIVE', 'MAINTENANCE'].includes(req.body.status)) return res.status(400).json({ error: 'Invalid status.' });
    const [[b]] = await db.query("SELECT COUNT(*) n FROM borrow_requests WHERE tool_id=? AND status IN ('ACTIVE','OVERDUE')", [req.params.id]);
    if (b.n) return res.status(409).json({ error: 'Tool is currently borrowed.' });
    await db.query('UPDATE tools SET status=? WHERE tool_id=?', [req.body.status, req.params.id]); res.json({ message: 'Updated.' });
  }));
  app.get('/api/admin/borrow', A, wrap(async (req, res) => { await markOverdue(); res.json(await rows(`SELECT b.*, t.name tool_name, s.name borrower_name, IFNULL(f.amount,0) fine,
      DATEDIFF(CURDATE(), b.due_date) days_late FROM borrow_requests b JOIN tools t USING(tool_id) JOIN students s ON s.student_id=b.borrower_id
      LEFT JOIN fines f ON f.borrow_request_id=b.borrow_request_id ORDER BY b.created_at DESC`)); }));
  app.get('/api/admin/reservations', A, wrap(async (req, res) => res.json(await rows(
    'SELECT r.*, t.name tool_name, s.name student_name FROM reservations r JOIN tools t USING(tool_id) JOIN students s USING(student_id) ORDER BY r.start_date DESC'))));
  app.put('/api/admin/reservations/:id', A, wrap(async (req, res) => {
    if (!['CONFIRMED', 'CANCELLED', 'COMPLETED'].includes(req.body.status)) return res.status(400).json({ error: 'Invalid status.' });
    await db.query('UPDATE reservations SET status=? WHERE reservation_id=?', [req.body.status, req.params.id]);
    await db.query('INSERT INTO notifications(student_id,message) SELECT student_id, CONCAT("Your reservation was ", LOWER(?)) FROM reservations WHERE reservation_id=?', [req.body.status, req.params.id]);
    res.json({ message: 'Updated.' });
  }));
  app.get('/api/admin/maintenance', A, wrap(async (req, res) => res.json(await rows(
    'SELECT m.*, t.name tool_name, s.name reporter FROM maintenance m JOIN tools t USING(tool_id) JOIN students s ON s.student_id=m.reported_by ORDER BY m.reported_at DESC'))));
  app.get('/api/admin/feedback', A, wrap(async (req, res) => res.json(await rows(`SELECT f.*, t.name tool_name, s.name borrower FROM feedback f
      JOIN borrow_requests b USING(borrow_request_id) JOIN tools t USING(tool_id) JOIN students s ON s.student_id=b.borrower_id ORDER BY f.created_at DESC`))));
  app.get('/api/admin/fines', A, wrap(async (req, res) => res.json(await rows(
    'SELECT f.*, s.name student_name, t.name tool_name FROM fines f JOIN students s USING(student_id) JOIN borrow_requests b USING(borrow_request_id) JOIN tools t ON t.tool_id=b.tool_id ORDER BY f.created_at DESC'))));
  app.put('/api/admin/fines/:id', A, wrap(async (req, res) => {
    if (!['PAID', 'WAIVED'].includes(req.body.status)) return res.status(400).json({ error: 'Invalid status.' });
    await db.query('UPDATE fines SET status=? WHERE fine_id=?', [req.body.status, req.params.id]); res.json({ message: 'Updated.' });
  }));
  app.get('/api/admin/reports', A, wrap(async (req, res) => {
    const { from, to, department, category } = req.query, w = ['1=1'], p = [];
    if (from) { w.push('b.created_at>=?'); p.push(from); } if (to) { w.push('b.created_at<=?'); p.push(to + ' 23:59:59'); }
    if (department) { w.push('s.department_id=?'); p.push(department); } if (category) { w.push('t.category_id=?'); p.push(category); }
    const base = `FROM borrow_requests b JOIN tools t USING(tool_id) JOIN students s ON s.student_id=b.borrower_id JOIN categories c ON c.category_id=t.category_id
      JOIN departments d ON d.department_id=s.department_id WHERE ${w.join(' AND ')}`;
    const g = (label, extra = '') => rows(`SELECT ${label} label, COUNT(*) n ${base} ${extra}`, p);
    res.json({ byCategory: await g('c.name', 'GROUP BY c.name ORDER BY n DESC'), monthly: await g("DATE_FORMAT(b.created_at,'%Y-%m')", 'GROUP BY label ORDER BY label'),
      topTools: await g('t.name', 'GROUP BY t.name ORDER BY n DESC LIMIT 5'), byDept: await g('d.name', 'GROUP BY d.name ORDER BY n DESC'),
      overdue: await rows(`SELECT DATE_FORMAT(b.due_date,'%Y-%m') label, COUNT(*) n ${base} AND (b.status='OVERDUE' OR b.actual_return_date>b.due_date) GROUP BY label ORDER BY label`, p),
      maintenance: await rows('SELECT status label, COUNT(*) n FROM maintenance GROUP BY status') });
  }));
};
