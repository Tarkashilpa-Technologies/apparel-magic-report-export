const json2csv = require("json2csv").parse;
const fs = require("fs");
const cron = require("node-cron");
const pjson = require("./package.json");
let headerForCSV = ["Item_OrderQty", "Item_Price", "ShipTo_Email"];
module.exports = {
  convertToCsv: async (jsonData) => {
    const csvData = json2csv(jsonData);
    return new Promise((resolve, reject) => {
      fs.writeFile(`csv_files/${Date.now()}.csv`, csvData, "utf8", (err) => {
        if (err) {
          //   reject({ msg: "error while creating csv file" });
          console.log("convertToCsv error".err);
        } else {
          resolve({ msg: "file created successfully" });
        }
      });
    });
  },
  apiStringWithEventTime: (endpoint, queryParam = "") => {
    return `${pjson.env.baseUrl}/${endpoint}?time=${Date.now()}&token=${
      pjson.env.token
    }${queryParam}`;
  },
  cronJobFirst: cron.schedule("0 13 * * *", () => {
    convertToCsv(data)
      .then((res) => {
        console.log(res);
      })
      .catch((err) => {
        console.log(err);
      });
  }),
  cronJobSecond: cron.schedule("0 20 * * *", () => {
    convertToCsv(data)
      .then((res) => {
        console.log(res);
      })
      .catch((err) => {
        console.log(err);
      });
  }),
  filterDataForCSV: (unprocessedData) => {
    var processedData = new Array();
    for (record of unprocessedData) {
      processedData.push({
        Item_OrderQty: record.qty,
        Item_Price: record.pick_ticket_items[0].unit_price,
        ShipTo_Email: record.customerData.email,
      });
    }
    return processedData;
  },
};
