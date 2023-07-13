const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const ShipInfo = new Schema(
  {
    shipId : { type: Number, default: "" },
    provider : { type: String, default: "" },
    name : { type: String, default: "" },
    ExentaShipViaCode : { type: String, default: "" },
    Notes : { type: String, default: "" },
    num_days : { type: String, default: "" },
    am_ship_carrier : { type: String, default: "" },
    am_ship_service : { type: String, default: "" },
    shipstation_carrier : { type: String, default: "" },
    shipstation_service : { type: String, default: "" },
    scac : { type: String, default: "" },
    sps_service_level : { type: String, default: "" },
    flat_rate : { type: String, default: "" },
    tracking_url : { type: String, default: "" },	
    errors : { type: String, default: "" }
  },
  { timestamps: false }
);

module.exports = mongoose.model("ShipInfo", ShipInfo);
