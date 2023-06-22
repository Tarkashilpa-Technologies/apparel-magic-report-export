const express = require("express");
const pjson = require("./package.json");
const app = express();
const port = pjson.env.port;
const {
  convertToCsv,
  cronJobFirst,
  apiStringWithEventTime,
  filterDataForCSV,
} = require("./utils");
// const csvData = require("./customerData.json");
const {
  fetchRecords,
  fetchCustomerRecords,
} = require("./controllers/functions");
const flatten = require("flat");

// base URL
app.get("/", (req, res) => {
  res.send("Refresh to start uploading");
  uploadFileToFTP("addresses.csv", "input/addresses.csv");
});

//Temp Function for now
app.get("/createRecords", async (req, res) => {
  //API calls to be made here
  let unprocessedData = await fetchRecords(
    req.query.pageSize,
    req.query.currentPage
  );
  for (pickTicket of unprocessedData?.response) {
    console.log("pickTicket.customer_id", pickTicket.customer_id);
    await fetchCustomerRecords(pickTicket.customer_id)
      .then((customerResponse) => {
        pickTicket.customerData = customerResponse;
      })
      .catch((err) => {
        console.log(err);
      });
  }
  console.log("data fetch complete");
  //Processing of the data
  let processedData = Object.values(
    filterDataForCSV(unprocessedData?.response)
  ).map((obj) => flatten(obj));

  //CSV creation
  convertToCsv(processedData);
  // console.log("CSV", csvData);

  //FTP can be done here
  // TODO: update response
  res.send(processedData);
});

//Cron Jobs initialization
// cronJobFirst.start();
// cronJobSecond.start(); //Second Cron Job if needed

app.listen(port, () => {
  console.log(`apparel-magic-report-export app listening on port ${port}`);
});
