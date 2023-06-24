const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const LastFetchedMetaData = new Schema(
  {
    pageSize: { type: String, default: "" },
    lastFetchedPagination: { type: String, default: "" },
    lastFetchedPickTicketIndex: { type: String, default: "" },
    lastFetchedPickTicketId: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("LastFetchedMetaData", LastFetchedMetaData);
