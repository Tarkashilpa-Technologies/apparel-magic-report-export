const { apiStringWithEventTime, filterDataForCSV, convertToCsv, sendEmail, asyncForEach } = require("../utils");
const axios = require("axios");
const pjson = require("../package.json");
const flatten = require("flat");
const mongoose = require("mongoose");
const Database = require("../Database");
const cron = require("node-cron");
const dbUrl = pjson.env.mongooseUrl;
const { get } = require("lodash");
const winston = require("../logging");

// const asyncForEach = async (array, callback) => {
//   for (let index = 0; index < array.length; index++) {
//     await callback(array[index], index, array);
//   }
// };

let emailData = new Array();
let isBatchActive = false;
// module.exports = {
const fetchCustomerRecords = async (customerId, element) => {
  // console.log("Fetching", element);
  return new Promise((resolve) => {
    let apiString = apiStringWithEventTime("customers/" + customerId, "", element);
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
const fetchRecords = async (pageSize = pjson.env.pageSize, currentPage = pjson.env.currentPage, lastPickTicketId, element) => {
  return new Promise((resolve) => {
    // console.log("fetchRecords lastPickTicketId", lastPickTicketId);
    console.log("fetchRecords lastPickTicketId", element?.name);
    let startPickTicketId = parseInt(lastPickTicketId);
    let apiString = apiStringWithEventTime(
      "pick_tickets/",
      "&pagination[page_number]=" +
        currentPage +
        "&pagination[page_size]=" +
        pageSize +
        "&parameters[0][field]=void&parameters[0][operator]==&parameters[0][value]=Not" +
        "&parameters[1][field]=pick_ticket_id&parameters[1][operator]=>&parameters[1][value]=" +
        startPickTicketId +
        "&parameters[2][field]=warehouse_id&parameters[2][include_type]=OR&parameters[2][value]=1" +
        "&parameters[3][field]=warehouse_id&parameters[3][include_type]=OR&parameters[3][value]=4",
      element
    );
    // console.log("service call: ", apiString);
    axios.get(apiString).then(
      (response) => {
        // console.log(apiString, response?.data);
        resolve(response?.data);
      },
      (error) => {
        console.error("Error for fetchRecords: ", lastPickTicketId, " page: ", currentPage);
        console.log("Error details: ", error);
      }
    );
  });
};
const createRecords = async (pageSize, element) => {
  console.log("createRecords", element?.name);
  let lastProcessData = await Database.LastFetchedMetaData.findOne({ instanceName: element?.name });
  let [recordId, lastPickTicketId, lastProcessedPickTicket] = ["", element?.dayZeroPickTicketId, ""];
  // Get data for Last fetched data from DB
  // console.log("lastProcessData details: ", lastProcessData, null != lastProcessData);
  if (null != lastProcessData) {
    console.log("Pick Ticket configuration fetched from DB: ", lastProcessData);
    recordId = lastProcessData._id;
    lastPickTicketId = lastProcessData?.lastFetchedPickTicketId;
  }
  // Page 1 fetch for pick ticket
  let firstPage = await createBatchRecords(pageSize, "1", lastPickTicketId, element);
  let paginationData = firstPage?.meta?.pagination;
  lastProcessedPickTicket = firstPage?.endPickId;
  // let [last_id, last_page] = [paginationData?.number_records_returned, paginationData?.current_page];
  // Page 2 to last page fetch for pick ticket
  if (paginationData?.total_pages != parseInt(paginationData?.current_page)) {
    for (let i = parseInt(paginationData?.current_page) + 1; i <= paginationData?.total_pages; i++) {
      let tempRecords = await createBatchRecords(pageSize, i, lastPickTicketId, element);
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
      instanceName: element?.name,
    });
  } else {
    await Database.LastFetchedMetaData.create({
      // pageSize: pageSize,
      // lastFetchedPagination: last_page,
      // lastFetchedPickTicketIndex: last_id,
      lastFetchedPickTicketId: lastProcessedPickTicket,
      instanceName: element?.name,
    });
  }
  return paginationData;
};
const createBatchRecords = async (pageSize, currentPage, lastPickTicketId, element) => {
  console.log("fetching details for page: ", currentPage);
  emailData = new Array();
  let unprocessedData = await fetchRecords(pageSize, currentPage, lastPickTicketId, element);
  //Add checks here for warehouse : 1
  // const instanceObject = pjson.env?.instances?.find((instance) => instance.name === element);
  let [filePrefix, endPickId] = [element?.filenamePrefix + "_" + element?.name + "_" + unprocessedData?.response[0]?.pick_ticket_id, lastPickTicketId];
  console.log("Fetching data from Pick Ticket: ", lastPickTicketId);
  for (let [index, pickTicket] of unprocessedData?.response?.entries()) {
    console.log("Customer Id: ", pickTicket.customer_id, " of Pick Ticket: ", pickTicket.pick_ticket_id);
    // Get Customer data
    await fetchCustomerRecords(pickTicket.customer_id, element)
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
      await getShipInfo(pickTicket.ship_via, element).then((shipInfo) => {
        console.log("fetched shipinfo as ", shipInfo);
        pickTicket.ExentaShipViaCode = shipInfo;
      });
    }
    await getWareHouseData(pickTicket);
  }
  winston.info(`Data fetched till Pick Ticket: , ${endPickId}`);
  //Processing of the data
  let processedData = Object.values(filterDataForCSV(unprocessedData?.response)).map((obj) => flatten(obj));
  winston.info(`Filter and process complete for, ${processedData.length}, records`);
  //CSV creation
  if (processedData.length != 0) {
    convertToCsv(processedData, `${filePrefix}_${endPickId}`, element);
    winston.info(`CSV created with prefix:, ${filePrefix}_${endPickId}`);
  }
  if (emailData.length != 0 && pjson.env.enableEmail) {
    sendEmail(emailData.join("<br/>"), element);
  }
  // to update details in DB
  unprocessedData.endPickId = endPickId;
  return unprocessedData;
};
const getWareHouseData = async (pickTicketData) => {
  let pickTicketItemData = {};
  const emailDataLength = emailData.length;
  for (item of pickTicketData?.pick_ticket_items) {
    let upcDataDB = await Database.WareHouseItem.find({
      UPC: item?.upc,
    });
    // console.log("upc code from pick ticket", item?.upc, upcDataDB);
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
      // console.log("Size avilable", styleColorNameValue.hasOwnProperty(size));
      // console.log("totalQuantity avilable", styleColorNameValue[size]["totalQuantity"]);
      if (styleColorNameValue.hasOwnProperty(size) && styleColorNameValue[size]["totalQuantity"] >= packRatio[index]) {
        // Compute Maximum Pack
        let tempPack = Math.floor(parseFloat(styleColorNameValue[size]["totalQuantity"]) / parseFloat(packRatio[index]));
        if (index == 0) {
          maxPack = tempPack;
        } else {
          maxPack = tempPack < maxPack ? tempPack : maxPack;
        }
      } else {
        eligiableForPack = false;
      }
      //update orderQuantity by pack value
      styleColorNameValue.packDetails.orderQuantity = maxPack;
      if (eligiableForPack) {
        for (let [index, size] of packSize?.entries()) {
          if (styleColorNameValue.hasOwnProperty(size)) styleColorNameValue[size]["orderQuantity"] = parseFloat(styleColorNameValue[size]["totalQuantity"]) - parseFloat(packRatio[index]) * maxPack;
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
      // let processedData = asyncForEach(pjson.env.instances, async (element) => {
      //   console.log(`processing`, element.name);
      //   let [pageSize, currentPage] = [pjson.env.pageSize, pjson.env.currentPage];
      //   let processedData = createRecords(pageSize, element?.name ,currentPage );

      // })
    })
    .catch((err) => console.log(err));
};
const initFetchRecords = async () => {
  let [pageSize] = [pjson.env.pageSize];
  if (!isBatchActive) {
    isBatchActive = true;
    for (element of pjson?.env?.instances) {
      let processedData = await createRecords(pageSize, element);
      console.log("processing complete for instance: ", element?.name);
    }
    isBatchActive = false;
    winston.info(`########### Processing end at ", ${new Date()}, "###########`);
  } else {
    winston.info(`########### Skipping Schedule/process as one is already active at ", ${new Date()}, "###########`);
  }
};
const cronJob = cron.schedule(pjson.env.cronSchedule, () => {
  winston.info(`########### Schedule start at ", ${new Date()}, "###########`);
  initFetchRecords();
  // let processedData = asyncForEach(pjson?.env?.instances, async (element) => {
  //   let [pageSize, currentPage] = [pjson.env.pageSize, pjson.env.currentPage];
  //   let processedData = createRecords(pageSize, element?.name ,currentPage );

  // })
  // console.log("########### Schedule end at ", Date.now().toString(), "###########");
  // console.log("Cron end with", processedData);
});
const getShipInfo = async (shipId, element) => {
  return new Promise(async (resolve) => {
    let shipInfoData = await Database.ShipInfo.findOne({
      shipId: parseInt(shipId),
      instanceName: element?.name,
    });
    let ExentaShipViaCode = get(shipInfoData, "ExentaShipViaCode", "");
    resolve(ExentaShipViaCode);
  });
};

const createRecordOnArray = async (request) => {
  try {
    console.log(request.body);
    const { pickTickets, instance } = request.body;
    const requestArray = [];
    let instanceElement = {};
    for (element of pjson?.env?.instances) {
      if (element?.name.toUpperCase() == instance.toUpperCase()) {
        instanceElement = element;
      }
    }
    // Fetch data for each pick ticket in parallel
    await Promise.all(
      pickTickets.map(async (pt) => {
        const apiString = apiStringWithEventTime(`pick_tickets/${pt}`, "", instanceElement);
        // console.log("apiString", apiString);
        const response = await axios.get(apiString);
        if (response?.data?.response?.[0]) {
          requestArray.push(response.data.response[0]);
        } else {
          winston.info(`No response data for pick_ticket_id: ${pt}, response: `, response.data);
        }
      })
    );

    // Process data for each pick ticket
    for (const pickTicket of requestArray) {
      console.log(`Customer Id: ${pickTicket.customer_id} of Pick Ticket: ${pickTicket.pick_ticket_id}`);
      // Get Customer data
      try {
        const customerResponse = await fetchCustomerRecords(pickTicket.customer_id, instanceElement);
        pickTicket.customerData = customerResponse;
      } catch (err) {
        console.error(err);
        winston.info(`Error fetching customer records for customer_id: ${pickTicket.customer_id}`);
      }

      // Get warehouse data from DB
      if (pickTicket.ship_via && !isNaN(pickTicket.ship_via)) {
        // console.log(`Fetching shipping info for ship via ${pickTicket.ship_via}`);
        const shipInfo = await getShipInfo(pickTicket.ship_via, instanceElement);
        // console.log(`Fetched shipinfo as: ${shipInfo}`);
        pickTicket.ExentaShipViaCode = shipInfo;
      }

      await getWareHouseData(pickTicket);
    }

    // Filter and process the data
    const processedData = Object.values(filterDataForCSV(requestArray)).map((obj) => flatten(obj));
    // console.log("Processed Data:", processedData);

    if (processedData.length !== 0) {
      const lastElement = requestArray[requestArray.length - 1];
      const filePrefix = `${instanceElement.filenamePrefix}_${instanceElement.name}_${new Date().toJSON().slice(0, 10)}`;

      // CSV creation
      convertToCsv(processedData, filePrefix, instanceElement);
      winston.info(`CSV created with prefix: ${filePrefix}`);
      return `CSV created: ${filePrefix}`;
    } else {
      return "Error: No file created. Please check log file for errors.";
    }
  } catch (error) {
    winston.info("An error occurred:", error);
    return "An error occurred. Please check the server logs.";
  }
};

module.exports = { initDatabase, createRecords, createRecordOnArray, initFetchRecords };
