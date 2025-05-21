require("dotenv").config();
const express = require("express");
const cors = require("cors"); 
const pool = require("./DbConnection/db");
const app = express();
const PORT = process.env.PORT || 5000;
const path = require("path");

const authRouter = require("./Router/authRouter");
const courseRouter = require("./Router/Courses");
const cartRouter = require("./Router/cartRoutes");
const razorpayRoute = require("./Router/razorRoutes");
const internshipRouter = require("./Router/internship");
const callbacksRouter = require("./Router/callbackRoutes");
app.use(cors({
  origin: ["http://localhost:3000", "https://yourdomain.com"],
  methods: ["GET", "POST", "PATCH", "DELETE"], 
  allowedHeaders: ["Content-Type", "Authorization"], 
  credentials: true, 
}));

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.get("/download-curriculum/:filename", (req, res) => {
  const filePath = path.join(__dirname, "uploads", req.params.filename);
  res.download(filePath, `${req.query.courseName}_curriculum.pdf`, (err) => {
    if (err) {
      console.error("Error downloading file:", err);
      res.status(500).send("File download failed.");
    }
  });
});

app.use("/auth/api", authRouter);
app.use("/admin/", courseRouter);
app.use("/carting/", cartRouter);
app.use("/amount/", razorpayRoute);
app.use("/intern/", internshipRouter);
app.use("/support/", callbacksRouter);

app.get("/", (req, res) => {
  res.send("Skillcoder Server is running...");
});

// Test database connection
pool.connect()
  .then((client) => {
    console.log("✅ Connected to PostgreSQL Database!");
    client.release();
  })
  .catch((err) => {
    console.error("❌ Database connection failed:", err);
  });

const port = process.env.PORT || 5001;
app.listen(port,'0.0.0.0', () => {
  console.log(`Server started on http://localhost:${port}`);
});
