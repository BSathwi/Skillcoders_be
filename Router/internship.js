const express=require("express");
const pool=require("../DbConnection/db");
const { verifyToken, verifyAdmin } = require("../middleware/authMiddle");

const internshipRouter=express.Router();


internshipRouter.post("/submit-internship",verifyToken, async (req, res) => {
    const { domain, name, phone_number, mail_id, branch, year_of_passout, college } = req.body;
    const image=req.user.user_image;

    if (!name || !phone_number || !mail_id || !college || !branch || !year_of_passout || !domain) {
        return res.status(400).json({ message: "All fields are required" });
    }
    

    try {
        const [existingSubmission] = await pool.query("SELECT * FROM internship_form WHERE name = ?", [name]);

        if (existingSubmission.length > 0) {
            return res.status(400).json({ message: "You already submitted one form!!" });
        }


        const query = `
            INSERT INTO internship_form (domain, name, phone_number, mail_id, branch, year_of_passout, college)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        await pool.query(query, [domain, name, phone_number, mail_id, branch, year_of_passout, college]);

        res.status(201).json({ message: "Internship application submitted successfully" });
    } catch (error) {
        console.error("Error submitting internship application:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

internshipRouter.get("/internship-forms",verifyAdmin, async (req, res) => {
    try {
        const query = `
            SELECT id, domain, name, phone_number, mail_id, college, branch, year_of_passout, status, user_image, status_updated_at, created_at
            FROM internship_form
            ORDER BY created_at DESC;
        `;
        const [results] = await pool.query(query);
        res.json(results);
    } catch (error) {
        console.error("Error fetching internship forms:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

module.exports=internshipRouter;