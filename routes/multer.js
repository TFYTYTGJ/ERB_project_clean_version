const multer  = require('multer');
const fs = require('fs');
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let dir;
        if (file.mimetype.startsWith("image/")) dir = 'public/images'
        else dir = 'public/videos';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
      cb(null, dir)
    },
    filename: (req, file, cb) => {
        cb(null, file.fieldname);
      }
  });
const upload = multer({ storage: storage,
    fileFilter: (req, file, cb) => {
      const fileSize = parseInt(req.headers["content-length"])
        if ((!file.originalname.match(/\.(jpg|jpeg|png)$/) || !file.mimetype.startsWith("video/")) && fileSize <= 5368709120) {
            cb(null, true)
          } else {
          req.session.messages.push("檔案過大")
          cb(null, false)
        }
      }
     });

exports.upload = upload;
