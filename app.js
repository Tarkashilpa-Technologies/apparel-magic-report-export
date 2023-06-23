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
const mongoose = require("mongoose");
const Database = require("./Database");
const dbUrl = pjson.env.mongooseUrl;

// base URL
// app.get("/", (req, res) => {
//   res.send("Refresh to start uploading");
//   uploadFileToFTP("addresses.csv", "input/addresses.csv");
// });

//Temp Function for now
app.get("/createRecords", async (req, res) => {
  let [pageSize, currentPage] = [pjson.env.pageSize, pjson.env.currentPage];
  let processedData = await createRecords(pageSize, currentPage);
  res.send(processedData);
});
async function createRecords(pageSize, currentPage) {
  let lastProcessData = await Database.LastFetchedMetaData.find();
  let [recordId, lastFetchedPickTicketIndex] = ["", ""];

  if (lastProcessData.length > 0) {
    console.log("data fetched from DB");
    pageSize = lastProcessData[0]?.pageSize;
    currentPage = lastProcessData[0]?.lastFetchedPagination;
    recordId = lastProcessData[0]?._id;
    lastFetchedPickTicketIndex = lastProcessData[0]?.lastFetchedPickTicketIndex;
  }
  let firstPage = await createBatchRecords(
    pageSize,
    currentPage,
    lastFetchedPickTicketIndex
  );
  let paginationData = firstPage?.meta?.pagination;
  let [last_id, last_page] = [
    paginationData?.number_records_returned,
    paginationData?.current_page,
  ];
  if (paginationData?.total_pages != parseInt(paginationData?.current_page)) {
    for (
      let i = parseInt(paginationData?.current_page) + 1;
      i <= paginationData?.total_pages;
      i++
    ) {
      let tempRecords = await createBatchRecords(pageSize, i);
      last_id = tempRecords?.meta?.pagination?.number_records_returned;
      last_page = tempRecords?.meta?.pagination?.current_page;
      // page_Size = pageSize;
    }
  }
  if (recordId) {
    await Database.LastFetchedMetaData.findByIdAndUpdate(recordId, {
      pageSize: pageSize,
      lastFetchedPagination: last_page,
      lastFetchedPickTicketIndex: last_id,
    });
  } else {
    await Database.LastFetchedMetaData.create({
      pageSize: pageSize,
      lastFetchedPagination: last_page,
      lastFetchedPickTicketIndex: last_id,
    });
  }
  return paginationData;
}
async function createBatchRecords(
  pageSize,
  currentPage,
  lastFetchedPickTicketIndex
) {
  console.log("******** fetching details for ********");
  console.log("pageSize: ", pageSize);
  console.log("currentPage: ", currentPage);

  let unprocessedData = await fetchRecords(pageSize, currentPage);
  console.log("total pages: ", unprocessedData?.meta?.pagination?.total_pages);
  for (let [index, pickTicket] of unprocessedData?.response?.entries()) {
    if (index < lastFetchedPickTicketIndex) {
      pickTicket.alreadyProcessed = true;
    } else {
      console.log("pickTicket.customer_id", pickTicket.customer_id);
      await fetchCustomerRecords(pickTicket.customer_id)
        .then((customerResponse) => {
          pickTicket.customerData = customerResponse;
          pickTicket.alreadyProcessed = false;
        })
        .catch((err) => {
          console.log(err);
        });
    }
  }
  console.log("data fetch complete");
  //Processing of the data
  let processedData = Object.values(
    filterDataForCSV(unprocessedData?.response)
  ).map((obj) => flatten(obj));
  // console.log("processedData", processedData);
  //CSV creation
  if (processedData.length != 0) {
    convertToCsv(processedData);
  }
  return unprocessedData;
}
//Cron Jobs initialization
// cronJobFirst.start();
// cronJobSecond.start(); //Second Cron Job if needed

app.listen(port, () => {
  mongoose
    .connect(dbUrl, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
      console.log(`apparel-magic-report-export app listening on port ${port}`);
    })
    .catch((err) => console.log(err));
});
