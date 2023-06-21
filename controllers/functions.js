const { apiStringWithEventTime } = require("../utils");
const axios = require("axios");
// const ftp = require("basic-ftp");
module.exports = {
  fetchCustomerRecords: async (customerId) => {
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
  },
  fetchRecords: async (pageSize = 100, currentPage = 1) => {
    return new Promise((resolve) => {
      let apiString = apiStringWithEventTime(
        "pick_tickets/",
        "&pagination[page_number]=" +
          currentPage +
          "&pagination[page_size]=" +
          pageSize
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
  },
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
};
