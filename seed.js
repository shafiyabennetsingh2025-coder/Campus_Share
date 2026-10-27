const bcrypt = require('bcryptjs'); const db = require('./db');
(async () => {
  const sp = await bcrypt.hash('Student@123', 10), ap = await bcrypt.hash('Admin@123', 10);
  await db.query("INSERT IGNORE INTO departments(name) VALUES ('Computer Science'),('Electronics'),('Mechanical')");
  await db.query("INSERT IGNORE INTO categories(name) VALUES ('Microcontrollers'),('Measurement'),('Camera & Media'),('Calculators'),('Lab Equipment')");
  await db.query("INSERT IGNORE INTO admins(name,email,password_hash) VALUES ('Campus Admin','admin@college.edu',?)", [ap]);
  const st = [['25BAI0187','Aarav Nair',1],['25BEC0042','Meera Iyer',2],['25BME0310','Rohan Das',3],['25BAI0201','Isha Menon',1]];
  for (const [cid,n,d] of st)
    await db.query("INSERT IGNORE INTO students(college_id,name,email,password_hash,department_id,year,phone,account_status) VALUES (?,?,?,?,?,2,'9876543210','ACTIVE')",
      [cid,n,`${n.split(' ')[0].toLowerCase()}.${cid.toLowerCase()}@vitstudent.ac.in`,sp,d]);
  const tools = [[1,1,'Arduino Uno R3','Uno with USB cable','EXCELLENT','Block A'],[2,2,'Digital Multimeter','Auto-ranging','GOOD','Lab 2'],
    [3,3,'DSLR Camera','Canon 1500D','GOOD','Hostel B'],[4,4,'Scientific Calculator','Casio fx-991','FAIR','Library']];
  for (const t of tools)
    await db.query("INSERT INTO tools(owner_id,category_id,name,description,`condition`,location) SELECT ?,?,?,?,?,? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tools WHERE name=?)", [...t, t[2]]);
  console.log('Seeded.'); process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
