require('dotenv').config();
const { app } = require('./server');

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`PR Guardian trigger listening on port ${PORT}`);
  console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhook`);
  console.log(`Manual trigger:   POST http://localhost:${PORT}/trigger`);
  console.log(`Health check:     GET  http://localhost:${PORT}/health`);
});
