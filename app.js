const express = require("express");
const pjson = require("./package.json");
const app = express();
const port = pjson.env.port;

const ftp = require("basic-ftp");
app.get("/", (req, res) => {
  res.send("Uploading start");
  uploadFileToFTP("addresses.csv", "input/addresses.csv");
});

app.listen(port, () => {
  console.log(`apparel-magic-report-export app listening on port ${port}`);
});

async function uploadFileToFTP(localFile, remotePath) {
  const client = new ftp.Client();

  try {
    await client.access({
      host: pjson.env.host,
      user: pjson.env.user,
      password: pjson.env.password,
      secure: pjson.env.secure,
    });

    // upload the local file located in localFile
    // to remotePath
    await client.uploadFrom(localFile, remotePath);
  } catch (err) {
    console.log(err);
  }
  client.close();
}
