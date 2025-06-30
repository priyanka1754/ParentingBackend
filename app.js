const express = require("express");
const { PORT } = require("./constants");
const app = express();
const bodyParser = require('body-parser');
const port = process.env.PORT || PORT;
const path = require("path");
const connectToMongoDB = require("./config");

app.use("/uploads", express.static(path.join(__dirname, "/uploads")));

// Define the directory for static contents
const publicDirectoryPath = path.join(__dirname, "public");
// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());

app.use(express.static(publicDirectoryPath));

// Serve the client app
app.use("/", express.static(path.join(__dirname, "public")));
// Serve the franchise app
app.use("/franchise", express.static(path.join(__dirname, "public/franchise")));

// Fallback for client-side routing
// app.get("/client/*", (req, res) => {
//   res.sendFile(path.join(__dirname, "public/client/index.html"));
// });
app.get("/franchise/*", (req, res) => {
  console.log('sdfghjk');
  res.sendFile(path.join(__dirname, "public/franchise/index.html"));
});



// connect to DB
connectToMongoDB();


// Routes
const routes = require("./routes");
app.use("/", routes);

// Wildcard route to serve Angular's index.html for non-API routes
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(publicDirectoryPath, "index.html"));
});

// Start server
app.listen(port, async () => {
  console.log(`Server is running on port ${port}`);
});
