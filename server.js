const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// API routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve static files from current directory
app.use(express.static(__dirname));

// Fallback middleware
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
