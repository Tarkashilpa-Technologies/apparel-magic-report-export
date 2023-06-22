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
const mongoose = require('mongoose');
const Database = require("./Database");
const dbUrl = pjson.env.mongooseUrl;


// base URL
// app.get("/", (req, res) => {
//   res.send("Refresh to start uploading");
//   uploadFileToFTP("addresses.csv", "input/addresses.csv");
// });

//Temp Function for now
app.get("/createRecords", async (req, res) => {
  let processedData = await createRecords(
    req.query.pageSize,
    req.query.currentPage
  );
  res.send(processedData);
});
async function createRecords(pageSize, currentPage) {
  // let pageSize = req.query.pageSize;
  let firstPage = await createBatchRecords(10, 1);
  let paginationData = firstPage?.meta?.pagination;
  let [
    last_id,
    last_page,
    page_Size,
    tempRecords
  ] = ['', '' , '' , '']
  if (paginationData?.total_pages != parseInt(paginationData?.current_page)) {
    for (
      let i = parseInt(paginationData?.current_page) + 1;
      i <= paginationData?.total_pages;
      i++
    ) {
      tempRecords = await createBatchRecords(pageSize, i);
      last_id = tempRecords?.meta?.pagination?.last_id
      last_page = tempRecords?.meta?.pagination?.current_page
      page_Size = pageSize
    }
    await Database.LastFetchedMetaData.create({
      pageSize: page_Size,
      lastfetchedPagination: last_page,
      lastfetchedPickTicketId: last_id,
    })
  }
  return paginationData;
}
async function createBatchRecords(pageSize, currentPage) {
  console.log("******** fetching details for ********");
  console.log("pageSize: ", pageSize);
  console.log("currentPage: ", currentPage);

  let unprocessedData = await fetchRecords(pageSize, currentPage);
  console.log("total pages: ", unprocessedData?.meta?.pagination?.total_pages);
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
  return unprocessedData;
}
//Cron Jobs initialization
// cronJobFirst.start();
// cronJobSecond.start(); //Second Cron Job if needed

app.listen(port, () => {
  mongoose.connect(dbUrl, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
  console.log(`apparel-magic-report-export app listening on port ${port}`);
  })
  .catch((err) => console.log(err))
});
