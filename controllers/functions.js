const { apiStringWithEventTime, filterDataForCSV, convertToCsv, sendEmail } = require("../utils");
const axios = require("axios");
const pjson = require("../package.json");
const flatten = require("flat");
const mongoose = require("mongoose");
const Database = require("../Database");
const cron = require("node-cron");
const dbUrl = pjson.env.mongooseUrl;
const { get } = require("lodash");

let emailData = new Array();
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
        console.error("Error for fetchCustomerRecords: ", customerId);
        console.log("Error details: ", error);
      }
    );
  });
};
const fetchRecords = async (pageSize = pjson.env.pageSize, currentPage = pjson.env.currentPage, lastPickTicketId) => {
  return new Promise((resolve) => {
    // console.log("fetchRecords lastPickTicketId", lastPickTicketId);
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
        console.error("Error for fetchRecords: ", lastPickTicketId, " page: ", currentPage);
        console.log("Error details: ", error);
      }
    );
  });
};
const createRecords = async (pageSize) => {
  let lastProcessData = await Database.LastFetchedMetaData.find();
  let [recordId, lastPickTicketId, lastProcessedPickTicket] = ["", pjson.env.dayZeroPickTicketId, ""];
  // Get data for Last fetched data from DB
  if (lastProcessData.length > 0) {
    console.log("Pick Ticket configuration fetched from DB");
    recordId = lastProcessData[0]?._id;
    lastPickTicketId = lastProcessData[0]?.lastFetchedPickTicketId;
  }
  // Page 1 fetch for pick ticket
  let firstPage = await createBatchRecords(pageSize, "1", lastPickTicketId);
  let paginationData = firstPage?.meta?.pagination;
  lastProcessedPickTicket = firstPage?.endPickId;
  // let [last_id, last_page] = [paginationData?.number_records_returned, paginationData?.current_page];
  // Page 2 to last page fetch for pick ticket
  if (paginationData?.total_pages != parseInt(paginationData?.current_page)) {
    for (let i = parseInt(paginationData?.current_page) + 1; i <= paginationData?.total_pages; i++) {
      let tempRecords = await createBatchRecords(pageSize, i, lastPickTicketId);
      // last_id = tempRecords?.meta?.pagination?.number_records_returned;
      // last_page = tempRecords?.meta?.pagination?.current_page;
      lastProcessedPickTicket = tempRecords?.endPickId;
    }
  }
  // Insert or update database
  if (recordId) {
    await Database.LastFetchedMetaData.findByIdAndUpdate(recordId, {
      // pageSize: pageSize,
      // lastFetchedPagination: last_page,
      // lastFetchedPickTicketIndex: last_id,
      lastFetchedPickTicketId: lastProcessedPickTicket,
    });
  } else {
    await Database.LastFetchedMetaData.create({
      // pageSize: pageSize,
      // lastFetchedPagination: last_page,
      // lastFetchedPickTicketIndex: last_id,
      lastFetchedPickTicketId: lastProcessedPickTicket,
    });
  }
  return paginationData;
};
const createBatchRecords = async (pageSize, currentPage, lastPickTicketId) => {
  console.log("fetching details for page: ", currentPage);
  emailData = new Array();
  let unprocessedData = await fetchRecords(pageSize, currentPage, lastPickTicketId);
  let [filePrefix, endPickId] = [pjson.env.filenamePrefix + "_" + unprocessedData?.response[0]?.pick_ticket_id, lastPickTicketId];
  console.log("Fetching data from Pick Ticket: ", lastPickTicketId);
  for (let [index, pickTicket] of unprocessedData?.response?.entries()) {
    console.log("Customer Id: ", pickTicket.customer_id, " of Pick Ticket: ", pickTicket.pick_ticket_id);
    // Get Customer data
    await fetchCustomerRecords(pickTicket.customer_id)
      .then((customerResponse) => {
        pickTicket.customerData = customerResponse;
      })
      .catch((err) => {
        console.log(err);
        console.error("error for fetchCustomerRecords: ", pickTicket.customer_id);
      });
    endPickId = pickTicket.pick_ticket_id;
    //Get warehouse data from DB
    if (pickTicket?.ship_via && !isNaN?.(pickTicket?.ship_via)) {
      console.log("fetching shipping info for ship via", pickTicket?.ship_via);
      await getShipInfo(pickTicket.ship_via).then((shipInfo) => {
        console.log("fetched shipinfo as ", shipInfo);
        pickTicket.ExentaShipViaCode = shipInfo;
      });
    }
    await getWareHouseData(pickTicket);
  }
  console.log("Data fetched till Pick Ticket: ", endPickId);
  //Processing of the data
  let processedData = Object.values(filterDataForCSV(unprocessedData?.response)).map((obj) => flatten(obj));
  console.log("Filter and process complete for ", processedData.length, " records");
  //CSV creation
  if (processedData.length != 0) {
    convertToCsv(processedData, `${filePrefix}_${endPickId}`);
    console.log("CSV created with prefix: ", `${filePrefix}_${endPickId}`);
  }
  if (emailData.length != 0 && pjson.env.enableEmail) {
    sendEmail(emailData.join("<br/>"));
  }
  // to update details in DB
  unprocessedData.endPickId = endPickId;
  return unprocessedData;
};
const getWareHouseData = async (pickTicketData) => {
  let pickTicketItemData = {};
  const emailDataLength = emailData.length;
  for (item of pickTicketData?.pick_ticket_items) {
    // console.log("upc code from pick ticket", item?.upc);
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
    } else {
      emailData.push("UPC code: " + item?.upc + " not avaialble for pick ticket: " + pickTicketData.pick_ticket_id);
      console.log("UPC code: ", item?.upc, " not avaialble for pick ticket: ", pickTicketData.pick_ticket_id);
    }
  }
  //check if pick ticket item is not available
  if (emailData.length != emailDataLength) {
    pickTicketData.pickTicketItemData = optimisePickTicketItem({});
    console.log("Skiping records for pick ticket ", pickTicketData.pick_ticket_id);
    return;
  }
  // console.log("pickTicketItemData", JSON.stringify(pickTicketItemData));
  // Optimise Items and store
  pickTicketData.pickTicketItemData = optimisePickTicketItem(pickTicketItemData);
};
const optimisePickTicketItem = (pickTicketItemData) => {
  let processedPickItems = new Array();
  for (let [styleColorName, styleColorNameValue] of Object.entries(pickTicketItemData)) {
    let packRatio = styleColorNameValue?.packDetails?.Ratio.split("-");
    let packSize = styleColorNameValue?.packDetails?.["Prepack Size Name"].split("-");
    console.log("packSize: ", packSize);
    let eligiableForPack = true;
    let maxPack;
    if (undefined == packSize) {
      packSize = new Array();
    }
    // Check for pack eligiblity and possible packs
    for (let [index, size] of packSize?.entries()) {
      if (!(styleColorNameValue.hasOwnProperty(size) && styleColorNameValue[size]["totalQuantity"] < packRatio[index])) {
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
      //update orderQuantity by pack value
      styleColorNameValue.packDetails.orderQuantity = maxPack;
      if (eligiableForPack) {
        for (let [index, size] of packSize?.entries()) {
          if (styleColorNameValue.hasOwnProperty(size))
            styleColorNameValue[size]["orderQuantity"] = parseFloat(styleColorNameValue[size]["totalQuantity"]) - parseFloat(packRatio[index]) * maxPack;
        }
      }
      styleColorNameValue.eligiableForPack = eligiableForPack;
      styleColorNameValue.maxPackPossible = maxPack;
    }
    // processed data for reporting
    for (let [orderType, orderTypeValue] of Object.entries(styleColorNameValue)) {
      if (parseFloat(orderTypeValue?.orderQuantity) > 0) {
        console.debug("orderType", orderType, parseFloat(orderTypeValue?.orderQuantity));
        processedPickItems.push({
          CompanyDivisionCode: orderTypeValue?.Division,
          CompanyDivisionDescription: orderTypeValue?.Division,
          Item_OrderQty: orderTypeValue?.orderQuantity,
          Item_SKU: `${orderTypeValue?.Style}_${orderTypeValue?.Color}_${orderTypeValue?.Size}`,
          Item_UOM: orderTypeValue?.UOM,
          Item_UPC: orderTypeValue?.UPC,
        });
      }
    }
  }
  pickTicketItemData.processedPickItems = processedPickItems;
  console.debug("pickTicketItemData final data: ", JSON.stringify(pickTicketItemData));
  return pickTicketItemData;
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
  console.log("########### Schedule start at ", new Date(), "###########");
  let [pageSize, currentPage] = [pjson.env.pageSize, pjson.env.currentPage];
  let processedData = createRecords(pageSize, currentPage);
  // console.log("########### Schedule end at ", Date.now().toString(), "###########");
  // console.log("Cron end with", processedData);
});
const getShipInfo = async (shipId) => {
  return new Promise(async (resolve) => {
    let shipInfoData = await Database.ShipInfo.findOne({
      shipId: parseInt(shipId),
    });
    let ExentaShipViaCode = get(shipInfoData, "ExentaShipViaCode", "");
    resolve(ExentaShipViaCode);
  });
};
module.exports = { initDatabase, createRecords };
