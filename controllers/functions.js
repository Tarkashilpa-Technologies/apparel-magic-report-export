const { apiStringWithEventTime, filterDataForCSV, convertToCsv } = require("../utils");
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
    // console.log("service call: ", apiString);
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
const fetchRecords = async (pageSize = pjson.env.pageSize, currentPage = pjson.env.currentPage, lastPickTicketId) => {
  return new Promise((resolve) => {
    console.log("fetchRecords lastPickTicketId", lastPickTicketId);
    let startPickTicketId = parseInt(lastPickTicketId) + 1;
    let apiString = apiStringWithEventTime(
      "pick_tickets/",
      "&pagination[page_number]=" +
        currentPage +
        "&pagination[page_size]=" +
        pageSize +
        "&parameters[0][field]=void&parameters[0][operator]==&parameters[0][value]=Not" +
        "&parameters[1][field]=pick_ticket_id&parameters[1][operator]=>&parameters[1][value]=" +
        startPickTicketId
    );
    // console.log("service call: ", apiString);
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
  let [recordId, lastFetchedPickTicketIndex, lastPickTicketId, lastProcessedPickTicket] = ["", "", "0", ""];

  if (lastProcessData.length > 0) {
    console.log("data fetched from DB");
    // pageSize = lastProcessData[0]?.pageSize;
    // currentPage = lastProcessData[0]?.lastFetchedPagination;
    recordId = lastProcessData[0]?._id;
    // lastFetchedPickTicketIndex = lastProcessData[0]?.lastFetchedPickTicketIndex;
    lastPickTicketId = lastProcessData[0]?.lastFetchedPickTicketId;
  }
  let firstPage = await createBatchRecords(
    pageSize,
    "1",
    // lastFetchedPickTicketIndex,
    lastPickTicketId
  );
  let paginationData = firstPage?.meta?.pagination;
  lastProcessedPickTicket = firstPage?.endPickId;
  let [last_id, last_page] = [paginationData?.number_records_returned, paginationData?.current_page];
  if (paginationData?.total_pages != parseInt(paginationData?.current_page)) {
    for (let i = parseInt(paginationData?.current_page) + 1; i <= paginationData?.total_pages; i++) {
      console.log("lastProcessedPickTicket", lastProcessedPickTicket);
      let tempRecords = await createBatchRecords(pageSize, i, lastPickTicketId);
      last_id = tempRecords?.meta?.pagination?.number_records_returned;
      last_page = tempRecords?.meta?.pagination?.current_page;
      lastProcessedPickTicket = tempRecords?.endPickId;
    }
  }
  if (recordId) {
    await Database.LastFetchedMetaData.findByIdAndUpdate(recordId, {
      pageSize: pageSize,
      lastFetchedPagination: last_page,
      lastFetchedPickTicketIndex: last_id,
      lastFetchedPickTicketId: "14023", //lastProcessedPickTicket,
    });
  } else {
    await Database.LastFetchedMetaData.create({
      pageSize: pageSize,
      lastFetchedPagination: last_page,
      lastFetchedPickTicketIndex: last_id,
      lastFetchedPickTicketId: lastProcessedPickTicket,
    });
  }
  return paginationData;
};
const createBatchRecords = async (pageSize, currentPage, lastPickTicketId) => {
  console.log("******** fetching details for ********");
  console.log("pageSize: ", pageSize);
  console.log("currentPage: ", currentPage);
  console.log("lastPickTicketId: ", lastPickTicketId);
  let unprocessedData = await fetchRecords(pageSize, currentPage, lastPickTicketId);
  let [filePrefix, endPickId] = [unprocessedData?.response[0]?.pick_ticket_id, ""];

  console.log("total pages: ", unprocessedData?.meta?.pagination?.total_pages);
  for (let [index, pickTicket] of unprocessedData?.response?.entries()) {
    console.log("pickTicket.customer_id", pickTicket.customer_id);
    // Get Customer data
    await fetchCustomerRecords(pickTicket.customer_id)
      .then((customerResponse) => {
        pickTicket.customerData = customerResponse;
        pickTicket.alreadyProcessed = false;
      })
      .catch((err) => {
        console.log(err);
      });
    endPickId = pickTicket.pick_ticket_id;
    //Get warehouse data from DB
    await getWareHouseData(pickTicket);
  }
  console.log("data fetch complete");
  //Processing of the data
  let processedData = Object.values(filterDataForCSV(unprocessedData?.response)).map((obj) => flatten(obj));
  // console.log("processedData", processedData);
  //CSV creation
  if (processedData.length != 0) {
    convertToCsv(processedData, `${filePrefix}_${endPickId}`);
  }
  unprocessedData.endPickId = endPickId;
  return unprocessedData;
};
const getWareHouseData = async (pickTicketData) => {
  let pickTicketItemData = {};
  for (item of pickTicketData?.pick_ticket_items) {
    console.log("upc code from pick ticket", item?.upc);
    let upcDataDB = await Database.WareHouseItem.find({
      UPC: item?.upc,
    });
    if (upcDataDB.length > 0) {
      item.upcData = upcDataDB[0];
      let processUpcKey = `${upcDataDB[0]?.Style}_${upcDataDB[0]?.Color}`;
      let quantity = item.qty;
      if (pickTicketItemData.hasOwnProperty(processUpcKey)) {
        if (pickTicketItemData?.[processUpcKey].hasOwnProperty(upcDataDB[0]?.Size)) {
          quantity = parseFloat(quantity) + parseFloat(pickTicketItemData?.[processUpcKey][upcDataDB[0]?.Size].totalQuantity);
        } else {
          // UPC detais for Style, color and size
          pickTicketItemData[processUpcKey][upcDataDB[0]?.Size] = JSON.parse(JSON.stringify(upcDataDB[0]));
        }
      } else {
        pickTicketItemData[processUpcKey] = {};
        // pack details for Style and color
        let upcPackDataDB = await Database.WareHouseItem.find({
          Style: upcDataDB[0]?.Style,
          Color: upcDataDB[0]?.Color,
          Size: "PPK",
        });
        if (upcPackDataDB.length > 0) {
          pickTicketItemData[processUpcKey].packDetails = JSON.parse(JSON.stringify(upcPackDataDB[0]));
        }
        // UPC detais for Style, color and size
        pickTicketItemData[processUpcKey][upcDataDB[0]?.Size] = JSON.parse(JSON.stringify(upcDataDB[0]));
      }
      pickTicketItemData[processUpcKey][upcDataDB[0]?.Size]["totalQuantity"] = quantity.toString();
      pickTicketItemData[processUpcKey][upcDataDB[0]?.Size]["orderQuantity"] = quantity.toString();
    }
  }
  // console.log("pickTicketItemData", JSON.stringify(pickTicketItemData));
  // Optimise Items and store
  pickTicketData.pickTicketItemData = optimisePickTicketItem(pickTicketItemData);
};
const optimisePickTicketItem = (pickTicketItemData) => {
  for (let [styleColorName, styleColorNameValue] of Object.entries(pickTicketItemData)) {
    let packRatio = styleColorNameValue?.packDetails?.Ratio.split("-");
    let packSize = styleColorNameValue?.packDetails?.["Prepack Size Name"].split("-");
    let eligiableForPack = true;
    let maxPack;
    // Check for pack eligiblity and possible packs
    for (let [index, size] of packSize?.entries()) {
      if (!(styleColorNameValue.hasOwnProperty(size) || styleColorNameValue[size]["totalQuantity"] < packRatio[index])) {
        eligiableForPack = false;
      } else {
        // Compute Maximum Pack
        let tempPack = Math.floor(parseFloat(styleColorNameValue[size]["totalQuantity"]) / parseFloat(packRatio[index]));
        if (index == 0) {
          maxPack = tempPack;
        } else {
          maxPack = tempPack < maxPack ? tempPack : maxPack;
        }
      }
      //TODO: update orderQuantity by pack value
      styleColorNameValue.eligiableForPack = eligiableForPack;
      styleColorNameValue.maxPackPossible = maxPack;
    }
  }

  console.log("pickTicketItemData", JSON.stringify(pickTicketItemData));
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
module.exports = { initDatabase, createRecords };
