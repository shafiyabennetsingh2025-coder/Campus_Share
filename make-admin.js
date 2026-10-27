   const bcrypt = require('bcryptjs');
   const db = require('./db');
   (async () => {
     const h = await bcrypt.hash('Admin@123', 10);
     await db.query(
       "INSERT INTO admins(name,email,password_hash) VALUES (?,?,?) ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash)",
       ['Campus Admin', 'admin@college.edu', h]
     );
     console.log('Admin ready');
     process.exit(0);
   })();