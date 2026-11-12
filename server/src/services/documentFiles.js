// The supporting document files of applications (payslips, IDs), kept in MongoDB GridFS so no
// other storage service is needed. Only staff and the applicant can read them (routes/applications.js).
const crypto = require("node:crypto");
const mongoose = require("mongoose");

const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_BYTES = 10 * 1024 * 1024;

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "applicationDocuments" });

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/** Saves a file and returns its id. */
function save(buf, { fileName, contentType, applicationId, index }) {
  return new Promise((resolve, reject) => {
    const stream = bucket().openUploadStream(fileName, { metadata: { contentType, application: applicationId, index, sha256: sha256(buf) } });
    stream.on("error", reject);
    stream.on("finish", () => resolve(stream.id));
    stream.end(buf);
  });
}

const open = (fileId) => bucket().openDownloadStream(new mongoose.Types.ObjectId(String(fileId)));

module.exports = { TYPES, MAX_BYTES, sha256, save, open };
