const express = require("express");
const pjson = require("./package.json");
const app = express();
const port = pjson.env.port;
const morgan = require("morgan"); // Import morgan
const { initDatabase, createRecordOnArray, initFetchRecords } = require("./controllers/functions");
const { createDirectory } = require("./utils");
const winston = require("./logging");
app.use(express.json());

app.use(morgan("combined", { stream: winston.stream }));

// base URL
// API to create CSV based on pickTicket ids and instance name
/**
 * Sample Request
{
  "pickTickets":[2810, 2902],
  "instance":"instance2"
}
 */
app.post("/pick-tickets", async (req, res) => {
  try {
    let response = await createRecordOnArray(req);
    res.status(200).json({ response });
  } catch (error) {
    // Handle the error here, you can log it or send an error response to the client
    console.error(error);
    res.status(500).json({ error: "An error occurred" });
  }
});
// API to manually trigger fetch records any time
/**
 * Sample Request: None
 */
app.get("/fetchRecords", async (req, res) => {
  try {
    let response = await initFetchRecords();
    res.status(200).json({ response });
  } catch (error) {
    // Handle the error here, you can log it or send an error response to the client
    console.error(error);
    res.status(500).json({ error: "An error occurred" });
  }
});

//Temp Function for now
// app.get("/createRecords", async (req, res) => {
//   res.send("createRecords compete");
// });

app.listen(port, () => {
  console.log(`apparel-magic-report-export app listening on port ${port}`);
  initDatabase();
  createDirectory();
});
