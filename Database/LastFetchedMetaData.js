const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const LastFetchedMetaData = new Schema(
    {
        pageSize: { type: String, default: "" },
        lastfetchedPagination: { type: String, default: "" },
        lastfetchedPickTicketId: { type: String, default: "" },
    },
    { timestamps: true }
)

module.exports = mongoose.model("LastFetchedMetaData", LastFetchedMetaData);