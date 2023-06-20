const { apiStringWithEventTime } = require("../utils")
const axios = require('axios');


module.exports = {
    fetchRecords : async (res) => {
        return new Promise((resolve) => {
        let apiString = apiStringWithEventTime('customers/1000')
        axios.get(apiString)
        .then(response => {
            resolve(response?.data?.response)
          })
    })
}
}