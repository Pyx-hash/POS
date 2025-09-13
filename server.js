const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const nodemailer = require('nodemailer');
const Twilio = require('twilio');
const ExcelJS = require('exceljs');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// Setup nodemailer transporter (Gmail SMTP example)
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

// Twilio client
const twilioClient = new Twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);

const EXCEL_PATH = path.join(__dirname, 'orders.xlsx');

async function appendOrderToExcel(order) {
  const workbook = new ExcelJS.Workbook();
  let sheet;
  if (fs.existsSync(EXCEL_PATH)) {
    await workbook.xlsx.readFile(EXCEL_PATH);
    sheet = workbook.getWorksheet('Orders');
  } else {
    sheet = workbook.addWorksheet('Orders');
    sheet.addRow(['Timestamp','Order ID','Name','Email','Phone','Items (JSON)','Subtotal','Tax','Total']);
  }

  if (!sheet) sheet = workbook.addWorksheet('Orders');

  const row = [
    new Date().toISOString(),
    order.id,
    order.name,
    order.email || '',
    order.phone || '',
    JSON.stringify(order.items),
    order.subtotal,
    order.tax,
    order.total
  ];

  sheet.addRow(row);
  await workbook.xlsx.writeFile(EXCEL_PATH);
}

function calculateCart(items) {
  let subtotal = 0;
  for (const it of items) {
    const price = parseFloat(it.price) || 0;
    const qty = parseInt(it.qty) || 0;
    subtotal += price * qty;
  }
  const taxRate = 0.12; // 12% tax example
  const tax = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  return { subtotal, tax, total };
}

app.post('/api/preorder', async (req, res) => {
  try {
    const { name, email, phone, items } = req.body;
    if (!name || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'name and items are required' });
    }

    const id = 'ORD-' + Date.now();
    const { subtotal, tax, total } = calculateCart(items);

    const order = { id, name, email, phone, items, subtotal, tax, total };

    // Save to Excel (auto-save)
    await appendOrderToExcel(order);

    // Send email confirmation
    if (email && process.env.GMAIL_USER && process.env.GMAIL_PASS) {
      const mailOptions = {
        from: process.env.GMAIL_USER,
        to: email,
        subject: `Pre-order confirmation (${id})`,
        text: `Thank you ${name}!\n\nOrder ID: ${id}\nItems: ${JSON.stringify(items, null, 2)}\nSubtotal: ${subtotal}\nTax: ${tax}\nTotal: ${total}\n\nWe will contact you when order is ready.`,
      };

      transporter.sendMail(mailOptions).catch(err => console.error('Email send error', err));
    }

    // Send SMS confirmation via Twilio
    if (phone && process.env.TWILIO_SID && process.env.TWILIO_TOKEN && process.env.TWILIO_FROM) {
      const smsBody = `Pre-order confirmed (${id}) for ${name}. Total: ${total}. Thank you!`;
      twilioClient.messages.create({
        body: smsBody,
        from: process.env.TWILIO_FROM,
        to: phone
      }).catch(err => console.error('Twilio error', err));
    }

    // Emit to sockets (for dashboard/real-time)
    io.emit('new-order', order);

    res.json({ success: true, order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/orders', async (req, res) => {
  // Return orders from Excel if exists (reads last 200 rows)
  try {
    if (!fs.existsSync(EXCEL_PATH)) return res.json({ orders: [] });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(EXCEL_PATH);
    const sheet = workbook.getWorksheet('Orders');
    if (!sheet) return res.json({ orders: [] });
    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // header
      rows.push(row.values.slice(1));
    });
    res.json({ orders: rows.reverse().slice(0, 200) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not read orders' });
  }
});

// Serve index.html for any other route (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', socket => {
  console.log('Socket connected', socket.id);
  socket.on('disconnect', () => console.log('Socket disconnected', socket.id));
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});