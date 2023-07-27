const express = require("express");
const pjson = require("./package.json");
const app = express();
const port = pjson.env.port;
const { initDatabase } = require("./controllers/functions");
const { createDirectory } = require("./utils");

// base URL
// app.get("/", (req, res) => {
//   res.send("Refresh to start uploading");
//   uploadFileToFTP("addresses.csv", "input/addresses.csv");
// });

//Temp Function for now
// app.get("/createRecords", async (req, res) => {
//   res.send("createRecords compete");
// });

app.listen(port, () => {
  console.log(`apparel-magic-report-export app listening on port ${port}`);
  initDatabase();
  createDirectory();
});
