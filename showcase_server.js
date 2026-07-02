const express = require('express');
const path = require('path');
const app = express();
const PORT = 8081;

// Serve the website directory as the root
app.use(express.static(path.join(__dirname, 'website')));

// Specifically serve the Avatars directory
app.use('/Avatars', express.static(path.join(__dirname, 'Avatars')));

app.listen(PORT, () => {
    console.log(`Avatar Showcase server running at http://localhost:${PORT}`);
});