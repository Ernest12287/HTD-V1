const nodemailer = require("nodemailer");
const express = require("express");
const pool = require("../../../database/sqlConnection");
const router = express.Router();
const { EmailSenderManager } = require("./emailRoute"); // Import the class

/**
 * Test Email Service Function
 */
router.get("/api/admin/test-email/:id", async (req, res) => {
    const { id } = req.params;
    const testRecipient = req.query.testRecipient || "test-recipient@example.com"; // Default recipient

    try {
        const emailSenderManager = new EmailSenderManager(pool);

        // Get email sender details by ID
        const connection = await pool.getConnection();
        const [senders] = await connection.query(
            `SELECT * FROM email_senders WHERE id = ?`,
            [id]
        );
        connection.release();

        if (!senders.length) {
            return res.status(404).json({ success: false, message: "Email sender not found" });
        }

        const { email, password, host, port } = senders[0];

        // Create a transporter
        const transporter = nodemailer.createTransport({
            host,
            port,
            secure: port === 465, // Use secure if port is 465
            auth: {
                user: email,
                pass: password,
            },
        });

        // Send a test email
        await transporter.sendMail({
            from: `"Test Service" <${email}>`, // Sender address
            to: testRecipient, // Test recipient
            subject: "Test Email - Service Verification", // Subject line
            text: "This is a test email to verify the email service is working.", // Plain text body
        });

        res.json({ success: true, message: "Test email sent successfully" });
    } catch (error) {
        console.error("Error sending test email:", error);
        res.status(500).json({
            success: false,
            message: "Failed to send test email",
            error: error.message,
        });
    }
});

module.exports = router;
