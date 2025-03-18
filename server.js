// server.js
const express = require('express');
const app = express();

// Set the port to 8080 by default so that it matches the Cloudflare Tunnel configuration.
// You can override this by setting the PORT environment variable if needed.
const PORT = process.env.PORT || 8080;

// Serve static files from the "public" directory.
app.use(express.static('public'));

// Start the server and log a confirmation message.
const server = app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Add error handling for the server startup.
server.on('error', (err) => {
  console.error('Server failed to start:', err);
});
