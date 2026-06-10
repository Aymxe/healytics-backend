const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, verifyRole } = require('../middleware/auth');

// Add a column only if it doesn't already exist (compatible with all MySQL versions)
const addCol = async (col, def) => {
  try {
    await db.query(`ALTER TABLE messages ADD COLUMN ${col} ${def}`);
  } catch (err) {
    if (err.errno !== 1060) console.error(`messages.${col} init error:`, err.sqlMessage);
  }
};

// Auto-create messages table and ensure all columns exist
db.query(`
  CREATE TABLE IF NOT EXISTS messages (
    MessageID     VARCHAR(10)  NOT NULL,
    SenderID      VARCHAR(10)  DEFAULT NULL,
    SenderName    VARCHAR(100) DEFAULT NULL,
    SenderRole    VARCHAR(20)  DEFAULT NULL,
    Subject       VARCHAR(200) DEFAULT NULL,
    Body          TEXT         DEFAULT NULL,
    Status        VARCHAR(20)  DEFAULT 'Unread',
    SentAt        DATETIME     DEFAULT CURRENT_TIMESTAMP,
    ReplyBody     TEXT         DEFAULT NULL,
    RepliedAt     DATETIME     DEFAULT NULL,
    PatientRead   TINYINT(1)   DEFAULT 0,
    RecipientID   VARCHAR(10)  DEFAULT NULL,
    Direction     VARCHAR(10)  DEFAULT NULL,
    RecipientName VARCHAR(100) DEFAULT NULL,
    PRIMARY KEY (MessageID)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
`).then(() => Promise.all([
  addCol('PatientRead',   'TINYINT(1) DEFAULT 0'),
  addCol('RecipientID',   'VARCHAR(10) DEFAULT NULL'),
  addCol('Direction',     'VARCHAR(10) DEFAULT NULL'),
  addCol('RecipientName', 'VARCHAR(100) DEFAULT NULL'),
])).catch((err) => console.error('messages table create error:', err.sqlMessage));

// ── GET /api/messages/unread  →  unread count (Admin only)
router.get('/unread', verifyToken, verifyRole('Admin'), async (req, res) => {
  try {
    const [[{ count }]] = await db.query(
      "SELECT COUNT(*) AS count FROM messages WHERE Status = 'Unread'"
    );
    res.status(200).json({ count });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── GET /api/messages?role=Doctor|Patient|All&direction=incoming|sent
router.get('/', verifyToken, verifyRole('Admin'), async (req, res) => {
  const { role, direction } = req.query;
  try {
    const conditions = [];
    const params = [];

    if (direction === 'sent') {
      conditions.push("Direction = 'ToUser'");
    } else {
      // default: incoming only
      conditions.push("(Direction IS NULL OR Direction != 'ToUser')");
    }

    if (role && role !== 'All') {
      conditions.push('SenderRole = ?');
      params.push(role);
    }

    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    const [messages] = await db.query('SELECT * FROM messages' + where + ' ORDER BY SentAt DESC', params);
    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── GET /api/messages/mine  →  own sent messages + inbound admin messages
router.get('/mine', verifyToken, verifyRole('Doctor', 'Patient'), async (req, res) => {
  const { refID } = req.user;
  try {
    const [messages] = await db.query(
      `SELECT * FROM messages
       WHERE (SenderID = ? AND (Direction IS NULL OR Direction != 'ToUser'))
          OR (RecipientID = ? AND Direction = 'ToUser')
       ORDER BY SentAt DESC`,
      [refID, refID]
    );
    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── GET /api/messages/new-replies  →  count of unseen messages (replies + admin-initiated)
router.get('/new-replies', verifyToken, verifyRole('Doctor', 'Patient'), async (req, res) => {
  const { refID } = req.user;
  try {
    const [[{ count }]] = await db.query(
      `SELECT COUNT(*) AS count FROM messages
       WHERE PatientRead = 0
         AND ((SenderID = ? AND Status = 'Replied')
           OR (RecipientID = ? AND Direction = 'ToUser'))`,
      [refID, refID]
    );
    res.status(200).json({ count });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── PUT /api/messages/:id/seen  →  mark message as read by recipient
router.put('/:id/seen', verifyToken, verifyRole('Doctor', 'Patient'), async (req, res) => {
  const { refID } = req.user;
  try {
    await db.query(
      'UPDATE messages SET PatientRead = 1 WHERE MessageID = ? AND (SenderID = ? OR RecipientID = ?)',
      [req.params.id, refID, refID]
    );
    res.status(200).json({ message: 'Marked as seen.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── POST /api/messages  →  send message (Doctor or Patient)
router.post('/', verifyToken, verifyRole('Doctor', 'Patient'), async (req, res) => {
  const { subject, body } = req.body;
  const { refID, fullName, role } = req.user;

  if (!body?.trim()) {
    return res.status(400).json({ message: 'Message body is required.' });
  }

  try {
    const [all] = await db.query('SELECT MessageID FROM messages');
    const lastNum = all.length > 0
      ? Math.max(...all.map((r) => parseInt(r.MessageID.replace(/\D/g, '')) || 0))
      : 0;
    const newID = `MSG${String(lastNum + 1).padStart(3, '0')}`;

    await db.query(
      `INSERT INTO messages (MessageID, SenderID, SenderName, SenderRole, Subject, Body, Status, SentAt)
       VALUES (?, ?, ?, ?, ?, ?, 'Unread', NOW())`,
      [newID, refID, fullName, role, subject?.trim() || 'Support Request', body.trim()]
    );

    res.status(201).json({ message: 'Message sent successfully.', messageID: newID });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── POST /api/messages/admin/send  →  admin composes message to doctor or patient
router.post('/admin/send', verifyToken, verifyRole('Admin'), async (req, res) => {
  const { recipientID, recipientName, subject, body } = req.body;
  if (!recipientID || !body?.trim()) {
    return res.status(400).json({ message: 'recipientID and body are required.' });
  }
  try {
    const [all] = await db.query('SELECT MessageID FROM messages');
    const lastNum = all.length > 0
      ? Math.max(...all.map((r) => parseInt(r.MessageID.replace(/\D/g, '')) || 0))
      : 0;
    const newID = `MSG${String(lastNum + 1).padStart(3, '0')}`;

    await db.query(
      `INSERT INTO messages
         (MessageID, SenderID, SenderName, SenderRole, Subject, Body, Status, SentAt, RecipientID, RecipientName, Direction)
       VALUES (?, 'ADMIN', 'Admin', 'Admin', ?, ?, 'Unread', NOW(), ?, ?, 'ToUser')`,
      [newID, subject?.trim() || 'Message from Admin', body.trim(), recipientID, recipientName || recipientID]
    );

    res.status(201).json({ message: 'Message sent.', messageID: newID });
  } catch (error) {
    console.error('Admin send message error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── PUT /api/messages/:id  →  mark read OR reply (Admin only)
router.put('/:id', verifyToken, verifyRole('Admin'), async (req, res) => {
  const { replyBody } = req.body;
  try {
    if (replyBody?.trim()) {
      await db.query(
        "UPDATE messages SET Status = 'Replied', ReplyBody = ?, RepliedAt = NOW() WHERE MessageID = ?",
        [replyBody.trim(), req.params.id]
      );
    } else {
      await db.query(
        "UPDATE messages SET Status = 'Read' WHERE MessageID = ? AND Status = 'Unread'",
        [req.params.id]
      );
    }
    res.status(200).json({ message: 'Updated.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
