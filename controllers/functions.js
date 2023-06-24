const {
  apiStringWithEventTime,
  filterDataForCSV,
  convertToCsv,
} = require("../utils");
const axios = require("axios");
const pjson = require("../package.json");
const flatten = require("flat");
const mongoose = require("mongoose");
const Database = require("../Database");
const cron = require("node-cron");
const dbUrl = pjson.env.mongooseUrl;

// module.exports = {
const fetchCustomerRecords = async (customerId) => {
  return new Promise((resolve) => {
    let apiString = apiStringWithEventTime("customers/" + customerId);
    axios.get(apiString).then(
      (response) => {
        resolve(response?.data?.response[0]);
      },
      (error) => {
        console.log(error);
      }
    );
  });
};
const fetchRecords = async (
  pageSize = pjson.env.pageSize,
  currentPage = pjson.env.currentPage
) => {
  return new Promise((resolve) => {
    let apiString = apiStringWithEventTime(
      "pick_tickets/",
      "&pagination[page_number]=" +
        currentPage +
        "&pagination[page_size]=" +
        pageSize +
        "&parameters[0][field]=void&parameters[0][operator]==&parameters[0][value]=Not"
    );
    axios.get(apiString).then(
      (response) => {
        resolve(response?.data);
      },
      (error) => {
        console.log(error);
      }
    );
  });
};
const createRecords = async (pageSize, currentPage) => {
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
};
const createBatchRecords = async (
  pageSize,
  currentPage,
  lastFetchedPickTicketIndex
) => {
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
};
const initDatabase = () => {
  mongoose
    .connect(dbUrl, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
      console.log(`connected with DB`);
      cronJob.start();
    })
    .catch((err) => console.log(err));
};
const cronJob = cron.schedule(pjson.env.cronSchedule, () => {
  console.log("Cron started");
  let [pageSize, currentPage] = [pjson.env.pageSize, pjson.env.currentPage];
  let processedData = createRecords(pageSize, currentPage);
  // console.log("Cron end with", processedData);
});
module.exports = { initDatabase, createRecords, cronJob };
