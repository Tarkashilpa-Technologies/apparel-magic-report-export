const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const WareHouseItem = new Schema(
  {
    "Client ID": { type: String, default: "" },
    Division: { type: String, default: "" },
    Style: { type: String, default: "" },
    UOM: { type: String, default: "" },
    "Size Range": { type: String, default: "" },
    "Item No": { type: String, default: "" },
    "Style Name": { type: String, default: "" },
    Color: { type: String, default: "" },
    "Color Desc": { type: String, default: "" },
    PPK: { type: String, default: "" },
    Size: { type: String, default: "" },
    UPC: { type: Number, default: "" },
    Ratio: { type: String, default: "" },
    "Prepack Size Name": { type: String, default: "" },
    "Combine Size + Ratio": { type: String, default: "" },
    "Size Desc": { type: String, default: "" },
    "Style Desc": { type: String, default: "" },
    "Created Date": { type: String, default: "" },
  },
  { timestamps: false }
);

module.exports = mongoose.model("WareHouseItem", WareHouseItem);
