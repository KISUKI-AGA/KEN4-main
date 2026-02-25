/**
 * BACKEND SERVER
 * Run this file using node: `node server.js`
 * Dependencies: express, sqlite3, cors, body-parser
 * Install: `npm install express sqlite3 cors body-parser`
 */

import express from 'express';
import sqlite3 from 'sqlite3';
import cors from 'cors';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Database Setup
const db = new sqlite3.Database('./sel_database.sqlite', (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    initDb();
  }
});

function initDb() {
  db.serialize(() => {
    // Create Users Table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      avatar TEXT,
      grade TEXT,
      gender TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Create Responses Table
    db.run(`CREATE TABLE IF NOT EXISTS responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      question_id INTEGER,
      score INTEGER,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
  });
}

// ========== API Routes ==========

// 0. Health Check - 前端用來確認後端是否在線
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 1. Create User / Login
app.post('/api/login', (req, res) => {
  const { name, avatar, grade, gender } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const stmt = db.prepare('INSERT INTO users (name, avatar, grade, gender) VALUES (?, ?, ?, ?)');
  stmt.run(name, avatar, grade, gender, function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, name, avatar, grade, gender });
  });
  stmt.finalize();
});

// 2. Save Response
app.post('/api/response', (req, res) => {
  const { user_id, question_id, score } = req.body;

  if (!user_id || !question_id || !score) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const stmt = db.prepare('INSERT INTO responses (user_id, question_id, score) VALUES (?, ?, ?)');
  stmt.run(user_id, question_id, score, function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, status: 'saved' });
  });
  stmt.finalize();
});

// 3. Admin: Get All Responses with User Details
app.get('/api/admin/responses', (req, res) => {
  const sql = `
    SELECT
      users.id as user_id,
      users.name as user_name,
      users.avatar as user_avatar,
      users.grade as user_grade,
      users.gender as user_gender,
      responses.question_id,
      responses.score,
      responses.timestamp
    FROM responses
    JOIN users ON responses.user_id = users.id
    ORDER BY responses.timestamp DESC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// 4. Get Single User's Responses - 取得特定使用者的回答紀錄
app.get('/api/users/:id/responses', (req, res) => {
  const userId = req.params.id;
  const sql = `
    SELECT
      responses.id,
      responses.user_id,
      responses.question_id,
      responses.score,
      responses.timestamp
    FROM responses
    WHERE responses.user_id = ?
    ORDER BY responses.question_id ASC
  `;

  db.all(sql, [userId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// 5. Sync Local Data to Database - 將本地暫存資料同步到資料庫
app.post('/api/sync', (req, res) => {
  const { users, responses } = req.body;

  if (!users && !responses) {
    return res.status(400).json({ error: 'No data to sync' });
  }

  let syncedUsers = 0;
  let syncedResponses = 0;
  const userIdMap = new Map(); // local_id -> db_id

  db.serialize(() => {
    // Step 1: Insert users and build ID mapping
    const userStmt = db.prepare('INSERT INTO users (name, avatar, grade, gender) VALUES (?, ?, ?, ?)');

    const userPromises = (users || []).map((user) => {
      return new Promise((resolve, reject) => {
        userStmt.run(user.name, user.avatar, user.grade, user.gender, function(err) {
          if (err) {
            reject(err);
          } else {
            userIdMap.set(user.id, this.lastID);
            syncedUsers++;
            resolve(this.lastID);
          }
        });
      });
    });

    Promise.all(userPromises).then(() => {
      userStmt.finalize();

      // Step 2: Insert responses with mapped user IDs
      const respStmt = db.prepare('INSERT INTO responses (user_id, question_id, score, timestamp) VALUES (?, ?, ?, ?)');

      const respPromises = (responses || []).map((resp) => {
        return new Promise((resolve, reject) => {
          const dbUserId = userIdMap.get(resp.user_id) || resp.user_id;
          respStmt.run(dbUserId, resp.question_id, resp.score, resp.timestamp, function(err) {
            if (err) {
              reject(err);
            } else {
              syncedResponses++;
              resolve(this.lastID);
            }
          });
        });
      });

      Promise.all(respPromises).then(() => {
        respStmt.finalize();
        res.json({
          status: 'synced',
          synced_users: syncedUsers,
          synced_responses: syncedResponses
        });
      }).catch(err => {
        respStmt.finalize();
        res.status(500).json({ error: err.message });
      });
    }).catch(err => {
      userStmt.finalize();
      res.status(500).json({ error: err.message });
    });
  });
});

// 6. Get All Users - 取得所有使用者列表
app.get('/api/users', (req, res) => {
  db.all('SELECT * FROM users ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API endpoints:`);
  console.log(`  GET  /api/health            - Health check`);
  console.log(`  POST /api/login             - Create user`);
  console.log(`  POST /api/response          - Save response`);
  console.log(`  GET  /api/admin/responses    - All responses (admin)`);
  console.log(`  GET  /api/users/:id/responses - User responses`);
  console.log(`  POST /api/sync              - Sync local data to DB`);
  console.log(`  GET  /api/users             - All users`);
});
