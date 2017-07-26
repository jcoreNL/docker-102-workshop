const express = require('express');
const environment = process.env.APP_ENVIRONMENT || 'none specified';

const port = process.env.NODE_PORT || 8080;
const host = '0.0.0.0';

const app = express();
app.get('/', (req, res) => {
  res.send(`Environment: ${environment}`);
});

app.listen(port, host);
console.log(`Running on port ${port}`);
