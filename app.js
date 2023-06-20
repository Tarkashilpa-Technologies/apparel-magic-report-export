const express = require("express");
const pjson = require("./package.json");
const app = express();
const port = pjson.env.port;
const ftp = require("basic-ftp");
const { convertToCsv, cronJobFirst, apiStringWithEventTime } = require("./utils");
const csvData = require("./customerData.json");
const { fetchRecords } = require("./controllers/functions");
const flatten = require('flat');


// base URL
app.get("/", (req, res) => {
  res.send("Refresh to start uploading");
  uploadFileToFTP("addresses.csv", "input/addresses.csv");
});

//Temp Function for now
app.get("/createRecords", async (req, res) => {
  //API calls to be made here
  let unprocessedData= await fetchRecords()

  //Processing of the data
  let processedData = Object.values(unprocessedData).map(obj => flatten(obj));

  //CSV creation
  let csvData = convertToCsv(processedData);
  console.log("CSV", csvData);

  //FTP can be done here
});

//Cron Jobs initialization
cronJobFirst.start();
// cronJobSecond.start(); //Second Cron Job if needed


app.listen(port, () => {
  console.log(`apparel-magic-report-export app listening on port ${port}`);
});

async function uploadFileToFTP(localFile, remotePath) {
  const client = new ftp.Client();

  try {
    //Configuration from Package JSON
    await client.access({
      host: pjson.env.host,
      user: pjson.env.user,
      password: pjson.env.password,
      secure: pjson.env.secure,
    });

    // upload the local file located in localFile relative path from server loction
    // to remotePath
    await client.uploadFrom(localFile, remotePath);
  } catch (err) {
    console.log(err);
  }
  client.close();
}
