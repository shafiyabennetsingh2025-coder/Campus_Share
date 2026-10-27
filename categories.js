   const db = require('./db');
   const names = ['Microcontrollers', 'Measurement', 'Camera & Media', 'Calculators', 'Lab Equipment'];
   (async () => {
     for (const n of names) {
       const [[found]] = await db.query('SELECT COUNT(*) c FROM categories WHERE name=?', [n]);
       if (!found.c) await db.query('INSERT INTO categories(name) VALUES (?)', [n]);
     }
     const [rows] = await db.query('SELECT * FROM categories');
     console.log(rows);
     process.exit(0);
   })();