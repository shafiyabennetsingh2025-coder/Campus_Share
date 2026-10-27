DROP DATABASE IF EXISTS campus_share;
CREATE DATABASE campus_share CHARACTER SET utf8mb4;
USE campus_share;

CREATE TABLE settings (k VARCHAR(50) PRIMARY KEY, v VARCHAR(100) NOT NULL);
INSERT INTO settings VALUES ('FINE_PER_DAY','10');

CREATE TABLE departments (department_id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE);
CREATE TABLE categories (category_id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(60) NOT NULL UNIQUE);

CREATE TABLE students (
  student_id INT AUTO_INCREMENT PRIMARY KEY,
  college_id VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  department_id INT NOT NULL,
  year TINYINT NOT NULL CHECK (year BETWEEN 1 AND 6),
  phone VARCHAR(15) NOT NULL,
  profile_image VARCHAR(255),
  reputation_score DECIMAL(3,2) NOT NULL DEFAULT 0,
  account_status ENUM('PENDING','ACTIVE','SUSPENDED') NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(department_id)
);
CREATE TABLE admins (
  admin_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL, email VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE tools (
  tool_id INT AUTO_INCREMENT PRIMARY KEY,
  owner_id INT NOT NULL, category_id INT NOT NULL,
  name VARCHAR(120) NOT NULL, description TEXT, image VARCHAR(255),
  `condition` ENUM('EXCELLENT','GOOD','FAIR','DAMAGED') NOT NULL DEFAULT 'GOOD',
  location VARCHAR(100) NOT NULL,
  status ENUM('AVAILABLE','PENDING','BORROWED','RESERVED','MAINTENANCE','INACTIVE') NOT NULL DEFAULT 'AVAILABLE',
  deposit_amount DECIMAL(8,2) NOT NULL DEFAULT 0 CHECK (deposit_amount >= 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES students(student_id),
  FOREIGN KEY (category_id) REFERENCES categories(category_id),
  INDEX idx_tools_status (status), INDEX idx_tools_cat (category_id)
);
CREATE TABLE borrow_requests (
  borrow_request_id INT AUTO_INCREMENT PRIMARY KEY,
  tool_id INT NOT NULL, borrower_id INT NOT NULL,
  start_date DATE NOT NULL, due_date DATE NOT NULL, actual_return_date DATE NULL,
  message VARCHAR(255),
  status ENUM('PENDING','APPROVED','REJECTED','ACTIVE','RETURNED','CANCELLED','OVERDUE') NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CHECK (due_date >= start_date),
  FOREIGN KEY (tool_id) REFERENCES tools(tool_id),
  FOREIGN KEY (borrower_id) REFERENCES students(student_id),
  INDEX idx_br_status (status), INDEX idx_br_due (due_date)
);
CREATE TABLE reservations (
  reservation_id INT AUTO_INCREMENT PRIMARY KEY,
  tool_id INT NOT NULL, student_id INT NOT NULL,
  start_date DATE NOT NULL, end_date DATE NOT NULL,
  status ENUM('PENDING','CONFIRMED','CANCELLED','COMPLETED') NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (end_date >= start_date),
  FOREIGN KEY (tool_id) REFERENCES tools(tool_id),
  FOREIGN KEY (student_id) REFERENCES students(student_id),
  INDEX idx_res_tool_dates (tool_id, start_date, end_date)
);
CREATE TABLE maintenance (
  maintenance_id INT AUTO_INCREMENT PRIMARY KEY,
  tool_id INT NOT NULL, reported_by INT NOT NULL,
  issue_type ENUM('DAMAGE','MISSING_PARTS','MALFUNCTION','GENERAL') NOT NULL DEFAULT 'GENERAL',
  description TEXT NOT NULL,
  status ENUM('REPORTED','UNDER_REVIEW','IN_PROGRESS','RESOLVED') NOT NULL DEFAULT 'REPORTED',
  reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, resolved_at TIMESTAMP NULL, admin_notes TEXT,
  FOREIGN KEY (tool_id) REFERENCES tools(tool_id),
  FOREIGN KEY (reported_by) REFERENCES students(student_id)
);
CREATE TABLE feedback (
  feedback_id INT AUTO_INCREMENT PRIMARY KEY,
  borrow_request_id INT NOT NULL UNIQUE,
  rating TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (borrow_request_id) REFERENCES borrow_requests(borrow_request_id)
);
CREATE TABLE notifications (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL, message VARCHAR(255) NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(student_id),
  INDEX idx_notif (student_id, is_read)
);
CREATE TABLE fines (
  fine_id INT AUTO_INCREMENT PRIMARY KEY,
  borrow_request_id INT NOT NULL UNIQUE, student_id INT NOT NULL,
  days_overdue INT NOT NULL CHECK (days_overdue > 0),
  amount DECIMAL(8,2) NOT NULL,
  status ENUM('UNPAID','PAID','WAIVED') NOT NULL DEFAULT 'UNPAID',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (borrow_request_id) REFERENCES borrow_requests(borrow_request_id),
  FOREIGN KEY (student_id) REFERENCES students(student_id)
);

CREATE VIEW v_available_tools AS
SELECT t.*, c.name AS category, s.name AS owner_name, s.reputation_score
FROM tools t JOIN categories c USING(category_id) JOIN students s ON s.student_id=t.owner_id
WHERE t.status='AVAILABLE';

CREATE VIEW v_active_borrowings AS
SELECT b.*, t.name AS tool_name, s.name AS borrower_name
FROM borrow_requests b JOIN tools t USING(tool_id) JOIN students s ON s.student_id=b.borrower_id
WHERE b.status IN ('ACTIVE','OVERDUE');

CREATE VIEW v_overdue_borrowings AS
SELECT b.borrow_request_id, t.name AS tool_name, s.name AS borrower_name, b.due_date,
       DATEDIFF(CURDATE(), b.due_date) AS days_overdue,
       DATEDIFF(CURDATE(), b.due_date) * (SELECT CAST(v AS DECIMAL) FROM settings WHERE k='FINE_PER_DAY') AS fine_so_far
FROM borrow_requests b JOIN tools t USING(tool_id) JOIN students s ON s.student_id=b.borrower_id
WHERE b.status IN ('ACTIVE','OVERDUE') AND b.due_date < CURDATE();

CREATE VIEW v_tool_statistics AS
SELECT t.tool_id, t.name, COUNT(DISTINCT b.borrow_request_id) AS times_borrowed,
       ROUND(AVG(f.rating),2) AS avg_rating, COUNT(f.feedback_id) AS reviews
FROM tools t LEFT JOIN borrow_requests b ON b.tool_id=t.tool_id AND b.status='RETURNED'
LEFT JOIN feedback f ON f.borrow_request_id=b.borrow_request_id
GROUP BY t.tool_id, t.name;

CREATE VIEW v_student_reputation AS
SELECT s.student_id, s.name, ROUND(AVG(f.rating),2) AS avg_rating, COUNT(f.feedback_id) AS total_reviews
FROM students s LEFT JOIN tools t ON t.owner_id=s.student_id
LEFT JOIN borrow_requests b ON b.tool_id=t.tool_id
LEFT JOIN feedback f ON f.borrow_request_id=b.borrow_request_id
GROUP BY s.student_id, s.name;

DELIMITER //
CREATE TRIGGER trg_reservation_no_overlap BEFORE INSERT ON reservations FOR EACH ROW
BEGIN
  IF EXISTS (SELECT 1 FROM reservations WHERE tool_id=NEW.tool_id AND status IN ('PENDING','CONFIRMED')
             AND NEW.start_date <= end_date AND NEW.end_date >= start_date) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tool unavailable for the selected dates.';
  END IF;
END//

CREATE TRIGGER trg_borrow_returned AFTER UPDATE ON borrow_requests FOR EACH ROW
BEGIN
  DECLARE d INT; DECLARE rate DECIMAL(8,2);
  IF NEW.status='RETURNED' AND OLD.status<>'RETURNED' THEN
    UPDATE tools SET status='AVAILABLE' WHERE tool_id=NEW.tool_id AND status='BORROWED';
    SET d = DATEDIFF(NEW.actual_return_date, NEW.due_date);
    IF d > 0 THEN
      SELECT CAST(v AS DECIMAL(8,2)) INTO rate FROM settings WHERE k='FINE_PER_DAY';
      INSERT INTO fines(borrow_request_id,student_id,days_overdue,amount) VALUES (NEW.borrow_request_id,NEW.borrower_id,d,d*rate);
      INSERT INTO notifications(student_id,message) VALUES (NEW.borrower_id, CONCAT('Fine generated: Rs ',d*rate,' for ',d,' late day(s).'));
    END IF;
  END IF;
END//

CREATE TRIGGER trg_maint_insert AFTER INSERT ON maintenance FOR EACH ROW
BEGIN UPDATE tools SET status='MAINTENANCE' WHERE tool_id=NEW.tool_id AND status<>'BORROWED'; END//

CREATE TRIGGER trg_maint_resolved AFTER UPDATE ON maintenance FOR EACH ROW
BEGIN
  IF NEW.status='RESOLVED' AND OLD.status<>'RESOLVED' THEN
    UPDATE tools SET status='AVAILABLE' WHERE tool_id=NEW.tool_id AND status='MAINTENANCE';
    INSERT INTO notifications(student_id,message) VALUES (NEW.reported_by,'Your maintenance report was resolved.');
  END IF;
END//

CREATE TRIGGER trg_feedback_reputation AFTER INSERT ON feedback FOR EACH ROW
BEGIN
  UPDATE students s SET reputation_score = (SELECT IFNULL(avg_rating,0) FROM v_student_reputation r WHERE r.student_id=s.student_id)
  WHERE s.student_id = (SELECT t.owner_id FROM borrow_requests b JOIN tools t USING(tool_id) WHERE b.borrow_request_id=NEW.borrow_request_id);
END//

CREATE PROCEDURE sp_approve_request(IN p_id INT)
BEGIN
  DECLARE v_tool INT; DECLARE v_borrower INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT tool_id, borrower_id INTO v_tool, v_borrower FROM borrow_requests
    WHERE borrow_request_id=p_id AND status='PENDING' FOR UPDATE;
  IF v_tool IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Request is not pending.'; END IF;
  IF (SELECT status FROM tools WHERE tool_id=v_tool FOR UPDATE) <> 'AVAILABLE' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tool unavailable.'; END IF;
  UPDATE borrow_requests SET status='ACTIVE' WHERE borrow_request_id=p_id;
  UPDATE tools SET status='BORROWED' WHERE tool_id=v_tool;
  UPDATE borrow_requests SET status='REJECTED' WHERE tool_id=v_tool AND status='PENDING';
  INSERT INTO notifications(student_id,message) VALUES (v_borrower,'Your borrow request was approved.');
  COMMIT;
END//
DELIMITER ;
