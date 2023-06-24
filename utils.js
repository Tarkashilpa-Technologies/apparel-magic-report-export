const json2csv = require("json2csv").parse;
const fs = require("fs");
const pjson = require("./package.json");
module.exports = {
  convertToCsv: async (jsonData, filePrefix) => {
    const csvData = json2csv(jsonData);
    return new Promise((resolve, reject) => {
      fs.writeFile(
        `${pjson.env.csvLocation}/csv_files/${filePrefix}_${Date.now()}.csv`,
        csvData,
        "utf8",
        (err) => {
          if (err) {
            reject({ msg: "error while creating csv file" });
            // console.log("convertToCsv error".err);
          } else {
            resolve({ msg: "file created successfully" });
          }
        }
      );
    });
  },
  // updateCofiguration: async (jsonData) => {
  //   // const csvData = json2csv(jsonData);
  //   return new Promise((resolve, reject) => {
  //     fs.writeFile(`batchConfig.json`, jsonData, "utf8", (err) => {
  //       if (err) {
  //         reject({ msg: "error while creating csv file" });
  //         // console.log("convertToCsv error".err);
  //       } else {
  //         resolve({ msg: "file created successfully" });
  //       }
  //     });
  //   });
  // },
  // getCofiguration: async () => {
  //   // const csvData = json2csv(jsonData);
  //   return new Promise((resolve, reject) => {
  //     const data = fs.readFileSync(`batchConfig.json`, {
  //       encoding: "utf8",
  //       mode: "r",
  //     });
  //     resolve(data);
  //   });
  // },
  //   uploadFileToFTP: async (localFile, remotePath) => {
  //     const client = new ftp.Client();
  //     try {
  //       //Configuration from Package JSON
  //       await client.access({
  //         host: pjson.env.host,
  //         user: pjson.env.user,
  //         password: pjson.env.password,
  //         secure: pjson.env.secure,
  //       });

  //       // upload the local file located in localFile relative path from server loction
  //       // to remotePath
  //       await client.uploadFrom(localFile, remotePath);
  //     } catch (err) {
  //       console.log(err);
  //     }
  //     client.close();
  //   },
  apiStringWithEventTime: (endpoint, queryParam = "") => {
    return `${pjson.env.baseUrl}/${endpoint}?time=${Date.now()}&token=${
      pjson.env.token
    }${queryParam}`;
  },
  // cronJobSecond: cron.schedule("0 20 * * *", () => {
  //   convertToCsv(data)
  //     .then((res) => {
  //       console.log(res);
  //     })
  //     .catch((err) => {
  //       console.log(err);
  //     });
  // }),
  filterDataForCSV: (unprocessedData) => {
    var processedData = new Array();
    for (record of unprocessedData) {
      // console.log("record.alreadyProcessed", record.alreadyProcessed);
      if (!record.alreadyProcessed) {
        processedData.push({
          MessageSendingDate: "",
          AIMS360ClientCode: "CHLOE",
          AIMS360ClientName: "Chloe J llc - DBA Jocelyn",
          AIMS360CustOrderNum: record?.order_id,
          COD: "No", //TODO: Confirm details
          CompanyDivisionCode: record?.customerData?.division_id,
          CompanyDivisionDescription: "", // TODO: conversion reqired
          CompanyName: "Chloe J LLC DBA Jocelyn",
          CustomerAcctCode: record?.customerData?.customer_id,
          CustomerName: record?.customerData?.customer_name,
          DepartmentCode: "",
          DepartmentDescription: "",
          DivisionCode: "",
          DivisionDescription: "",
          EarliestShipDate: record?.date_start,
          Email: "",
          ExpectedDate: record?.date_due,
          MarkForStoreName: "",
          MarkForStoreNumber: "",
          MerchType: "",
          OrderType: "RETAIL", //TODO: Confirm details
          PONum: record?.customer_po,
          ReferenceNum: record?.pick_ticket_id,
          ServiceLevel: "",
          WarehouseCode: "", //TODO: Confirm details
          WarehouseName: "CREATIVE LOGISTIC SERVICES",
          BillTo_BillToCode: "",
          BillTo_Email: record?.customerData?.email,
          BillTo_Name: record?.customerData?.first_name,
          BillTo_PhoneNumber1: record?.customerData?.phone,
          BillTo_Address1: record?.customerData?.address_1,
          BillTo_Address2: record?.customerData?.address_2,
          BillTo_Address3: "",
          BillTo_City: record?.customerData?.city,
          BillTo_Country: record?.customerData?.country,
          BillTo_CountryCode: record?.customerData?.country,
          BillTo_State: record?.customerData?.state,
          BillTo_Zip: record?.customerData?.postal_code,
          MarkFor_Email: "",
          MarkFor_MarkForCode: record?.ship_to_id,
          MarkFor_Name: record?.customerData?.first_name,
          MarkFor_PhoneNumber1: record?.phone,
          MarkFor_Address1: record?.address_1,
          MarkFor_Address2: record?.address_2,
          MarkFor_Address3: "",
          MarkFor_City: record?.city,
          MarkFor_Country: record?.country,
          MarkFor_CountryCode: record?.country,
          MarkFor_State: record?.state,
          MarkFor_Zip: record?.postal_code,
          ShipTo_CompanyName: record?.ship_to_id,
          ShipTo_DCNo: "",
          ShipTo_Email: record?.customerData?.email,
          ShipTo_Fax: "",
          ShipTo_Name: record?.customerData?.first_name,
          ShipTo_PhoneNumber1: record?.phone,
          ShipTo_ShipToCode: record?.ship_to_id,
          ShipTo_Store: record?.ship_to_id,
          ShipTo_Address1: record?.address_1,
          ShipTo_Address2: record?.address_2,
          ShipTo_Address3: "",
          ShipTo_City: record?.city,
          ShipTo_Country: record?.country,
          ShipTo_CountryCode: record?.country,
          ShipTo_State: record?.state,
          ShipTo_Zip: record?.postal_code,
          ShipVia_Account: "",
          ShipVia_AccountZip: "",
          ShipVia_BillingCode: record?.shipping_terms_id,
          ShipVia_Carrier: record?.shipping_info,
          ShipVia_Mode: record?.ship_via,
          ShipVia_PackingNotes: "",
          ShipVia_PackingSlipUrl: "",
          ShipVia_SCACCode: record?.ship_via,
          ShipVia_ShippingNotes: "",
          ShipVia_VASNotes: "",
          ShipVia_VASShippingServ: "",
          Item_BuyersColorDescrp: "",
          Item_BuyersPartNum: "",
          Item_OrderLineId: "",
          Item_OrderQty: record?.qty, //TODO: conversion required
          Item_Price: record?.unit_price, //TODO: conversion required
          Item_SKU: record?.sku_id, //TODO: conversion required
          Item_UOM: record?.qty, //TODO: conversion required
          Item_UPC: record?.upc_display, //TODO: conversion required
          Item_Notes: "", // No detail available
          Notes: "", // No detail available
        });
      }
    }
    return processedData;
  },
};
